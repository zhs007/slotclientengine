import { Application, Assets, Container, Sprite, type Texture } from "pixi.js";
import type {
  GameLogic,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotGameStateSnapshot,
  SlotGameViewportSnapshot,
} from "@slotclientengine/gameframeworks";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import {
  createGame003SymbolAssetMapFromModules,
  loadGame003SymbolTextures,
} from "./assets.js";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
import {
  GAME003_ASSET_SIZE,
  createGame003Layout,
  createGame003ReelLayerLayout,
  type Game003Layout,
} from "./game-layout.js";
import {
  DEFAULT_GAME003_REEL_CONFIG,
  assertGame003ReelVisualMatchesTarget,
  createGame003ReelRuntime,
  type Game003ReelRuntime,
} from "./game-demo.js";
import { validateGame003Scene } from "./scene.js";
import type { Game003SkinConfig } from "./skin-config.js";
import {
  createGame003WinSymbolSequence,
  type Game003WinSymbolGroup,
} from "./win-sequence.js";
import {
  createGame003WinAmountLayout,
  createGame003WinAmountPlayer,
} from "./win-amount-config.js";

export type Game003TickerSnapshot = { readonly deltaMS: number };
export type Game003TickerListener = (ticker: Game003TickerSnapshot) => void;

export interface Game003PixiApplication {
  readonly canvas: HTMLElement;
  readonly stage: Pick<Container, "addChild">;
  readonly renderer: {
    resize(width: number, height: number): void;
  };
  readonly ticker: {
    add(listener: Game003TickerListener): void;
    remove(listener: Game003TickerListener): void;
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

export interface Game003StaticTextures {
  readonly landscapeBackground: Texture;
  readonly portraitBackground: Texture;
  readonly mainReelBackground: Texture;
  readonly landscapeConveyor: Texture;
  readonly portraitConveyor: Texture;
}

export interface Game003AdapterOptions {
  readonly skin: Game003SkinConfig;
  readonly createApplication?: () => Game003PixiApplication;
  readonly loadStaticTextures?: () => Promise<Game003StaticTextures>;
  readonly loadSymbolTextures?: () => Promise<SymbolAssetMap>;
  readonly createRuntime?: (symbolAssets: SymbolAssetMap) => Game003ReelRuntime;
  readonly createWinAmountPlayer?: (
    layout: Game003Layout,
  ) => WinAmountAnimationPlayer;
}

interface PendingAnimation {
  readonly targetScene: ReturnType<typeof validateGame003Scene>;
  phase: "spinning" | "win-sequence";
  winQueue: readonly Game003WinSymbolGroup[];
  winIndex: number;
  winGroupStarted: boolean;
  winGroupAdvanced: boolean;
  winSequenceComplete: boolean;
  winAmountExpected: boolean;
  betAmountRaw: number;
  winAmountRaw: number;
  resolve(): void;
  reject(error: Error): void;
}

interface Game003WorldSprites {
  readonly background: Sprite;
  readonly mainReelBackground: Sprite;
  readonly conveyor: Sprite;
}

const GAME003_MAX_TICK_DELTA_SECONDS = 1 / 30;

export function createGame003Adapter(
  options: Game003AdapterOptions,
): SlotGameAdapter {
  return new Game003PixiAdapter(options);
}

class Game003PixiAdapter implements SlotGameAdapter {
  readonly #skin: Game003SkinConfig;
  readonly #createApplication: () => Game003PixiApplication;
  readonly #loadStaticTextures: () => Promise<Game003StaticTextures>;
  readonly #loadSymbolTextures: () => Promise<SymbolAssetMap>;
  readonly #createRuntime: (symbolAssets: SymbolAssetMap) => Game003ReelRuntime;
  readonly #createWinAmountPlayer: (
    layout: Game003Layout,
  ) => WinAmountAnimationPlayer;
  #app: Game003PixiApplication | null = null;
  #staticTextures: Game003StaticTextures | null = null;
  #worldLayer: Container | null = null;
  #worldSprites: Game003WorldSprites | null = null;
  #runtime: Game003ReelRuntime | null = null;
  #winAmountPlayer: WinAmountAnimationPlayer | null = null;
  #pendingAnimation: PendingAnimation | null = null;
  #unsubscribeViewport: (() => void) | null = null;

  constructor(options: Game003AdapterOptions) {
    this.#skin = options.skin;
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#loadStaticTextures =
      options.loadStaticTextures ?? (() => loadStaticTextures(this.#skin));
    this.#loadSymbolTextures =
      options.loadSymbolTextures ?? (() => loadSymbolTextures(this.#skin));
    this.#createRuntime =
      options.createRuntime ??
      ((symbolAssets) =>
        createGame003ReelRuntime({
          rawGameConfig: GAME003_STATIC_CONFIG.gameConfig,
          symbolAssets,
          config: {
            ...DEFAULT_GAME003_REEL_CONFIG,
            kind: "normal",
            emptySymbols: this.#skin.emptySymbols,
            texturedSymbols: this.#skin.displaySymbols,
            missingAssetLabel: this.#skin.label,
            symbolScales: this.#skin.symbolScales,
            animationResolver: this.#skin.symbolAnimationResolver,
          },
        }));
    this.#createWinAmountPlayer =
      options.createWinAmountPlayer ?? createGame003WinAmountPlayer;
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#app) {
      throw new Error("game003 adapter is already mounted.");
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

    const layout = createGame003Layout({
      viewportSize: initialViewport.frameDesignSize,
    });
    const [staticTextures, symbolTextures] = await Promise.all([
      this.#loadStaticTextures(),
      this.#loadSymbolTextures(),
    ]);
    const runtime = this.#createRuntime(symbolTextures);
    runtime.applyLayout(createGame003ReelLayerLayout(runtime.layout, layout));
    const winAmountPlayer = this.#createWinAmountPlayer(layout);

    const worldLayer = new Container();
    const worldSprites = createWorldSprites(staticTextures, layout);
    worldLayer.addChild(
      worldSprites.background,
      worldSprites.conveyor,
      worldSprites.mainReelBackground,
      runtime.mainReelsLayer,
      winAmountPlayer.container,
    );
    app.stage.addChild(worldLayer);

    app.ticker.add(this.#onTick);
    this.#app = app;
    this.#staticTextures = staticTextures;
    this.#worldLayer = worldLayer;
    this.#worldSprites = worldSprites;
    this.#runtime = runtime;
    this.#winAmountPlayer = winAmountPlayer;
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
      validateGame003Scene(state.defaultScene, "live defaultScene"),
      "live defaultScene",
    );
  }

  playSpin(logic: GameLogic): Promise<void> {
    const runtime = this.#requireRuntime();
    if (this.#pendingAnimation) {
      throw new Error("game003 adapter animation is already in progress.");
    }
    const targetScene = validateGame003Scene(
      logic.getStep(0).getScene(0),
      "spin main scene",
    );
    const winQueue = createGame003WinSymbolSequence(logic, targetScene);
    runtime.spinToScene(targetScene, "spin main scene");

    return new Promise((resolve, reject) => {
      this.#pendingAnimation = {
        targetScene,
        phase: "spinning",
        winQueue,
        winIndex: 0,
        winGroupStarted: false,
        winGroupAdvanced: false,
        winSequenceComplete: winQueue.length === 0,
        winAmountExpected: logic.getTotalWin() > 0,
        betAmountRaw: logic.getBet(),
        winAmountRaw: logic.getTotalWin(),
        resolve,
        reject,
      };
    });
  }

  setFrameworkState(_state: SlotGameStateSnapshot): void {
    return undefined;
  }

  destroy(): void {
    this.#rejectPending(new Error("game003 adapter was destroyed."));
    this.#unsubscribeViewport?.();
    this.#unsubscribeViewport = null;
    this.#app?.ticker.remove(this.#onTick);
    this.#app?.ticker.stop();
    this.#winAmountPlayer?.destroy();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
    this.#staticTextures = null;
    this.#worldLayer = null;
    this.#worldSprites = null;
    this.#runtime = null;
    this.#winAmountPlayer = null;
  }

  readonly #onTick: Game003TickerListener = (ticker) => {
    if (!this.#runtime || !this.#pendingAnimation) {
      return;
    }

    try {
      const deltaSeconds = normalizeTickerDeltaSeconds(ticker);
      if (this.#pendingAnimation.phase === "spinning") {
        this.#tickSpinPhase(deltaSeconds);
      } else {
        this.#tickWinSequencePhase(deltaSeconds);
      }
    } catch (error) {
      this.#app?.ticker.stop();
      this.#rejectPending(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  };

  #tickSpinPhase(deltaSeconds: number): void {
    const runtime = this.#requireRuntime();
    const result = runtime.update(deltaSeconds);
    if (!result.completed) {
      return;
    }

    const pending = this.#pendingAnimation;
    if (!pending) {
      return;
    }
    assertGame003ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      pending.targetScene,
      "completed game003 adapter spin",
    );
    if (pending.winAmountExpected) {
      this.#requireWinAmountPlayer().start({
        betAmountRaw: pending.betAmountRaw,
        winAmountRaw: pending.winAmountRaw,
      });
    }
    if (pending.winSequenceComplete && !pending.winAmountExpected) {
      this.#completePending(pending);
      return;
    }

    pending.phase = "win-sequence";
    pending.winIndex = 0;
    if (!pending.winSequenceComplete) {
      this.#startCurrentWinGroup(pending);
    }
  }

  #tickWinSequencePhase(deltaSeconds: number): void {
    const runtime = this.#requireRuntime();
    const pending = this.#pendingAnimation;
    if (!pending) {
      return;
    }

    if (!pending.winSequenceComplete) {
      runtime.update(deltaSeconds);
      pending.winGroupAdvanced = true;
      if (this.#isCurrentWinGroupComplete(pending)) {
        pending.winIndex += 1;
        if (pending.winIndex >= pending.winQueue.length) {
          pending.winSequenceComplete = true;
        } else {
          this.#startCurrentWinGroup(pending);
        }
      }
    }

    if (pending.winAmountExpected) {
      this.#requireWinAmountPlayer().update(deltaSeconds);
    }
    if (
      pending.winSequenceComplete &&
      (!pending.winAmountExpected ||
        !this.#requireWinAmountPlayer().isPlaying())
    ) {
      this.#completePending(pending);
    }
  }

  #startCurrentWinGroup(pending: PendingAnimation): void {
    const group = pending.winQueue[pending.winIndex];
    if (!group) {
      this.#completePending(pending);
      return;
    }
    this.#requireRuntime().requestVisibleSymbolStates(group.positions, "win");
    pending.winGroupStarted = true;
    pending.winGroupAdvanced = false;
  }

