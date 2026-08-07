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
  AwaitPresentationCommand,
  PresentationTransactionCommand,
} from "@slotclientengine/gameframeworks";
import { createPresentationTransactionRunner } from "@slotclientengine/gameframeworks";
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
  RenderGridCellReelSet,
  type SlotOperationHandler,
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
} from "./game002-reel-controller.js";
import { sceneEquals, validateGame002Scene } from "./scene.js";
import type { Game002PackageConfig } from "./package-config.js";
import {
  createGame002SceneRuntime,
  type Game002BackgroundPlayer,
} from "./game002-scene-runtime.js";
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
  #presentationRoot: Container | null = null;
  #backgroundPlayer: Game002BackgroundPlayer | null = null;
  #runtime: Game002ReelRuntime | null = null;
  #winAmountPlayer: WinAmountAnimationPlayer | null = null;
  #symbolCascadePlayer: SymbolCascadePlayer | null = null;
  #roundCoordinator: ReturnType<typeof createSlotOperationCoordinator> | null =
    null;
  #roundTarget: Game002RoundTarget | null = null;
  #freeGameOperationTarget: Game002FreeGameOperationTarget | null = null;
  #unsubscribeViewport: (() => void) | null = null;
  #disposePopupInputBinding: (() => void) | null = null;
  #disposeReelOverlay: (() => void) | null = null;
  #lastPresentationDiagnostic = "";
  #presentationDiagnosticAgeSeconds = 0;
  #presentationStallReported = false;

  constructor(options: Game002AdapterOptions) {
    const packageConfig = options.packageConfig;
    let sceneLayoutPlayers:
      | ReturnType<typeof createGame002SceneRuntime>
      | undefined;
    let sceneLayoutReelRuntime: Game002ReelRuntime | undefined;
    this.#packageConfig = packageConfig;
    this.#createApplication =
      options.createApplication ?? createPixiApplication;
    this.#createBackgroundPlayer =
      options.createBackgroundPlayer ??
      (() => {
        const reel = sceneLayoutReelRuntime?.mainReelPresentation;
        if (!(reel instanceof RenderGridCellReelSet))
          throw new Error(
            "game002 Scene Layout requires the prepared grid-cell main reel.",
          );
        sceneLayoutPlayers = createGame002SceneRuntime({
          resource: packageConfig.presentation.resource,
          initialMode: packageConfig.presentation.initialMode,
          awardCelebrationPopup:
            packageConfig.presentation.awardCelebrationPopup,
          reel,
        });
        return sceneLayoutPlayers.backgroundPlayer;
      });
    this.#createRuntime =
      options.createRuntime ??
      (() => {
        const runtime = createGame002ReelRuntime({
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
          ownsReel: false,
        });
        sceneLayoutReelRuntime = runtime;
        return runtime;
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
      runtime = this.#createRuntime();
      await runtime.prepare();
      backgroundPlayer = this.#createBackgroundPlayer();
      await backgroundPlayer.init();
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
      const disposeReelOverlay = backgroundPlayer.attachReelOverlay(
        symbolCascadePlayer.container,
      );
      app.stage.addChild(backgroundPlayer.container);

      this.#app = app;
      this.#presentationRoot = backgroundPlayer.container;
      this.#disposeReelOverlay = disposeReelOverlay;
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
      const keyboardTarget = app.canvas.ownerDocument.defaultView;
      if (!keyboardTarget)
        throw new Error("game002 canvas has no browser window input target.");
      this.#disposePopupInputBinding = backgroundPlayer.bindPopupInput({
        canvas: app.canvas,
        keyboardTarget,
        onError: (error) =>
          this.#reportFatalError(
            error instanceof Error ? error : new Error(String(error)),
          ),
      });
      this.#applyViewport(initialViewport);
      this.#unsubscribeViewport = context.onViewportChange((viewport) => {
        this.#applyViewport(viewport);
      });
    } catch (error) {
      this.#unsubscribeViewport?.();
      this.#unsubscribeViewport = null;
      this.#disposePopupInputBinding?.();
      this.#disposePopupInputBinding = null;
      if (tickerAdded) {
        app.ticker.remove(this.#onTick);
      }
      app.ticker.stop();
      winAmountPlayer?.destroy();
      symbolCascadePlayer?.destroy();
      this.#disposeReelOverlay?.();
      this.#disposeReelOverlay = null;
      runtime?.destroy();
      backgroundPlayer?.destroy();
      app.canvas.remove();
      app.destroy();
      this.#app = null;
      this.#presentationRoot = null;
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
    this.#backgroundPlayer?.acknowledgeReelSceneCommit();
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
    this.#disposePopupInputBinding?.();
    this.#disposePopupInputBinding = null;
    this.#disposeReelOverlay?.();
    this.#disposeReelOverlay = null;
    this.#app?.ticker.remove(this.#onTick);
    this.#app?.ticker.stop();
    this.#winAmountPlayer?.destroy();
    this.#symbolCascadePlayer?.destroy();
    this.#runtime?.destroy();
    this.#backgroundPlayer?.destroy();
    this.#app?.canvas.remove();
    this.#app?.destroy();
    this.#app = null;
    this.#presentationRoot = null;
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
    if (!this.#app || !this.#presentationRoot) {
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
    this.#presentationRoot.position.set(
      layout.worldOffset.x,
      layout.worldOffset.y,
    );
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
    if (!payload?.phase)
      throw new Error("game002 atomic transform operation payload is invalid.");
    return payload;
  };
  const handler: SlotOperationHandler<SlotOperationV2, SlotOperationV2> = {
    preflight: (operation) =>
      target.preflightAtomicTransform(operation, requirePayload(operation)),
    prepare: (operation) => operation,
    start: (operation) => {
      const payload = requirePayload(operation);
      target.startAtomicTransform(operation, payload);
    },
    update: (_operation, deltaSeconds) => {
      target.update(deltaSeconds);
      return target.updateAtomicTransform(_operation);
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
    | "atomic-transform"
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
  readonly #transformRunner = createPresentationTransactionRunner();
  #transformProgramId = 0;
  #transformPlaybackFailure: Error | null = null;
  #atomicTransformOperation: SlotOperationV2 | null = null;

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
    if (this.#transformRunner.getSnapshot().running)
      this.#transformRunner.cleanup("next-program");
    this.#transformProgramId += 1;
    this.#transformPlaybackFailure = null;
    const atomic = this.#atomicTransformOperation;
    this.#atomicTransformOperation = null;
    if (atomic?.effect === "state-mutation" && this.#runtime.getCurrentScene())
      this.#runtime.applyScene(
        atomic.input.scene,
        "game002 atomic transform rollback",
        atomic.input.values as Parameters<Game002ReelRuntime["applyScene"]>[2],
      );
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

  preflightAtomicTransform(
    operation: SlotOperationV2,
    payload: Game002TransformPayload,
  ): void {
    if (
      payload.phase !== "wild-multiplier" &&
      operation.effect !== "state-mutation"
    )
      throw new Error(`${operation.kind} must mutate state.`);
    const requireStates = (
      positions: readonly { readonly x: number; readonly y: number }[],
      states: readonly string[],
    ) => {
      for (const position of positions)
        for (const state of states)
          if (
            !this.#runtime.hasVisibleSymbolStateCapability(
              position.x,
              position.y,
              state,
            )
          )
            throw new Error(
              `game002 ${payload.phase} symbol (${position.x},${position.y}) has no "${state}" animation capability.`,
            );
    };
    switch (payload.phase) {
      case "wl-increment":
        requireStates(
          payload.increments.map((item) => item.position),
          ["appear"],
        );
        return;
      case "wild-multiplier":
        requireStates(payload.wmPositions, ["multStart", "multIdle"]);
        return;
      case "wm-to-cn":
        requireStates(
          payload.replacements.map((item) => item.position),
          ["multEnd", "change"],
        );
        return;
      case "coin-multiplier":
        requireStates([payload.cm.position], ["feature1"]);
        requireStates(
          payload.updates.map((item) => item.position),
          ["featureChange"],
        );
        return;
      case "cm-to-cn":
        requireStates([payload.cm.position], ["change"]);
        return;
      case "co-collect":
        requireStates(
          payload.collection.segments.map((segment) => segment.co),
          ["feature"],
        );
        requireStates(payload.collection.sourcePositions, [
          "feature1",
          "feature2",
        ]);
    }
  }

  startAtomicTransform(
    operation: SlotOperationV2,
    payload: Game002TransformPayload,
  ): void {
    if (
      this.#activity !== "idle" ||
      this.#transformRunner.getSnapshot().running
    )
      throw new Error("game002 atomic transform cannot start while active.");
    this.preflightAtomicTransform(operation, payload);
    const commands = this.createAtomicTransformCommands(operation, payload);
    this.#activity = "atomic-transform";
    this.#atomicTransformOperation = operation;
    this.#transformPlaybackFailure = null;
    const programId = ++this.#transformProgramId;
    const completion = this.#transformRunner.start(
      Object.freeze({ commands: Object.freeze(commands) }),
    );
    void completion.catch((error: unknown) => {
      if (programId === this.#transformProgramId)
        this.#transformPlaybackFailure = asError(error);
    });
  }

  updateAtomicTransform(operation: SlotOperationV2): {
    readonly completed: boolean;
  } {
    if (
      this.#activity !== "atomic-transform" ||
      this.#atomicTransformOperation !== operation
    )
      throw new Error("game002 atomic transform operation is not active.");
    if (this.#transformPlaybackFailure) throw this.#transformPlaybackFailure;
    if (this.#transformRunner.getSnapshot().phase !== "complete")
      return { completed: false };
    if (operation.effect === "state-mutation")
      assertGame002ReelVisualMatchesTarget(
        this.#runtime.getVisualSnapshot(),
        operation.output.scene,
        `completed ${operation.kind}`,
      );
    this.#atomicTransformOperation = null;
    this.#activity = "idle";
    return { completed: true };
  }

  private createAtomicTransformCommands(
    operation: SlotOperationV2,
    payload: Game002TransformPayload,
  ): PresentationTransactionCommand[] {
    const awaitStates = (
      requests: readonly {
        readonly positions: readonly {
          readonly x: number;
          readonly y: number;
        }[];
        readonly state: string;
        readonly completion: "once-complete" | "next-loop-complete";
      }[],
    ): import("@slotclientengine/rendercore").AwaitPresentationCommand =>
      Object.freeze({
        kind: "await",
        preflight: () => undefined,
        start: (signal: AbortSignal) =>
          this.#runtime.playVisibleSymbolStateBatch(
            requests.map((request) => ({
              positions: request.positions,
              state: request.state,
              options: {
                transitionMode: "immediate",
                completion: request.completion,
              },
            })),
            { signal },
          ),
      });
    const state = (
      positions: readonly { readonly x: number; readonly y: number }[],
      name: string,
      completion: "once-complete" | "next-loop-complete" = "once-complete",
    ) => awaitStates([{ positions, state: name, completion }]);
    const commit = (
      apply: () => void,
    ): import("@slotclientengine/rendercore").CommitPresentationCommand =>
      Object.freeze({
        kind: "commit",
        preflight: () => undefined,
        prepare: () =>
          Object.freeze({
            commit: apply,
            rollback: () => undefined,
            destroy: () => undefined,
          }),
      });
    const mutation = this.requireAtomicMutation(operation, payload.phase);
    switch (payload.phase) {
      case "wl-increment": {
        const positions = payload.increments.map((item) => item.position);
        return [
          commit(() => {
            for (const item of payload.increments) {
              this.#runtime.setVisibleSymbolPresentationValue(
                item.position.x,
                item.position.y,
                item.outputValue,
              );
              this.#runtime.setVisibleSymbolImageStringText(
                item.position.x,
                item.position.y,
                "multiplier",
                formatMultiplier(item.outputValue),
              );
            }
          }),
          state(positions, "appear"),
        ];
      }
      case "wild-multiplier": {
        const commands: PresentationTransactionCommand[] = [
          state(payload.wmPositions, "multStart"),
        ];
        if (mutation)
          commands.push(
            commit(() => {
              for (const occurrence of mutation.output.occurrences) {
                const input = mutation.input.occurrences.find(
                  (candidate) => candidate.id === occurrence.id,
                );
                if (
                  input?.code !== this.#wlSymbolCode ||
                  input.value === occurrence.value
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
            }),
          );
        commands.push(
          state(payload.wmPositions, "multIdle", "next-loop-complete"),
        );
        return commands;
      }
      case "wm-to-cn":
        return [
          state(
            payload.replacements.map((item) => item.position),
            "multEnd",
          ),
          state(
            payload.replacements.map((item) => item.position),
            "change",
          ),
          ...payload.replacements.map((item) =>
            this.replacementCommit({
              x: item.position.x,
              y: item.position.y,
              expectedCode: this.#wmSymbolCode,
              outputCode: this.#cnSymbolCode,
              outputPresentationValue: item.intermediateValue,
            }),
          ),
        ];
      case "coin-multiplier":
        return [
          state([payload.cm.position], "feature1"),
          commit(() => {
            for (const item of payload.updates)
              this.#runtime.setVisibleSymbolPresentationValue(
                item.position.x,
                item.position.y,
                item.outputValue,
              );
          }),
          state(
            payload.updates.map((item) => item.position),
            "featureChange",
          ),
        ];
      case "cm-to-cn":
        return [
          state([payload.cm.position], "change"),
          this.replacementCommit({
            x: payload.cm.position.x,
            y: payload.cm.position.y,
            expectedCode: this.#cmSymbolCode,
            outputCode: this.#cnSymbolCode,
            outputPresentationValue: payload.cm.outputValue,
          }),
        ];
      case "co-collect":
        return this.createCoCollectionCommands(
          mutation!,
          payload.collection,
          awaitStates,
        );
    }
  }

  private requireAtomicMutation(
    operation: SlotOperationV2,
    phase: Game002TransformPhase,
  ): Extract<SlotOperationV2, { readonly effect: "state-mutation" }> | null {
    if (operation.effect === "state-mutation") return operation;
    if (phase === "wild-multiplier") return null;
    throw new Error(`${operation.kind} must mutate state.`);
  }

  private replacementCommit(options: {
    readonly x: number;
    readonly y: number;
    readonly expectedCode: number;
    readonly outputCode: number;
    readonly outputPresentationValue: number | null;
  }): import("@slotclientengine/rendercore").CommitPresentationCommand {
    return Object.freeze({
      kind: "commit",
      preflight: () => undefined,
      prepare: () => this.#runtime.prepareVisibleOccurrenceReplacement(options),
    });
  }

  private createCoCollectionCommands(
    operation: Extract<SlotOperationV2, { readonly effect: "state-mutation" }>,
    collection: NonNullable<Game002TransformOperationPayload["coCollection"]>,
    awaitStates: (
      requests: readonly {
        readonly positions: readonly {
          readonly x: number;
          readonly y: number;
        }[];
        readonly state: string;
        readonly completion: "once-complete" | "next-loop-complete";
      }[],
    ) => AwaitPresentationCommand,
  ): PresentationTransactionCommand[] {
    const relocations = collection.transform.relocations ?? [];
    const relocationKeys = new Set(
      relocations.flatMap((item) => [
        `${item.source.x},${item.source.y}`,
        `${item.target.x},${item.target.y}`,
      ]),
    );
    const changes = new Map(
      collection.transform.changes.map((item) => [
        `${item.position.x},${item.position.y}`,
        item,
      ]),
    );
    const transfers = new Map(
      collection.segments.flatMap((segment) =>
        segment.transfers.map((item) => [
          `${item.source.x},${item.source.y}`,
          item,
        ]),
      ),
    );
    return [
      awaitStates([
        {
          positions: collection.segments.map((segment) => segment.co),
          state: "feature",
          completion: "once-complete",
        },
        {
          positions: collection.sourcePositions,
          state: "feature1",
          completion: "once-complete",
        },
      ]),
      Object.freeze({
        kind: "progress" as const,
        durationSeconds: 0.5,
        preflight: () => undefined,
        await: (signal: AbortSignal) =>
          this.#runtime.playVisibleSymbolStates(
            collection.sourcePositions,
            "feature2",
            {
              transitionMode: "immediate",
              completion: "once-complete",
              signal,
            },
          ),
        prepare: () => {
          const replacements = collection.transform.changes
            .filter(
              (item) =>
                !relocationKeys.has(`${item.position.x},${item.position.y}`),
            )
            .map((item) =>
              this.#runtime.prepareVisibleOccurrenceReplacement({
                x: item.position.x,
                y: item.position.y,
                expectedCode:
                  operation.input.scene[item.position.x]![item.position.y]!,
                outputCode: item.outputCode,
                outputPresentationValue: item.outputValue,
              }),
            );
          const transfer =
            relocations.length === 0
              ? null
              : this.#runtime.prepareVisibleOccurrenceTransferBatch({
                  transfers: relocations.map((item) => {
                    const sourceChange = changes.get(
                      `${item.source.x},${item.source.y}`,
                    );
                    const evidence = transfers.get(
                      `${item.source.x},${item.source.y}`,
                    );
                    if (!sourceChange || !evidence)
                      throw new Error(
                        `game002 CO source (${item.source.x},${item.source.y}) evidence is incomplete.`,
                      );
                    return Object.freeze({
                      source: item.source,
                      target: item.target,
                      expectedSourceCode: evidence.sourceCode,
                      expectedTargetCode:
                        operation.input.scene[item.target.x]![item.target.y]!,
                      sourceReplacementCode: sourceChange.outputCode,
                      sourceReplacementPresentationValue:
                        sourceChange.outputValue,
                    });
                  }),
                });
          return Object.freeze({
            start: () => transfer?.start(),
            setProgress: (progress: number) => transfer?.setProgress(progress),
            commit: () => {
              transfer?.commit();
              for (const replacement of replacements) replacement.commit();
            },
            rollback: () => {
              transfer?.rollback();
              for (const replacement of replacements) replacement.rollback();
            },
            destroy: () => {
              transfer?.destroy();
              for (const replacement of replacements) replacement.destroy();
            },
          });
        },
      }),
    ];
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
    this.#transformRunner.update(deltaSeconds);
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
      activeStepIndex:
        this.#atomicTransformOperation?.source.kind === "server-component"
          ? this.#atomicTransformOperation.source.stepIndex
          : null,
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

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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
