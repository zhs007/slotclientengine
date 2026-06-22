import {
  Application,
  Assets,
  Sprite,
  type Container,
  type Texture,
} from "pixi.js";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import stateTextureManifest from "../../../assets/symbols/symbol-state-textures.manifest.json";
import compositeManifest from "../../../assets/symbols/symbol-composites.json";
import backgroundUrl from "../../../assets/game001/bk.jpg?url";
import logoUrl from "../../../assets/game001/logo.png?url";
import mainReelsBackgroundUrl from "../../../assets/game001/reels1bk.png?url";
import secondaryReelsBackgroundUrl from "../../../assets/game001/reels2bk.png?url";
import type {
  GameLogic,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotGameStateSnapshot,
} from "@slotclientengine/gameframeworks";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import {
  createGame001SymbolAssetMapFromModules,
  loadGame001SymbolTextures,
} from "./assets.js";
import {
  GAME_ASSET_SIZE,
  GAME_STAGE_SIZE,
  createGame001Layout,
} from "./game-layout.js";
import {
  createGame001ReelRuntime,
  type Game001ReelRuntime,
} from "./game-demo.js";
import { assertGame001MainReelsVisualMatchesTarget } from "./main-reels-view.js";
import { validateGame001Scene } from "./scene.js";

const rawSymbolAssetModules = import.meta.glob(
  "../../../assets/symbols/*.png",
  {
    eager: true,
    import: "default",
    query: "?url",
  },
) as Record<string, string>;

export type Game001TickerSnapshot = { readonly deltaMS: number };
export type Game001TickerListener = (ticker: Game001TickerSnapshot) => void;

export interface Game001PixiApplication {
  readonly canvas: HTMLElement;
  readonly stage: Pick<Container, "addChild">;
  readonly ticker: {
    add(listener: Game001TickerListener): void;
    remove(listener: Game001TickerListener): void;
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

export interface Game001StaticTextures {
  readonly background: Texture;
  readonly logo: Texture;
  readonly mainReelsBackground: Texture;
  readonly secondaryReelsBackground: Texture;
}

export interface Game001AdapterOptions {
  readonly createApplication?: () => Game001PixiApplication;
  readonly loadStaticTextures?: () => Promise<Game001StaticTextures>;
  readonly loadSymbolTextures?: () => Promise<SymbolAssetMap>;
  readonly createRuntime?: (symbolAssets: SymbolAssetMap) => Game001ReelRuntime;
}

interface PendingAnimation {
  readonly targetScene: ReturnType<typeof validateGame001Scene>;
  resolve(): void;
  reject(error: Error): void;
}

export function createGame001Adapter(
  options: Game001AdapterOptions = {},
): SlotGameAdapter {
  return new Game001PixiAdapter(options);
}

class Game001PixiAdapter implements SlotGameAdapter {
  readonly #createApplication: () => Game001PixiApplication;
  readonly #loadStaticTextures: () => Promise<Game001StaticTextures>;
  readonly #loadSymbolTextures: () => Promise<SymbolAssetMap>;
  readonly #createRuntime: (symbolAssets: SymbolAssetMap) => Game001ReelRuntime;
  #app: Game001PixiApplication | null = null;
  #runtime: Game001ReelRuntime | null = null;
  #pendingAnimation: PendingAnimation | null = null;

  constructor(options: Game001AdapterOptions) {
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#loadStaticTextures = options.loadStaticTextures ?? loadStaticTextures;
    this.#loadSymbolTextures = options.loadSymbolTextures ?? loadSymbolTextures;
    this.#createRuntime =
      options.createRuntime ??
      ((symbolAssets) =>
        createGame001ReelRuntime({
          rawGameConfig,
          symbolAssets,
        }));
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#app) {
      throw new Error("game001 adapter is already mounted.");
    }

    const app = this.#createApplication();
    await app.init({
      width: GAME_STAGE_SIZE.width,
      height: GAME_STAGE_SIZE.height,
      antialias: true,
      autoDensity: false,
      resolution: 1,
    });
    context.gameLayer.replaceChildren(app.canvas);

    const layout = createGame001Layout();
    const [staticTextures, symbolTextures] = await Promise.all([
      this.#loadStaticTextures(),
      this.#loadSymbolTextures(),
    ]);
    const runtime = this.#createRuntime(symbolTextures);

    app.stage.addChild(
      createPositionedSprite(staticTextures.background, layout.background),
    );
    app.stage.addChild(
      createPositionedSprite(staticTextures.logo, layout.logo),
    );
    app.stage.addChild(
      createPositionedSprite(
        staticTextures.mainReelsBackground,
        layout.mainReelsBackground,
      ),
    );
    app.stage.addChild(runtime.mainReelsLayer);
    app.stage.addChild(
      createPositionedSprite(
        staticTextures.secondaryReelsBackground,
        layout.secondaryReelsBackground,
      ),
    );

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
      validateGame001Scene(state.defaultScene, "live defaultScene"),
      "live defaultScene",
    );
  }

  playSpin(logic: GameLogic): Promise<void> {
    const runtime = this.#requireRuntime();
    if (this.#pendingAnimation) {
      throw new Error("game001 adapter animation is already in progress.");
    }
    const targetScene = validateGame001Scene(
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
    this.#rejectPending(new Error("game001 adapter was destroyed."));
    this.#app?.ticker.remove(this.#onTick);
    this.#app?.ticker.stop();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
    this.#runtime = null;
  }

  readonly #onTick: Game001TickerListener = (ticker) => {
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
      assertGame001MainReelsVisualMatchesTarget(
        this.#runtime.getVisualSnapshot(),
        pending.targetScene,
        "completed game001 adapter spin",
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

  #requireRuntime(): Game001ReelRuntime {
    if (!this.#runtime) {
      throw new Error("game001 adapter is not mounted.");
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

function createPixiApplication(): Game001PixiApplication {
  return new Application() as unknown as Game001PixiApplication;
}

async function loadStaticTextures(): Promise<Game001StaticTextures> {
  const [background, logo, mainReelsBackground, secondaryReelsBackground] =
    await Promise.all([
      loadTextureWithSize("bk.jpg", backgroundUrl, GAME_ASSET_SIZE.background),
      loadTextureWithSize("logo.png", logoUrl, GAME_ASSET_SIZE.logo),
      loadTextureWithSize(
        "reels1bk.png",
        mainReelsBackgroundUrl,
        GAME_ASSET_SIZE.mainReelsBackground,
      ),
      loadTextureWithSize(
        "reels2bk.png",
        secondaryReelsBackgroundUrl,
        GAME_ASSET_SIZE.secondaryReelsBackground,
      ),
    ]);
  return Object.freeze({
    background,
    logo,
    mainReelsBackground,
    secondaryReelsBackground,
  });
}

async function loadSymbolTextures(): Promise<SymbolAssetMap> {
  const assetUrls = createGame001SymbolAssetMapFromModules({
    modules: rawSymbolAssetModules,
    stateTextureManifest,
    compositeManifest,
  });
  return loadGame001SymbolTextures(assetUrls);
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
