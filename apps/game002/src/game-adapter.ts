import { Application, Assets, Container, Sprite, type Texture } from "pixi.js";
import rawGameConfig from "../../../assets/gamecfg002/gameconfig.json";
import type {
  GameLogic,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotGameStateSnapshot,
  SlotGameViewportSnapshot,
} from "@slotclientengine/gameframeworks";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import {
  createGame002SymbolAssetMapFromModules,
  loadGame002SymbolTextures,
} from "./assets.js";
import { GAME002_ASSET_SIZE, createGame002Layout } from "./game-layout.js";
import {
  DEFAULT_GAME002_REEL_CONFIG,
  assertGame002ReelVisualMatchesTarget,
  createGame002ReelRuntime,
  type Game002ReelRuntime,
} from "./game-demo.js";
import { validateGame002Scene } from "./scene.js";
import type { Game002SkinConfig } from "./skin-config.js";

export type Game002TickerSnapshot = { readonly deltaMS: number };
export type Game002TickerListener = (ticker: Game002TickerSnapshot) => void;

export interface Game002PixiApplication {
  readonly canvas: HTMLElement;
  readonly stage: Pick<Container, "addChild">;
  readonly renderer: {
    resize(width: number, height: number): void;
  };
  readonly ticker: {
    add(listener: Game002TickerListener): void;
    remove(listener: Game002TickerListener): void;
    stop(): void;
  };
  init(options: {
    readonly width: number;
    readonly height: number;
    readonly antialias: boolean;
    readonly autoDensity: boolean;
    readonly resolution: number;
  }): Promise<void>;
  destroy(): void;
}

export interface Game002StaticTextures {
  readonly background: Texture;
}

export interface Game002AdapterOptions {
  readonly skin: Game002SkinConfig;
  readonly createApplication?: () => Game002PixiApplication;
  readonly loadStaticTextures?: () => Promise<Game002StaticTextures>;
  readonly loadSymbolTextures?: () => Promise<SymbolAssetMap>;
  readonly createRuntime?: (symbolAssets: SymbolAssetMap) => Game002ReelRuntime;
}

interface PendingAnimation {
  readonly targetScene: ReturnType<typeof validateGame002Scene>;
  resolve(): void;
  reject(error: Error): void;
}

const GAME002_MAX_TICK_DELTA_SECONDS = 1 / 30;

export function createGame002Adapter(
  options: Game002AdapterOptions,
): SlotGameAdapter {
  return new Game002PixiAdapter(options);
}

class Game002PixiAdapter implements SlotGameAdapter {
  readonly #createApplication: () => Game002PixiApplication;
  readonly #loadStaticTextures: () => Promise<Game002StaticTextures>;
  readonly #loadSymbolTextures: () => Promise<SymbolAssetMap>;
  readonly #createRuntime: (symbolAssets: SymbolAssetMap) => Game002ReelRuntime;
  #app: Game002PixiApplication | null = null;
  #worldLayer: Container | null = null;
  #runtime: Game002ReelRuntime | null = null;
  #pendingAnimation: PendingAnimation | null = null;
  #unsubscribeViewport: (() => void) | null = null;

  constructor(options: Game002AdapterOptions) {
    const skin = options.skin;
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#loadStaticTextures =
      options.loadStaticTextures ?? (() => loadStaticTextures(skin));
    this.#loadSymbolTextures =
      options.loadSymbolTextures ?? (() => loadSymbolTextures(skin));
    this.#createRuntime =
      options.createRuntime ??
      ((symbolAssets) =>
        createGame002ReelRuntime({
          rawGameConfig,
          symbolAssets,
          config: {
            ...DEFAULT_GAME002_REEL_CONFIG,
            emptySymbols: skin.emptySymbols,
            texturedSymbols: skin.displaySymbols,
            missingAssetLabel: skin.label,
          },
        }));
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#app) {
      throw new Error("game002 adapter is already mounted.");
    }

    const app = this.#createApplication();
    const initialViewport = context.getViewport();
    await app.init({
      width: initialViewport.frameDesignSize.width,
      height: initialViewport.frameDesignSize.height,
      antialias: true,
      autoDensity: false,
      resolution: 1,
    });
    context.gameLayer.replaceChildren(app.canvas);

    const layout = createGame002Layout();
    const [staticTextures, symbolTextures] = await Promise.all([
      this.#loadStaticTextures(),
      this.#loadSymbolTextures(),
    ]);
    const runtime = this.#createRuntime(symbolTextures);

    const worldLayer = new Container();
    worldLayer.addChild(
      createPositionedSprite(staticTextures.background, layout.background),
    );
    worldLayer.addChild(runtime.mainReelsLayer);
    app.stage.addChild(worldLayer);