  #isCurrentWinGroupComplete(pending: PendingAnimation): boolean {
    if (!pending.winGroupStarted || !pending.winGroupAdvanced) {
      return false;
    }
    const group = pending.winQueue[pending.winIndex];
    if (!group) {
      return true;
    }
    return this.#requireRuntime()
      .getVisibleSymbolStateSnapshots(group.positions)
      .every(
        (snapshot) =>
          snapshot.requestedState === "normal" &&
          snapshot.resolvedState === "normal",
      );
  }

  #completePending(pending: PendingAnimation): void {
    if (this.#pendingAnimation !== pending) {
      return;
    }
    this.#pendingAnimation = null;
    pending.resolve();
  }

  #requireRuntime(): Game003ReelRuntime {
    if (!this.#runtime) {
      throw new Error("game003 adapter is not mounted.");
    }
    return this.#runtime;
  }

  #requireWinAmountPlayer(): WinAmountAnimationPlayer {
    if (!this.#winAmountPlayer) {
      throw new Error("game003 adapter is not mounted.");
    }
    return this.#winAmountPlayer;
  }

  #applyViewport(viewport: SlotGameViewportSnapshot): void {
    if (
      !this.#app ||
      !this.#staticTextures ||
      !this.#worldLayer ||
      !this.#worldSprites ||
      !this.#runtime
    ) {
      throw new Error("game003 adapter is not mounted.");
    }
    const layout = createGame003Layout({
      viewportSize: viewport.frameDesignSize,
    });
    this.#app.renderer.resize(
      layout.viewportSize.width,
      layout.viewportSize.height,
    );
    this.#worldLayer.position.set(layout.worldOffset.x, layout.worldOffset.y);
    applyWorldSpriteLayout(this.#worldSprites, this.#staticTextures, layout);
    this.#runtime.applyLayout(
      createGame003ReelLayerLayout(this.#runtime.layout, layout),
    );
    this.#winAmountPlayer?.applyLayout(createGame003WinAmountLayout(layout));
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

function normalizeTickerDeltaSeconds(ticker: Game003TickerSnapshot): number {
  const deltaSeconds = ticker.deltaMS / 1000;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error(
      "game003 ticker deltaMS must be a finite non-negative number.",
    );
  }
  return Math.min(deltaSeconds, GAME003_MAX_TICK_DELTA_SECONDS);
}

