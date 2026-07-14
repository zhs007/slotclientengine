import { Application, Container } from "pixi.js";
import type {
  GameLogic,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotGameStateSnapshot,
  SlotGameViewportSnapshot,
} from "@slotclientengine/gameframeworks";
import {
  createSymbolWinCarousel,
  createSymbolValuePresenter,
  type CreateSymbolWinCarouselOptions,
  type CreateSymbolValuePresenterOptions,
  type PreparedSymbolValuePresentation,
  type PreparedSymbolWinCarousel,
  type SymbolAssetMap,
  type SymbolValuePresenter,
  type SymbolWinCarousel,
} from "@slotclientengine/rendercore";
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
import { formatServerUsdAmount } from "./money.js";
import {
  GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS,
  GAME002_WIN_COMPONENT_NAMES,
  resolveGame002WinResultAmount,
  validateGame002WinComponent,
} from "./win-symbol-carousel-config.js";
import {
  createGame002CnPresentationValues,
  createGame002CnValueItems,
  GAME002_CN_VALUE_COMPONENT_NAME,
  GAME002_CN_VALUE_SYMBOL,
} from "./cn-value-sequence.js";

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
  readonly createSymbolWinCarousel?: (
    options: CreateSymbolWinCarouselOptions,
  ) => SymbolWinCarousel;
  readonly createSymbolValuePresenter?: (
    options: CreateSymbolValuePresenterOptions,
  ) => SymbolValuePresenter;
  readonly reportFatalError?: (error: Error) => void;
}

