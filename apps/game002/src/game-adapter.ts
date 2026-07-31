import { Application, Container } from "pixi.js";
import type {
  GameLogic,
  GameLogicStep,
  SlotRoundDropdownStepPlan,
  SlotRoundCapability,
  SlotRoundExecutionPlan,
  SlotRoundOccurrenceSnapshot,
  SlotRoundRefillStepPlan,
  SlotRoundSettledTransformStepPlan,
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
  type SymbolCascadePlayer,
  createSlotRoundCoordinator,
  type SlotRoundPresentationCapabilityTarget,
  type PreparedVisibleOccurrenceReplacement,
  type PreparedGridCellVisibleOccurrenceTransferBatch,
} from "@slotclientengine/rendercore";
import type {
  WinAmountAnimationPhase,
  WinAmountAnimationPlayer,
} from "@slotclientengine/rendercore/win-amount";
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
  createGame002SceneLayoutPlayers,
  type Game002BackgroundPlayer,
} from "./scene-layout-skin.js";
import { createGame002WinAmountLayout } from "./win-amount-config.js";
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
import {
  createGame002WlWmMultiplierCompiler,
  type Game002WlWmMultiplierPresentationBatch,
} from "./wl-wm-multiplier-plan.js";
import { compileGame002FreeGamePlan } from "./freegame-plan.js";
import {
  createGame002FreeGamePlayback,
  type Game002FreeGamePlayback,
} from "./freegame-playback.js";

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
  readonly createBackgroundPlayer?: () => Game002BackgroundPlayer;
  readonly createRuntime?: () => Game002ReelRuntime;
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
  readonly logDiagnostic?: (message: string) => void;
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
  readonly #createBackgroundPlayer: () => Game002BackgroundPlayer;
  readonly #createRuntime: () => Game002ReelRuntime;
  readonly #createWinAmountPlayer: (
    layout: ReturnType<typeof createGame002Layout>,
  ) => WinAmountAnimationPlayer;
  readonly #createSymbolCascadePlayer: (
    options: CreateSymbolCascadePlayerOptions,
  ) => SymbolCascadePlayer;
  readonly #reportFatalError: (error: Error) => void;
  readonly #logDiagnostic: (message: string) => void;
  #app: Game002PixiApplication | null = null;
  #worldLayer: Container | null = null;
  #backgroundPlayer: Game002BackgroundPlayer | null = null;
  #runtime: Game002ReelRuntime | null = null;
  #winAmountPlayer: WinAmountAnimationPlayer | null = null;
  #symbolCascadePlayer: SymbolCascadePlayer | null = null;
  #roundCoordinator: ReturnType<typeof createSlotRoundCoordinator> | null =
    null;
  #roundTarget: Game002RoundTarget | null = null;
  #freeGamePlayback: Game002FreeGamePlayback | null = null;
  #unsubscribeViewport: (() => void) | null = null;
  #disposeWinAmountAdvanceListener: (() => void) | null = null;
  #lastPresentationDiagnostic = "";
  #presentationDiagnosticAgeSeconds = 0;
  #presentationStallReported = false;

  constructor(options: Game002AdapterOptions) {
    const skin = options.skin;
    let sceneLayoutPlayers:
      | ReturnType<typeof createGame002SceneLayoutPlayers>
      | undefined;
    this.#skin = skin;
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#createBackgroundPlayer =
      options.createBackgroundPlayer ??
      (() => {
        sceneLayoutPlayers = createGame002SceneLayoutPlayers({
          resource: skin.presentation.resource,
          initialMode: skin.presentation.initialMode,
          awardCelebrationPopup: skin.presentation.awardCelebrationPopup,
        });
        return sceneLayoutPlayers.backgroundPlayer;
      });
    this.#createRuntime =
      options.createRuntime ??
      (() => {
        return createGame002ReelRuntime({
          gameConfig: skin.presentation.symbolPackage.gameConfig,
          symbolRegistry: skin.presentation.symbolRegistry,
          config: {
            ...DEFAULT_GAME002_REEL_CONFIG,
            reelsName: skin.reelsName,
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
        });
      });
    this.#createWinAmountPlayer =
      options.createWinAmountPlayer ??
      ((layout) => {
        if (!sceneLayoutPlayers) {
          throw new Error(
            "game002 scene-layout presentation was not created before its popup.",
          );
        }
        return sceneLayoutPlayers.winAmountPlayer;
      });
    this.#createSymbolCascadePlayer =
      options.createSymbolCascadePlayer ?? createSymbolCascadePlayer;
    this.#reportFatalError = options.reportFatalError ?? reportFatalError;
    this.#logDiagnostic =
      options.logDiagnostic ?? ((message) => console.info(message));
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#app) {
      throw new Error("game002 adapter is already mounted.");
    }

    const app = this.#createApplication();
    let backgroundPlayer: Game002BackgroundPlayer | null = null;
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
      await backgroundPlayer.init();
      runtime = this.#createRuntime();
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
      if (backgroundPlayer.transitionContainer)
        worldLayer.addChild(backgroundPlayer.transitionContainer);
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
        wlSymbolCode: requireGame002SymbolCode(runtime, "WL"),
        wmSymbolCode: requireGame002SymbolCode(runtime, "WM"),
        cnSymbolCode: requireGame002SymbolCode(runtime, "CN"),
        cmSymbolCode: requireGame002SymbolCode(runtime, "CM"),
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
    if (
      coordinator.getSnapshot().running ||
      this.#freeGamePlayback?.isRunning()
    ) {
      throw new Error("game002 adapter animation is already in progress.");
    }
    this.#resetPresentationDiagnostic();
    const betAmountRaw = logic.getBet() * logic.getLines();
    const winAmountRaw = logic.getTotalWin();
    assertValidWinAmountInput(betAmountRaw, winAmountRaw);
    const cnSymbolCode = runtime.gameConfig.getSymbolCode(
      GAME002_CN_VALUE_SYMBOL,
    );
    if (cnSymbolCode === undefined) {
      throw new Error("game002 game config is missing CN symbol code.");
    }
    const wlSymbolCode = runtime.gameConfig.getSymbolCode("WL");
    if (wlSymbolCode === undefined) {
      throw new Error("game002 game config is missing WL symbol code.");
    }
    const wmSymbolCode = runtime.gameConfig.getSymbolCode("WM");
    if (wmSymbolCode === undefined) {
      throw new Error("game002 game config is missing WM symbol code.");
    }
    const cmSymbolCode = runtime.gameConfig.getSymbolCode("CM");
    if (cmSymbolCode === undefined) {
      throw new Error("game002 game config is missing CM symbol code.");
    }
    const coSymbolCode = runtime.gameConfig.getSymbolCode("CO");
    if (coSymbolCode === undefined) {
      throw new Error("game002 game config is missing CO symbol code.");
    }
    const bnSymbolCode = runtime.gameConfig.getSymbolCode("BN");
    if (bnSymbolCode === undefined) {
      throw new Error("game002 game config is missing BN symbol code.");
    }
    const symbolCodes = Object.fromEntries(
      this.#skin.displaySymbols.map((symbol) => {
        const code = runtime.gameConfig.getSymbolCode(symbol);
        if (code === undefined)
          throw new Error(`game002 display symbol "${symbol}" has no code.`);
        return [symbol, code];
      }),
    );
    const triggerStepIndex = logic
      .getSteps()
      .findIndex((step) => step.hasComponent("bg-triggerfg"));
    const baseLogic =
      triggerStepIndex < 0
        ? logic
        : createGame002LogicSlice(logic, triggerStepIndex + 1);
    const multiplierCompiler = createGame002WlWmMultiplierCompiler({
      wlSymbolCode,
      wmSymbolCode,
      cnSymbolCode,
      cmSymbolCode,
      coSymbolCode,
      bnSymbolCode,
      logDiagnostic: this.#logDiagnostic,
    });
    const plan = compileSlotRoundExecutionPlan(
      GAME002_ROUND_FLOW_PROFILE,
      baseLogic,
      {
        symbolCodes,
        columns: GAME002_REEL_COUNT,
        rows: GAME002_VISIBLE_ROWS,
        resolveSettledScene: (context) =>
          multiplierCompiler.resolveSettledScene(context),
        hydrateSettledValues: (context) =>
          multiplierCompiler.hydrateSettledValues(context),
        compileSettledTransform: (context) =>
          multiplierCompiler.compileSettledTransform(context),
      },
    );
    multiplierCompiler.assertComplete();
    const sequence = createGame002CascadeSequence({
      logic: baseLogic,
      cnSymbolCode,
      auxiliaryValueSymbolCodes: [wlSymbolCode, wmSymbolCode, cmSymbolCode],
      executionPlan: plan,
      canRemoveSymbol: ({ code }) =>
        canGame002CascadeRemoveSymbol(
          resolveGame002CascadeSymbol(runtime, code),
        ),
      canDropSymbol: ({ code }) =>
        canGame002CascadeDropSymbol(resolveGame002CascadeSymbol(runtime, code)),
    });
    assertGame002CascadeResources(sequence, runtime, this.#skin);
    assertGame002PlanMatchesSequence(plan, sequence);
    const freeGamePlan =
      triggerStepIndex < 0
        ? null
        : compileGame002FreeGamePlan({
            logic,
            entryScene: plan.final.scene,
            entryValues: plan.final.values.map((column) =>
              Object.freeze(
                column.map((value) => {
                  if (value === -1)
                    throw new Error(
                      "game002 FreeGame entry values must not contain cascade holes.",
                    );
                  return value;
                }),
              ),
            ),
            symbolCodes: {
              WL: wlSymbolCode,
              CN: cnSymbolCode,
              CO: coSymbolCode,
              AF: requireGame002SymbolCode(runtime, "AF"),
              BN: bnSymbolCode,
            },
          });
    this.#requireRoundTarget().configure({
      sequence,
      betAmountRaw,
      winAmountRaw: freeGamePlan ? 0 : winAmountRaw,
      multiplierBatches: new Map(
        plan.steps
          .filter((step) => step.kind === "settled-transform")
          .map((step) => {
            const batch = multiplierCompiler.getPresentationBatch(
              step.stepIndex,
            );
            if (!batch)
              throw new Error(
                `game002 step[${step.stepIndex}] multiplier presentation batch is missing.`,
              );
            return [step.stepIndex, batch] as const;
          }),
      ),
    });
    if (!freeGamePlan) return coordinator.start(plan);
    const backgroundPlayer = this.#backgroundPlayer;
    if (!backgroundPlayer)
      throw new Error("game002 scene-layout player is not mounted.");
    const playback = createGame002FreeGamePlayback({
      plan: freeGamePlan,
      runtime,
      cascadePlayer: this.#requireSymbolCascadePlayer(),
      winAmountPlayer: this.#winAmountPlayer!,
      backgroundPlayer,
      betAmountRaw,
      winAmountRaw,
      symbolCodes: {
        AF: requireGame002SymbolCode(runtime, "AF"),
        CN: cnSymbolCode,
        CO: coSymbolCode,
        BN: bnSymbolCode,
      },
    });
    this.#freeGamePlayback = playback;
    return coordinator
      .start(plan)
      .then(() => playback.start())
      .finally(() => {
        if (this.#freeGamePlayback === playback) this.#freeGamePlayback = null;
      });
  }

  setFrameworkState(_state: SlotGameStateSnapshot): void {
    return undefined;
  }

  destroy(): void {
    this.#freeGamePlayback?.cleanup();
    this.#freeGamePlayback = null;
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
      if (this.#freeGamePlayback?.isRunning()) {
        this.#freeGamePlayback.update(deltaSeconds);
        return;
      }
      if (!coordinator?.getSnapshot().running) {
        if (this.#winAmountPlayer?.isPlaying()) {
          this.#winAmountPlayer.update(deltaSeconds);
        }
        this.#runtime.update(deltaSeconds);
        return;
      }
      coordinator.update(deltaSeconds);
      this.#reportPresentationProgress(deltaSeconds);
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

  #resetPresentationDiagnostic(): void {
    this.#lastPresentationDiagnostic = "";
    this.#presentationDiagnosticAgeSeconds = 0;
    this.#presentationStallReported = false;
  }

  #reportPresentationProgress(deltaSeconds: number): void {
    const coordinator = this.#roundCoordinator;
    const target = this.#roundTarget;
    if (!coordinator || !target) return;
    const coordinatorSnapshot = coordinator.getSnapshot();
    const diagnostic = JSON.stringify({
      coordinator: coordinatorSnapshot,
      target: target.getDiagnosticSnapshot(),
    });
    if (diagnostic !== this.#lastPresentationDiagnostic) {
      this.#lastPresentationDiagnostic = diagnostic;
      this.#presentationDiagnosticAgeSeconds = 0;
      this.#presentationStallReported = false;
      this.#logDiagnostic(`presentation progress ${diagnostic}`);
      return;
    }
    if (!coordinatorSnapshot.running) return;
    this.#presentationDiagnosticAgeSeconds += deltaSeconds;
    if (
      this.#presentationDiagnosticAgeSeconds >= 5 &&
      !this.#presentationStallReported
    ) {
      this.#presentationStallReported = true;
      this.#logDiagnostic(
        `presentation stalled>=5s ${this.#lastPresentationDiagnostic}`,
      );
    }
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