function createPixiApplication(): Game003PixiApplication {
  return new Application() as unknown as Game003PixiApplication;
}

async function loadStaticTextures(
  skin: Game003SkinConfig,
): Promise<Game003StaticTextures> {
  const [
    landscapeBackground,
    portraitBackground,
    mainReelBackground,
    landscapeConveyor,
    portraitConveyor,
  ] = await Promise.all([
    loadTextureWithSize(
      "game003 skin 1 bg1.jpg",
      skin.landscapeBackgroundUrl,
      GAME003_ASSET_SIZE.landscapeBackground,
    ),
    loadTextureWithSize(
      "game003 skin 1 bg2.jpg",
      skin.portraitBackgroundUrl,
      GAME003_ASSET_SIZE.portraitBackground,
    ),
    loadTextureWithSize(
      "game003 skin 1 mainreelbg.png",
      skin.mainReelBackgroundUrl,
      GAME003_ASSET_SIZE.mainReelBackground,
    ),
    loadTextureWithSize(
      "game003 skin 1 conveyor1.png",
      skin.landscapeConveyorUrl,
      GAME003_ASSET_SIZE.landscapeConveyor,
    ),
    loadTextureWithSize(
      "game003 skin 1 conveyor2.png",
      skin.portraitConveyorUrl,
      GAME003_ASSET_SIZE.portraitConveyor,
    ),
  ]);
  return Object.freeze({
    landscapeBackground,
    portraitBackground,
    mainReelBackground,
    landscapeConveyor,
    portraitConveyor,
  });
}

