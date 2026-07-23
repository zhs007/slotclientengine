import { Application, Container } from "pixi.js";
import type {
  GameLogic,
  SlotRoundDropdownStepPlan,
  SlotRoundCapability,
  SlotRoundExecutionPlan,
  SlotRoundOccurrenceSnapshot,
  SlotRoundRefillStepPlan,
  SlotRoundWinStepPlan,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotGameStateSnapshot,
  SlotGameViewportSnapshot,
} from "@slotclientengine/gameframeworks";
import { compileSlotRoundExecutionPlan } from "@slotclientengine/gameframeworks";
import {
  assertSymbolValueDisplayResource,
  createSymbolCascadePlayer,
  type CreateSymbolCascadePlayerOptions,
  type CreateSymbolWinCarouselOptions,
  type CreateSymbolValuePresenterOptions,
  type SymbolWinCarousel,
  type SymbolValuePresenter,
  type SymbolAssetMap,
  type SymbolCascadePlayer,
  createSlotRoundCoordinator,
  type SlotRoundPresentationCapabilityTarget,
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
  GAME002_REEL_COUNT,
  GAME002_VISIBLE_ROWS,
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
  GAME002_ROUND_FLOW_PROFILE,
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
  #roundCoordinator: ReturnType<typeof createSlotRoundCoordinator> | null =
    null;
  #roundTarget: Game002RoundTarget | null = null;
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
            symbolValuePresentationResources:
              skin.symbolValuePresentationResources,
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
        startPresentationsWithEmphasis:
          GAME002_CASCADE_PRESENTATION.startPresentationsWithEmphasis,
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
      this.#roundTarget = new Game002RoundTarget({
        runtime,
        cascadePlayer: symbolCascadePlayer,
        winAmountPlayer,
      });
      this.#roundCoordinator = createSlotRoundCoordinator({
        target: this.#roundTarget,
      });
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
      this.#roundCoordinator = null;
      this.#roundTarget = null;
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
    const coordinator = this.#requireRoundCoordinator();
    if (coordinator.getSnapshot().running) {
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
    const symbolCodes = Object.fromEntries(
      this.#skin.displaySymbols.map((symbol) => {
        const code = runtime.gameConfig.getSymbolCode(symbol);
        if (code === undefined)
          throw new Error(`game002 display symbol "${symbol}" has no code.`);
        return [symbol, code];
      }),
    );
    const plan = compileSlotRoundExecutionPlan(
      GAME002_ROUND_FLOW_PROFILE,
      logic,
      {
        symbolCodes,
        columns: GAME002_REEL_COUNT,
        rows: GAME002_VISIBLE_ROWS,
      },
    );
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
    assertGame002PlanMatchesSequence(plan, sequence);
    this.#requireRoundTarget().configure({
      sequence,
      betAmountRaw,
      winAmountRaw,
    });
    return coordinator.start(plan);
  }

  setFrameworkState(_state: SlotGameStateSnapshot): void {
    return undefined;
  }

  destroy(): void {
    this.#roundCoordinator?.destroy();
    this.#roundCoordinator = null;
    this.#roundTarget = null;
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
      const coordinator = this.#roundCoordinator;
      if (!coordinator?.getSnapshot().running) {
        if (this.#winAmountPlayer?.isPlaying()) {
          this.#winAmountPlayer.update(deltaSeconds);
        }
        this.#runtime.update(deltaSeconds);
        return;
      }
      coordinator.update(deltaSeconds);
    } catch (error) {
      this.#app?.ticker.stop();
      const failure = error instanceof Error ? error : new Error(String(error));
      const hadPendingAnimation =
        this.#roundCoordinator?.getSnapshot().running === true;
      this.#roundCoordinator?.cleanup("execution-failure");
      if (!hadPendingAnimation) this.#reportFatalError(failure);
    }
  };

  #requireRuntime(): Game002ReelRuntime {
    if (!this.#runtime) {
      throw new Error("game002 adapter is not mounted.");
    }
    return this.#runtime;
  }

  #requireSymbolCascadePlayer(): SymbolCascadePlayer {
    if (!this.#symbolCascadePlayer) {
      throw new Error("game002 adapter is not mounted.");
    }
    return this.#symbolCascadePlayer;
  }

  #requireRoundCoordinator(): ReturnType<typeof createSlotRoundCoordinator> {
    if (!this.#roundCoordinator)
      throw new Error("game002 adapter is not mounted.");
    return this.#roundCoordinator;
  }

  #requireRoundTarget(): Game002RoundTarget {
    if (!this.#roundTarget) throw new Error("game002 adapter is not mounted.");
    return this.#roundTarget;
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
}