interface PendingAnimation {
  phase: "spinning" | "win-sequence";
  readonly targetScene: ReturnType<typeof validateGame002Scene>;
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
  readonly winAmountExpected: boolean;
  readonly preparedWinCarousel: PreparedSymbolWinCarousel;
  readonly preparedCnValues: PreparedSymbolValuePresentation;
  winSequenceComplete: boolean;
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
  readonly #createSymbolWinCarousel: (
    options: CreateSymbolWinCarouselOptions,
  ) => SymbolWinCarousel;
  readonly #createSymbolValuePresenter: (
    options: CreateSymbolValuePresenterOptions,
  ) => SymbolValuePresenter;
  readonly #reportFatalError: (error: Error) => void;
  #app: Game002PixiApplication | null = null;
  #worldLayer: Container | null = null;
  #backgroundPlayer: SpineBackgroundPlayer | null = null;
  #runtime: Game002ReelRuntime | null = null;
  #winAmountPlayer: WinAmountAnimationPlayer | null = null;
  #symbolWinCarousel: SymbolWinCarousel | null = null;
  #symbolValuePresenter: SymbolValuePresenter | null = null;
  #pendingAnimation: PendingAnimation | null = null;
  #preparingSpin = false;
  #lifecycleVersion = 0;
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
    this.#createSymbolWinCarousel =
      options.createSymbolWinCarousel ?? createSymbolWinCarousel;
    this.#createSymbolValuePresenter =
      options.createSymbolValuePresenter ?? createSymbolValuePresenter;
    this.#reportFatalError = options.reportFatalError ?? reportFatalError;
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#app) {
      throw new Error("game002 adapter is already mounted.");
    }

    const app = this.#createApplication();
    let backgroundPlayer: SpineBackgroundPlayer | null = null;
    let winAmountPlayer: WinAmountAnimationPlayer | null = null;
    let symbolWinCarousel: SymbolWinCarousel | null = null;
    let symbolValuePresenter: SymbolValuePresenter | null = null;
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
      symbolWinCarousel = this.#createSymbolWinCarousel({
        target: runtime,
        resolveAmount: resolveGame002WinResultAmount,
        validateComponent: validateGame002WinComponent,
        formatAmount: formatServerUsdAmount,
        ...GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS,
      });
      symbolValuePresenter = this.#createSymbolValuePresenter({
        target: runtime,
        resources: this.#skin.symbolValuePresentationResources,
      });
      symbolWinCarousel.container.position.set(
        runtime.layerLayout.x,
        runtime.layerLayout.y,
      );
      const worldLayer = new Container();
      worldLayer.addChild(backgroundPlayer.container);
      worldLayer.addChild(runtime.mainReelsLayer);
      worldLayer.addChild(symbolWinCarousel.container);
      worldLayer.addChild(winAmountPlayer.container);
      app.stage.addChild(worldLayer);

      this.#app = app;
      this.#worldLayer = worldLayer;
      this.#backgroundPlayer = backgroundPlayer;
      this.#runtime = runtime;
      this.#winAmountPlayer = winAmountPlayer;
      this.#symbolWinCarousel = symbolWinCarousel;
      this.#symbolValuePresenter = symbolValuePresenter;
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
      symbolWinCarousel?.destroy();
      symbolValuePresenter?.destroy();
      backgroundPlayer?.destroy();
      app.canvas.remove();
      app.destroy();
      this.#app = null;
      this.#worldLayer = null;
      this.#backgroundPlayer = null;
      this.#runtime = null;
      this.#winAmountPlayer = null;
      this.#symbolWinCarousel = null;
      this.#symbolValuePresenter = null;
      throw error;
    }
  }

  applyInitialState(state: SlotGameInitialState): void {
    const runtime = this.#requireRuntime();
    this.#requireSymbolValuePresenter().clear();
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
    if (this.#pendingAnimation || this.#preparingSpin) {
      throw new Error("game002 adapter animation is already in progress.");
    }
    const targetScene = validateGame002Scene(
      logic.getStep(0).getScene(0),
      "spin main scene",
    );
    const preparedWinCarousel = this.#requireSymbolWinCarousel().prepare({
      logic,
      stepIndex: 0,
      scene: targetScene,
      componentNames: GAME002_WIN_COMPONENT_NAMES,
    });
    const betAmountRaw = logic.getBet() * logic.getLines();
    const winAmountRaw = logic.getTotalWin();
    assertValidWinAmountInput(betAmountRaw, winAmountRaw);
    const cnSymbolCode = runtime.gameConfig.getSymbolCode(
      GAME002_CN_VALUE_SYMBOL,
    );
    if (cnSymbolCode === undefined) {
      throw new Error("game002 game config is missing CN symbol code.");
    }
    const cnValueItems = createGame002CnValueItems({
      logic,
      targetScene,
      cnSymbolCode,
      componentName: GAME002_CN_VALUE_COMPONENT_NAME,
    });
    const cnTargetPresentationValues =
      cnValueItems.length === 0
        ? undefined
        : createGame002CnPresentationValues({
            targetScene,
            items: cnValueItems,
          });
    this.#preparingSpin = true;
    const lifecycleVersion = this.#lifecycleVersion;
    return this.#requireSymbolValuePresenter()
      .prepare(cnValueItems)
      .then(
        (preparedCnValues) => {
          if (lifecycleVersion !== this.#lifecycleVersion || !this.#runtime) {
            throw new Error(
              "game002 adapter was destroyed during spin prepare.",
            );
          }
          this.#preparingSpin = false;
          this.#requireSymbolValuePresenter().clear();
          this.#requireSymbolWinCarousel().clear();
          this.#requireWinAmountPlayer().dismissImmediately();
          runtime.spinToScene(
            targetScene,
            "spin main scene",
            cnTargetPresentationValues,
          );
          return new Promise<void>((resolve, reject) => {
            this.#pendingAnimation = {
              phase: "spinning",
              targetScene,
              betAmountRaw,
              winAmountRaw,
              winAmountExpected: winAmountRaw > 0,
              preparedWinCarousel,
              preparedCnValues,
              winSequenceComplete: preparedWinCarousel.groupCount === 0,
              winAmountPlaybackComplete: winAmountRaw <= 0,
              resolve,
              reject,
            };
          });
        },
        (error: unknown) => {
          this.#preparingSpin = false;
          throw error;
        },
      );
  }

  setFrameworkState(_state: SlotGameStateSnapshot): void {
    return undefined;
  }

  destroy(): void {
    this.#lifecycleVersion += 1;
    this.#preparingSpin = false;
    this.#rejectPending(new Error("game002 adapter was destroyed."));
    this.#unsubscribeViewport?.();
    this.#unsubscribeViewport = null;
    this.#disposeWinAmountAdvanceListener?.();
    this.#disposeWinAmountAdvanceListener = null;
    this.#app?.ticker.remove(this.#onTick);
    this.#app?.ticker.stop();
    this.#winAmountPlayer?.destroy();
    this.#symbolWinCarousel?.destroy();
    this.#symbolValuePresenter?.destroy();
    this.#backgroundPlayer?.destroy();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
    this.#worldLayer = null;
    this.#backgroundPlayer = null;
    this.#runtime = null;
    this.#winAmountPlayer = null;
    this.#symbolWinCarousel = null;
    this.#symbolValuePresenter = null;
  }

  readonly #onTick: Game002TickerListener = (ticker) => {
    if (!this.#runtime || !this.#backgroundPlayer) {
      return;
    }

    try {
      const deltaSeconds = normalizeTickerDeltaSeconds(ticker);
      this.#backgroundPlayer.update(deltaSeconds);
      this.#symbolValuePresenter?.update(deltaSeconds);
      const pending = this.#pendingAnimation;
      if (!pending) {
        if (this.#winAmountPlayer?.isPlaying()) {
          this.#winAmountPlayer.update(deltaSeconds);
        }
        const carousel = this.#symbolWinCarousel;
        const carouselPhase = carousel?.getSnapshot().phase ?? "idle";
        if (carousel && carouselPhase === "playing") {
          carousel.update(deltaSeconds);
        } else {
          this.#runtime.update(deltaSeconds);
          if (carousel && carouselPhase === "cycle-pause") {
            carousel.update(deltaSeconds);
          }
        }
        return;
      }
      let reelsUpdated = false;
      if (pending.phase === "spinning") {
        const reelResult = this.#runtime.update(deltaSeconds);
        reelsUpdated = true;
        if (!reelResult.completed) {
          return;
        }
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          pending.targetScene,
          "completed game002 adapter spin",
        );
        this.#requireSymbolValuePresenter().discard(pending.preparedCnValues);
        pending.phase = "win-sequence";
        if (!pending.winSequenceComplete) {
          this.#requireSymbolWinCarousel().start(pending.preparedWinCarousel);
        }
        if (pending.winAmountExpected) {
          this.#requireWinAmountPlayer().start({
            betAmountRaw: pending.betAmountRaw,
            winAmountRaw: pending.winAmountRaw,
          });
        }
      }
      if (!pending.winSequenceComplete) {
        const result = this.#requireSymbolWinCarousel().update(
          reelsUpdated ? 0 : deltaSeconds,
        );
        pending.winSequenceComplete = result.firstCycleComplete;
      } else if (!reelsUpdated) {
        this.#runtime.update(deltaSeconds);
      }
      if (pending.winAmountExpected && !pending.winAmountPlaybackComplete) {
        const result = this.#requireWinAmountPlayer().update(deltaSeconds);
        pending.winAmountPlaybackComplete = !isWinAmountBlockingSpin(
          result.phase,
        );
      }
      if (
        pending.phase === "win-sequence" &&
        pending.winSequenceComplete &&
        pending.winAmountPlaybackComplete
      ) {
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

  #requireSymbolWinCarousel(): SymbolWinCarousel {
    if (!this.#symbolWinCarousel) {
      throw new Error("game002 adapter is not mounted.");
    }
    return this.#symbolWinCarousel;
  }

  #requireSymbolValuePresenter(): SymbolValuePresenter {
    if (!this.#symbolValuePresenter) {
      throw new Error("game002 adapter is not mounted.");
    }
    return this.#symbolValuePresenter;
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
    if (this.#runtime && this.#symbolWinCarousel) {
      this.#symbolWinCarousel.container.position.set(
        this.#runtime.layerLayout.x,
        this.#runtime.layerLayout.y,
      );
    }
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
