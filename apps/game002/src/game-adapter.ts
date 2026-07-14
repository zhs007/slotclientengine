import { Application, Container } from "pixi.js";
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
  createSpineBackgroundPlayer,
  type SpineBackgroundPlayer,
} from "@slotclientengine/rendercore/background";
import type {
  WinAmountAnimationPhase,
  WinAmountAnimationPlayer,
} from "@slotclientengine/rendercore/win-amount";
import {
  createGame002SymbolAssetMapFromModules,
  loadGame002SymbolTextures,
} from "./assets.js";
import { createGame002Layout } from "./game-layout.js";
import {
  DEFAULT_GAME002_REEL_CONFIG,
  assertGame002ReelVisualMatchesTarget,
  createGame002ReelRuntime,
  type Game002ReelRuntime,
} from "./game-demo.js";
import { validateGame002Scene } from "./scene.js";
import type { Game002SkinConfig } from "./skin-config.js";
import {
  createGame002WinAmountLayout,
  createGame002WinAmountPlayer,
} from "./win-amount-config.js";

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

export interface Game002AdapterOptions {
  readonly skin: Game002SkinConfig;
  readonly createApplication?: () => Game002PixiApplication;
  readonly createBackgroundPlayer?: () => SpineBackgroundPlayer;
  readonly loadSymbolTextures?: () => Promise<SymbolAssetMap>;
  readonly createRuntime?: (symbolAssets: SymbolAssetMap) => Game002ReelRuntime;
  readonly createWinAmountPlayer?: (
    layout: ReturnType<typeof createGame002Layout>,
  ) => WinAmountAnimationPlayer;
  readonly reportFatalError?: (error: Error) => void;
}

