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
  type CreateSymbolWinCarouselOptions,
  type PreparedSymbolWinCarousel,
  type SymbolWinCarousel,
  type VisibleSymbolPresentationTarget,
} from "@slotclientengine/rendercore";
import type {
  WinAmountAnimationPhase,
  WinAmountAnimationPlayer,
} from "@slotclientengine/rendercore/win-amount";
import {
  createGame003CoinOverlayRuntime,
  type Game003CoinOverlayRuntime,
} from "./coin-overlay-runtime.js";
import {
  createGame003CoinOverlayItems,
  type Game003CoinOverlayItem,
} from "./coin-overlay-sequence.js";
import {
  assertGame003ReelVisualMatchesTarget,
  type Game003ReelRuntime,
} from "./game-demo.js";
import { formatServerAmount } from "./money.js";
import {
  createGame003SceneLayoutPresentation,
  type Game003SceneLayoutPresentation,
} from "./scene-layout-presentation.js";
import { validateGame003Scene } from "./scene.js";
import type { Game003SkinConfig } from "./skin-config.js";
import {
  GAME003_WIN_COMPONENT_NAMES,
  resolveGame003WinResultAmount,
  validateGame003WinComponent,
} from "./win-sequence.js";

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

export interface Game003AdapterOptions {
  readonly skin: Game003SkinConfig;
  readonly createApplication?: () => Game003PixiApplication;
  readonly createCoinOverlayRuntime?: (
    reelRuntime: Game003ReelRuntime,
  ) => Game003CoinOverlayRuntime;
  readonly createSymbolWinCarousel?: (
    options: CreateSymbolWinCarouselOptions,
  ) => SymbolWinCarousel;
  readonly createSceneLayoutPresentation?: (
    skin: Game003SkinConfig,
  ) => Promise<Game003SceneLayoutPresentation>;
}

