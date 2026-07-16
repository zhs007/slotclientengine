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
  assertSymbolValueDisplayResource,
  createSymbolCascadePlayer,
  type CreateSymbolCascadePlayerOptions,
  type CreateSymbolWinCarouselOptions,
  type CreateSymbolValuePresenterOptions,
  type SymbolWinCarousel,
  type SymbolValuePresenter,
  type PreparedSymbolCascade,
  type SymbolAssetMap,
  type SymbolCascadePlayer,
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
import {
  createGame002GridCellDimming,
  createGame002Layout,
} from "./game-layout.js";
import {
  DEFAULT_GAME002_REEL_CONFIG,
  assertGame002ReelVisualMatchesTarget,
  createGame002ReelRuntime,
  type Game002ReelRuntime,
} from "./game-demo.js";
import { sceneEquals, validateGame002Scene } from "./scene.js";
import type { Game002SkinConfig } from "./skin-config.js";
import {
  createGame002WinAmountLayout,
  createGame002WinAmountPlayer,
} from "./win-amount-config.js";
import { formatServerUsdAmount } from "./money.js";
import { GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS } from "./win-symbol-carousel-config.js";
import { GAME002_CN_VALUE_SYMBOL } from "./cn-value-sequence.js";
import { createGame002WinSummaryCollectOptions } from "./cascade-win-summary-config.js";
import { resolveGame002WinResultCashAmount } from "./cascade-win-summary-config.js";
import { resolveGame002WinResultCoinAmount } from "./cascade-win-summary-config.js";
import {
  createGame002CascadeSequence,
  type Game002CascadeSequence,
  type Game002WinRemoveStage,
} from "./cascade-sequence.js";
import {
  GAME002_CASCADE_MOTION,
  GAME002_CASCADE_PRESENTATION,
  canGame002CascadeDropSymbol,
  canGame002CascadeRemoveSymbol,
  isGame002SequentialWinCompanionSymbol,
} from "./cascade-config.js";

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
  readonly createSymbolCascadePlayer?: (
    options: CreateSymbolCascadePlayerOptions,
  ) => SymbolCascadePlayer;
  /** @deprecated task 95 uses createSymbolCascadePlayer. */
  readonly createSymbolWinCarousel?: (
    options: CreateSymbolWinCarouselOptions,
  ) => SymbolWinCarousel;
  /** @deprecated task 95 no longer creates a detached value presenter. */
  readonly createSymbolValuePresenter?: (
    options: CreateSymbolValuePresenterOptions,
  ) => SymbolValuePresenter;
  readonly reportFatalError?: (error: Error) => void;
}

