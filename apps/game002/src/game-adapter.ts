import { Application, Container } from "pixi.js";
import type {
  GameLogic,
  GameLogicStep,
  SlotRoundCapability,
  SlotRoundOccurrenceSnapshot,
  SlotOperationV2,
  SlotOperationSnapshot,
  SlotChgPayload,
  SlotChgTransferPayload,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotGameStateSnapshot,
  SlotGameViewportSnapshot,
} from "@slotclientengine/gameframeworks";
import {
  createSymbolCascadePlayer,
  type CreateSymbolCascadePlayerOptions,
  type SymbolCascadePlayer,
  createSlotOperationCoordinator,
  createSlotOperationHandlerRegistry,
  RenderGridCellReelSet,
  type SlotOperationHandler,
  type SlotOperationExecutionContext,
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
import { createGame002WinSummaryCollectOptions } from "./cascade-win-summary-config.js";
import {
  GAME002_CASCADE_MOTION,
  GAME002_CASCADE_PRESENTATION,
  canGame002CascadeDropSymbol,
} from "./cascade-config.js";
import {
  compileGame002RoundOperationPlan,
  type Game002FallPayload,
  type Game002FreeGameOperationPayload,
  type Game002TransformOperation,
  type Game002TransformKey,
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
  #roundExecutionFailed = false;

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
    this.#roundExecutionFailed = false;

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
        updateRuntime: (deltaSeconds) =>
          this.#roundTarget?.update(deltaSeconds),
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
    if (this.#roundExecutionFailed) {
      throw new Error(
        "game002 presentation stopped after a previous round failure; reinitialize the game before spinning again.",
      );
    }
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
      if (hadPendingAnimation) this.#roundExecutionFailed = true;
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
  const frameDriven = (options: {
    readonly start: (operation: SlotOperationV2) => void;
    readonly update: (
      operation: SlotOperationV2,
      deltaSeconds: number,
    ) => boolean;
  }): SlotOperationHandler<SlotOperationV2> => ({
    async start(operation, context): Promise<void> {
      options.start(operation);
      await context.waitForFrame((deltaSeconds) =>
        options.update(operation, deltaSeconds),
      );
    },
  });
  const registration = (
    kind: string,
    handler: SlotOperationHandler<SlotOperationV2>,
  ) =>
    Object.freeze({
      kind,
      version: 2,
      handler,
    });
  const spin = frameDriven({
    start: (operation) => {
      if (operation.effect !== "scene-landing")
        throw new Error("game002:spin must establish a scene.");
      const payload = operation.payload as Game002SpinPayload;
      target.startInitialSpin(payload.scene);
    },
    update: () => target.isInitialSpinComplete(),
  });
  const win = frameDriven({
    start: (operation) =>
      target.startWinGroups((operation.payload as Game002WinPayload).groups),
    update: () => target.updateWin().completed,
  });
  const remove = frameDriven({
    start: (operation) =>
      target.applyReleaseOnlyPositions(
        (operation.payload as Game002RemovePayload).releaseOnlyPositions,
      ),
    update: () => true,
  });
  const dropdown = frameDriven({
    start: (operation) =>
      target.startDropdownData(operation.payload as Game002FallPayload),
    update: () => target.isDropdownComplete(),
  });
  const refill = frameDriven({
    start: (operation) => {
      if (operation.effect !== "state-mutation")
        throw new Error("game002:refill must mutate state.");
      target.startRefillData(
        operation.payload as Game002FallPayload,
        operation.output,
      );
    },
    update: () => target.isRefillComplete(),
  });
  const completion = frameDriven({
    start: (operation) => {
      const payload = operation.payload as {
        readonly betAmountRaw: number;
        readonly winAmountRaw: number;
      };
      target.startCompletionAmounts(payload.betAmountRaw, payload.winAmountRaw);
    },
    update: () => target.isCompletionComplete(),
  });
  const handler: SlotOperationHandler<SlotOperationV2> = {
    start: (operation, context) =>
      target.startAtomicTransform(
        requireGame002ChgOperation(operation),
        context,
      ),
  };
  return [
    registration("game002:spin", spin),
    registration("game002:win", win),
    registration("game002:remove", remove),
    registration("game002:dropdown", dropdown),
    registration("game002:refill", refill),
    registration("game002:win-amount", completion),
    ...GAME002_TRANSFORM_KEYS.map((key) =>
      Object.freeze({
        kind: `game002:${key}`,
        version: 2,
        handler,
      }),
    ),
  ];
}

const GAME002_TRANSFORM_KEYS: readonly Game002TransformKey[] = [
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
  const handler: SlotOperationHandler<SlotOperationV2> = {
    start: (operation, context) =>
      target.start(requirePayload(operation), context),
  };
  return [
    "game002:freegame-trigger",
    "game002:freegame-enter",
    "game002:freegame-spin",
    "game002:freegame-af",
    "game002:freegame-co",
    "game002:freegame-win",
    "game002:freegame-popup",
    "game002:freegame-exit",
  ].map((kind) =>
    Object.freeze({
      kind,
      version: 2,
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
  #completionComplete = true;
  #unifiedSteps = new Set<number | string>();
  #initialSnapshot: SlotRoundOccurrenceSnapshot | null = null;
  #refillSnapshot: SlotRoundOccurrenceSnapshot | null = null;
  #atomicTransformOperation: SlotOperationV2 | null = null;

  constructor(options: {
    readonly runtime: Game002ReelRuntime;
    readonly cascadePlayer: SymbolCascadePlayer;
    readonly winAmountPlayer: WinAmountAnimationPlayer;
    readonly wlSymbolCode: number;
    readonly wmSymbolCode: number;
    readonly cmSymbolCode: number;
  }) {
    this.#runtime = options.runtime;
    this.#cascadePlayer = options.cascadePlayer;
    this.#winAmountPlayer = options.winAmountPlayer;
    this.#wlSymbolCode = options.wlSymbolCode;
    this.#wmSymbolCode = options.wmSymbolCode;
    this.#cmSymbolCode = options.cmSymbolCode;
  }

  cleanup(): void {
    this.#atomicTransformOperation = null;
    this.#cascadePlayer.clear();
    this.#winAmountPlayer.dismissImmediately();
    this.#runtime.resetPresentationState();
    this.#activity = "idle";
    this.#activeFall = null;
    this.#runtimeCompleted = false;
    this.#winCompleted = false;
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
    this.#activity = "win";
    this.#cascadePlayer.start(prepared);
  }

  applyReleaseOnlyPositions(
    positions: Game002RemovePayload["releaseOnlyPositions"],
  ): void {
    if (positions.length > 0) this.#runtime.releaseVisibleSymbols(positions);
  }

  updateWin(): { readonly completed: boolean } {
    if (this.#activity !== "win")
      throw new Error("game002 win stage is not active.");
    if (!this.#winCompleted) return { completed: false };
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

  async startAtomicTransform(
    operation: Game002TransformOperation,
    context: SlotOperationExecutionContext,
  ): Promise<void> {
    if (this.#activity !== "idle")
      throw new Error("game002 atomic transform cannot start while active.");
    this.#activity = "atomic-transform";
    this.#atomicTransformOperation = operation;
    try {
      switch (operation.kind) {
        case "game002:wl-increment": {
          const payload = requireGame002ChgPayload(operation, "change");
          this.applyWlValues(operation, payload.pos);
          await this.playStates(payload.pos, "appear", context.signal);
          return;
        }
        case "game002:wild-multiplier": {
          const payload = requireGame002ChgPayload(operation, "driven-change");
          await this.playStates(payload.mainPos, "multStart", context.signal);
          this.applyWlValues(operation, payload.pos);
          await this.playStates(
            payload.mainPos,
            "multIdle",
            context.signal,
            "next-loop-complete",
          );
          return;
        }
        case "game002:wm-to-cn": {
          const payload = requireGame002ChgPayload(operation, "change");
          await this.playStates(payload.pos, "multEnd", context.signal);
          await this.playStates(payload.pos, "change", context.signal);
          for (const position of payload.pos)
            this.replaceFromOperation(operation, position);
          return;
        }
        case "game002:coin-multiplier": {
          const payload = requireGame002ChgPayload(operation, "driven-change");
          await this.playStates(payload.mainPos, "feature1", context.signal);
          await Promise.all(
            payload.pos.map(async (position) => {
              await this.playStates(
                [position],
                "featureChange",
                context.signal,
              );
              this.#runtime.setVisibleSymbolPresentationValue(
                position.x,
                position.y,
                operationOutputCell(operation, position).value,
              );
            }),
          );
          return;
        }
        case "game002:cm-to-cn": {
          const payload = requireGame002ChgPayload(operation, "change");
          for (const position of payload.pos) {
            await this.playStates([position], "change", context.signal);
            this.replaceFromOperation(operation, position);
          }
          return;
        }
        case "game002:co-collect":
          await this.runCoCollection(
            requireGame002MutationOperation(operation),
            requireGame002ChgPayload(operation, "transfer"),
            context,
          );
          return;
        default:
          throw new Error(
            `${operation.kind} is not a game002 change operation.`,
          );
      }
    } finally {
      if (this.#atomicTransformOperation === operation) {
        this.#atomicTransformOperation = null;
        this.#activity = "idle";
      }
    }
  }

  private playStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: string,
    signal: AbortSignal,
    completion: "once-complete" | "next-loop-complete" = "once-complete",
  ): Promise<void> {
    return this.#runtime.playVisibleSymbolStates(positions, state, {
      transitionMode: "immediate",
      completion,
      signal,
    });
  }

  private applyWlValues(
    operation: Game002TransformOperation,
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void {
    for (const position of positions) {
      const value = operationOutputCell(operation, position).value;
      this.#runtime.setVisibleSymbolPresentationValue(
        position.x,
        position.y,
        value,
      );
      this.#runtime.setVisibleSymbolImageStringText(
        position.x,
        position.y,
        "multiplier",
        formatMultiplier(value),
      );
    }
  }

  private replaceFromOperation(
    operation: Game002MutationOperation,
    position: { readonly x: number; readonly y: number },
  ): void {
    const mutation = requireGame002MutationOperation(operation);
    const input = operationInputCell(mutation, position);
    const output = operationOutputCell(mutation, position);
    this.#runtime.replaceVisibleOccurrence({
      x: position.x,
      y: position.y,
      expectedCode: input.code,
      outputCode: output.code,
      outputPresentationValue: output.value,
    });
  }

  private async runCoCollection(
    operation: Extract<SlotOperationV2, { readonly effect: "state-mutation" }>,
    payload: SlotChgTransferPayload,
    context: SlotOperationExecutionContext,
  ): Promise<void> {
    const sourcePositions = payload.routes.map(({ source }) => source);
    await this.#runtime.playVisibleSymbolStateBatch(
      [
        {
          positions: payload.mainPos,
          state: "feature",
          options: {
            transitionMode: "immediate",
            completion: "once-complete",
          },
        },
        {
          positions: sourcePositions,
          state: "feature1",
          options: {
            transitionMode: "immediate",
            completion: "once-complete",
          },
        },
      ],
      { signal: context.signal },
    );
    await this.#runtime.transferVisibleOccurrences({
      transfers: payload.routes.map(({ source, target }) => {
        const inputSource = operationInputCell(operation, source);
        const inputTarget = operationInputCell(operation, target);
        const outputSource = operationOutputCell(operation, source);
        return Object.freeze({
          source,
          target,
          expectedSourceCode: inputSource.code,
          expectedTargetCode: inputTarget.code,
          sourceReplacementCode: outputSource.code,
          sourceReplacementPresentationValue: outputSource.value,
        });
      }),
      durationSeconds: 0.5,
      barrier: this.playStates(sourcePositions, "feature2", context.signal),
      waitForFrame: context.waitForFrame,
    });
    for (const position of payload.mainPos)
      this.replaceFromOperation(operation, position);
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
    if (this.#activity === "refill-complete") return;
    const result = this.#runtime.update(deltaSeconds);
    if (this.#activity === "idle") return;
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

type Game002MutationOperation = Extract<
  SlotOperationV2,
  { readonly effect: "state-mutation" }
>;

function requireGame002MutationOperation(
  operation: SlotOperationV2,
): Game002MutationOperation {
  if (operation.effect !== "state-mutation")
    throw new Error(`${operation.kind} must be a state-mutation operation.`);
  return operation;
}

function requireGame002ChgOperation(
  operation: SlotOperationV2,
): Game002TransformOperation {
  const mutation = requireGame002MutationOperation(operation);
  if (
    !GAME002_TRANSFORM_KEYS.some((key) => operation.kind === `game002:${key}`)
  )
    throw new Error(`${operation.kind} is not a game002 change operation.`);
  const payload = mutation.payload as SlotChgPayload;
  if (
    !payload ||
    !["change", "driven-change", "transfer"].includes(payload.type)
  )
    throw new Error(`${operation.kind} change payload is invalid.`);
  return mutation as Game002TransformOperation;
}

function requireGame002ChgPayload<Type extends SlotChgPayload["type"]>(
  operation: Game002TransformOperation,
  type: Type,
): Extract<SlotChgPayload, { readonly type: Type }> {
  requireGame002MutationOperation(operation);
  const payload = operation.payload as SlotChgPayload;
  if (!payload || payload.type !== type)
    throw new Error(`${operation.kind} must use a ${type} payload.`);
  return payload as Extract<SlotChgPayload, { readonly type: Type }>;
}

function operationInputCell(
  operation: Game002MutationOperation,
  position: { readonly x: number; readonly y: number },
) {
  return Object.freeze({
    code: operation.input.scene[position.x]![position.y]!,
    value: operation.input.values[position.x]![position.y]!,
  });
}

function operationOutputCell(
  operation: SlotOperationV2,
  position: { readonly x: number; readonly y: number },
) {
  const mutation = requireGame002MutationOperation(operation);
  return Object.freeze({
    code: mutation.output.scene[position.x]![position.y]!,
    value: mutation.output.values[position.x]![position.y]!,
  });
}

function formatMultiplier(value: number | null): string {
  if (!Number.isSafeInteger(value) || value === null || value <= 0)
    throw new Error(
      "game002 multiplier value must be a positive safe integer.",
    );
  return `x${value}`;
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