export class Game002RoundTarget implements SlotRoundPresentationCapabilityTarget {
  readonly capabilities: ReadonlySet<SlotRoundCapability> = new Set([
    "spin",
    "visible-symbol-states",
    "remove",
    "dropdown",
    "refill",
    "settled-transform",
    "sequential-collect",
  ]);
  readonly #runtime: Game002ReelRuntime;
  readonly #cascadePlayer: SymbolCascadePlayer;
  readonly #winAmountPlayer: WinAmountAnimationPlayer;
  readonly #wlSymbolCode: number;
  readonly #wmSymbolCode: number;
  readonly #cnSymbolCode: number;
  readonly #cmSymbolCode: number;
  #round: {
    readonly sequence: Game002CascadeSequence;
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
    readonly multiplierBatches: ReadonlyMap<
      number,
      Game002WlWmMultiplierPresentationBatch
    >;
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
    | "transform-wl-start"
    | "transform-mult-start"
    | "transform-mult-idle"
    | "transform-mult-end"
    | "transform-wm-change"
    | "transform-cm-feature"
    | "transform-cn-feature-change"
    | "transform-cm-change"
    | "transform-co-feature"
    | "transform-co-transfer"
    | "completion" = "idle";
  #activeStage: Game002CascadeSequence["cascades"][number] | null = null;
  #runtimeCompleted = false;
  #winCompleted = false;
  #activeReleaseOnlyPositions: readonly {
    readonly x: number;
    readonly y: number;
  }[] = [];
  #completionComplete = true;
  #unifiedSteps = new Set<number>();
  #initialSnapshot: SlotRoundOccurrenceSnapshot | null = null;
  #refillSnapshot: SlotRoundOccurrenceSnapshot | null = null;
  #activeTransform: SlotRoundSettledTransformStepPlan | null = null;
  #activeMultiplierBatch: Game002WlWmMultiplierPresentationBatch | null = null;
  #preparedWmReplacements: PreparedVisibleOccurrenceReplacement[] = [];
  #preparedCmReplacements: PreparedVisibleOccurrenceReplacement[] = [];
  #preparedCoReplacements: PreparedVisibleOccurrenceReplacement[] = [];
  #preparedCoTransfers: PreparedGridCellVisibleOccurrenceTransferBatch | null =
    null;
  #coTransferProgress = 0;
  #transformCompletionBaselines = new Map<
    string,
    Readonly<{ loop: number; once: number }>
  >();

  constructor(options: {
    readonly runtime: Game002ReelRuntime;
    readonly cascadePlayer: SymbolCascadePlayer;
    readonly winAmountPlayer: WinAmountAnimationPlayer;
    readonly wlSymbolCode: number;
    readonly wmSymbolCode: number;
    readonly cnSymbolCode: number;
    readonly cmSymbolCode: number;
  }) {
    this.#runtime = options.runtime;
    this.#cascadePlayer = options.cascadePlayer;
    this.#winAmountPlayer = options.winAmountPlayer;
    this.#wlSymbolCode = options.wlSymbolCode;
    this.#wmSymbolCode = options.wmSymbolCode;
    this.#cnSymbolCode = options.cnSymbolCode;
    this.#cmSymbolCode = options.cmSymbolCode;
  }

  configure(round: {
    readonly sequence: Game002CascadeSequence;
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
    readonly multiplierBatches: ReadonlyMap<
      number,
      Game002WlWmMultiplierPresentationBatch
    >;
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
    this.#activeReleaseOnlyPositions = [];
    this.#completionComplete = true;
    this.#unifiedSteps.clear();
    this.#initialSnapshot = null;
    this.#refillSnapshot = null;
    this.#activeTransform = null;
    this.#activeMultiplierBatch = null;
    for (const prepared of this.#preparedWmReplacements) prepared.rollback();
    for (const prepared of this.#preparedCmReplacements) prepared.rollback();
    for (const prepared of this.#preparedCoReplacements) prepared.rollback();
    this.#preparedCoTransfers?.rollback();
    this.#preparedWmReplacements = [];
    this.#preparedCmReplacements = [];
    this.#preparedCoReplacements = [];
    this.#preparedCoTransfers = null;
    this.#coTransferProgress = 0;
    this.#transformCompletionBaselines.clear();
  }

  startInitialSpin(snapshot: SlotRoundOccurrenceSnapshot): void {
    const sequence = this.requireRound().sequence;
    this.#activity = "initial";
    this.#runtimeCompleted = false;
    this.#initialSnapshot = snapshot;
    this.#runtime.spinToScene(
      snapshot.scene,
      "game002 cascade initial spin scene",
      snapshot.values as Parameters<Game002ReelRuntime["spinToScene"]>[2],
    );
  }

  isInitialSpinComplete(): boolean {
    if (this.#activity !== "initial")
      throw new Error("game002 initial spin is not active.");
    if (!this.#runtimeCompleted) return false;
    const snapshot = this.#initialSnapshot;
    if (!snapshot)
      throw new Error("game002 initial multiplier snapshot is missing.");
    this.applyMultiplierTexts(snapshot);
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      this.requireRound().sequence.initial.spinScene,
      "completed game002 cascade initial spin",
    );
    this.#activity = "idle";
    this.#initialSnapshot = null;
    return true;
  }

  startWin(step: SlotRoundWinStepPlan): void {
    const stage = this.findWinStage(step.stepIndex);
    const prepared = this.#cascadePlayer.prepare(stage.groups);
    this.#winCompleted = false;
    this.#activeReleaseOnlyPositions = step.releaseOnlyPositions ?? [];
    this.#activity = "win";
    this.#cascadePlayer.start(prepared);
  }

  updateWin(_deltaSeconds: number): { readonly completed: boolean } {
    if (this.#activity !== "win")
      throw new Error("game002 win stage is not active.");
    if (!this.#winCompleted) return { completed: false };
    if (this.#activeReleaseOnlyPositions.length > 0)
      this.#runtime.releaseVisibleSymbols(this.#activeReleaseOnlyPositions);
    this.#activeReleaseOnlyPositions = [];
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
    this.#refillSnapshot = step.output;
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
      this.applyRequiredRefillMultiplierTexts();
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
    this.applyRequiredRefillMultiplierTexts();
    this.#activity = "idle";
    return true;
  }

  startSettledTransform(step: SlotRoundSettledTransformStepPlan): void {
    if (this.#activity !== "idle")
      throw new Error("game002 settled transform cannot start while active.");
    const batch = this.requireRound().multiplierBatches.get(step.stepIndex);
    if (!batch)
      throw new Error(
        `game002 step[${step.stepIndex}] multiplier presentation batch is missing.`,
      );
    const coChangesByKey = new Map(
      (batch.coCollection?.transform.changes ?? []).map((change) => [
        `${change.position.x},${change.position.y}`,
        change,
      ]),
    );
    const stepChangeKeys = new Set(
      step.changes.map((change) => `${change.position.x},${change.position.y}`),
    );
    if (
      step.changes.some((change) => {
        const key = `${change.position.x},${change.position.y}`;
        if (coChangesByKey.has(key)) return false;
        return !(
          (change.input.code === this.#wlSymbolCode &&
            change.output.code === this.#wlSymbolCode) ||
          (change.input.code === this.#wmSymbolCode &&
            change.output.code === this.#cnSymbolCode) ||
          (change.input.code === this.#cnSymbolCode &&
            change.output.code === this.#cnSymbolCode) ||
          (change.input.code === this.#cmSymbolCode &&
            change.output.code === this.#cnSymbolCode)
        );
      })
    ) {
      throw new Error(
        `game002 step[${step.stepIndex}] settled transform must contain only WL/CN updates, WM/CM-to-CN replacements and bg-genco CO replacements.`,
      );
    }
    if (
      batch.wmReplacements.length === 0 &&
      batch.wlIncrements.length === 0 &&
      batch.cm === null &&
      !batch.coCollection
    )
      throw new Error(
        `game002 step[${step.stepIndex}] multiplier transform has no display operation.`,
      );
    if ([...coChangesByKey.keys()].some((key) => !stepChangeKeys.has(key)))
      throw new Error(
        `game002 step[${step.stepIndex}] CO collection batch does not match the transform.`,
      );
    for (const replacement of batch.wmReplacements) {
      const { x, y } = replacement.position;
      const coChange = coChangesByKey.get(`${x},${y}`);
      if (
        step.input.scene[x]?.[y] !== this.#wmSymbolCode ||
        step.output.scene[x]?.[y] !==
          (coChange?.outputCode ?? this.#cnSymbolCode) ||
        step.output.values[x]?.[y] !==
          (coChange?.outputValue ?? replacement.outputValue)
      )
        throw new Error(
          `game002 step[${step.stepIndex}] WM replacement (${x},${y}) does not match the transform snapshots.`,
        );
    }
    if (batch.cm) {
      const { x, y } = batch.cm.position;
      const coChange = coChangesByKey.get(`${x},${y}`);
      if (
        step.input.scene[x]?.[y] !== this.#cmSymbolCode ||
        step.input.values[x]?.[y] !== batch.cm.multiplier ||
        step.output.scene[x]?.[y] !==
          (coChange?.outputCode ?? this.#cnSymbolCode) ||
        step.output.values[x]?.[y] !==
          (coChange?.outputValue ?? batch.cm.outputValue)
      )
        throw new Error(
          `game002 step[${step.stepIndex}] CM replacement (${x},${y}) does not match the transform snapshots.`,
        );
      const expectedCnPositions = step.input.occurrences.filter(
        (occurrence) =>
          occurrence.code === this.#cnSymbolCode ||
          occurrence.code === this.#wmSymbolCode,
      );
      const expectedCnKeys = new Set(
        expectedCnPositions.map(
          (occurrence) => `${occurrence.position.x},${occurrence.position.y}`,
        ),
      );
      const actualCnKeys = new Set(
        batch.cnUpdates.map(
          (update) => `${update.position.x},${update.position.y}`,
        ),
      );
      if (
        expectedCnKeys.size !== batch.cnUpdates.length ||
        actualCnKeys.size !== batch.cnUpdates.length ||
        [...expectedCnKeys].some((key) => !actualCnKeys.has(key))
      )
        throw new Error(
          `game002 step[${step.stepIndex}] CN update batch does not cover every intermediate CN.`,
        );
      for (const update of batch.cnUpdates) {
        const { x, y } = update.position;
        const inputCode = step.input.scene[x]?.[y];
        const wmReplacement = batch.wmReplacements.find(
          (replacement) =>
            replacement.position.x === x && replacement.position.y === y,
        );
        const expectedInputValue =
          inputCode === this.#wmSymbolCode
            ? wmReplacement?.intermediateValue
            : step.input.values[x]?.[y];
        const coChange = coChangesByKey.get(`${x},${y}`);
        if (
          (inputCode !== this.#cnSymbolCode &&
            inputCode !== this.#wmSymbolCode) ||
          expectedInputValue !== update.inputValue ||
          step.output.scene[x]?.[y] !==
            (coChange?.outputCode ?? this.#cnSymbolCode) ||
          step.output.values[x]?.[y] !==
            (coChange?.outputValue ?? update.outputValue)
        )
          throw new Error(
            `game002 step[${step.stepIndex}] CN update (${x},${y}) does not match the transform snapshots.`,
          );
      }
    } else if (batch.cnUpdates.length > 0) {
      throw new Error(
        `game002 step[${step.stepIndex}] CN updates require a CM presentation.`,
      );
    }
    for (const increment of batch.wlIncrements) {
      const { x, y } = increment.position;
      const coChange = coChangesByKey.get(`${x},${y}`);
      if (
        step.input.scene[x]?.[y] !== this.#wlSymbolCode ||
        step.output.scene[x]?.[y] !==
          (coChange?.outputCode ?? this.#wlSymbolCode) ||
        step.output.values[x]?.[y] !==
          (coChange?.outputValue ?? increment.outputValue)
      )
        throw new Error(
          `game002 step[${step.stepIndex}] WL increment (${x},${y}) does not match the transform snapshots.`,
        );
    }
    for (const replacement of batch.coCollection?.transform.changes ?? []) {
      const { x, y } = replacement.position;
      if (
        step.input.scene[x]?.[y] === undefined ||
        step.output.scene[x]?.[y] !== replacement.outputCode ||
        step.output.values[x]?.[y] !== replacement.outputValue
      )
        throw new Error(
          `game002 step[${step.stepIndex}] CO collection change (${x},${y}) does not match the transform snapshots.`,
        );
    }
    this.applyMultiplierTexts(step.input);
    for (const replacement of batch.wmReplacements) {
      for (const state of ["multStart", "multIdle", "multEnd", "change"]) {
        if (
          !this.#runtime.hasVisibleSymbolStateCapability(
            replacement.position.x,
            replacement.position.y,
            state,
          )
        ) {
          throw new Error(
            `game002 WM (${replacement.position.x},${replacement.position.y}) has no "${state}" animation capability.`,
          );
        }
      }
    }
    for (const increment of batch.wlIncrements) {
      if (
        !this.#runtime.hasVisibleSymbolStateCapability(
          increment.position.x,
          increment.position.y,
          "appear",
        )
      )
        throw new Error(
          `game002 WL (${increment.position.x},${increment.position.y}) has no "appear" Start animation capability.`,
        );
    }
    if (batch.cm) {
      for (const state of ["feature1", "change"]) {
        if (
          !this.#runtime.hasVisibleSymbolStateCapability(
            batch.cm.position.x,
            batch.cm.position.y,
            state,
          )
        )
          throw new Error(
            `game002 CM (${batch.cm.position.x},${batch.cm.position.y}) has no "${state}" animation capability.`,
          );
      }
    }
    for (const update of batch.cnUpdates) {
      const inputCode =
        step.input.scene[update.position.x]?.[update.position.y];
      if (
        inputCode === this.#cnSymbolCode &&
        !this.#runtime.hasVisibleSymbolStateCapability(
          update.position.x,
          update.position.y,
          "featureChange",
        )
      )
        throw new Error(
          `game002 CN (${update.position.x},${update.position.y}) has no "featureChange" animation capability.`,
        );
    }
    for (const segment of batch.coCollection?.segments ?? []) {
      if (
        !this.#runtime.hasVisibleSymbolStateCapability(
          segment.co.x,
          segment.co.y,
          "feature",
        )
      )
        throw new Error(
          `game002 CO (${segment.co.x},${segment.co.y}) has no "feature" animation capability.`,
        );
      for (const transfer of segment.transfers)
        for (const state of ["feature1", "feature2"])
          if (
            !this.#runtime.hasVisibleSymbolStateCapability(
              transfer.source.x,
              transfer.source.y,
              state,
            )
          )
            throw new Error(
              `game002 CO source (${transfer.source.x},${transfer.source.y}) has no "${state}" animation capability.`,
            );
    }
    const preparedWm: PreparedVisibleOccurrenceReplacement[] = [];
    const preparedCm: PreparedVisibleOccurrenceReplacement[] = [];
    const preparedCo: PreparedVisibleOccurrenceReplacement[] = [];
    const postMultiplierCnKeys = new Set([
      ...batch.wmReplacements.map(
        (replacement) => `${replacement.position.x},${replacement.position.y}`,
      ),
      ...(batch.cm ? [`${batch.cm.position.x},${batch.cm.position.y}`] : []),
    ]);
    const postMultiplierCodeAt = (position: {
      readonly x: number;
      readonly y: number;
    }) =>
      postMultiplierCnKeys.has(`${position.x},${position.y}`)
        ? this.#cnSymbolCode
        : step.input.scene[position.x][position.y];
    try {
      for (const replacement of batch.wmReplacements) {
        preparedWm.push(
          this.#runtime.prepareVisibleOccurrenceReplacement({
            x: replacement.position.x,
            y: replacement.position.y,
            expectedCode: this.#wmSymbolCode,
            outputCode: this.#cnSymbolCode,
            outputPresentationValue: replacement.intermediateValue,
          }),
        );
      }
      if (batch.cm)
        preparedCm.push(
          this.#runtime.prepareVisibleOccurrenceReplacement({
            x: batch.cm.position.x,
            y: batch.cm.position.y,
            expectedCode: this.#cmSymbolCode,
            outputCode: this.#cnSymbolCode,
            outputPresentationValue: batch.cm.outputValue,
          }),
        );
      const relocations = batch.coCollection?.transform.relocations ?? [];
      const relocatedPositions = new Set(
        relocations.flatMap((relocation) => [
          `${relocation.source.x},${relocation.source.y}`,
          `${relocation.target.x},${relocation.target.y}`,
        ]),
      );
      for (const replacement of batch.coCollection?.transform.changes ?? [])
        if (
          !relocatedPositions.has(
            `${replacement.position.x},${replacement.position.y}`,
          )
        )
          preparedCo.push(
            this.#runtime.prepareVisibleOccurrenceReplacement({
              x: replacement.position.x,
              y: replacement.position.y,
              expectedCode: postMultiplierCodeAt(replacement.position),
              outputCode: replacement.outputCode,
              outputPresentationValue: replacement.outputValue,
            }),
          );
      if (batch.coCollection) {
        const changes = new Map(
          batch.coCollection.transform.changes.map((change) => [
            `${change.position.x},${change.position.y}`,
            change,
          ]),
        );
        const transfersBySource = new Map(
          batch.coCollection.segments.flatMap((segment) =>
            segment.transfers.map((transfer) => [
              `${transfer.source.x},${transfer.source.y}`,
              transfer,
            ]),
          ),
        );
        this.#preparedCoTransfers =
          this.#runtime.prepareVisibleOccurrenceTransferBatch({
            transfers: relocations.map((relocation) => {
              const sourceChange = changes.get(
                `${relocation.source.x},${relocation.source.y}`,
              );
              if (!sourceChange)
                throw new Error(
                  `game002 CO source (${relocation.source.x},${relocation.source.y}) has no source replacement.`,
                );
              const transfer = transfersBySource.get(
                `${relocation.source.x},${relocation.source.y}`,
              );
              if (
                !transfer ||
                transfer.sourceCode !== postMultiplierCodeAt(relocation.source)
              )
                throw new Error(
                  `game002 CO source (${relocation.source.x},${relocation.source.y}) does not match the post-multiplier scene.`,
                );
              return Object.freeze({
                source: relocation.source,
                target: relocation.target,
                expectedSourceCode: transfer.sourceCode,
                expectedTargetCode: postMultiplierCodeAt(relocation.target),
                sourceReplacementCode: sourceChange.outputCode,
                sourceReplacementPresentationValue: sourceChange.outputValue,
              });
            }),
          });
      }
    } catch (error) {
      for (const replacement of preparedWm) replacement.rollback();
      for (const replacement of preparedCm) replacement.rollback();
      for (const replacement of preparedCo) replacement.rollback();
      this.#preparedCoTransfers?.rollback();
      this.#preparedCoTransfers = null;
      throw error;
    }
    this.#preparedWmReplacements = preparedWm;
    this.#preparedCmReplacements = preparedCm;
    this.#preparedCoReplacements = preparedCo;
    this.#activeTransform = step;
    this.#activeMultiplierBatch = batch;
    if (batch.wlIncrements.length > 0) {
      const positions = batch.wlIncrements.map(
        (increment) => increment.position,
      );
      for (const increment of batch.wlIncrements) {
        this.#runtime.setVisibleSymbolPresentationValue(
          increment.position.x,
          increment.position.y,
          increment.outputValue,
        );
        this.#runtime.setVisibleSymbolImageStringText(
          increment.position.x,
          increment.position.y,
          "multiplier",
          formatMultiplier(increment.outputValue),
        );
      }
      this.requestTransformState(positions, "appear");
      this.#activity = "transform-wl-start";
      return;
    }
    this.startWmOrCm(step, batch);
  }

  updateSettledTransform(_deltaSeconds: number): {
    readonly completed: boolean;
  } {
    const step = this.#activeTransform;
    if (!step) throw new Error("game002 settled transform is not active.");
    const batch = this.#activeMultiplierBatch;
    if (!batch)
      throw new Error("game002 multiplier presentation batch is missing.");
    const wmPositions = batch.wmReplacements.map(
      (replacement) => replacement.position,
    );
    if (this.#activity === "transform-wl-start") {
      const positions = batch.wlIncrements.map(
        (increment) => increment.position,
      );
      if (!this.didTransformAnimationComplete(positions, "once"))
        return { completed: false };
      return this.startWmOrCm(step, batch);
    }
    if (this.#activity === "transform-mult-start") {
      if (!this.didTransformAnimationComplete(wmPositions, "once"))
        return { completed: false };
      for (const change of step.changes) {
        if (change.input.code !== this.#wlSymbolCode) continue;
        this.#runtime.setVisibleSymbolPresentationValue(
          change.position.x,
          change.position.y,
          change.output.value,
        );
        this.#runtime.setVisibleSymbolImageStringText(
          change.position.x,
          change.position.y,
          "multiplier",
          formatMultiplier(change.output.value),
        );
      }
      this.requestTransformState(wmPositions, "multIdle");
      this.#activity = "transform-mult-idle";
      return { completed: false };
    }
    if (this.#activity === "transform-mult-idle") {
      if (!this.didTransformAnimationComplete(wmPositions, "loop"))
        return { completed: false };
      this.requestTransformState(wmPositions, "multEnd");
      this.#activity = "transform-mult-end";
      return { completed: false };
    }
    if (this.#activity === "transform-mult-end") {
      if (!this.didTransformAnimationComplete(wmPositions, "once"))
        return { completed: false };
      this.requestTransformState(wmPositions, "change");
      this.#activity = "transform-wm-change";
      return { completed: false };
    }
    if (this.#activity === "transform-wm-change") {
      if (!this.didTransformAnimationComplete(wmPositions, "once"))
        return { completed: false };
      for (const replacement of this.#preparedWmReplacements)
        replacement.commit();
      this.#preparedWmReplacements = [];
      for (const update of batch.cnUpdates)
        if (
          !this.#runtime.hasVisibleSymbolStateCapability(
            update.position.x,
            update.position.y,
            "featureChange",
          )
        )
          throw new Error(
            `game002 CN (${update.position.x},${update.position.y}) has no "featureChange" animation capability.`,
          );
      return this.startCmOrComplete(step, batch);
    }
    if (this.#activity === "transform-cm-feature") {
      const cm = requireCmPresentation(batch);
      if (!this.didTransformAnimationComplete([cm.position], "once"))
        return { completed: false };
      for (const update of batch.cnUpdates)
        this.#runtime.setVisibleSymbolPresentationValue(
          update.position.x,
          update.position.y,
          update.outputValue,
        );
      if (batch.cnUpdates.length === 0) {
        this.requestTransformState([cm.position], "change");
        this.#activity = "transform-cm-change";
      } else {
        this.requestTransformState(
          batch.cnUpdates.map((update) => update.position),
          "featureChange",
        );
        this.#activity = "transform-cn-feature-change";
      }
      return { completed: false };
    }
    if (this.#activity === "transform-cn-feature-change") {
      if (
        !this.didTransformAnimationComplete(
          batch.cnUpdates.map((update) => update.position),
          "once",
        )
      )
        return { completed: false };
      const cm = requireCmPresentation(batch);
      this.requestTransformState([cm.position], "change");
      this.#activity = "transform-cm-change";
      return { completed: false };
    }
    if (this.#activity === "transform-cm-change") {
      const cm = requireCmPresentation(batch);
      if (!this.didTransformAnimationComplete([cm.position], "once"))
        return { completed: false };
      for (const replacement of this.#preparedCmReplacements)
        replacement.commit();
      this.#preparedCmReplacements = [];
      return this.startCoOrComplete(step, batch);
    }
    if (this.#activity === "transform-co-feature") {
      const collection = requireCoCollection(batch);
      const positions = [
        ...collection.segments.map((segment) => segment.co),
        ...collection.sourcePositions,
      ];
      if (!this.didTransformAnimationComplete(positions, "once"))
        return { completed: false };
      this.requestTransformState(collection.sourcePositions, "feature2");
      this.#preparedCoTransfers?.start();
      this.#coTransferProgress = 0;
      this.#activity = "transform-co-transfer";
      return { completed: false };
    }
    if (this.#activity === "transform-co-transfer") {
      const collection = requireCoCollection(batch);
      const completed = this.didTransformAnimationComplete(
        collection.sourcePositions,
        "once",
      );
      if (!completed) {
        this.#coTransferProgress = Math.min(
          0.9,
          this.#coTransferProgress + _deltaSeconds * 2,
        );
        this.#preparedCoTransfers?.setProgress(this.#coTransferProgress);
        return { completed: false };
      }
      this.#preparedCoTransfers?.setProgress(1);
      this.completeSettledTransform(step);
      return { completed: true };
    }
    throw new Error("game002 settled transform activity is invalid.");
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
    this.#runtimeCompleted ||= result.completed;
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

  getDiagnosticSnapshot() {
    const visual = this.#runtime.getVisualSnapshot();
    const cascade = this.#cascadePlayer.getSnapshot();
    return Object.freeze({
      activity: this.#activity,
      activeStepIndex:
        this.#activeTransform?.stepIndex ??
        this.#activeStage?.stepIndex ??
        null,
      runtimeCompleted: this.#runtimeCompleted,
      winCompleted: this.#winCompleted,
      completionComplete: this.#completionComplete,
      reelSpinning: this.#runtime.isSpinning(),
      anticipation: this.#runtime.getAnticipationSnapshot(),
      effects: visual.effects
        ? Object.freeze({
            prepared: visual.effects.prepared,
            active: Object.freeze(
              visual.effects.active.map(({ effectId, x, y }) =>
                Object.freeze({ effectId, x, y }),
              ),
            ),
            activeCount: visual.effects.activeCount,
          })
        : null,
      cascade: Object.freeze({
        phase: cascade.phase,
        currentIndex: cascade.currentIndex,
        componentName: cascade.componentName,
        resultIndex: cascade.resultIndex,
        currentItemIndex: cascade.currentItemIndex,
        currentItemPosition: cascade.currentItemPosition,
        summaryCounting: cascade.summaryCounting,
      }),
    });
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

  private applyRequiredRefillMultiplierTexts(): void {
    const snapshot = this.#refillSnapshot;
    if (!snapshot)
      throw new Error("game002 refill multiplier snapshot is missing.");
    this.applyMultiplierTexts(snapshot);
    this.#refillSnapshot = null;
  }

  private startWmOrCm(
    step: SlotRoundSettledTransformStepPlan,
    batch: Game002WlWmMultiplierPresentationBatch,
  ): { readonly completed: boolean } {
    if (batch.wmReplacements.length === 0)
      return this.startCmOrComplete(step, batch);
    this.requestTransformState(
      batch.wmReplacements.map((replacement) => replacement.position),
      "multStart",
    );
    this.#activity = "transform-mult-start";
    return { completed: false };
  }

  private startCmOrComplete(
    step: SlotRoundSettledTransformStepPlan,
    batch: Game002WlWmMultiplierPresentationBatch,
  ): { readonly completed: boolean } {
    if (!batch.cm) {
      return this.startCoOrComplete(step, batch);
    }
    this.requestTransformState([batch.cm.position], "feature1");
    this.#activity = "transform-cm-feature";
    return { completed: false };
  }

  private startCoOrComplete(
    step: SlotRoundSettledTransformStepPlan,
    batch: Game002WlWmMultiplierPresentationBatch,
  ): { readonly completed: boolean } {
    const collection = batch.coCollection;
    if (!collection) {
      this.completeSettledTransform(step);
      return { completed: true };
    }
    this.requestTransformStates([
      Object.freeze({
        positions: collection.segments.map((segment) => segment.co),
        state: "feature",
      }),
      Object.freeze({
        positions: collection.sourcePositions,
        state: "feature1",
      }),
    ]);
    this.#activity = "transform-co-feature";
    return { completed: false };
  }

  private completeSettledTransform(
    step: SlotRoundSettledTransformStepPlan,
  ): void {
    if (
      this.#preparedWmReplacements.length > 0 ||
      this.#preparedCmReplacements.length > 0
    )
      throw new Error(
        `game002 step[${step.stepIndex}] multiplier transform completed with uncommitted replacements.`,
      );
    this.#preparedCoTransfers?.commit();
    this.#preparedCoTransfers = null;
    for (const replacement of this.#preparedCoReplacements)
      replacement.commit();
    this.#preparedCoReplacements = [];
    this.#coTransferProgress = 0;
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      step.output.scene,
      `completed game002 step[${step.stepIndex}] multiplier transform`,
    );
    this.#activeTransform = null;
    this.#activeMultiplierBatch = null;
    this.#transformCompletionBaselines.clear();
    this.#activity = "idle";
  }

  private applyMultiplierTexts(snapshot: SlotRoundOccurrenceSnapshot): void {
    for (const occurrence of snapshot.occurrences) {
      if (
        occurrence.code !== this.#wlSymbolCode &&
        occurrence.code !== this.#wmSymbolCode &&
        occurrence.code !== this.#cmSymbolCode
      )
        continue;
      this.#runtime.setVisibleSymbolPresentationValue(
        occurrence.position.x,
        occurrence.position.y,
        occurrence.value,
      );
      this.#runtime.setVisibleSymbolImageStringText(
        occurrence.position.x,
        occurrence.position.y,
        "multiplier",
        formatMultiplier(occurrence.value),
      );
    }
  }

  private requestTransformState(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: string,
  ): void {
    this.requestTransformStates([Object.freeze({ positions, state })]);
  }

  private requestTransformStates(
    requests: readonly Readonly<{
      positions: readonly { readonly x: number; readonly y: number }[];
      state: string;
    }>[],
  ): void {
    const baselines = requestGame002TransformStates(this.#runtime, requests);
    this.#transformCompletionBaselines.clear();
    for (const [key, baseline] of baselines)
      this.#transformCompletionBaselines.set(key, baseline);
  }

  private didTransformAnimationComplete(
    positions: readonly { readonly x: number; readonly y: number }[],
    kind: "loop" | "once",
  ): boolean {
    return this.#runtime
      .getVisibleSymbolStateSnapshots(positions)
      .every((snapshot) => {
        const baseline = this.#transformCompletionBaselines.get(
          `${snapshot.x},${snapshot.y}`,
        );
        if (!baseline)
          throw new Error(
            `game002 transform animation baseline is missing for (${snapshot.x},${snapshot.y}).`,
          );
        return kind === "loop"
          ? (snapshot.loopCompletionCount ?? 0) > baseline.loop
          : (snapshot.onceCompletionCount ?? 0) > baseline.once;
      });
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

function requireGame002SymbolCode(
  runtime: Game002ReelRuntime,
  symbol: string,
): number {
  const code = runtime.gameConfig.getSymbolCode(symbol);
  if (code === undefined)
    throw new Error(`game002 game config is missing ${symbol} symbol code.`);
  return code;
}

function requireCmPresentation(batch: Game002WlWmMultiplierPresentationBatch) {
  if (!batch.cm)
    throw new Error(
      `game002 step[${batch.stepIndex}] CM presentation is missing.`,
    );
  return batch.cm;
}

function requireCoCollection(batch: Game002WlWmMultiplierPresentationBatch) {
  if (!batch.coCollection)
    throw new Error(
      `game002 step[${batch.stepIndex}] CO collection presentation is missing.`,
    );
  return batch.coCollection;
}

function formatMultiplier(value: number | null): string {
  if (!Number.isSafeInteger(value) || value === null || value <= 0)
    throw new Error(
      "game002 multiplier value must be a positive safe integer.",
    );
  return `x${value}`;
}

export function assertGame002CascadeResources(
  sequence: Game002CascadeSequence,
  runtime: Game002ReelRuntime,
  skin: Game002SkinConfig,
): void {
  const checkWinStage = (stage: Game002WinRemoveStage | undefined) => {
    if (!stage) return;
    const scene = stage.sourceScene;
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
  checkWinStage(sequence.initial.winStage);
  for (const stage of sequence.cascades) {
    checkWinStage(stage.winStage);
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

function createGame002LogicSlice(
  source: GameLogic,
  stepCount: number,
): GameLogic {
  if (
    !Number.isSafeInteger(stepCount) ||
    stepCount <= 0 ||
    stepCount > source.getStepCount()
  )
    throw new Error(`game002 logic slice stepCount ${stepCount} is invalid.`);
  const steps = Object.freeze(source.getSteps().slice(0, stepCount));
  const getStep = (index: number): GameLogicStep => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= steps.length)
      throw new RangeError(
        `game002 sliced step index ${index} is out of range.`,
      );
    return steps[index]!;
  };
  return Object.freeze({
    getGameModuleName: () => source.getGameModuleName(),
    getGameId: () => source.getGameId(),
    getBet: () => source.getBet(),
    getLines: () => source.getLines(),
    getTotalWin: () => source.getTotalWin(),
    getPlayWin: () => source.getPlayWin(),
    getRawMessage: () => source.getRawMessage(),
    getRawGmi: () => source.getRawGmi(),
    getDefaultScene: () => source.getDefaultScene(),
    getRandomNumbers: () => source.getRandomNumbers(),
    getStepCount: () => steps.length,
    getStep,
    getSteps: () => steps,
    getScene: (stepIndex: number, sceneIndex: number) =>
      getStep(stepIndex).getScene(sceneIndex),
    getOtherScene: (stepIndex: number, otherSceneIndex: number) =>
      getStep(stepIndex).getOtherScene(otherSceneIndex),
    getResult: (stepIndex: number, resultIndex: number) =>
      getStep(stepIndex).getResult(resultIndex),
    hasComponent: (stepIndex: number, name: string) =>
      getStep(stepIndex).hasComponent(name),
    getComponent: (stepIndex: number, name: string) =>
      getStep(stepIndex).getComponent(name),
    getComponentScenes: (stepIndex: number, name: string) =>
      getStep(stepIndex).getComponentScenes(name),
    getComponentOtherScenes: (stepIndex: number, name: string) =>
      getStep(stepIndex).getComponentOtherScenes(name),
    getComponentResults: (stepIndex: number, name: string) =>
      getStep(stepIndex).getComponentResults(name),
  });
}

export function requestGame002TransformStates(
  runtime: Pick<
    Game002ReelRuntime,
    "requestVisibleSymbolStates" | "getVisibleSymbolStateSnapshots"
  >,
  requests: readonly Readonly<{
    positions: readonly { readonly x: number; readonly y: number }[];
    state: string;
  }>[],
): ReadonlyMap<string, Readonly<{ loop: number; once: number }>> {
  for (const request of requests)
    runtime.requestVisibleSymbolStates(
      request.positions,
      request.state,
      "immediate",
    );
  const positions = requests.flatMap((request) => request.positions);
  const expectedKeys = new Set(
    positions.map((position) => `${position.x},${position.y}`),
  );
  const baselines = new Map<string, Readonly<{ loop: number; once: number }>>();
  for (const snapshot of runtime.getVisibleSymbolStateSnapshots(positions))
    baselines.set(
      `${snapshot.x},${snapshot.y}`,
      Object.freeze({
        loop: snapshot.loopCompletionCount ?? 0,
        once: snapshot.onceCompletionCount ?? 0,
      }),
    );
  if (
    baselines.size !== expectedKeys.size ||
    [...expectedKeys].some((key) => !baselines.has(key))
  )
    throw new Error(
      "game002 transform state batch did not capture every requested animation baseline.",
    );
  return baselines;
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

function reportFatalError(error: Error): void {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
    return;
  }
  console.error(error);
}
