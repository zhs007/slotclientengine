import { Application, Container } from "pixi.js";
import type {
  GameLogic,
  GameLogicStep,
  SlotRoundCapability,
  SlotRoundOccurrenceSnapshot,
  SlotOperationV2,
  SlotOperationPlanV2,
  SlotOperationSnapshot,
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
  type SymbolCascadePlayer,
  createSlotOperationCoordinator,
  createSlotOperationHandlerRegistry,
  type SlotOperationHandler,
  type PreparedVisibleOccurrenceReplacement,
  type PreparedGridCellVisibleOccurrenceTransferBatch,
} from "@slotclientengine/rendercore";
import type {
  WinAmountAnimationPhase,
  WinAmountAnimationPlayer,
} from "@slotclientengine/rendercore/win-amount";
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
import type { Game002PackageConfig } from "./package-config.js";
import {
  createGame002SceneLayoutPlayers,
  type Game002BackgroundPlayer,
} from "./scene-layout-presentation.js";
import { formatServerUsdAmount } from "./money.js";
import { GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS } from "./win-symbol-carousel-config.js";
import { GAME002_CN_VALUE_SYMBOL } from "./cn-value-sequence.js";
import {
  createGame002WinSummaryCollectOptions,
  resolveGame002WinResultCashAmount,
  resolveGame002WinResultCoinAmount,
  resolveGame002WinResultMultiplier,
} from "./cascade-win-summary-config.js";
import {
  GAME002_CASCADE_MOTION,
  GAME002_CASCADE_PRESENTATION,
  canGame002CascadeDropSymbol,
  isGame002SequentialWinCompanionSymbol,
} from "./cascade-config.js";
import { type Game002TransformOperationPayload } from "./wl-wm-multiplier-plan.js";
import {
  compileGame002RoundOperationPlan,
  type Game002FallPayload,
  type Game002FreeGameOperationPayload,
  type Game002TransformPayload,
  type Game002WinPayload,
  type Game002RemovePayload,
  type Game002SpinPayload,
} from "./game002-operation-compiler.js";
import { Game002FreeGameOperationTarget } from "./freegame-operation-target.js";

export type Game002TickerSnapshot = { readonly deltaMS: number };