interface PendingAnimation {
  readonly targetScene: ReturnType<typeof validateGame002Scene>;
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
  readonly winAmountExpected: boolean;
  reelsComplete: boolean;
  winAmountPlaybackComplete: boolean;
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
  readonly #skin: Game002SkinConfig;
  readonly #createApplication: () => Game002PixiApplication;
  readonly #createBackgroundPlayer: () => SpineBackgroundPlayer;
  readonly #loadSymbolTextures: () => Promise<SymbolAssetMap>;
  readonly #createRuntime: (symbolAssets: SymbolAssetMap) => Game002ReelRuntime;
  readonly #createWinAmountPlayer: (
    layout: ReturnType<typeof createGame002Layout>,
  ) => WinAmountAnimationPlayer;
  readonly #reportFatalError: (error: Error) => void;
  #app: Game002PixiApplication | null = null;
  #worldLayer: Container | null = null;
  #backgroundPlayer: SpineBackgroundPlayer | null = null;
  #runtime: Game002ReelRuntime | null = null;
  #winAmountPlayer: WinAmountAnimationPlayer | null = null;
  #pendingAnimation: PendingAnimation | null = null;
  #unsubscribeViewport: (() => void) | null = null;
  #disposeWinAmountAdvanceListener: (() => void) | null = null;

  constructor(options: Game002AdapterOptions) {
    const skin = options.skin;
    this.#skin = skin;
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#createBackgroundPlayer =
      options.createBackgroundPlayer ??
      (() => createSpineBackgroundPlayer({ resource: skin.background }));
    this.#loadSymbolTextures =
      options.loadSymbolTextures ?? (() => loadSymbolTextures(skin));
    this.#createRuntime =
      options.createRuntime ??
      ((symbolAssets) =>
        createGame002ReelRuntime({
          rawGameConfig: skin.rawGameConfig,
          symbolAssets,
          config: {
            ...DEFAULT_GAME002_REEL_CONFIG,
            emptySymbols: skin.emptySymbols,
            texturedSymbols: skin.displaySymbols,
            missingAssetLabel: skin.label,
            symbolScales: skin.symbolScales,
            symbolRenderPriorities: skin.symbolRenderPriorities,
            animationResolver: skin.symbolAnimationResolver,
            gridLayout: skin.gridLayout,
            focusRegion: skin.focusRegion,
          },
        }));
    this.#createWinAmountPlayer =
      options.createWinAmountPlayer ?? createGame002WinAmountPlayer;
    this.#reportFatalError = options.reportFatalError ?? reportFatalError;
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#app) {
      throw new Error("game002 adapter is already mounted.");
    }

    const app = this.#createApplication();
    let backgroundPlayer: SpineBackgroundPlayer | null = null;
    let winAmountPlayer: WinAmountAnimationPlayer | null = null;
    let tickerAdded = false;
    try {
      const initialViewport = context.getViewport();
      await app.init({
        width: initialViewport.frameDesignSize.width,
        height: initialViewport.frameDesignSize.height,
        antialias: true,
        autoDensity: false,
        resolution: 1,
      });
      context.gameLayer.replaceChildren(app.canvas);

      const layout = createGame002Layout({
        gridLayout: this.#skin.gridLayout,
        focusRegion: this.#skin.focusRegion,
      });
      backgroundPlayer = this.#createBackgroundPlayer();
      const [, symbolTextures] = await Promise.all([
        backgroundPlayer.init(),
        this.#loadSymbolTextures(),
      ]);
      const runtime = this.#createRuntime(symbolTextures);
      winAmountPlayer = this.#createWinAmountPlayer(layout);
      const worldLayer = new Container();
      worldLayer.addChild(backgroundPlayer.container);
      worldLayer.addChild(runtime.mainReelsLayer);
      worldLayer.addChild(winAmountPlayer.container);
      app.stage.addChild(worldLayer);

      this.#app = app;
      this.#worldLayer = worldLayer;
      this.#backgroundPlayer = backgroundPlayer;
      this.#runtime = runtime;
      this.#winAmountPlayer = winAmountPlayer;
      app.ticker.add(this.#onTick);
      tickerAdded = true;
      const requestWinAmountAdvance = () => {
        this.#winAmountPlayer?.requestAdvance();
      };
      app.canvas.addEventListener("pointerdown", requestWinAmountAdvance);
      this.#disposeWinAmountAdvanceListener = () => {
        app.canvas.removeEventListener("pointerdown", requestWinAmountAdvance);
      };
      this.#applyViewport(initialViewport);
      this.#unsubscribeViewport = context.onViewportChange((viewport) => {
        this.#applyViewport(viewport);
      });
    } catch (error) {
      this.#unsubscribeViewport?.();
      this.#unsubscribeViewport = null;
      this.#disposeWinAmountAdvanceListener?.();
      this.#disposeWinAmountAdvanceListener = null;
      if (tickerAdded) {
        app.ticker.remove(this.#onTick);
      }
      app.ticker.stop();
      winAmountPlayer?.destroy();
      backgroundPlayer?.destroy();
      app.canvas.remove();
      app.destroy();
      this.#app = null;
      this.#worldLayer = null;
      this.#backgroundPlayer = null;
      this.#runtime = null;
      this.#winAmountPlayer = null;
      throw error;
    }
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
    const betAmountRaw = logic.getBet() * logic.getLines();
    const winAmountRaw = logic.getTotalWin();
    assertValidWinAmountInput(betAmountRaw, winAmountRaw);
    this.#requireWinAmountPlayer().dismissImmediately();
    const targetScene = validateGame002Scene(
      logic.getStep(0).getScene(0),
      "spin main scene",
    );
    runtime.spinToScene(targetScene, "spin main scene");

    return new Promise((resolve, reject) => {
      this.#pendingAnimation = {
        targetScene,
        betAmountRaw,
        winAmountRaw,
        winAmountExpected: winAmountRaw > 0,
        reelsComplete: false,
        winAmountPlaybackComplete: winAmountRaw <= 0,
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
    this.#disposeWinAmountAdvanceListener?.();
    this.#disposeWinAmountAdvanceListener = null;
    this.#app?.ticker.remove(this.#onTick);
    this.#app?.ticker.stop();
    this.#winAmountPlayer?.destroy();
    this.#backgroundPlayer?.destroy();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
    this.#worldLayer = null;
    this.#backgroundPlayer = null;
    this.#runtime = null;
    this.#winAmountPlayer = null;
  }

  readonly #onTick: Game002TickerListener = (ticker) => {
    if (!this.#runtime || !this.#backgroundPlayer) {
      return;
    }

    try {
      const deltaSeconds = normalizeTickerDeltaSeconds(ticker);
      this.#backgroundPlayer.update(deltaSeconds);
      const pending = this.#pendingAnimation;
      if (!pending) {
        if (this.#winAmountPlayer?.isPlaying()) {
          this.#winAmountPlayer.update(deltaSeconds);
        }
        return;
      }
      if (!pending.reelsComplete) {
        const result = this.#runtime.update(deltaSeconds);
        if (!result.completed) {
          return;
        }
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          pending.targetScene,
          "completed game002 adapter spin",
        );
        pending.reelsComplete = true;
        if (pending.winAmountExpected) {
          this.#requireWinAmountPlayer().start({
            betAmountRaw: pending.betAmountRaw,
            winAmountRaw: pending.winAmountRaw,
          });
        }
      }
      if (pending.winAmountExpected && !pending.winAmountPlaybackComplete) {
        const result = this.#requireWinAmountPlayer().update(deltaSeconds);
        pending.winAmountPlaybackComplete = !isWinAmountBlockingSpin(
          result.phase,
        );
      }
      if (pending.reelsComplete && pending.winAmountPlaybackComplete) {
        this.#pendingAnimation = null;
        pending.resolve();
      }
    } catch (error) {
      this.#app?.ticker.stop();
      const failure = error instanceof Error ? error : new Error(String(error));
      const hadPendingAnimation = this.#pendingAnimation !== null;
      this.#rejectPending(failure);
      if (!hadPendingAnimation) {
        this.#reportFatalError(failure);
      }
    }
  };

  #requireRuntime(): Game002ReelRuntime {
    if (!this.#runtime) {
      throw new Error("game002 adapter is not mounted.");
    }
    return this.#runtime;
  }

  #requireWinAmountPlayer(): WinAmountAnimationPlayer {
    if (!this.#winAmountPlayer) {
      throw new Error("game002 adapter is not mounted.");
    }
    return this.#winAmountPlayer;
  }

  #applyViewport(viewport: SlotGameViewportSnapshot): void {
    if (!this.#app || !this.#worldLayer) {
      throw new Error("game002 adapter is not mounted.");
    }
    const layout = createGame002Layout({
      viewportSize: viewport.frameDesignSize,
      gridLayout: this.#skin.gridLayout,
      focusRegion: this.#skin.focusRegion,
    });
    this.#app.renderer.resize(
      layout.viewportSize.width,
      layout.viewportSize.height,
    );
    this.#worldLayer.position.set(layout.worldOffset.x, layout.worldOffset.y);
    this.#winAmountPlayer?.applyLayout(createGame002WinAmountLayout(layout));
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

function isWinAmountBlockingSpin(phase: WinAmountAnimationPhase): boolean {
  return (
    phase === "minor-counting" ||
    phase === "major-counting" ||
    phase === "tier-counting"
  );
}

function assertValidWinAmountInput(
  betAmountRaw: number,
  winAmountRaw: number,
): void {
  if (!Number.isFinite(betAmountRaw) || betAmountRaw <= 0) {
    throw new Error("game002 bet amount must be a finite positive number.");
  }
  if (!Number.isFinite(winAmountRaw) || winAmountRaw < 0) {
    throw new Error("game002 win amount must be a finite non-negative number.");
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

async function loadSymbolTextures(
  skin: Game002SkinConfig,
): Promise<SymbolAssetMap> {
  const assetUrls = createGame002SymbolAssetMapFromModules({
    modules: skin.symbolModules,
    stateTextureManifest: skin.stateTextureManifest,
    displaySymbols: skin.displaySymbols,
  });
  return loadGame002SymbolTextures(assetUrls);
}

function reportFatalError(error: Error): void {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
    return;
  }
  console.error(error);
}