interface PendingAnimation {
  readonly targetScene: ReturnType<typeof validateGame003Scene>;
  readonly coinOverlayItems: readonly Game003CoinOverlayItem[];
  readonly preparedWinCarousel: PreparedSymbolWinCarousel;
  readonly winAmountExpected: boolean;
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
  phase: "spinning" | "win-sequence";
  winSequenceComplete: boolean;
  winAmountPlaybackComplete: boolean;
  resolve(): void;
  reject(error: Error): void;
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
  readonly #createCoinOverlayRuntime: (
    reelRuntime: Game003ReelRuntime,
  ) => Game003CoinOverlayRuntime;
  readonly #createSymbolWinCarousel: (
    options: CreateSymbolWinCarouselOptions,
  ) => SymbolWinCarousel;
  readonly #createSceneLayoutPresentation: (
    skin: Game003SkinConfig,
  ) => Promise<Game003SceneLayoutPresentation>;
  #app: Game003PixiApplication | null = null;
  #runtime: Game003ReelRuntime | null = null;
  #coinOverlayRuntime: Game003CoinOverlayRuntime | null = null;
  #winAmountPlayer: WinAmountAnimationPlayer | null = null;
  #winSymbolLoopRuntime: SymbolWinCarousel | null = null;
  #sceneLayoutPresentation: Game003SceneLayoutPresentation | null = null;
  #pendingAnimation: PendingAnimation | null = null;
  #unsubscribeViewport: (() => void) | null = null;
  #disposeWinAmountAdvanceListener: (() => void) | null = null;

  constructor(options: Game003AdapterOptions) {
    this.#skin = options.skin;
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#createCoinOverlayRuntime =
      options.createCoinOverlayRuntime ??
      ((reelRuntime) =>
        createGame003CoinOverlayRuntime({
          reelRuntime,
          config: this.#skin.coinOverlay,
        }));
    this.#createSymbolWinCarousel =
      options.createSymbolWinCarousel ?? createSymbolWinCarousel;
    this.#createSceneLayoutPresentation =
      options.createSceneLayoutPresentation ??
      createGame003SceneLayoutPresentation;
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

    const presentation = await this.#createSceneLayoutPresentation(this.#skin);
    try {
      const runtime = presentation.reelRuntime;
      const coinOverlayRuntime = this.#createCoinOverlayRuntime(runtime);
      const winSymbolLoopRuntime = this.#createSymbolWinCarousel({
        target: createSceneLayoutCarouselTarget(runtime),
        resolveAmount: resolveGame003WinResultAmount,
        validateComponent: validateGame003WinComponent,
        formatAmount: formatServerAmount,
        cyclePauseSeconds: this.#skin.winSymbolLoop.cyclePauseSeconds,
        amountText: this.#skin.winSymbolLoop.resultAmount,
      });
      runtime.mainReelsLayer.addChild(
        coinOverlayRuntime.container,
        winSymbolLoopRuntime.container,
      );
      app.stage.addChild(presentation.packageRuntime.container);
      app.ticker.add(this.#onTick);

      this.#app = app;
      this.#runtime = runtime;
      this.#coinOverlayRuntime = coinOverlayRuntime;
      this.#winAmountPlayer = presentation.winAmountPlayer;
      this.#winSymbolLoopRuntime = winSymbolLoopRuntime;
      this.#sceneLayoutPresentation = presentation;

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
      presentation.destroy();
      app.destroy();
      throw error;
    }
  }

  applyInitialState(state: SlotGameInitialState): void {
    const runtime = this.#requireRuntime();
    this.#requireCoinOverlayRuntime().clear();
    if (state.defaultScene !== undefined) {
      runtime.applyScene(
        validateGame003Scene(state.defaultScene, "live defaultScene"),
        "live defaultScene",
      );
    }
  }

  playSpin(logic: GameLogic): Promise<void> {
    const runtime = this.#requireRuntime();
    if (this.#pendingAnimation) {
      throw new Error("game003 adapter animation is already in progress.");
    }
    this.#requireCoinOverlayRuntime().clear();
    const targetScene = validateGame003Scene(
      logic.getStep(0).getScene(0),
      "spin main scene",
    );
    const coinSymbolCode = runtime.gameConfig.getSymbolCode(
      this.#skin.coinOverlay.coinSymbol,
    );
    if (coinSymbolCode === undefined) {
      throw new Error(
        `game003 coin symbol "${this.#skin.coinOverlay.coinSymbol}" is missing from game config.`,
      );
    }
    const coinOverlayItems = createGame003CoinOverlayItems({
      logic,
      targetScene,
      coinSymbolCode,
      componentName: this.#skin.coinOverlay.componentName,
    });
    const preparedWinCarousel = this.#requireWinSymbolLoopRuntime().prepare({
      logic,
      stepIndex: 0,
      scene: targetScene,
      componentNames: GAME003_WIN_COMPONENT_NAMES,
    });
    const betAmountRaw = logic.getBet() * logic.getLines();
    const winAmountRaw = logic.getTotalWin();
    this.#winSymbolLoopRuntime?.clear();
    this.#requireWinAmountPlayer().dismissImmediately();
    runtime.spinToScene(targetScene, "spin main scene");

    return new Promise((resolve, reject) => {
      this.#pendingAnimation = {
        targetScene,
        coinOverlayItems,
        preparedWinCarousel,
        winAmountExpected: winAmountRaw > 0,
        betAmountRaw,
        winAmountRaw,
        phase: "spinning",
        winSequenceComplete: preparedWinCarousel.groupCount === 0,
        winAmountPlaybackComplete: winAmountRaw <= 0,
        resolve,
        reject,
      };
    });
  }

  setFrameworkState(_state: SlotGameStateSnapshot): void {}

  destroy(): void {
    this.#rejectPending(new Error("game003 adapter was destroyed."));
    this.#unsubscribeViewport?.();
    this.#unsubscribeViewport = null;
    this.#disposeWinAmountAdvanceListener?.();
    this.#disposeWinAmountAdvanceListener = null;
    this.#app?.ticker.remove(this.#onTick);
    this.#app?.ticker.stop();
    this.#winSymbolLoopRuntime?.destroy();
    this.#winAmountPlayer?.destroy();
    this.#coinOverlayRuntime?.destroy();
    this.#sceneLayoutPresentation?.destroy();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
    this.#runtime = null;
    this.#coinOverlayRuntime = null;
    this.#winAmountPlayer = null;
    this.#winSymbolLoopRuntime = null;
    this.#sceneLayoutPresentation = null;
  }

  readonly #onTick: Game003TickerListener = (ticker) => {
    if (!this.#runtime) return;
    try {
      const deltaSeconds = normalizeTickerDeltaSeconds(ticker);
      const pending = this.#pendingAnimation;
      if (!pending) this.#tickLingeringAnimations(deltaSeconds);
      else if (pending.phase === "spinning") {
        this.#tickSpinPhase(deltaSeconds, pending);
      } else {
        this.#tickWinSequencePhase(deltaSeconds, pending);
      }
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.#app?.ticker.stop();
      if (this.#pendingAnimation) this.#rejectPending(normalizedError);
      else throw normalizedError;
    }
  };

  #tickLingeringAnimations(deltaSeconds: number): void {
    this.#requireRuntime().update(deltaSeconds);
    if (this.#winAmountPlayer?.isPlaying()) {
      this.#winAmountPlayer.update(deltaSeconds);
    }
    const carousel = this.#winSymbolLoopRuntime;
    if (carousel && carousel.getSnapshot().phase !== "idle") {
      carousel.update(deltaSeconds);
    }
  }

  #tickSpinPhase(deltaSeconds: number, pending: PendingAnimation): void {
    const runtime = this.#requireRuntime();
    const result = runtime.update(deltaSeconds);
    if (!result.completed) return;

    assertGame003ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      pending.targetScene,
      "completed game003 adapter spin",
    );
    this.#requireCoinOverlayRuntime().show(pending.coinOverlayItems);
    if (pending.winAmountExpected) {
      this.#requireWinAmountPlayer().start({
        betAmountRaw: pending.betAmountRaw,
        winAmountRaw: pending.winAmountRaw,
      });
    }
    pending.phase = "win-sequence";
    if (!pending.winSequenceComplete) {
      this.#requireWinSymbolLoopRuntime().start(pending.preparedWinCarousel);
    }
    this.#completePendingIfReady(pending);
  }

  #tickWinSequencePhase(deltaSeconds: number, pending: PendingAnimation): void {
    this.#requireRuntime().update(deltaSeconds);
    const carousel = this.#requireWinSymbolLoopRuntime();
    if (carousel.getSnapshot().phase !== "idle") {
      const result = carousel.update(deltaSeconds);
      if (result.firstCycleComplete) pending.winSequenceComplete = true;
    }
    if (pending.winAmountExpected && !pending.winAmountPlaybackComplete) {
      const result = this.#requireWinAmountPlayer().update(deltaSeconds);
      pending.winAmountPlaybackComplete = !isWinAmountBlockingSpin(
        result.phase,
      );
    }
    this.#completePendingIfReady(pending);
  }

  #completePendingIfReady(pending: PendingAnimation): void {
    if (!pending.winSequenceComplete || !pending.winAmountPlaybackComplete) {
      return;
    }
    if (this.#pendingAnimation === pending) {
      this.#pendingAnimation = null;
      pending.resolve();
    }
  }

  #applyViewport(viewport: SlotGameViewportSnapshot): void {
    if (
      !this.#app ||
      !this.#sceneLayoutPresentation ||
      !this.#coinOverlayRuntime
    ) {
      throw new Error("game003 adapter is not mounted.");
    }
    this.#app.renderer.resize(
      viewport.frameDesignSize.width,
      viewport.frameDesignSize.height,
    );
    this.#sceneLayoutPresentation.applyViewport(viewport.frameDesignSize);
    this.#coinOverlayRuntime.refresh();
  }

  #requireRuntime(): Game003ReelRuntime {
    if (!this.#runtime) throw new Error("game003 adapter is not mounted.");
    return this.#runtime;
  }

  #requireCoinOverlayRuntime(): Game003CoinOverlayRuntime {
    if (!this.#coinOverlayRuntime) {
      throw new Error("game003 adapter is not mounted.");
    }
    return this.#coinOverlayRuntime;
  }

  #requireWinAmountPlayer(): WinAmountAnimationPlayer {
    if (!this.#winAmountPlayer) {
      throw new Error("game003 adapter is not mounted.");
    }
    return this.#winAmountPlayer;
  }

  #requireWinSymbolLoopRuntime(): SymbolWinCarousel {
    if (!this.#winSymbolLoopRuntime) {
      throw new Error("game003 adapter is not mounted.");
    }
    return this.#winSymbolLoopRuntime;
  }

  #rejectPending(error: Error): void {
    const pending = this.#pendingAnimation;
    if (!pending) return;
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

function isWinAmountBlockingSpin(phase: WinAmountAnimationPhase): boolean {
  return (
    phase === "minor-counting" ||
    phase === "major-counting" ||
    phase === "tier-counting"
  );
}

function createPixiApplication(): Game003PixiApplication {
  return new Application() as unknown as Game003PixiApplication;
}

function createSceneLayoutCarouselTarget(
  runtime: Game003ReelRuntime,
): VisibleSymbolPresentationTarget {
  return Object.freeze({
    requestVisibleSymbolStates(
      positions: readonly { readonly x: number; readonly y: number }[],
      state: string,
    ): void {
      runtime.requestVisibleSymbolStates(positions, state);
    },
    getVisibleSymbolStateSnapshots(
      positions: readonly { readonly x: number; readonly y: number }[],
    ) {
      return runtime.getVisibleSymbolStateSnapshots(positions);
    },
    getVisibleSymbolGeometrySnapshots(
      positions: readonly { readonly x: number; readonly y: number }[],
    ) {
      return runtime.getVisibleSymbolGeometrySnapshots(positions);
    },
    update(): void {
      // The package runtime advances all presentation layers per adapter tick.
    },
  });
}