function createGame002WinAmountLayout(
  layout: ReturnType<typeof createGame002Layout>,
): import("@slotclientengine/rendercore/win-amount").WinAmountAnimationLayout {
  return Object.freeze({
    minorTextPosition: Object.freeze({
      x: layout.boardFrame.x + layout.boardFrame.width / 2,
      y: layout.boardFrame.y + layout.boardFrame.height - 28,
    }),
    majorTextPosition: Object.freeze({
      x: layout.boardFrame.x + layout.boardFrame.width / 2,
      y: layout.boardFrame.y + layout.boardFrame.height / 2,
    }),
    tierStageRect: layout.backgroundFrame,
  });
}
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
  readonly packageConfig: Game002PackageConfig;
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
  readonly #packageConfig: Game002PackageConfig;
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
  #roundCoordinator: ReturnType<typeof createSlotOperationCoordinator> | null =
    null;
  #roundTarget: Game002RoundTarget | null = null;
  #freeGameOperationTarget: Game002FreeGameOperationTarget | null = null;
  #unsubscribeViewport: (() => void) | null = null;
  #disposeWinAmountAdvanceListener: (() => void) | null = null;
  #lastPresentationDiagnostic = "";
  #presentationDiagnosticAgeSeconds = 0;
  #presentationStallReported = false;

  constructor(options: Game002AdapterOptions) {
    const packageConfig = options.packageConfig;
    let sceneLayoutPlayers:
      | ReturnType<typeof createGame002SceneLayoutPlayers>
      | undefined;
    this.#packageConfig = packageConfig;
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#createBackgroundPlayer =
      options.createBackgroundPlayer ??
      (() => {
        sceneLayoutPlayers = createGame002SceneLayoutPlayers({
          resource: packageConfig.presentation.resource,
          initialMode: packageConfig.presentation.initialMode,
          awardCelebrationPopup:
            packageConfig.presentation.awardCelebrationPopup,
        });
        return sceneLayoutPlayers.backgroundPlayer;
      });
    this.#createRuntime =
      options.createRuntime ??
      (() => {
        return createGame002ReelRuntime({
          gameConfig: packageConfig.presentation.symbolPackage.gameConfig,
          symbolRegistry: packageConfig.presentation.symbolRegistry,
          config: {
            ...DEFAULT_GAME002_REEL_CONFIG,
            reelsName: packageConfig.reelsName,
            emptySymbols: packageConfig.emptySymbols,
            texturedSymbols: packageConfig.displaySymbols,
            missingAssetLabel: packageConfig.label,
            symbolScales: packageConfig.symbolScales,
            symbolRenderPriorities: packageConfig.symbolRenderPriorities,
            symbolAnimationCapabilities:
              packageConfig.symbolAnimationCapabilities,
            symbolStatePreset: packageConfig.symbolStatePreset,
            animationResolver: packageConfig.symbolAnimationResolver,
            symbolValuePresentationResources:
              packageConfig.symbolValuePresentationResources,
            timing: packageConfig.reelManifest.spin.timing,
            reelManifest: packageConfig.reelManifest,
            reelEffectResources: packageConfig.reelEffectResources,
            reelEffectPoolCapacities: packageConfig.reelEffectPoolCapacities,
            dimming: createGame002GridCellDimming(
              packageConfig.reelManifest.spin.dimmingAlpha,
            ),
            spinBounceStrength: packageConfig.reelManifest.spin.bounceStrength,
            gridLayout: packageConfig.gridLayout,
            focusRegion: packageConfig.focusRegion,
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
        gridLayout: this.#packageConfig.gridLayout,
        focusRegion: this.#packageConfig.focusRegion,
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
          packageConfig: this.#packageConfig,
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
      const registry = createSlotOperationHandlerRegistry();
      for (const registration of createGame002OperationRegistrations(
        this.#roundTarget,
      ))
        registry.register(registration);
      this.#freeGameOperationTarget = new Game002FreeGameOperationTarget({
        runtime,
        cascadePlayer: symbolCascadePlayer,
        winAmountPlayer,
        backgroundPlayer,
        codes: {
          AF: requireGame002SymbolCode(runtime, "AF"),
          CN: requireGame002SymbolCode(runtime, "CN"),
          CO: requireGame002SymbolCode(runtime, "CO"),
          BN: requireGame002SymbolCode(runtime, "BN"),
        },
      });
      for (const registration of createGame002FreeGameOperationRegistrations(
        this.#freeGameOperationTarget,
      ))
        registry.register(registration);
      this.#roundCoordinator = createSlotOperationCoordinator({
        registry,
        cleanup: () => {
          this.#roundTarget?.cleanup();
          this.#freeGameOperationTarget?.cleanup();
        },
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
    this.#resetPresentationDiagnostic();
    try {
      const compiled = compileGame002RoundOperationPlan({
        logic,
        runtime,
        displaySymbols: this.#packageConfig.displaySymbols,
        logDiagnostic: this.#logDiagnostic,
      });
      assertGame002OperationResources(
        compiled.plan,
        runtime,
        this.#packageConfig,
      );
      return coordinator.start(compiled.plan);
    } catch (error) {
      this.#logDiagnostic(
        `game002 operation plan compile failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  setFrameworkState(_state: SlotGameStateSnapshot): void {
    return undefined;
  }

  destroy(): void {
    this.#roundCoordinator?.destroy();
    this.#roundCoordinator = null;
    this.#roundTarget = null;
    this.#freeGameOperationTarget = null;
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

  #requireRoundCoordinator(): ReturnType<
    typeof createSlotOperationCoordinator
  > {
    if (!this.#roundCoordinator)
      throw new Error("game002 adapter is not mounted.");
    return this.#roundCoordinator;
  }

  #applyViewport(viewport: SlotGameViewportSnapshot): void {
    if (!this.#app || !this.#worldLayer) {
      throw new Error("game002 adapter is not mounted.");
    }
    const layout = createGame002Layout({
      viewportSize: viewport.frameDesignSize,
      gridLayout: this.#packageConfig.gridLayout,
      focusRegion: this.#packageConfig.focusRegion,
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

function createGame002OperationRegistrations(target: Game002RoundTarget) {
  const lifecycle = (options: {
    readonly start: (operation: SlotOperationV2) => void;
    readonly update: (
      operation: SlotOperationV2,
      deltaSeconds: number,
    ) => boolean;
    readonly preflight?: (operation: SlotOperationV2) => void;
  }): SlotOperationHandler<SlotOperationV2, SlotOperationV2> => ({
    preflight: (operation) => options.preflight?.(operation),
    prepare: (operation) => operation,
    start: (operation) => options.start(operation),
    update: (operation, deltaSeconds) => ({
      completed: options.update(operation, deltaSeconds),
    }),
    commit: () => undefined,
    rollback: () => target.cleanup(),
    destroy: () => undefined,
  });
  const registration = (
    kind: string,
    effect: SlotOperationV2["effect"],
    handler: SlotOperationHandler<SlotOperationV2, SlotOperationV2>,
  ) =>
    Object.freeze({
      kind,
      version: 2,
      effect,
      requiredCapabilities: new Set([kind]),
      handler,
    });
  const spin = lifecycle({
    start: (operation) => {
      if (operation.effect !== "scene-landing")
        throw new Error("game002:spin must establish a scene.");
      const payload = operation.payload as Game002SpinPayload;
      target.startInitialSpin(payload.scene);
    },
    update: (_operation, deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isInitialSpinComplete();
    },
  });
  const win = lifecycle({
    start: (operation) =>
      target.startWinGroups((operation.payload as Game002WinPayload).groups),
    update: (_operation, deltaSeconds) => {
      target.update(deltaSeconds);
      return target.updateWin(deltaSeconds).completed;
    },
  });
  const remove = lifecycle({
    start: (operation) =>
      target.applyReleaseOnlyPositions(
        (operation.payload as Game002RemovePayload).releaseOnlyPositions,
      ),
    update: () => true,
  });
  const dropdown = lifecycle({
    start: (operation) =>
      target.startDropdownData(operation.payload as Game002FallPayload),
    update: (_operation, deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isDropdownComplete();
    },
  });
  const refill = lifecycle({
    start: (operation) => {
      if (operation.effect !== "state-mutation")
        throw new Error("game002:refill must mutate state.");
      target.startRefillData(
        operation.payload as Game002FallPayload,
        operation.output,
      );
    },
    update: (_operation, deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isRefillComplete();
    },
  });
  const completion = lifecycle({
    start: (operation) => {
      const payload = operation.payload as {
        readonly betAmountRaw: number;
        readonly winAmountRaw: number;
      };
      target.startCompletionAmounts(payload.betAmountRaw, payload.winAmountRaw);
    },
    update: (_operation, deltaSeconds) => {
      target.update(deltaSeconds);
      return target.isCompletionComplete();
    },
  });
  const requirePayload = (operation: SlotOperationV2) => {
    const payload = operation.payload as Game002TransformPayload;
    if (!payload?.transform || !payload.phase || !payload.transformInput)
      throw new Error("game002 atomic transform operation payload is invalid.");
    return payload;
  };
  const handler: SlotOperationHandler<SlotOperationV2, SlotOperationV2> = {
    preflight: (operation) => {
      requirePayload(operation);
    },
    prepare: (operation) => operation,
    start: (operation) => {
      const payload = requirePayload(operation);
      target.startAtomicTransformPayload(payload);
    },
    update: (_operation, deltaSeconds) => {
      target.update(deltaSeconds);
      return target.updateAtomicTransformOperation(
        deltaSeconds,
        requirePayload(_operation).phase,
      );
    },
    commit: () => undefined,
    rollback: () => target.cleanup(),
    destroy: () => undefined,
  };
  return [
    registration("game002:spin", "scene-landing", spin),
    registration("game002:win", "presentation", win),
    registration("game002:remove", "state-mutation", remove),
    registration("game002:dropdown", "state-mutation", dropdown),
    registration("game002:refill", "state-mutation", refill),
    registration("game002:win-amount", "presentation", completion),
    ...GAME002_TRANSFORM_PHASES.map((phase) =>
      Object.freeze({
        kind: `game002:${phase}`,
        version: 2,
        effect: "state-mutation" as const,
        requiredCapabilities: new Set([`game002:${phase}`]),
        handler,
      }),
    ),
    Object.freeze({
      kind: "game002:wild-multiplier-presentation",
      version: 2,
      effect: "presentation" as const,
      requiredCapabilities: new Set(["game002:wild-multiplier-presentation"]),
      handler,
    }),
  ];
}

type Game002TransformPhase =
  | "wl-increment"
  | "wild-multiplier"
  | "wm-to-cn"
  | "coin-multiplier"
  | "cm-to-cn"
  | "co-collect";

const GAME002_TRANSFORM_PHASES: readonly Game002TransformPhase[] = [
  "wl-increment",
  "wild-multiplier",
  "wm-to-cn",
  "coin-multiplier",
  "cm-to-cn",
  "co-collect",
];

function createGame002FreeGameOperationRegistrations(
  target: Game002FreeGameOperationTarget,
) {
  const requirePayload = (operation: SlotOperationV2) => {
    const payload = operation.payload as Game002FreeGameOperationPayload;
    if (!payload?.kind)
      throw new Error(`${operation.kind} FreeGame payload is invalid.`);
    return payload;
  };
  const handler: SlotOperationHandler<SlotOperationV2, SlotOperationV2> = {
    preflight: (operation) => target.preflight(requirePayload(operation)),
    prepare: (operation) => operation,
    start: (operation) => target.start(requirePayload(operation)),
    update: (_operation, deltaSeconds) => target.update(deltaSeconds),
    commit: () => undefined,
    rollback: () => target.cleanup(),
    destroy: () => undefined,
  };
  return [
    ["game002:freegame-trigger", "presentation"],
    ["game002:freegame-enter", "presentation"],
    ["game002:freegame-spin", "state-mutation"],
    ["game002:freegame-af", "state-mutation"],
    ["game002:freegame-co", "state-mutation"],
    ["game002:freegame-win", "presentation"],
    ["game002:freegame-popup", "presentation"],
    ["game002:freegame-exit", "presentation"],
  ].map(([kind, effect]) =>
    Object.freeze({
      kind: kind!,
      version: 2,
      effect: effect as "presentation" | "state-mutation",
      requiredCapabilities: new Set([kind!]),
      handler,
    }),
  );
}

function fallStepKey(fall: Game002FallPayload): string {
  return fall.flowKey;
}

function createSyntheticTransformStep(
  payload: Game002TransformPayload,
): Game002TransformSession {
  const occurrenceAt = (
    snapshot: SlotOperationSnapshot,
    position: { readonly x: number; readonly y: number },
    label: string,
  ) => {
    const occurrence = snapshot.occurrences.find(
      (item) =>
        item.position.x === position.x && item.position.y === position.y,
    );
    if (!occurrence)
      throw new Error(
        `${payload.flowKey} ${label} occurrence (${position.x},${position.y}) is missing.`,
      );
    return occurrence;
  };
  const changes = payload.transformChanges.map((change) => {
    const input = occurrenceAt(
      payload.transformInput,
      change.position,
      "input",
    );
    const output = occurrenceAt(payload.finalOutput, change.position, "output");
    return Object.freeze({
      occurrenceId: input.id,
      position: change.position,
      input,
      output,
    });
  });
  const relocations = payload.transformRelocations.map((relocation) => {
    const source = occurrenceAt(
      payload.transformInput,
      relocation.source,
      "relocation source",
    );
    const overwritten = occurrenceAt(
      payload.transformInput,
      relocation.target,
      "relocation target",
    );
    const replacement = occurrenceAt(
      payload.finalOutput,
      relocation.source,
      "source replacement",
    );
    return Object.freeze({
      occurrenceId: source.id,
      overwrittenOccurrenceId: overwritten.id,
      sourceReplacementOccurrenceId: replacement.id,
      source: relocation.source,
      target: relocation.target,
    });
  });
  const flowIndex = Number(payload.flowKey.split(":").at(-1));
  if (!Number.isSafeInteger(flowIndex) || flowIndex < 0)
    throw new Error(`${payload.flowKey} has an invalid operation flow key.`);
  return Object.freeze({
    stepIndex: flowIndex,
    input: payload.transformInput,
    output: payload.finalOutput,
    changes: Object.freeze(changes),
    relocations: Object.freeze(relocations),
  });
}

interface Game002TransformSession {
  readonly stepIndex: number;
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
  readonly changes: readonly {
    readonly occurrenceId: string;
    readonly position: { readonly x: number; readonly y: number };
    readonly input: SlotOperationSnapshot["occurrences"][number];
    readonly output: SlotOperationSnapshot["occurrences"][number];
  }[];
  readonly relocations?: readonly {
    readonly occurrenceId: string;
    readonly overwrittenOccurrenceId: string;
    readonly sourceReplacementOccurrenceId: string;
    readonly source: { readonly x: number; readonly y: number };
    readonly target: { readonly x: number; readonly y: number };
  }[];
}

export class Game002RoundTarget {
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
  readonly #wlSymbolCode: number;
  readonly #wmSymbolCode: number;
  readonly #cnSymbolCode: number;
  readonly #cmSymbolCode: number;
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
    | "transform-wait-wm"
    | "transform-mult-start"
    | "transform-mult-idle"
    | "transform-mult-end"
    | "transform-wm-change"
    | "transform-wait-wm-replace"
    | "transform-wait-cm"
    | "transform-cm-feature"
    | "transform-cn-feature-change"
    | "transform-wait-cm-replace"
    | "transform-cm-change"
    | "transform-wait-co"
    | "transform-co-feature"
    | "transform-co-transfer"
    | "completion" = "idle";
  #activeFall: Game002FallPayload | null = null;
  #runtimeCompleted = false;
  #winCompleted = false;
  #activeReleaseOnlyPositions: readonly {
    readonly x: number;
    readonly y: number;
  }[] = [];
  #completionComplete = true;
  #unifiedSteps = new Set<number | string>();
  #initialSnapshot: SlotRoundOccurrenceSnapshot | null = null;
  #refillSnapshot: SlotRoundOccurrenceSnapshot | null = null;
  #activeTransform: Game002TransformSession | null = null;
  #activeMultiplierBatch: Game002TransformOperationPayload | null = null;
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

  cleanup(): void {
    this.#cascadePlayer.clear();
    this.#winAmountPlayer.dismissImmediately();
    this.#runtime.resetPresentationState();
    this.#activity = "idle";
    this.#activeFall = null;
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
      snapshot.scene,
      "completed game002 initial spin",
    );
    this.#activity = "idle";
    this.#initialSnapshot = null;
    return true;
  }

  startWinGroups(groups: Game002WinPayload["groups"]): void {
    const prepared = this.#cascadePlayer.prepare(groups);
    this.#winCompleted = false;
    this.#activeReleaseOnlyPositions = [];
    this.#activity = "win";
    this.#cascadePlayer.start(prepared);
  }

  applyReleaseOnlyPositions(
    positions: Game002RemovePayload["releaseOnlyPositions"],
  ): void {
    if (positions.length > 0) this.#runtime.releaseVisibleSymbols(positions);
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

  startDropdownData(fall: Game002FallPayload): void {
    this.#activeFall = fall;
    const planOptions = this.createDropPlanOptionsFromFall(fall);
    const anticipation = this.#runtime.isAnticipationActive();
    const plan = anticipation
      ? this.#runtime.createCascadeDropdownPlan(planOptions)
      : this.#runtime.createCascadeDropPlan(planOptions);
    this.#activity = anticipation ? "dropdown-only" : "dropdown-unified";
    if (!anticipation) this.#unifiedSteps.add(fallStepKey(fall));
    this.#runtimeCompleted = plan.totalSeconds === 0;
    this.#runtime.startCascadeDrop(plan);
  }

  isDropdownComplete(): boolean {
    const stage = this.activeFallView();
    if (!this.#runtimeCompleted) return false;
    if (this.#activity === "dropdown-unified")
      assertGame002ReelVisualMatchesTarget(
        this.#runtime.getVisualSnapshot(),
        stage.refillScene,
        `completed game002 ${stage.label} unified fall`,
      );
    else {
      const current = this.#runtime.getCurrentScene();
      if (!current || !sceneEquals(current, stage.dropdownScene))
        throw new Error(
          `completed game002 ${stage.label} dropdown scene does not match.`,
        );
    }
    this.#activity = "idle";
    return true;
  }

  startRefillData(
    fall: Game002FallPayload,
    output: SlotOperationSnapshot,
  ): void {
    this.#activeFall = fall;
    this.#runtimeCompleted = false;
    this.#refillSnapshot = output;
    if (this.#unifiedSteps.has(fallStepKey(fall))) {
      this.#activity = "refill-complete";
      this.#runtimeCompleted = true;
      return;
    }
    this.#activity = "refill-sweep";
    this.#runtime.startRefillEffectSweep(fall.refillPositions);
  }

  isRefillComplete(): boolean {
    const stage = this.activeFallView();
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
      `completed game002 ${stage.label} selective refill`,
    );
    this.applyRequiredRefillMultiplierTexts();
    this.#activity = "idle";
    return true;
  }

  startSettledTransformOperation(
    step: Game002TransformSession,
    batch: Game002TransformOperationPayload,
  ): void {
    if (this.#activity !== "idle")
      throw new Error("game002 settled transform cannot start while active.");
    if (batch.stepIndex !== step.stepIndex)
      throw new Error(
        `game002 transform payload stepIndex does not match step[${step.stepIndex}].`,
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
    return this.updateSettledTransformPhase(_deltaSeconds, null);
  }

  private updateSettledTransformPhase(
    _deltaSeconds: number,
    stopAfter: Game002TransformPhase | null,
  ): {
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
      if (stopAfter === "wl-increment") {
        if (isLastTransformPhase(batch, "wl-increment")) {
          this.completeSettledTransform(step);
          return { completed: true };
        }
        this.#activity = "transform-wait-wm";
        return { completed: true };
      }
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
      if (stopAfter === "wild-multiplier") {
        this.#activity = "transform-wait-wm-replace";
        return { completed: true };
      }
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
      if (stopAfter === "wm-to-cn") {
        if (isLastTransformPhase(batch, "wm-to-cn")) {
          this.completeSettledTransform(step);
          return { completed: true };
        }
        this.#activity = "transform-wait-cm";
        return { completed: true };
      }
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
      if (stopAfter === "coin-multiplier") {
        this.#activity = "transform-wait-cm-replace";
        return { completed: true };
      }
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
      if (stopAfter === "cm-to-cn") {
        if (isLastTransformPhase(batch, "cm-to-cn")) {
          this.completeSettledTransform(step);
          return { completed: true };
        }
        this.#activity = "transform-wait-co";
        return { completed: true };
      }
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

  startAtomicTransformOperation(
    step: Game002TransformSession,
    batch: Game002TransformOperationPayload,
    phase: Game002TransformPhase,
  ): void {
    if (!this.#activeTransform) {
      const expected = firstTransformPhase(batch);
      if (phase !== expected)
        throw new Error(
          `game002 transform must start with ${expected}; received ${phase}.`,
        );
      this.startSettledTransformOperation(step, batch);
      return;
    }
    if (
      this.#activeTransform.stepIndex !== step.stepIndex ||
      this.#activeMultiplierBatch !== batch
    )
      throw new Error(
        "game002 atomic transform session does not match its payload.",
      );
    if (this.#activity === "transform-wait-wm" && phase === "wild-multiplier") {
      this.startWmOrCm(step, batch);
      return;
    }
    if (
      this.#activity === "transform-wait-wm-replace" &&
      phase === "wm-to-cn"
    ) {
      this.#activity = "transform-mult-idle";
      return;
    }
    if (
      this.#activity === "transform-wait-cm" &&
      (phase === "coin-multiplier" || phase === "cm-to-cn")
    ) {
      this.startCmOrComplete(step, batch);
      return;
    }
    if (
      this.#activity === "transform-wait-cm-replace" &&
      phase === "cm-to-cn"
    ) {
      const cm = requireCmPresentation(batch);
      this.requestTransformState([cm.position], "change");
      this.#activity = "transform-cm-change";
      return;
    }
    if (this.#activity === "transform-wait-co" && phase === "co-collect") {
      this.startCoOrComplete(step, batch);
      return;
    }
    throw new Error(
      `game002 cannot start atomic phase ${phase} from activity ${this.#activity}.`,
    );
  }

  startAtomicTransformPayload(payload: Game002TransformPayload): void {
    const step = this.#activeTransform ?? createSyntheticTransformStep(payload);
    const batch =
      this.#activeMultiplierBatch ??
      (Object.freeze({
        ...payload.transform,
        stepIndex: step.stepIndex,
      }) as Game002TransformOperationPayload);
    this.startAtomicTransformOperation(step, batch, payload.phase);
  }

  updateAtomicTransformOperation(
    deltaSeconds: number,
    phase: Game002TransformPhase,
  ): { readonly completed: boolean } {
    return this.updateSettledTransformPhase(deltaSeconds, phase);
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
      const stage = this.activeFallView();
      this.#activity = "refill-spin";
      this.#runtimeCompleted = false;
      this.#runtime.startSelectiveRefillSpin({
        dropdownScene: stage.dropdownScene,
        dropdownValues: stage.dropdownValues,
        targetScene: stage.refillScene,
        targetValues: stage.refillValues,
        refillPositions: stage.refillPositions,
        sceneName: `game002 ${stage.label} selective refill`,
      });
    }
  }

  startCompletionAmounts(betAmountRaw: number, winAmountRaw: number): void {
    this.#cascadePlayer.clear();
    if (winAmountRaw <= 0) {
      this.#completionComplete = true;
      this.#activity = "idle";
      return;
    }
    this.#completionComplete = false;
    this.#activity = "completion";
    this.#winAmountPlayer.start({ betAmountRaw, winAmountRaw });
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
      activeStepIndex: this.#activeTransform?.stepIndex ?? null,
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

  private createDropPlanOptionsFromFall(
    fall: Game002FallPayload,
  ): Parameters<Game002ReelRuntime["createCascadeDropPlan"]>[0] {
    return {
      sourceScene: fall.sourceScene,
      sourceValues: fall.sourceValues,
      settledScene: fall.dropdownScene,
      settledValues: fall.dropdownValues,
      targetScene: fall.refillScene,
      targetValues: fall.refillValues,
      refillPositions: fall.refillPositions,
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
    step: Game002TransformSession,
    batch: Game002TransformOperationPayload,
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
    step: Game002TransformSession,
    batch: Game002TransformOperationPayload,
  ): { readonly completed: boolean } {
    if (!batch.cm) {
      return this.startCoOrComplete(step, batch);
    }
    this.requestTransformState([batch.cm.position], "feature1");
    this.#activity = "transform-cm-feature";
    return { completed: false };
  }

  private startCoOrComplete(
    step: Game002TransformSession,
    batch: Game002TransformOperationPayload,
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

  private completeSettledTransform(step: Game002TransformSession): void {
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

  private activeFallView() {
    const stage = this.#activeFall;
    if (!stage) throw new Error("game002 fall operation is not active.");
    return Object.freeze({
      ...stage,
      label: stage.flowKey,
    });
  }
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

function requireCmPresentation(batch: Game002TransformOperationPayload) {
  if (!batch.cm)
    throw new Error(
      `game002 step[${batch.stepIndex}] CM presentation is missing.`,
    );
  return batch.cm;
}

function firstTransformPhase(
  batch: Game002TransformOperationPayload,
): Game002TransformPhase {
  if (batch.wlIncrements.length > 0) return "wl-increment";
  if (batch.wmReplacements.length > 0) return "wild-multiplier";
  if (batch.cnUpdates.length > 0) return "coin-multiplier";
  if (batch.cm) return "cm-to-cn";
  if (batch.coCollection) return "co-collect";
  throw new Error("game002 transform payload has no atomic phase.");
}

function isLastTransformPhase(
  batch: Game002TransformOperationPayload,
  phase: Game002TransformPhase,
): boolean {
  if (batch.coCollection) return phase === "co-collect";
  if (batch.cm) return phase === "cm-to-cn";
  if (batch.wmReplacements.length > 0) return phase === "wm-to-cn";
  return phase === "wl-increment";
}

function requireCoCollection(batch: Game002TransformOperationPayload) {
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

export function assertGame002OperationResources(
  plan: SlotOperationPlanV2,
  runtime: Game002ReelRuntime,
  packageConfig: Game002PackageConfig,
): void {
  const checkWinStage = (stage: {
    readonly stepIndex: number;
    readonly groups: Game002WinPayload["groups"];
    readonly sourceScene: SlotOperationSnapshot["scene"];
    readonly sourceValues: SlotOperationSnapshot["values"];
  }) => {
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
        ? packageConfig.cascadeWinPresentations[resultSymbol]
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
      const resultMultiplier =
        resultPresentation.playback.mode === "sequentialCollect"
          ? resolveGame002WinResultMultiplier({
              group,
              groupIndex,
            })
          : undefined;
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
        const presentation = packageConfig.cascadeWinPresentations[symbol];
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
            !packageConfig.symbolAnimationCapabilities[symbol]?.includes(
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
          if (
            !packageConfig.symbolAnimationCapabilities[symbol]?.includes(state)
          ) {
            throw new Error(
              `game002 step[${stage.stepIndex}] group[${groupIndex}] position (${position.x},${position.y}) symbol ${symbol} has no ${state} animation.`,
            );
          }
        }
        if (presentation.playback.mode === "sequentialCollect") {
          if (resultMultiplier === undefined) {
            throw new Error(
              `game002 step[${stage.stepIndex}] sequential collect result multiplier is missing.`,
            );
          }
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
          const weightedCashAmount = value * resultMultiplier * groupCashAmount;
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
          ? packageConfig.cascadeWinPresentations[symbol]
          : undefined;
        const removeState = presentation?.playback.removeState;
        if (
          !symbol ||
          !removeState ||
          !packageConfig.symbolAnimationCapabilities[symbol]?.includes(
            removeState,
          )
        ) {
          throw new Error(
            `game002 step[${stage.stepIndex}] group[${groupIndex}] remove position (${position.x},${position.y}) has no remove animation.`,
          );
        }
      }
      if (resultPresentation.playback.mode === "sequentialCollect") {
        if (resultMultiplier === undefined) {
          throw new Error(
            `game002 step[${stage.stepIndex}] sequential collect result multiplier is missing.`,
          );
        }
        const multipliedItemTotal = itemTotal * resultMultiplier;
        if (!Number.isSafeInteger(multipliedItemTotal)) {
          throw new Error(
            `game002 step[${stage.stepIndex}] multiplied collect item sum must be a safe integer.`,
          );
        }
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
        if (multipliedItemTotal !== groupCoinAmount) {
          throw new Error(
            `game002 step[${stage.stepIndex}] collect item sum ${itemTotal} multiplied by result otherMul ${resultMultiplier} does not match result coin amount ${groupCoinAmount}.`,
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
  const resource =
    packageConfig.symbolValuePresentationResources[GAME002_CN_VALUE_SYMBOL];
  if (!resource)
    throw new Error("game002 CN valuePresentation resource is missing.");
  let current: SlotOperationSnapshot | null = null;
  let hasSpin = false;
  for (const operation of plan.operations) {
    if (operation.effect !== "presentation") {
      current = operation.output;
      hasSpin ||= operation.kind === "game002:spin";
      for (const column of operation.output.values) {
        for (const value of column) {
          if (value !== null && value !== -1)
            assertSymbolValueDisplayResource({ value, resource });
        }
      }
    }
    if (operation.kind !== "game002:win") continue;
    if (!current)
      throw new Error("game002 win operation has no established scene.");
    checkWinStage({
      stepIndex: operation.operationIndex,
      groups: (operation.payload as Game002WinPayload).groups,
      sourceScene: current.scene,
      sourceValues: current.values,
    });
  }
  if (!current)
    throw new Error("game002 operation plan has no established scene.");
  if (!hasSpin)
    throw new Error("game002 operation plan has no spin operation.");
}

function isWinAmountBlockingSpin(phase: WinAmountAnimationPhase): boolean {
  return (
    phase === "minor-counting" ||
    phase === "major-counting" ||
    phase === "tier-counting"
  );
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