async function loadSymbolTextures(
  skin: Game003SkinConfig,
): Promise<SymbolAssetMap> {
  const assetUrls = createGame003SymbolAssetMapFromModules({
    modules: skin.symbolModules,
    stateTextureManifest: skin.stateTextureManifest,
    displaySymbols: skin.displaySymbols,
  });
  return loadGame003SymbolTextures(assetUrls);
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

function createWorldSprites(
  textures: Game003StaticTextures,
  layout: Game003Layout,
): Game003WorldSprites {
  const background = new Sprite(textures.landscapeBackground);
  const mainReelBackground = new Sprite(textures.mainReelBackground);
  const conveyor = new Sprite(textures.landscapeConveyor);
  const sprites = Object.freeze({
    background,
    mainReelBackground,
    conveyor,
  });
  applyWorldSpriteLayout(sprites, textures, layout);
  return sprites;
}

function applyWorldSpriteLayout(
  sprites: Game003WorldSprites,
  textures: Game003StaticTextures,
  layout: Game003Layout,
): void {
  sprites.background.texture =
    layout.orientation === "portrait"
      ? textures.portraitBackground
      : textures.landscapeBackground;
  sprites.conveyor.texture =
    layout.orientation === "portrait"
      ? textures.portraitConveyor
      : textures.landscapeConveyor;
  applyRect(sprites.background, layout.backgroundFrame);
  applyRect(sprites.conveyor, layout.sceneParts.conveyor);
  applyRect(sprites.mainReelBackground, layout.sceneParts.mainReelBackground);
}

function applyRect(
  sprite: Sprite,
  rect: { readonly x: number; readonly y: number },
): void {
  sprite.x = rect.x;
  sprite.y = rect.y;
}