    app.ticker.add(this.#onTick);
    this.#app = app;
    this.#worldLayer = worldLayer;
    this.#runtime = runtime;
    this.#applyViewport(initialViewport);
    this.#unsubscribeViewport = context.onViewportChange((viewport) => {
      this.#applyViewport(viewport);
    });
  }

  applyInitialState(state: SlotGameInitialState): void {
    const runtime = this.#requireRuntime();
    if (state.defaultScene === undefined) {
      return;
    }
    runtime.applyScene(
      validateGame002Scene(state.defaultScene, "live defaultScene"),
      "live defaultScene",
    );
  }

  playSpin(logic: GameLogic): Promise<void> {
    const runtime = this.#requireRuntime();
    if (this.#pendingAnimation) {
      throw new Error("game002 adapter animation is already in progress.");
    }
    const targetScene = validateGame002Scene(
      logic.getStep(0).getScene(0),
      "spin main scene",
    );
    runtime.spinToScene(targetScene, "spin main scene");

    return new Promise((resolve, reject) => {
      this.#pendingAnimation = {
        targetScene,
        resolve,
        reject,
      };
    });
  }

  setFrameworkState(_state: SlotGameStateSnapshot): void {
    return undefined;
  }

  destroy(): void {
    this.#rejectPending(new Error("game002 adapter was destroyed."));
    this.#unsubscribeViewport?.();
    this.#unsubscribeViewport = null;
    this.#app?.ticker.remove(this.#onTick);
    this.#app?.ticker.stop();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
    this.#worldLayer = null;
    this.#runtime = null;
  }

  readonly #onTick: Game002TickerListener = (ticker) => {
    if (
      !this.#runtime ||
      !this.#pendingAnimation ||
      !this.#runtime.isSpinning()
    ) {
      return;
    }

    try {
      const result = this.#runtime.update(normalizeTickerDeltaSeconds(ticker));
      if (!result.completed) {
        return;
      }

      const pending = this.#pendingAnimation;
      assertGame002ReelVisualMatchesTarget(
        this.#runtime.getVisualSnapshot(),
        pending.targetScene,
        "completed game002 adapter spin",
      );
      this.#pendingAnimation = null;
      pending.resolve();
    } catch (error) {
      this.#app?.ticker.stop();
      this.#rejectPending(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  };

  #requireRuntime(): Game002ReelRuntime {
    if (!this.#runtime) {
      throw new Error("game002 adapter is not mounted.");
    }
    return this.#runtime;
  }

  #applyViewport(viewport: SlotGameViewportSnapshot): void {
    if (!this.#app || !this.#worldLayer) {
      throw new Error("game002 adapter is not mounted.");
    }
    const layout = createGame002Layout(viewport.frameDesignSize);
    this.#app.renderer.resize(
      layout.viewportSize.width,
      layout.viewportSize.height,
    );
    this.#worldLayer.position.set(layout.worldOffset.x, layout.worldOffset.y);
  }

  #rejectPending(error: Error): void {
    const pending = this.#pendingAnimation;
    if (!pending) {
      return;
    }
    this.#pendingAnimation = null;
    pending.reject(error);
  }
}

function normalizeTickerDeltaSeconds(ticker: Game002TickerSnapshot): number {
  const deltaSeconds = ticker.deltaMS / 1000;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error(
      "game002 ticker deltaMS must be a finite non-negative number.",
    );
  }
  return Math.min(deltaSeconds, GAME002_MAX_TICK_DELTA_SECONDS);
}

function createPixiApplication(): Game002PixiApplication {
  return new Application() as unknown as Game002PixiApplication;
}

async function loadStaticTextures(
  skin: Game002SkinConfig,
): Promise<Game002StaticTextures> {
  const background = await loadTextureWithSize(
    skin.backgroundLabel,
    skin.backgroundUrl,
    GAME002_ASSET_SIZE.background,
  );
  return Object.freeze({
    background,
  });
}

async function loadSymbolTextures(
  skin: Game002SkinConfig,
): Promise<SymbolAssetMap> {
  const assetUrls = createGame002SymbolAssetMapFromModules({
    modules: skin.symbolModules,
    stateTextureManifest: skin.stateTextureManifest,
    displaySymbols: skin.displaySymbols,
    emptySymbols: skin.emptySymbols,
  });
  return loadGame002SymbolTextures(assetUrls);
}

async function loadTextureWithSize(
  label: string,
  url: string,
  expected: { readonly width: number; readonly height: number },
): Promise<Texture> {
  const texture = await Assets.load<Texture>(url);
  const width =
    texture.width || texture.source?.width || texture.orig?.width || 0;
  const height =
    texture.height || texture.source?.height || texture.orig?.height || 0;
  if (width !== expected.width || height !== expected.height) {
    throw new Error(
      `${label} size must be ${expected.width} x ${expected.height}, got ${width} x ${height}.`,
    );
  }
  return texture;
}

function createPositionedSprite(
  texture: Texture,
  point: { readonly x: number; readonly y: number },
): Sprite {
  const sprite = new Sprite(texture);
  sprite.x = point.x;
  sprite.y = point.y;
  return sprite;
}