interface PendingAnimation {
  phase:
    | "initial-spin"
    | "step-win-remove"
    | "cascade-unified-fall"
    | "cascade-dropdown"
    | "refill-sweep"
    | "refill-spin"
    | "finalizing"
    | "win-amount";
  readonly sequence: Game002CascadeSequence;
  cascadeIndex: number;
  activeWinStage: Game002WinRemoveStage | null;
  preparedCascade: PreparedSymbolCascade | null;
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
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
  readonly #createSymbolCascadePlayer: (
    options: CreateSymbolCascadePlayerOptions,
  ) => SymbolCascadePlayer;
  readonly #reportFatalError: (error: Error) => void;
  #app: Game002PixiApplication | null = null;
  #worldLayer: Container | null = null;
  #backgroundPlayer: SpineBackgroundPlayer | null = null;
  #runtime: Game002ReelRuntime | null = null;
  #winAmountPlayer: WinAmountAnimationPlayer | null = null;
  #symbolCascadePlayer: SymbolCascadePlayer | null = null;
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
            symbolAnimationCapabilities: skin.symbolAnimationCapabilities,
            symbolStatePreset: skin.symbolStatePreset,
            animationResolver: skin.symbolAnimationResolver,
            timing: skin.reelManifest.spin.timing,
            reelManifest: skin.reelManifest,
            reelEffectResources: skin.reelEffectResources,
            reelEffectPoolCapacities: skin.reelEffectPoolCapacities,
            dimming: createGame002GridCellDimming(
              skin.reelManifest.spin.dimmingAlpha,
            ),
            spinBounceStrength: skin.reelManifest.spin.bounceStrength,
            gridLayout: skin.gridLayout,
            focusRegion: skin.focusRegion,
          },
        }));
    this.#createWinAmountPlayer =
      options.createWinAmountPlayer ?? createGame002WinAmountPlayer;
    this.#createSymbolCascadePlayer =
      options.createSymbolCascadePlayer ?? createSymbolCascadePlayer;
    this.#reportFatalError = options.reportFatalError ?? reportFatalError;
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#app) {
      throw new Error("game002 adapter is already mounted.");
    }

    const app = this.#createApplication();
    let backgroundPlayer: SpineBackgroundPlayer | null = null;
    let runtime: Game002ReelRuntime | null = null;
    let winAmountPlayer: WinAmountAnimationPlayer | null = null;
    let symbolCascadePlayer: SymbolCascadePlayer | null = null;
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
      runtime = this.#createRuntime(symbolTextures);
      await runtime.prepare();
      winAmountPlayer = this.#createWinAmountPlayer(layout);
      symbolCascadePlayer = this.#createSymbolCascadePlayer({
        target: runtime,
        formatAmount: formatServerUsdAmount,
        amountText: GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS.amountText,
        emphasisSeconds: GAME002_CASCADE_PRESENTATION.emphasisSeconds,
        dimmingInSeconds: GAME002_CASCADE_PRESENTATION.dimmingInSeconds,
        dimmingOutSeconds: GAME002_CASCADE_PRESENTATION.dimmingOutSeconds,
        nonWinningDimmingAlpha:
          GAME002_CASCADE_PRESENTATION.nonWinningDimmingAlpha,
        winSummaryCollect: createGame002WinSummaryCollectOptions({
          runtime,
          skin: this.#skin,
        }),
      });
      symbolCascadePlayer.container.position.set(
        runtime.layerLayout.x,
        runtime.layerLayout.y,
      );
      const worldLayer = new Container();
      worldLayer.addChild(backgroundPlayer.container);
      worldLayer.addChild(runtime.mainReelsLayer);
      worldLayer.addChild(symbolCascadePlayer.container);
      worldLayer.addChild(winAmountPlayer.container);
      app.stage.addChild(worldLayer);

      this.#app = app;
      this.#worldLayer = worldLayer;
      this.#backgroundPlayer = backgroundPlayer;
      this.#runtime = runtime;
      this.#winAmountPlayer = winAmountPlayer;
      this.#symbolCascadePlayer = symbolCascadePlayer;
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
      symbolCascadePlayer?.destroy();
      runtime?.destroy();
      backgroundPlayer?.destroy();
      app.canvas.remove();
      app.destroy();
      this.#app = null;
      this.#worldLayer = null;
      this.#backgroundPlayer = null;
      this.#runtime = null;
      this.#winAmountPlayer = null;
      this.#symbolCascadePlayer = null;
      throw error;
    }
  }

  applyInitialState(state: SlotGameInitialState): void {
    const runtime = this.#requireRuntime();
    this.#requireSymbolCascadePlayer().clear();
    runtime.resetPresentationState();
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
    const cnSymbolCode = runtime.gameConfig.getSymbolCode(
      GAME002_CN_VALUE_SYMBOL,
    );
    if (cnSymbolCode === undefined) {
      throw new Error("game002 game config is missing CN symbol code.");
    }
    const sequence = createGame002CascadeSequence({
      logic,
      cnSymbolCode,
      canRemoveSymbol: ({ code }) =>
        canGame002CascadeRemoveSymbol(
          resolveGame002CascadeSymbol(runtime, code),
        ),
      canDropSymbol: ({ code }) =>
        canGame002CascadeDropSymbol(resolveGame002CascadeSymbol(runtime, code)),
    });
    assertCascadeResources(sequence, runtime, this.#skin);
    this.#requireSymbolCascadePlayer().clear();
    this.#requireWinAmountPlayer().dismissImmediately();
    runtime.spinToScene(
      sequence.initial.spinScene,
      "game002 cascade initial spin scene",
      sequence.initial.usesServerValues
        ? sequence.initial.spinValues
        : undefined,
    );
    return new Promise<void>((resolve, reject) => {
      this.#pendingAnimation = {
        phase: "initial-spin",
        sequence,
        cascadeIndex: -1,
        activeWinStage: null,
        preparedCascade: null,
        betAmountRaw,
        winAmountRaw,
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
    this.#symbolCascadePlayer?.destroy();
    this.#runtime?.destroy();
    this.#backgroundPlayer?.destroy();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
    this.#worldLayer = null;
    this.#backgroundPlayer = null;
    this.#runtime = null;
    this.#winAmountPlayer = null;
    this.#symbolCascadePlayer = null;
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
        this.#runtime.update(deltaSeconds);
        return;
      }
      if (pending.phase === "initial-spin") {
        const result = this.#runtime.update(deltaSeconds);
        if (!result.completed) return;
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          pending.sequence.initial.spinScene,
          "completed game002 cascade initial spin",
        );
        if (pending.sequence.initial.winStage) {
          this.#startWinStage(pending, pending.sequence.initial.winStage);
        } else {
          this.#startCascadeStage(pending, 0);
        }
        return;
      }
      if (pending.phase === "step-win-remove") {
        const result = this.#requireSymbolCascadePlayer().update(deltaSeconds);
        if (!result.completed) return;
        this.#startCascadeStage(pending, pending.cascadeIndex + 1);
        return;
      }
      if (pending.phase === "cascade-unified-fall") {
        const result = this.#runtime.update(deltaSeconds);
        if (!result.completed) return;
        const stage = pending.sequence.cascades[pending.cascadeIndex];
        if (!stage) throw new Error("game002 cascade fall stage is missing.");
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          stage.refillScene,
          `completed game002 cascade step[${stage.stepIndex}] unified fall`,
        );
        if (stage.winStage) {
          this.#startWinStage(pending, stage.winStage);
        } else {
          this.#startCascadeStage(pending, pending.cascadeIndex + 1);
        }
        return;
      }
      if (pending.phase === "cascade-dropdown") {
        const result = this.#runtime.update(deltaSeconds);
        if (!result.completed) return;
        const stage = pending.sequence.cascades[pending.cascadeIndex];
        if (!stage)
          throw new Error("game002 cascade dropdown stage is missing.");
        const currentScene = this.#runtime.getCurrentScene();
        if (!currentScene || !sceneEquals(currentScene, stage.dropdownScene)) {
          throw new Error(
            `completed game002 cascade step[${stage.stepIndex}] dropdown scene does not match.`,
          );
        }
        this.#startRefillSweep(pending, stage);
        return;
      }
      if (pending.phase === "refill-sweep") {
        const result = this.#runtime.update(deltaSeconds);
        if (!result.completed) return;
        const stage = pending.sequence.cascades[pending.cascadeIndex];
        if (!stage) throw new Error("game002 refill sweep stage is missing.");
        this.#startRefillSpin(pending, stage);
        return;
      }
      if (pending.phase === "refill-spin") {
        const result = this.#runtime.update(deltaSeconds);
        if (!result.completed) return;
        const stage = pending.sequence.cascades[pending.cascadeIndex];
        if (!stage) throw new Error("game002 refill spin stage is missing.");
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          stage.refillScene,
          `completed game002 cascade step[${stage.stepIndex}] selective refill`,
        );
        this.#completeCascadeStage(pending, stage);
        return;
      }
      if (pending.phase === "win-amount") {
        this.#runtime.update(deltaSeconds);
        const result = this.#requireWinAmountPlayer().update(deltaSeconds);
        pending.winAmountPlaybackComplete = !isWinAmountBlockingSpin(
          result.phase,
        );
        if (pending.winAmountPlaybackComplete) this.#resolvePending(pending);
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

  #startWinStage(
    pending: PendingAnimation,
    stage: Game002WinRemoveStage,
  ): void {
    const player = this.#requireSymbolCascadePlayer();
    const prepared = player.prepare(stage.groups);
    pending.activeWinStage = stage;
    pending.preparedCascade = prepared;
    pending.phase = "step-win-remove";
    player.start(prepared);
  }

  #startCascadeStage(pending: PendingAnimation, index: number): void {
    pending.activeWinStage = null;
    pending.preparedCascade = null;
    if (index >= pending.sequence.cascades.length) {
      this.#finalizeSpin(pending);
      return;
    }
    const stage = pending.sequence.cascades[index];
    pending.cascadeIndex = index;
    const planOptions: Parameters<
      Game002ReelRuntime["createCascadeDropPlan"]
    >[0] = {
      sourceScene: stage.removedSourceScene,
      sourceValues: stage.removedSourceValues,
      settledScene: stage.dropdownScene,
      settledValues: stage.dropdownValues,
      targetScene: stage.refillScene,
      targetValues: stage.refillValues,
      refillPositions: stage.refillPositions,
      canDropOccurrence: ({ code }) =>
        canGame002CascadeDropSymbol(
          resolveGame002CascadeSymbol(this.#requireRuntime(), code),
        ),
      motion: GAME002_CASCADE_MOTION,
    };
    const runtime = this.#requireRuntime();
    const plan = runtime.isAnticipationActive()
      ? runtime.createCascadeDropdownPlan(planOptions)
      : runtime.createCascadeDropPlan(planOptions);
    pending.phase = runtime.isAnticipationActive()
      ? "cascade-dropdown"
      : "cascade-unified-fall";
    runtime.startCascadeDrop(plan);
    if (plan.totalSeconds === 0) {
      if (runtime.isAnticipationActive())
        this.#startRefillSweep(pending, stage);
      else this.#completeCascadeStage(pending, stage);
    }
  }

  #startRefillSweep(
    pending: PendingAnimation,
    stage: Game002CascadeSequence["cascades"][number],
  ): void {
    pending.phase = "refill-sweep";
    this.#requireRuntime().startRefillEffectSweep(stage.refillPositions);
  }

  #startRefillSpin(
    pending: PendingAnimation,
    stage: Game002CascadeSequence["cascades"][number],
  ): void {
    pending.phase = "refill-spin";
    this.#requireRuntime().startSelectiveRefillSpin({
      dropdownScene: stage.dropdownScene,
      dropdownValues: stage.dropdownValues,
      targetScene: stage.refillScene,
      targetValues: stage.refillValues,
      refillPositions: stage.refillPositions,
      sceneName: `game002 cascade step[${stage.stepIndex}] selective refill`,
    });
  }

  #completeCascadeStage(
    pending: PendingAnimation,
    stage: Game002CascadeSequence["cascades"][number],
  ): void {
    if (stage.winStage) this.#startWinStage(pending, stage.winStage);
    else this.#startCascadeStage(pending, pending.cascadeIndex + 1);
  }

  #finalizeSpin(pending: PendingAnimation): void {
    pending.phase = "finalizing";
    this.#requireSymbolCascadePlayer().clear();
    if (pending.winAmountRaw <= 0) {
      pending.winAmountPlaybackComplete = true;
      this.#resolvePending(pending);
      return;
    }
    this.#requireWinAmountPlayer().start({
      betAmountRaw: pending.betAmountRaw,
      winAmountRaw: pending.winAmountRaw,
    });
    pending.phase = "win-amount";
  }

  #resolvePending(pending: PendingAnimation): void {
    if (this.#pendingAnimation !== pending) return;
    this.#pendingAnimation = null;
    pending.resolve();
  }

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

  #requireSymbolCascadePlayer(): SymbolCascadePlayer {
    if (!this.#symbolCascadePlayer) {
      throw new Error("game002 adapter is not mounted.");
    }
    return this.#symbolCascadePlayer;
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
    if (this.#runtime && this.#symbolCascadePlayer) {
      this.#symbolCascadePlayer.container.position.set(
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
    let rejection = error;
    try {
      this.#symbolCascadePlayer?.clear();
      this.#runtime?.resetPresentationState();
    } catch (cleanupError) {
      rejection = new AggregateError(
        [error, cleanupError],
        "game002 cascade failed and cleanup also failed.",
      );
    }
    this.#pendingAnimation = null;
    pending.reject(rejection);
  }
}

