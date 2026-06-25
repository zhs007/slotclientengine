import {
  Application,
  Assets,
  Sprite,
  type Container,
  type Texture,
} from "pixi.js";
import rawGameConfig from "../../../assets/gamecfg002/gameconfig.json";
import stateTextureManifest from "../../../assets/symbols002/symbol-state-textures.manifest.json";
import backgroundUrl from "../../../assets/game002/bg.jpg?url";
import type {
  GameLogic,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotGameStateSnapshot,
} from "@slotclientengine/gameframeworks";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import {
  createGame002SymbolAssetMapFromModules,
  loadGame002SymbolTextures,
} from "./assets.js";
import {
  GAME002_ASSET_SIZE,
  GAME002_STAGE_SIZE,
  createGame002Layout,
} from "./game-layout.js";
import {
  assertGame002ReelVisualMatchesTarget,
  createGame002ReelRuntime,
  type Game002ReelRuntime,
} from "./game-demo.js";
import { validateGame002Scene } from "./scene.js";

const rawSymbolAssetModules = import.meta.glob(
  "../../../assets/symbols002/*.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

export type Game002TickerSnapshot = { readonly deltaMS: number };
export type Game002TickerListener = (ticker: Game002TickerSnapshot) => void;

export interface Game002PixiApplication {
  readonly canvas: HTMLElement;
  readonly stage: Pick<Container, "addChild">;
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

export function createGame002Adapter(
  options: Game002AdapterOptions = {},
): SlotGameAdapter {
  return new Game002PixiAdapter(options);
}

class Game002PixiAdapter implements SlotGameAdapter {
  readonly #createApplication: () => Game002PixiApplication;
  readonly #loadStaticTextures: () => Promise<Game002StaticTextures>;
  readonly #loadSymbolTextures: () => Promise<SymbolAssetMap>;
  readonly #createRuntime: (symbolAssets: SymbolAssetMap) => Game002ReelRuntime;
  #app: Game002PixiApplication | null = null;
  #runtime: Game002ReelRuntime | null = null;
  #pendingAnimation: PendingAnimation | null = null;

  constructor(options: Game002AdapterOptions) {
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#loadStaticTextures = options.loadStaticTextures ?? loadStaticTextures;
    this.#loadSymbolTextures = options.loadSymbolTextures ?? loadSymbolTextures;
    this.#createRuntime =
      options.createRuntime ??
      ((symbolAssets) =>
        createGame002ReelRuntime({
          rawGameConfig,
          symbolAssets,
        }));
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#app) {
      throw new Error("game002 adapter is already mounted.");
    }

    const app = this.#createApplication();
    await app.init({
      width: GAME002_STAGE_SIZE.width,
      height: GAME002_STAGE_SIZE.height,
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

    app.stage.addChild(
      createPositionedSprite(staticTextures.background, layout.background),
    );
    app.stage.addChild(runtime.mainReelsLayer);

    app.ticker.add(this.#onTick);
    this.#app = app;
    this.#runtime = runtime;
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
    this.#app?.ticker.remove(this.#onTick);
    this.#app?.ticker.stop();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
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
      const result = this.#runtime.update(ticker.deltaMS / 1000);
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

  #rejectPending(error: Error): void {
    const pending = this.#pendingAnimation;
    if (!pending) {
      return;
    }
    this.#pendingAnimation = null;
    pending.reject(error);
  }
}

function createPixiApplication(): Game002PixiApplication {
  return new Application() as unknown as Game002PixiApplication;
}

async function loadStaticTextures(): Promise<Game002StaticTextures> {
  const background = await loadTextureWithSize(
    "bg.jpg",
    backgroundUrl,
    GAME002_ASSET_SIZE.background,
  );
  return Object.freeze({
    background,
  });
}

async function loadSymbolTextures(): Promise<SymbolAssetMap> {
  const assetUrls = createGame002SymbolAssetMapFromModules({
    modules: rawSymbolAssetModules,
    stateTextureManifest,
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