class Game002RoundTarget implements SlotRoundPresentationCapabilityTarget {
  readonly capabilities: ReadonlySet<SlotRoundCapability> = new Set([
    "spin",
    "visible-symbol-states",
    "remove",
    "dropdown",
    "refill",
    "sequential-collect",
  ]);
  readonly #runtime: Game002ReelRuntime;
  readonly #cascadePlayer: SymbolCascadePlayer;
  readonly #winAmountPlayer: WinAmountAnimationPlayer;
  #round: {
    readonly sequence: Game002CascadeSequence;
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  } | null = null;
  #activity:
    | "idle"
    | "initial"
    | "win"
    | "dropdown-unified"
    | "dropdown-only"
    | "refill-complete"
    | "refill-sweep"
    | "refill-spin"
    | "completion" = "idle";
  #activeStage: Game002CascadeSequence["cascades"][number] | null = null;
  #runtimeCompleted = false;
  #winCompleted = false;
  #completionComplete = true;
  #unifiedSteps = new Set<number>();

  constructor(options: {
    readonly runtime: Game002ReelRuntime;
    readonly cascadePlayer: SymbolCascadePlayer;
    readonly winAmountPlayer: WinAmountAnimationPlayer;
  }) {
    this.#runtime = options.runtime;
    this.#cascadePlayer = options.cascadePlayer;
    this.#winAmountPlayer = options.winAmountPlayer;
  }

  configure(round: {
    readonly sequence: Game002CascadeSequence;
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): void {
    if (this.#activity !== "idle")
      throw new Error("game002 round target is already active.");
    this.#round = round;
  }

  cleanup(): void {
    this.#cascadePlayer.clear();
    this.#winAmountPlayer.dismissImmediately();
    this.#runtime.resetPresentationState();
    this.#activity = "idle";
    this.#activeStage = null;
    this.#runtimeCompleted = false;
    this.#winCompleted = false;
    this.#completionComplete = true;
    this.#unifiedSteps.clear();
  }

  startInitialSpin(_snapshot: SlotRoundOccurrenceSnapshot): void {
    const sequence = this.requireRound().sequence;
    this.#activity = "initial";
    this.#runtimeCompleted = false;
    this.#runtime.spinToScene(
      sequence.initial.spinScene,
      "game002 cascade initial spin scene",
      sequence.initial.usesServerValues
        ? sequence.initial.spinValues
        : undefined,
    );
  }

  isInitialSpinComplete(): boolean {
    if (this.#activity !== "initial")
      throw new Error("game002 initial spin is not active.");
    if (!this.#runtimeCompleted) return false;
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      this.requireRound().sequence.initial.spinScene,
      "completed game002 cascade initial spin",
    );
    this.#activity = "idle";
    return true;
  }

  startWin(step: SlotRoundWinStepPlan): void {
    const stage = this.findWinStage(step.stepIndex);
    const prepared = this.#cascadePlayer.prepare(stage.groups);
    this.#winCompleted = false;
    this.#activity = "win";
    this.#cascadePlayer.start(prepared);
  }

  updateWin(_deltaSeconds: number): { readonly completed: boolean } {
    if (this.#activity !== "win")
      throw new Error("game002 win stage is not active.");
    if (!this.#winCompleted) return { completed: false };
    this.#activity = "idle";
    return { completed: true };
  }

  startDropdown(step: SlotRoundDropdownStepPlan): void {
    const stage = this.findCascadeStage(step.stepIndex);
    this.#activeStage = stage;
    const planOptions = this.createDropPlanOptions(stage);
    const anticipation = this.#runtime.isAnticipationActive();
    const plan = anticipation
      ? this.#runtime.createCascadeDropdownPlan(planOptions)
      : this.#runtime.createCascadeDropPlan(planOptions);
    this.#activity = anticipation ? "dropdown-only" : "dropdown-unified";
    if (!anticipation) this.#unifiedSteps.add(step.stepIndex);
    this.#runtimeCompleted = plan.totalSeconds === 0;
    this.#runtime.startCascadeDrop(plan);
  }

  isDropdownComplete(): boolean {
    const stage = this.requireActiveStage();
    if (!this.#runtimeCompleted) return false;
    if (this.#activity === "dropdown-unified")
      assertGame002ReelVisualMatchesTarget(
        this.#runtime.getVisualSnapshot(),
        stage.refillScene,
        `completed game002 cascade step[${stage.stepIndex}] unified fall`,
      );
    else {
      const current = this.#runtime.getCurrentScene();
      if (!current || !sceneEquals(current, stage.dropdownScene))
        throw new Error(
          `completed game002 cascade step[${stage.stepIndex}] dropdown scene does not match.`,
        );
    }
    this.#activity = "idle";
    return true;
  }

  startRefill(step: SlotRoundRefillStepPlan): void {
    const stage = this.findCascadeStage(step.stepIndex);
    this.#activeStage = stage;
    this.#runtimeCompleted = false;
    if (this.#unifiedSteps.has(step.stepIndex)) {
      this.#activity = "refill-complete";
      this.#runtimeCompleted = true;
      return;
    }
    this.#activity = "refill-sweep";
    this.#runtime.startRefillEffectSweep(stage.refillPositions);
  }

  isRefillComplete(): boolean {
    const stage = this.requireActiveStage();
    if (this.#activity === "refill-complete") {
      this.#activity = "idle";
      return true;
    }
    if (this.#activity !== "refill-spin" || !this.#runtimeCompleted)
      return false;
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      stage.refillScene,
      `completed game002 cascade step[${stage.stepIndex}] selective refill`,
    );
    this.#activity = "idle";
    return true;
  }

  update(deltaSeconds: number): void {
    if (this.#activity === "win") {
      this.#winCompleted = this.#cascadePlayer.update(deltaSeconds).completed;
      return;
    }
    if (this.#activity === "completion") {
      this.#runtime.update(deltaSeconds);
      const result = this.#winAmountPlayer.update(deltaSeconds);
      this.#completionComplete = !isWinAmountBlockingSpin(result.phase);
      return;
    }
    if (this.#activity === "idle" || this.#activity === "refill-complete")
      return;
    const result = this.#runtime.update(deltaSeconds);
    this.#runtimeCompleted = result.completed;
    if (this.#activity === "refill-sweep" && result.completed) {
      const stage = this.requireActiveStage();
      this.#activity = "refill-spin";
      this.#runtimeCompleted = false;
      this.#runtime.startSelectiveRefillSpin({
        dropdownScene: stage.dropdownScene,
        dropdownValues: stage.dropdownValues,
        targetScene: stage.refillScene,
        targetValues: stage.refillValues,
        refillPositions: stage.refillPositions,
        sceneName: `game002 cascade step[${stage.stepIndex}] selective refill`,
      });
    }
  }

  startCompletion(_plan: SlotRoundExecutionPlan): void {
    const round = this.requireRound();
    this.#cascadePlayer.clear();
    if (round.winAmountRaw <= 0) {
      this.#completionComplete = true;
      this.#activity = "idle";
      return;
    }
    this.#completionComplete = false;
    this.#activity = "completion";
    this.#winAmountPlayer.start({
      betAmountRaw: round.betAmountRaw,
      winAmountRaw: round.winAmountRaw,
    });
  }

  isCompletionComplete(): boolean {
    if (!this.#completionComplete) return false;
    this.#activity = "idle";
    return true;
  }

  private createDropPlanOptions(
    stage: Game002CascadeSequence["cascades"][number],
  ): Parameters<Game002ReelRuntime["createCascadeDropPlan"]>[0] {
    return {
      sourceScene: stage.removedSourceScene,
      sourceValues: stage.removedSourceValues,
      settledScene: stage.dropdownScene,
      settledValues: stage.dropdownValues,
      targetScene: stage.refillScene,
      targetValues: stage.refillValues,
      refillPositions: stage.refillPositions,
      canDropOccurrence: ({ code }) =>
        canGame002CascadeDropSymbol(
          resolveGame002CascadeSymbol(this.#runtime, code),
        ),
      motion: GAME002_CASCADE_MOTION,
    };
  }

  private findWinStage(stepIndex: number): Game002WinRemoveStage {
    const sequence = this.requireRound().sequence;
    const stage =
      stepIndex === 0
        ? sequence.initial.winStage
        : sequence.cascades.find(
            (candidate) => candidate.stepIndex === stepIndex,
          )?.winStage;
    if (!stage)
      throw new Error(`game002 step[${stepIndex}] win stage is missing.`);
    return stage;
  }

  private findCascadeStage(
    stepIndex: number,
  ): Game002CascadeSequence["cascades"][number] {
    const stage = this.requireRound().sequence.cascades.find(
      (candidate) => candidate.stepIndex === stepIndex,
    );
    if (!stage)
      throw new Error(`game002 cascade step[${stepIndex}] is missing.`);
    return stage;
  }

  private requireActiveStage(): Game002CascadeSequence["cascades"][number] {
    if (!this.#activeStage)
      throw new Error("game002 cascade stage is not active.");
    return this.#activeStage;
  }

  private requireRound() {
    if (!this.#round)
      throw new Error("game002 round target is not configured.");
    return this.#round;
  }
}

function assertGame002PlanMatchesSequence(
  plan: SlotRoundExecutionPlan,
  sequence: Game002CascadeSequence,
): void {
  if (!sceneEquals(plan.initial.scene, sequence.initial.spinScene))
    throw new Error(
      "game002 shared plan initial scene diverged from sequence.",
    );
  if (!matrixEquals(plan.initial.values, sequence.initial.spinValues))
    throw new Error(
      "game002 shared plan initial values diverged from sequence.",
    );
  if (!sceneEquals(plan.final.scene, sequence.finalScene))
    throw new Error("game002 shared plan final scene diverged from sequence.");
  if (!matrixEquals(plan.final.values, sequence.finalValues))
    throw new Error("game002 shared plan final values diverged from sequence.");
  const plannedCascadeIndexes = plan.steps
    .filter((step) => step.kind === "dropdown")
    .map((step) => step.stepIndex);
  const sequenceCascadeIndexes = sequence.cascades.map(
    (stage) => stage.stepIndex,
  );
  if (
    plannedCascadeIndexes.length !== sequenceCascadeIndexes.length ||
    plannedCascadeIndexes.some(
      (value, index) => value !== sequenceCascadeIndexes[index],
    )
  )
    throw new Error(
      "game002 shared plan cascade order diverged from sequence.",
    );
  assertGame002WinPlanMatchesStage(
    plan,
    sequence.initial.winStage,
    sequence.initial.stepIndex,
  );
  for (const stage of sequence.cascades) {
    const dropdown = plan.steps.find(
      (step): step is SlotRoundDropdownStepPlan =>
        step.kind === "dropdown" && step.stepIndex === stage.stepIndex,
    );
    const refill = plan.steps.find(
      (step): step is SlotRoundRefillStepPlan =>
        step.kind === "refill" && step.stepIndex === stage.stepIndex,
    );
    if (
      !dropdown ||
      !sceneEquals(dropdown.input.scene, stage.removedSourceScene) ||
      !matrixEquals(dropdown.input.values, stage.removedSourceValues) ||
      !sceneEquals(dropdown.output.scene, stage.dropdownScene) ||
      !matrixEquals(dropdown.output.values, stage.dropdownValues)
    )
      throw new Error(
        `game002 shared plan step[${stage.stepIndex}] dropdown trace diverged from sequence.`,
      );
    if (
      !refill ||
      !sceneEquals(refill.input.scene, stage.dropdownScene) ||
      !matrixEquals(refill.input.values, stage.dropdownValues) ||
      !sceneEquals(refill.output.scene, stage.refillScene) ||
      !matrixEquals(refill.output.values, stage.refillValues) ||
      refill.movements.length !== stage.refillPositions.length
    )
      throw new Error(
        `game002 shared plan step[${stage.stepIndex}] refill trace diverged from sequence.`,
      );
    assertGame002WinPlanMatchesStage(plan, stage.winStage, stage.stepIndex);
  }
}

function assertGame002WinPlanMatchesStage(
  plan: SlotRoundExecutionPlan,
  stage: Game002WinRemoveStage | undefined,
  stepIndex: number,
): void {
  const planned = plan.steps.find(
    (step): step is SlotRoundWinStepPlan =>
      step.kind === "win" && step.stepIndex === stepIndex,
  );
  if (!stage) {
    if (planned)
      throw new Error(
        `game002 shared plan step[${stepIndex}] has an unexpected win trace.`,
      );
    return;
  }
  if (
    !planned ||
    !sceneEquals(planned.input.scene, stage.sourceScene) ||
    !matrixEquals(planned.input.values, stage.sourceValues) ||
    !sceneEquals(planned.output.scene, stage.outputScene) ||
    !matrixEquals(planned.output.values, stage.outputValues) ||
    planned.groups.length !== stage.groups.length
  )
    throw new Error(
      `game002 shared plan step[${stepIndex}] win/remove trace diverged from sequence.`,
    );
  for (const [groupIndex, group] of stage.groups.entries()) {
    const plannedGroup = planned.groups[groupIndex];
    if (
      !plannedGroup ||
      plannedGroup.amount !== group.amount ||
      !samePositionTrace(plannedGroup.positions, group.positions) ||
      !samePositionTrace(plannedGroup.removePositions, group.removePositions)
    )
      throw new Error(
        `game002 shared plan step[${stepIndex}] group[${groupIndex}] trace diverged from sequence.`,
      );
  }
}

function samePositionTrace(
  left: readonly { readonly x: number; readonly y: number }[],
  right: readonly { readonly x: number; readonly y: number }[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (position, index) =>
        position.x === right[index]?.x && position.y === right[index]?.y,
    )
  );
}

function matrixEquals(
  left: readonly (readonly unknown[])[],
  right: readonly (readonly unknown[])[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (column, x) =>
        column.length === right[x]?.length &&
        column.every((value, y) => value === right[x]?.[y]),
    )
  );
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