function assertCascadeResources(
  sequence: Game002CascadeSequence,
  runtime: Game002ReelRuntime,
  skin: Game002SkinConfig,
): void {
  const checkWinStage = (
    stage: Game002WinRemoveStage | undefined,
    scene: readonly (readonly number[])[],
  ) => {
    if (!stage) return;
    for (const [groupIndex, group] of stage.groups.entries()) {
      const resultCode = group.result.symbol;
      if (typeof resultCode !== "number" || !Number.isSafeInteger(resultCode)) {
        throw new Error(
          `game002 step[${stage.stepIndex}] group[${groupIndex}] result symbol code is invalid.`,
        );
      }
      const resultSymbol =
        runtime.gameConfig.getPaytableEntry(resultCode)?.symbol;
      const resultPresentation = resultSymbol
        ? skin.cascadeWinPresentations[resultSymbol]
        : undefined;
      if (!resultSymbol || !resultPresentation) {
        throw new Error(
          `game002 step[${stage.stepIndex}] group[${groupIndex}] result symbol has no cascade presentation.`,
        );
      }
      const groupCoinAmount = resolveGame002WinResultCoinAmount({
        group,
        groupIndex,
      });
      const groupCashAmount = resolveGame002WinResultCashAmount({
        group,
        groupIndex,
      });
      let itemTotal = 0;
      let itemCashTotal = 0;
      const primaryPositionKeys = new Set<string>();
      for (const position of group.positions) {
        const code = scene[position.x]?.[position.y];
        const symbol =
          code === undefined
            ? undefined
            : runtime.gameConfig.getPaytableEntry(code)?.symbol;
        if (!symbol) {
          throw new Error(
            `game002 step[${stage.stepIndex}] group[${groupIndex}] position (${position.x},${position.y}) has no symbol.`,
          );
        }
        const presentation = skin.cascadeWinPresentations[symbol];
        if (!presentation) {
          throw new Error(
            `game002 step[${stage.stepIndex}] group[${groupIndex}] position (${position.x},${position.y}) symbol ${symbol} has no cascade presentation.`,
          );
        }
        const isPrimary =
          JSON.stringify(presentation) === JSON.stringify(resultPresentation);
        if (!isPrimary) {
          if (
            resultPresentation.playback.mode !== "sequentialCollect" ||
            presentation.playback.mode !== "group" ||
            !isGame002SequentialWinCompanionSymbol(symbol)
          ) {
            throw new Error(
              `game002 step[${stage.stepIndex}] group[${groupIndex}] position (${position.x},${position.y}) symbol ${symbol} has an incompatible cascade presentation.`,
            );
          }
          if (
            !skin.symbolAnimationCapabilities[symbol]?.includes(
              presentation.playback.winState,
            )
          ) {
            throw new Error(
              `game002 step[${stage.stepIndex}] group[${groupIndex}] companion (${position.x},${position.y}) symbol ${symbol} has no ${presentation.playback.winState} animation.`,
            );
          }
          continue;
        }
        primaryPositionKeys.add(`${position.x},${position.y}`);
        const states =
          presentation.playback.mode === "group"
            ? [presentation.playback.winState]
            : [
                presentation.playback.startState,
                presentation.playback.loopState,
                presentation.playback.collectState,
              ];
        for (const state of states) {
          if (!skin.symbolAnimationCapabilities[symbol]?.includes(state)) {
            throw new Error(
              `game002 step[${stage.stepIndex}] group[${groupIndex}] position (${position.x},${position.y}) symbol ${symbol} has no ${state} animation.`,
            );
          }
        }
        if (presentation.playback.mode === "sequentialCollect") {
          const value = stage.sourceValues[position.x]?.[position.y];
          if (
            typeof value !== "number" ||
            !Number.isSafeInteger(value) ||
            value <= 0
          ) {
            throw new Error(
              `game002 step[${stage.stepIndex}] collect item (${position.x},${position.y}) value must be a positive safe integer.`,
            );
          }
          itemTotal += value;
          const weightedCashAmount = value * groupCashAmount;
          if (
            !Number.isSafeInteger(weightedCashAmount) ||
            weightedCashAmount % groupCoinAmount !== 0
          ) {
            throw new Error(
              `game002 step[${stage.stepIndex}] collect item (${position.x},${position.y}) cash share must divide the result cash amount exactly.`,
            );
          }
          itemCashTotal += weightedCashAmount / groupCoinAmount;
        }
      }
      for (const position of group.removePositions) {
        const key = `${position.x},${position.y}`;
        if (!primaryPositionKeys.has(key)) {
          throw new Error(
            `game002 step[${stage.stepIndex}] group[${groupIndex}] remove position (${position.x},${position.y}) is not a primary win position.`,
          );
        }
        const code = scene[position.x]?.[position.y];
        const symbol =
          code === undefined
            ? undefined
            : runtime.gameConfig.getPaytableEntry(code)?.symbol;
        const presentation = symbol
          ? skin.cascadeWinPresentations[symbol]
          : undefined;
        const removeState = presentation?.playback.removeState;
        if (
          !symbol ||
          !removeState ||
          !skin.symbolAnimationCapabilities[symbol]?.includes(removeState)
        ) {
          throw new Error(
            `game002 step[${stage.stepIndex}] group[${groupIndex}] remove position (${position.x},${position.y}) has no remove animation.`,
          );
        }
      }
      if (resultPresentation.playback.mode === "sequentialCollect") {
        const removePositionKeys = new Set(
          group.removePositions.map(
            (position) => `${position.x},${position.y}`,
          ),
        );
        if (
          removePositionKeys.size !== primaryPositionKeys.size ||
          [...primaryPositionKeys].some(
            (position) => !removePositionKeys.has(position),
          )
        ) {
          throw new Error(
            `game002 step[${stage.stepIndex}] sequential collect group must remove every primary item and no companion.`,
          );
        }
        if (itemTotal !== groupCoinAmount) {
          throw new Error(
            `game002 step[${stage.stepIndex}] collect item sum ${itemTotal} does not match result coin amount ${groupCoinAmount}.`,
          );
        }
        if (itemCashTotal !== groupCashAmount) {
          throw new Error(
            `game002 step[${stage.stepIndex}] collect item cash sum ${itemCashTotal} does not match result cash amount ${groupCashAmount}.`,
          );
        }
      }
    }
  };
  checkWinStage(sequence.initial.winStage, sequence.initial.spinScene);
  for (const stage of sequence.cascades) {
    checkWinStage(stage.winStage, stage.refillScene);
  }

  const resource =
    skin.symbolValuePresentationResources[GAME002_CN_VALUE_SYMBOL];
  if (!resource)
    throw new Error("game002 CN valuePresentation resource is missing.");
  const matrices = [
    sequence.initial.spinValues,
    ...sequence.cascades.map((stage) => stage.refillValues),
  ];
  for (const matrix of matrices) {
    for (const column of matrix) {
      for (const value of column) {
        if (value !== null) {
          assertSymbolValueDisplayResource({ value, resource });
        }
      }
    }
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

function resolveGame002CascadeSymbol(
  runtime: Game002ReelRuntime,
  code: number,
): string {
  const symbol = runtime.gameConfig.getPaytableEntry(code)?.symbol;
  if (!symbol) {
    throw new Error(`game002 cascade symbol code ${code} is not in paytable.`);
  }
  return symbol;
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
