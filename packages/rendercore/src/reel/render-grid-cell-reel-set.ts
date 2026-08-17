import { Container, Graphics } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { startSymbolStatePlaybackBatch } from "./symbol-state-playback.js";
import {
  normalizeGridCellReelOffsetMatrix,
  normalizeGridCellReelPhaseMatrix,
} from "./grid-cell-reel-offsets.js";
import { resolveGridCellDimmingAlpha } from "./grid-cell-spin-plan.js";
import { createReelLayout } from "./layout.js";
import { prepareVisibleOccurrenceMotion } from "./visible-occurrence-transfer.js";
import {
  createContainerRenderAnchor,
  resolveRenderAnchor,
} from "../presentation/render-anchor.js";
import {
  getRenderObjectAdapter,
  type RenderObject,
} from "../presentation/render-object.js";
import {
  getPresentationMountTargetAdapter,
  type PresentationNodeMountOptions,
  type PresentationScopeContext,
} from "../presentation/presentation-scope.js";
import {
  createRenderObjectLayer,
  type RenderObjectLayerController,
} from "../presentation/render-object-layer.js";
import { RenderReel } from "./render-reel.js";
import type {
  GridCellCoordinate,
  GridCellContinuousSpinOptions,
  GridCellDimmingPattern,
  GridCellCascadeDropMovement,
  GridCellCascadeDropPlan,
  GridCellCascadeValueMatrix,
  GridCellReelOffsetMatrix,
  GridCellReelPhase,
  GridCellReelPlanCell,
  GridCellReelSpinPlan,
  GridCellSpinPosition,
  GridCellEffectSweepPlan,
  GridCellTerminalRemoveOptions,
  RenderGridCellReelCellSnapshot,
  RenderGridCellReelSetOptions,
  RenderGridCellReelSetSpinOptions,
  RenderGridCellReelSetSnapshot,
  RenderGridCellReelSetUpdateResult,
  RenderReelSlotRenderView,
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
  GridCellVisibleOccurrenceTransfer,
  ReelSymbolRegistry,
  SymbolPresentationValueMatrix,
  VisibleSymbolStatePlaybackBatchOptions,
  VisibleSymbolStatePlaybackRequest,
  RenderReelVisibleOccurrence,
  ReelSpinDirection,
  VisibleOccurrenceEffectAttachmentOptions,
  VisibleOccurrenceEffectHandle,
  VisibleOccurrenceEffectPlayer,
  VisibleOccurrenceEffectPlayerFactory,
  VisibleOccurrenceHandle,
  VisibleOccurrenceMotion,
  VisibleOccurrenceTransferInput,
  VisibleOccurrenceTransferScope,
  DirectVisibleOccurrenceTransferBatchInput,
  DirectGridCellCascadeDropInput,
} from "./types.js";
import type { GridCellEffectController } from "./grid-cell-effect-player.js";
import type { LogicReels, SceneMatrix } from "@slotclientengine/logiccore";
import type {
  SymbolStateId,
  SymbolStatePlaybackOptions,
  SymbolStateTransitionMode,
} from "../symbol/index.js";
import {
  createSymbolHandle,
  type SymbolHandle,
} from "../symbol/symbol-handle.js";
import { createSymbolGroup } from "../symbol/symbol-group.js";
import type {
  SymbolArea,
  SymbolPosition,
  SymbolReplacement,
  SymbolReplacementTarget,
} from "./symbol-area.js";
import type {
  PresentableSymbolArea,
  SymbolAreaLayer,
  SymbolAreaLayerId,
} from "./reel-area.js";

interface RuntimeCell {
  readonly key: string;
  readonly coordinate: GridCellCoordinate;
  readonly root: Container;
  readonly clipContent: Container;
  readonly reel: RenderReel;
  readonly clipMask: Graphics;
  readonly dimOverlay: Container;
  readonly dimRows: readonly DimmingRow[];
  readonly slotRenderViewsByWindowY: ReadonlyMap<
    number,
    RenderReelSlotRenderView
  >;
  planCell: GridCellReelPlanCell | null;
  phase: GridCellReelPhase;
  hasStartedThisSpin: boolean;
  hasLandedThisSpin: boolean;
  fadeOutElapsedMs: number;
  fadeOutStartAlpha: number;
  targetPresentationValue: number | null;
  targetLandingState: SymbolStateId | null;
  occupied: boolean;
}

interface ActiveDropMovement {
  readonly movement: GridCellCascadeDropMovement;
  readonly occurrence: RenderReelVisibleOccurrence;
}

interface ActiveDrop {
  readonly plan: GridCellCascadeDropPlan;
  readonly movements: readonly ActiveDropMovement[];
  elapsedSeconds: number;
  resolve?: () => void;
  reject?: (error: Error) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

interface InternalVisibleOccurrenceTransferBatch {
  readonly transfers: readonly GridCellVisibleOccurrenceTransfer[];
  start(): void;
  setProgress(progress: number): void;
  finalize(): void;
  cancel(): void;
}

interface ActiveDirectTransferBatch {
  readonly batch: InternalVisibleOccurrenceTransferBatch;
  readonly durationMs: number;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  elapsedMs: number;
}

interface ActiveEffectSweep {
  readonly plan: GridCellEffectSweepPlan;
  readonly started: Set<string>;
  readonly completed: Set<string>;
  elapsedMs: number;
}

interface ActiveContinuousSpin {
  readonly keys: ReadonlySet<string>;
  readonly startAtMsByKey: ReadonlyMap<string, number>;
  readonly localPhaseYByKey: ReadonlyMap<string, number>;
  readonly direction: ReelSpinDirection;
  readonly speedSymbolsPerSecond: number;
  readonly dimming: GridCellDimmingPattern;
  readonly dimmingActivatedAtStart: boolean;
}

interface DimmingRow {
  readonly windowY: number;
  readonly graphic: Graphics;
}

interface PresentationDelayWaiter {
  remainingMs: number;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
}

interface AreaPresentationDelayWaiter {
  remainingSeconds: number;
  readonly signal: AbortSignal;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly abortListener: () => void;
}

interface AreaPresentationMountedNode {
  readonly target: SymbolAreaLayer;
  readonly node: RenderObject;
  readonly ownership: PresentationNodeMountOptions["ownership"];
}

interface AreaPresentationMotion {
  readonly node: RenderObject;
  readonly prepared: ReturnType<typeof prepareVisibleOccurrenceMotion>;
  readonly signal: AbortSignal;
  readonly abortListener: () => void;
  elapsedSeconds: number;
  resolve(): void;
  reject(error: Error): void;
}

interface OccurrenceEffectAttachment {
  readonly occurrence: RenderReelVisibleOccurrence;
  readonly generation: number;
  readonly parent: Container;
  readonly player: VisibleOccurrenceEffectPlayer;
  detached: boolean;
}

interface ActiveScopedTransfer {
  readonly input: VisibleOccurrenceTransferInput;
  readonly batch: InternalVisibleOccurrenceTransferBatch;
  readonly movingOccurrence: RenderReelVisibleOccurrence;
  readonly targetOccurrence: RenderReelVisibleOccurrence;
  readonly sourceGeometry: RenderVisibleSymbolGeometrySnapshot;
  readonly targetGeometry: RenderVisibleSymbolGeometrySnapshot;
  readonly controller: AbortController;
  inputAbortListener: (() => void) | null;
  motion: ReturnType<typeof prepareVisibleOccurrenceMotion> | null;
  elapsedMs: number;
  started: boolean;
  arrived: boolean;
  finalized: boolean;
  moveResolve: (() => void) | null;
  moveReject: ((error: Error) => void) | null;
}

const ZERO_DIMMING: GridCellDimmingPattern = Object.freeze({
  resolveDimmingAlpha: () => 0,
  fadeInMs: 0,
  fadeOutMs: 0,
});

export class RenderGridCellReelSet
  extends Container
  implements SymbolArea, PresentableSymbolArea
{
  readonly #reels: LogicReels;
  readonly #columns: number;
  readonly #rows: number;
  readonly #cellWidth: number;
  readonly #cellHeight: number;
  readonly #columnGap: number;
  readonly #rowGap: number;
  readonly #bounceStrength: number | undefined;
  readonly #order: readonly GridCellCoordinate[];
  readonly #cells: readonly RuntimeCell[];
  readonly #cellsByKey: ReadonlyMap<string, RuntimeCell>;
  readonly #cascadeMovementMask: Graphics;
  readonly #transferAboveSymbolsLayer: Container;
  readonly #transferLayer: Container;
  readonly #areaLayers: ReadonlyMap<SymbolAreaLayerId, Container>;
  readonly #areaLayerControllers = new Map<
    SymbolAreaLayerId,
    RenderObjectLayerController
  >();
  readonly #effectController: GridCellEffectController | null;
  #occurrenceEffectPlayerFactory: VisibleOccurrenceEffectPlayerFactory | null;
  readonly #presentationDelayWaiters = new Set<PresentationDelayWaiter>();
  readonly #areaPresentationDelayWaiters =
    new Set<AreaPresentationDelayWaiter>();
  readonly #areaPresentationMotions = new Set<AreaPresentationMotion>();
  readonly #occurrenceEffects = new Set<OccurrenceEffectAttachment>();
  readonly #occurrenceGenerations = new WeakMap<
    RenderReelVisibleOccurrence["symbol"],
    number
  >();
  readonly #startedCellsScratch: GridCellCoordinate[] = [];
  readonly #landedCellsScratch: GridCellCoordinate[] = [];
  readonly #activationCellsScratch: GridCellCoordinate[] = [];
  #spinPlan: GridCellReelSpinPlan | null = null;
  #continuousSpin: ActiveContinuousSpin | null = null;
  #activeDrop: ActiveDrop | null = null;
  #activeDirectTransferBatch: ActiveDirectTransferBatch | null = null;
  #activeEffectSweep: ActiveEffectSweep | null = null;
  #startedEffects = new Set<string>();
  #completedEffects = new Set<string>();
  #activationGateOpen = false;
  #dimmingActivated = false;
  #elapsedMs = 0;
  #activeTransferCleanup: (() => void) | null = null;
  #activeScopedTransfer: ActiveScopedTransfer | null = null;
  #areaPresentationAbort: AbortController | null = null;
  #areaPresentationFailure: Error | null = null;

  constructor(options: RenderGridCellReelSetOptions) {
    super();
    this.sortableChildren = true;
    this.#columns = assertPositiveInteger(options.columns, "columns");
    this.#rows = assertPositiveInteger(options.rows, "rows");
    this.#cellWidth = assertPositiveNumber(options.cellWidth, "cellWidth");
    this.#cellHeight = assertPositiveNumber(options.cellHeight, "cellHeight");
    this.#columnGap = assertNonNegativeNumber(
      options.columnGap ?? 0,
      "columnGap",
    );
    this.#rowGap = assertNonNegativeNumber(options.rowGap ?? 0, "rowGap");
    this.#bounceStrength = options.bounceStrength;
    if (options.reels.getReelCount() !== this.#columns) {
      throw new ReelError(
        `grid columns ${this.#columns} do not match reels reel count ${options.reels.getReelCount()}.`,
      );
    }
    this.#reels = options.reels;
    this.#order = parseOrder(options.order, this.#columns, this.#rows);

    const cells = this.#order.map((coordinate) =>
      this.createRuntimeCell(
        coordinate,
        options.registry,
        options.presentationValueResolver,
      ),
    );
    this.#cells = Object.freeze(cells);
    this.#cellsByKey = new Map(
      cells.map((cell) => [
        createCellKey(cell.coordinate.x, cell.coordinate.y),
        cell,
      ]),
    );
    this.#cascadeMovementMask = new Graphics()
      .rect(
        0,
        0,
        this.#columns * this.#cellWidth + (this.#columns - 1) * this.#columnGap,
        this.#rows * this.#cellHeight + (this.#rows - 1) * this.#rowGap,
      )
      .fill({ color: 0xffffff, alpha: 1 });
    this.#cascadeMovementMask.visible = false;
    this.#cascadeMovementMask.renderable = false;
    this.#cascadeMovementMask.includeInBuild = false;
    this.#cascadeMovementMask.measurable = false;
    this.addChild(this.#cascadeMovementMask);
    const bottomLayer = new Container();
    const topLayer = new Container();
    const winLayer = new Container();
    bottomLayer.sortableChildren = true;
    topLayer.sortableChildren = true;
    winLayer.sortableChildren = true;
    bottomLayer.zIndex = -1_000_000;
    topLayer.zIndex = this.#cells.length * 15_000;
    winLayer.zIndex = this.#cells.length * 25_000;
    this.#areaLayers = new Map([
      ["bottom", bottomLayer],
      ["top", topLayer],
      ["win", winLayer],
    ]);
    for (const [id, layer] of this.#areaLayers)
      this.#areaLayerControllers.set(
        id,
        createRenderObjectLayer({
          view: layer,
          label: `${id} area layer`,
          assertUsable: () => {
            if (this.destroyed)
              throw new ReelError("Symbol area runtime was destroyed.");
          },
          createError: (message) => new ReelError(message),
        }),
      );
    this.addChild(bottomLayer);
    this.#transferAboveSymbolsLayer = new Container();
    this.#transferAboveSymbolsLayer.sortableChildren = true;
    this.#transferAboveSymbolsLayer.zIndex = this.#cells.length * 5_000;
    this.addChild(this.#transferAboveSymbolsLayer);
    this.#transferLayer = new Container();
    this.#transferLayer.sortableChildren = true;
    this.#transferLayer.zIndex = this.#cells.length * 20_000;
    this.addChild(this.#transferLayer);
    this.addChild(topLayer);
    this.addChild(winLayer);
    this.#effectController = options.effectController ?? null;
    this.#occurrenceEffectPlayerFactory =
      options.occurrenceEffectPlayerFactory ?? null;
    if (this.#effectController) {
      this.#effectController.container.zIndex = this.#cells.length * 10_000;
      this.addChild(this.#effectController.container);
    }
  }

  prepareEffects(): Promise<void> | void {
    return this.#effectController?.prepare();
  }

  setOccurrenceEffectPlayerFactory(
    factory: VisibleOccurrenceEffectPlayerFactory,
  ): void {
    if (this.#occurrenceEffectPlayerFactory)
      throw new ReelError(
        "Visible occurrence effect player factory is already configured.",
      );
    this.#occurrenceEffectPlayerFactory = factory;
  }

  cancelPresentationEffects(): void {
    this.#activeEffectSweep = null;
    this.#effectController?.cancelAll();
    this.#startedEffects.clear();
    this.#completedEffects.clear();
  }

  resetToScene(
    scene: SceneMatrix,
    finalYs: readonly number[],
    cellReelOffsets?: GridCellReelOffsetMatrix,
    presentationValues?: SymbolPresentationValueMatrix,
  ): void {
    this.interruptAreaPresentation();
    this.cancelActiveScopedTransfer(
      new ReelError("Visible occurrence transfer was interrupted by reset."),
    );
    this.#activeTransferCleanup?.();
    const parsedScene = parseScene(scene, this.#columns, this.#rows);
    const parsedFinalYs = parseFinalYs(finalYs, this.#columns);
    const parsedCellReelOffsets = normalizeGridCellReelOffsetMatrix(
      cellReelOffsets,
      this.#columns,
      this.#rows,
    );
    const parsedPresentationValues = parsePresentationValueMatrix(
      presentationValues,
      this.#columns,
      this.#rows,
    );
    this.#spinPlan = null;
    this.#continuousSpin = null;
    this.clearDropOccurrences();
    this.#activeEffectSweep = null;
    this.#effectController?.cancelAll();
    this.#startedEffects.clear();
    this.#completedEffects.clear();
    this.#activationGateOpen = false;
    this.#dimmingActivated = false;
    this.#elapsedMs = 0;

    for (const cell of this.#cells) {
      const { x, y } = cell.coordinate;
      const cellFinalY = this.#reels.normalizeY(
        x,
        parsedFinalYs[x] + y + parsedCellReelOffsets[x][y],
      );
      cell.reel.resetToVisibleSymbols(
        [parsedScene[x][y]],
        cellFinalY,
        parsedPresentationValues === undefined
          ? undefined
          : [parsedPresentationValues[x][y]],
      );
      cell.planCell = null;
      cell.phase = "completed";
      cell.hasStartedThisSpin = false;
      cell.hasLandedThisSpin = false;
      cell.fadeOutElapsedMs = 0;
      cell.fadeOutStartAlpha = 0;
      cell.targetPresentationValue = null;
      cell.targetLandingState = null;
      cell.occupied = parsedScene[x][y] !== -1;
      cell.dimOverlay.alpha = 0;
      cell.dimOverlay.y = 0;
      cell.dimOverlay.renderable = false;
      resetReelSlotSymbolDimming(cell);
      this.setCellClipMask(cell, false);
      this.syncCellRenderOrder(cell);
    }
  }

  spin(
    plan: GridCellReelSpinPlan,
    options: RenderGridCellReelSetSpinOptions = {},
  ): void {
    if (this.#spinPlan || this.#continuousSpin) {
      throw new ReelError(
        "Cannot start a new grid cell reel spin while another spin is active.",
      );
    }
    if (this.#activeDrop) {
      throw new ReelError("Cannot spin while cascade dropdown is active.");
    }
    if (this.#activeEffectSweep) {
      throw new ReelError(
        "Cannot spin while grid cell effect sweep is active.",
      );
    }
    this.assertPlanMatchesRuntime(plan);
    if (plan.cells.some((cell) => cell.effect) && !this.#effectController) {
      throw new ReelError("Grid cell spin plan requires an effect controller.");
    }
    if (
      plan.cells.some((cell) => cell.effect) &&
      this.#effectController?.getSnapshot().prepared !== true
    ) {
      throw new ReelError("Grid cell spin effect controller is not prepared.");
    }
    const targetPresentationValues = parsePresentationValueMatrix(
      options.targetPresentationValues,
      this.#columns,
      this.#rows,
    );
    const targetLandingStates = parseStateMatrix(
      options.targetLandingStates,
      this.#columns,
      this.#rows,
    );
    validateGridEmptyTargets(
      plan,
      targetPresentationValues,
      targetLandingStates,
    );

    const planCellsByKey = new Map(
      plan.cells.map((planCell) => [
        createCellKey(planCell.x, planCell.y),
        planCell,
      ]),
    );
    if (plan.selective) {
      for (const cell of this.#cells) {
        const planCell = planCellsByKey.get(
          createCellKey(cell.coordinate.x, cell.coordinate.y),
        );
        if (planCell && cell.occupied) {
          throw new ReelError(
            `Selective grid spin position (${cell.coordinate.x},${cell.coordinate.y}) must be empty.`,
          );
        }
      }
    }

    this.interruptAreaPresentation();
    this.#spinPlan = plan;
    this.#elapsedMs = 0;
    this.#effectController?.cancelAll();
    this.#startedEffects.clear();
    this.#completedEffects.clear();
    this.#activationGateOpen = plan.activationGate === null;
    this.#dimmingActivated = plan.dimmingActivatedAtStart;
    for (const cell of this.#cells) {
      const planCell =
        planCellsByKey.get(
          createCellKey(cell.coordinate.x, cell.coordinate.y),
        ) ?? null;
      cell.planCell = planCell;
      cell.phase = planCell ? "waiting" : "completed";
      cell.hasStartedThisSpin = false;
      cell.hasLandedThisSpin = false;
      cell.fadeOutElapsedMs = 0;
      cell.fadeOutStartAlpha = 0;
      cell.targetPresentationValue = planCell
        ? (targetPresentationValues?.[cell.coordinate.x][cell.coordinate.y] ??
          null)
        : null;
      cell.targetLandingState = planCell
        ? (targetLandingStates?.[cell.coordinate.x]?.[cell.coordinate.y] ??
          null)
        : null;
      cell.dimOverlay.alpha = 0;
      cell.dimOverlay.y = 0;
      cell.dimOverlay.renderable = false;
      resetReelSlotSymbolDimming(cell);
      this.setCellClipMask(cell, false);
      this.syncCellRenderOrder(cell);
    }
  }

  startContinuous(options: GridCellContinuousSpinOptions): void {
    if (this.#spinPlan || this.#continuousSpin) {
      throw new ReelError(
        "Cannot start a continuous grid spin while another spin is active.",
      );
    }
    if (this.#activeDrop || this.#activeEffectSweep) {
      throw new ReelError(
        "Cannot start a continuous grid spin while another reel activity is active.",
      );
    }
    if (options.direction !== "forward" && options.direction !== "backward") {
      throw new ReelError(
        'continuous grid spin direction must be "forward" or "backward".',
      );
    }
    if (
      !Number.isFinite(options.speedSymbolsPerSecond) ||
      options.speedSymbolsPerSecond <= 0
    ) {
      throw new ReelError(
        "continuous grid spin speedSymbolsPerSecond must be positive.",
      );
    }
    const positions = options.positions
      ? normalizeContinuousPositions(
          options.positions,
          this.#columns,
          this.#rows,
          this.#cellsByKey,
        )
      : this.#order.map((position) =>
          Object.freeze({ ...position, startGroupIndex: position.orderIndex }),
        );
    const startStepMs = options.startStepMs ?? 0;
    assertNonNegativeNumber(startStepMs, "continuous startStepMs");
    const keys = new Set(positions.map(({ x, y }) => createCellKey(x, y)));
    const cellLocalPhaseYs = options.cellLocalPhaseYs
      ? normalizeGridCellReelPhaseMatrix(
          options.cellLocalPhaseYs,
          this.#columns,
          this.#rows,
          this.#reels,
        )
      : null;
    const startAtMsByKey = new Map(
      positions.map((position) => [
        createCellKey(position.x, position.y),
        position.startGroupIndex * startStepMs,
      ]),
    );
    const localPhaseYByKey = new Map(
      cellLocalPhaseYs
        ? positions.map((position) => [
            createCellKey(position.x, position.y),
            cellLocalPhaseYs[position.x]![position.y]!,
          ])
        : [],
    );
    const dimming = options.dimming ?? ZERO_DIMMING;
    if (typeof dimming.resolveDimmingAlpha !== "function") {
      throw new ReelError(
        "continuous grid spin dimming resolver must be a function.",
      );
    }
    assertNonNegativeNumber(dimming.fadeInMs, "continuous dimming fadeInMs");
    assertNonNegativeNumber(dimming.fadeOutMs, "continuous dimming fadeOutMs");
    for (const position of positions) {
      const cell = this.getCell(position.x, position.y);
      if (!cell.occupied) {
        throw new ReelError(
          `Continuous grid spin position (${position.x},${position.y}) is empty.`,
        );
      }
    }
    this.interruptAreaPresentation();
    for (const cell of this.#cells) {
      const selected = keys.has(
        createCellKey(cell.coordinate.x, cell.coordinate.y),
      );
      cell.planCell = null;
      cell.phase = selected ? "waiting" : "completed";
      cell.hasStartedThisSpin = false;
      cell.hasLandedThisSpin = false;
      cell.fadeOutElapsedMs = 0;
      cell.fadeOutStartAlpha = 0;
      cell.targetPresentationValue = null;
      cell.targetLandingState = null;
      if (selected) {
        this.setCellClipMask(cell, false);
        cell.dimOverlay.alpha = 0;
        cell.dimOverlay.renderable = false;
      } else {
        resetReelSlotSymbolDimming(cell);
        this.setCellClipMask(cell, false);
      }
      this.syncCellRenderOrder(cell);
    }
    this.#continuousSpin = {
      keys,
      startAtMsByKey,
      localPhaseYByKey,
      direction: options.direction,
      speedSymbolsPerSecond: options.speedSymbolsPerSecond,
      dimming,
      dimmingActivatedAtStart: options.dimmingActivatedAtStart === true,
    };
    this.#elapsedMs = 0;
  }

  settleContinuous(
    plan: GridCellReelSpinPlan,
    options: RenderGridCellReelSetSpinOptions = {},
  ): void {
    const continuous = this.#continuousSpin;
    if (!continuous) {
      throw new ReelError(
        "Cannot settle a grid spin without an active continuous spin.",
      );
    }
    this.assertPlanMatchesRuntime(plan);
    const planKeys = new Set(plan.cells.map(({ x, y }) => createCellKey(x, y)));
    if (
      planKeys.size !== continuous.keys.size ||
      [...planKeys].some((key) => !continuous.keys.has(key))
    ) {
      throw new ReelError(
        "Continuous grid spin settle positions must match the started positions.",
      );
    }
    if (plan.cells.some((cell) => cell.effect) && !this.#effectController) {
      throw new ReelError("Grid cell spin plan requires an effect controller.");
    }
    if (
      plan.cells.some((cell) => cell.effect) &&
      this.#effectController?.getSnapshot().prepared !== true
    ) {
      throw new ReelError("Grid cell spin effect controller is not prepared.");
    }
    const targetPresentationValues = parsePresentationValueMatrix(
      options.targetPresentationValues,
      this.#columns,
      this.#rows,
    );
    const targetLandingStates = parseStateMatrix(
      options.targetLandingStates,
      this.#columns,
      this.#rows,
    );
    validateGridEmptyTargets(
      plan,
      targetPresentationValues,
      targetLandingStates,
    );
    const normalizedCells = plan.cells.map((planCell) => {
      const cell = this.getCell(planCell.x, planCell.y);
      const key = createCellKey(planCell.x, planCell.y);
      const started = cell.hasStartedThisSpin;
      const remainingStartMs = started
        ? 0
        : Math.max(
            0,
            (continuous.startAtMsByKey.get(key) ?? 0) - this.#elapsedMs,
          );
      const stopAtMs = Math.max(remainingStartMs + 1, planCell.stopAtMs);
      const durationMs = stopAtMs - remainingStartMs;
      const currentY = started
        ? cell.reel.getSnapshot().currentY
        : (continuous.localPhaseYByKey.get(key) ??
          cell.reel.getSnapshot().currentY);
      const fractionalY = currentY - Math.floor(currentY);
      const minimumTravel = Math.ceil(
        (durationMs / 1000) * continuous.speedSymbolsPerSecond +
          (plan.direction === "forward" ? fractionalY : 1 - fractionalY),
      );
      const travelSymbols = Math.max(
        planCell.axisPlan.travelSymbols,
        minimumTravel,
      );
      const axisPlan = Object.freeze({
        ...planCell.axisPlan,
        startY: Math.floor(currentY),
        travelSymbols,
        startDelayMs: remainingStartMs,
        durationMs,
        stopAtMs,
      });
      return Object.freeze({
        ...planCell,
        startAtMs: remainingStartMs,
        stopAtMs,
        durationMs,
        axisPlan,
      });
    });
    const normalizedPlan = Object.freeze({
      ...plan,
      cells: Object.freeze(normalizedCells),
      lastStopAtMs: Math.max(...normalizedCells.map((cell) => cell.stopAtMs)),
    });
    const cellsByKey = new Map(
      normalizedCells.map((cell) => [createCellKey(cell.x, cell.y), cell]),
    );
    for (const cell of this.#cells) {
      const planCell = cellsByKey.get(
        createCellKey(cell.coordinate.x, cell.coordinate.y),
      );
      cell.planCell = planCell ?? null;
      cell.phase = planCell
        ? cell.hasStartedThisSpin
          ? "spinning"
          : "waiting"
        : "completed";
      cell.hasLandedThisSpin = false;
      cell.targetPresentationValue = planCell
        ? (targetPresentationValues?.[cell.coordinate.x][cell.coordinate.y] ??
          null)
        : null;
      cell.targetLandingState = planCell
        ? (targetLandingStates?.[cell.coordinate.x]?.[cell.coordinate.y] ??
          null)
        : null;
      if (planCell && cell.hasStartedThisSpin) {
        cell.reel.settleContinuous(planCell.axisPlan, {
          targetVisibleSymbols: planCell.targetVisibleSymbols,
          targetVisiblePresentationValues: [cell.targetPresentationValue],
          ...(cell.targetLandingState
            ? { targetVisibleStates: [cell.targetLandingState] }
            : {}),
        });
      }
    }
    this.#continuousSpin = null;
    this.#spinPlan = normalizedPlan;
    this.#elapsedMs = 0;
    this.#effectController?.cancelAll();
    this.#startedEffects.clear();
    this.#completedEffects.clear();
    this.#activationGateOpen = plan.activationGate === null;
    this.#dimmingActivated = plan.dimmingActivatedAtStart;
  }

  cancelContinuous(): void {
    const continuous = this.#continuousSpin;
    if (!continuous) return;
    for (const cell of this.#cells) {
      const key = createCellKey(cell.coordinate.x, cell.coordinate.y);
      if (continuous.keys.has(key)) cell.reel.cancelContinuous();
      cell.planCell = null;
      cell.phase = "completed";
      cell.hasStartedThisSpin = false;
      cell.hasLandedThisSpin = false;
      cell.dimOverlay.alpha = 0;
      cell.dimOverlay.renderable = false;
      resetReelSlotSymbolDimming(cell);
      this.setCellClipMask(cell, false);
      this.syncCellRenderOrder(cell);
    }
    this.#continuousSpin = null;
    this.#elapsedMs = 0;
  }

  isContinuousSpinning(): boolean {
    return this.#continuousSpin !== null;
  }

  spinSelective(
    plan: GridCellReelSpinPlan,
    options: RenderGridCellReelSetSpinOptions = {},
  ): void {
    if (!plan.selective) {
      throw new ReelError("spinSelective requires a selective grid spin plan.");
    }
    this.assertPlanMatchesRuntime(plan);
    const selected = plan.cells.map((planCell) => {
      const cell = this.getCell(planCell.x, planCell.y);
      return { cell, wasOccupied: cell.occupied };
    });
    const detached: Array<{
      readonly cell: RuntimeCell;
      readonly occurrence: RenderReelVisibleOccurrence;
    }> = [];
    try {
      for (const item of selected) {
        const slot = item.cell.reel.getSlotRenderView(0);
        if (
          item.wasOccupied &&
          slot?.symbol &&
          slot.kind !== "empty" &&
          slot.code >= 0
        ) {
          detached.push({
            cell: item.cell,
            occurrence: item.cell.reel.takeVisibleOccurrence(),
          });
        }
        item.cell.occupied = false;
      }
      this.spin(plan, options);
    } catch (error) {
      for (const { cell, occurrence } of detached) {
        cell.reel.placeVisibleOccurrence(occurrence);
      }
      for (const item of selected) item.cell.occupied = item.wasOccupied;
      throw error;
    }
    for (const { cell, occurrence } of detached) {
      cell.reel.releaseDetachedOccurrence(occurrence);
    }
  }

  update(deltaSeconds: number): RenderGridCellReelSetUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    if (this.#areaPresentationFailure) {
      const failure = this.#areaPresentationFailure;
      this.#areaPresentationFailure = null;
      throw failure;
    }
    this.updateAreaPresentationDelays(deltaSeconds);
    this.updateAreaPresentationMotions(deltaSeconds);
    this.updatePresentationWaiters(deltaSeconds);
    this.updateDirectTransfer(deltaSeconds);
    this.updateScopedTransfer(deltaSeconds);
    this.updateOccurrenceEffects(deltaSeconds);
    if (this.#activeDrop) {
      let completed: boolean;
      try {
        completed = this.updateDrop(deltaSeconds);
      } catch (error) {
        if (this.#activeDrop?.reject)
          this.cancelDirectDrop(
            error instanceof Error ? error : new ReelError(String(error)),
          );
        throw error;
      }
      return completed ? COMPLETED_IDLE_UPDATE_RESULT : DROPDOWN_UPDATE_RESULT;
    }
    if (this.#activeEffectSweep) {
      const completed = this.updateEffectSweep(deltaSeconds);
      return completed
        ? COMPLETED_IDLE_UPDATE_RESULT
        : EFFECT_SWEEP_UPDATE_RESULT;
    }
    if (this.#continuousSpin) {
      const active = this.#continuousSpin;
      const started = this.#startedCellsScratch;
      started.length = 0;
      const deltaMs = deltaSeconds * 1000;
      const previousElapsedMs = this.#elapsedMs;
      this.#elapsedMs += deltaMs;
      for (const cell of this.#cells) {
        const key = cell.key;
        const selected = active.keys.has(key);
        if (selected) {
          const startAtMs = active.startAtMsByKey.get(key) ?? 0;
          if (!cell.hasStartedThisSpin && this.#elapsedMs >= startAtMs) {
            const waitingDeltaMs = Math.max(0, startAtMs - previousElapsedMs);
            if (waitingDeltaMs > 0) cell.reel.update(waitingDeltaMs / 1000);
            cell.reel.startContinuous({
              direction: active.direction,
              speedSymbolsPerSecond: active.speedSymbolsPerSecond,
              ...(active.localPhaseYByKey.has(key)
                ? { localPhaseY: active.localPhaseYByKey.get(key)! }
                : {}),
            });
            cell.phase = "spinning";
            cell.hasStartedThisSpin = true;
            this.setCellClipMask(cell, true);
            started.push(cell.coordinate);
          }
          if (cell.hasStartedThisSpin) {
            const activeDeltaMs = Math.max(
              0,
              this.#elapsedMs - Math.max(previousElapsedMs, startAtMs),
            );
            cell.reel.update(activeDeltaMs / 1000);
            if (active.dimming.fadeInMs === 0) cell.dimOverlay.alpha = 1;
            else
              cell.dimOverlay.alpha = Math.min(
                1,
                cell.dimOverlay.alpha + activeDeltaMs / active.dimming.fadeInMs,
              );
            this.syncDimmingStrip(
              cell,
              active.dimming,
              active.dimmingActivatedAtStart,
            );
          } else cell.reel.update(deltaSeconds);
        } else if (cell.occupied) {
          cell.reel.update(deltaSeconds);
        }
        this.syncCellRenderOrder(cell);
      }
      if (started.length === 0) return CONTINUOUS_SPIN_UPDATE_RESULT;
      return Object.freeze({
        spinning: true,
        completed: false,
        activity: "spin",
        startedCells: freezeCoordinates(started),
        landedCells: EMPTY_GRID_CELL_COORDINATES,
        activationCells: EMPTY_GRID_CELL_COORDINATES,
      });
    }
    const started = this.#startedCellsScratch;
    const landed = this.#landedCellsScratch;
    const activated = this.#activationCellsScratch;
    started.length = 0;
    landed.length = 0;
    activated.length = 0;
    if (this.#spinPlan) {
      this.updateSpinTimeline(deltaSeconds, started, landed, activated);
    } else {
      for (const cell of this.#cells) {
        cell.reel.update(deltaSeconds);
        this.syncCellRenderOrder(cell);
      }
    }

    const completed = Boolean(
      this.#spinPlan && this.#cells.every((cell) => cell.phase === "completed"),
    );
    if (completed) {
      this.#spinPlan = null;
    }

    if (started.length === 0 && landed.length === 0 && activated.length === 0) {
      if (this.#spinPlan) return ACTIVE_SPIN_UPDATE_RESULT;
      if (completed) return COMPLETED_SPIN_UPDATE_RESULT;
      return IDLE_UPDATE_RESULT;
    }

    return Object.freeze({
      spinning: this.#spinPlan !== null,
      completed,
      activity: this.#spinPlan !== null || completed ? "spin" : null,
      startedCells: freezeCoordinates(started),
      landedCells: freezeCoordinates(landed),
      activationCells: freezeCoordinates(activated),
    });
  }

  startEffectSweep(plan: GridCellEffectSweepPlan): void {
    this.assertStopped("start grid cell effect sweep");
    if (!this.#effectController) {
      throw new ReelError(
        "Grid cell effect sweep requires an effect controller.",
      );
    }
    if (plan.loopCount !== 1) {
      throw new ReelError(
        "Grid cell effect sweep loopCount must be exactly 1.",
      );
    }
    if (
      typeof plan.effectId !== "string" ||
      plan.effectId.trim().length === 0
    ) {
      throw new ReelError("Grid cell effect sweep effectId must be non-empty.");
    }
    if (!Number.isFinite(plan.startStepMs) || plan.startStepMs < 0) {
      throw new ReelError(
        "Grid cell effect sweep startStepMs must be non-negative.",
      );
    }
    const positions = normalizePositions(
      plan.positions,
      this.#columns,
      this.#rows,
    );
    for (const position of positions) {
      if (this.getCell(position.x, position.y).occupied) {
        throw new ReelError(
          `Grid cell effect sweep position (${position.x},${position.y}) must be empty.`,
        );
      }
    }
    this.#effectController.cancelAll();
    this.#activeEffectSweep = {
      plan: Object.freeze({ ...plan, positions }),
      started: new Set(),
      completed: new Set(),
      elapsedMs: 0,
    };
  }

  getVisibleScene(): SceneMatrix {
    return Object.freeze(
      Array.from({ length: this.#columns }, (_, x) =>
        Object.freeze(
          Array.from({ length: this.#rows }, (_, y) => {
            const cell = this.getCell(x, y);
            if (!cell.occupied) return -1;
            const visibleSymbol = cell.reel.getVisibleScene()[0];
            if (!Number.isInteger(visibleSymbol)) {
              throw new ReelError(
                `grid cell (${x},${y}) has no visible symbol.`,
              );
            }
            return visibleSymbol;
          }),
        ),
      ),
    );
  }

  requestVisibleSymbolState(
    x: number,
    y: number,
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    this.assertStopped("request visible symbol state");
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      throw new ReelError(
        `Cannot request state for empty grid cell (${x},${y}).`,
      );
    }
    cell.reel.requestVisibleSymbolState(0, state, transitionMode);
  }

  requestLandedVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    for (const position of positions) {
      const cell = this.getCell(position.x, position.y);
      if (
        this.#activeDrop ||
        this.#activeEffectSweep ||
        (cell.phase !== "landed" && cell.phase !== "completed")
      )
        throw new ReelError(
          `Cannot request landed symbol state while grid cell (${position.x},${position.y}) is spinning.`,
        );
      if (!cell.occupied)
        throw new ReelError(
          `Cannot request state for empty grid cell (${position.x},${position.y}).`,
        );
      cell.reel.requestVisibleSymbolState(0, state, transitionMode);
    }
  }

  hasVisibleSymbolStateCapability(
    x: number,
    y: number,
    state: SymbolStateId,
  ): boolean {
    this.assertStopped("query visible symbol state capability");
    const cell = this.getCell(x, y);
    if (!cell.occupied) return false;
    const slot = cell.reel.getSlotRenderView(0);
    return slot.symbol?.hasAnimationCapability(state) ?? false;
  }

  releaseVisibleSymbols(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void {
    this.assertStopped("release visible symbols");
    const normalized = normalizePositions(positions, this.#columns, this.#rows);
    for (const position of normalized) {
      const cell = this.getCell(position.x, position.y);
      if (!cell.occupied) {
        throw new ReelError(
          `Cannot release empty grid cell (${position.x},${position.y}).`,
        );
      }
      this.releaseCell(cell);
    }
  }

  removeVisibleSymbols(options: GridCellTerminalRemoveOptions): Promise<void> {
    this.assertStopped("remove visible symbols");
    const positions = normalizePositions(
      options.positions,
      this.#columns,
      this.#rows,
      "coalesce",
    );
    const prepared = positions.map((position) => {
      const cell = this.getCell(position.x, position.y);
      if (!cell.occupied) {
        throw new ReelError(
          `Cannot remove empty grid cell (${position.x},${position.y}).`,
        );
      }
      const slot = cell.reel.getSlotRenderView(0);
      if (!slot.symbol) {
        throw new ReelError(
          `Cannot remove missing occurrence at grid cell (${position.x},${position.y}).`,
        );
      }
      cell.reel.validateVisibleSymbolStatePlayback(
        0,
        options.state,
        options.playback,
      );
      if (!cell.reel.hasVisibleTerminalSymbolState(0, options.state)) {
        throw new ReelError(
          `Terminal remove state "${options.state}" at grid cell (${position.x},${position.y}) must declare afterComplete "terminal".`,
        );
      }
      return Object.freeze({ cell, symbol: slot.symbol });
    });
    let remaining = prepared.length;

    return startSymbolStatePlaybackBatch(
      prepared.map(
        ({ cell, symbol }) =>
          (signal) =>
            cell.reel.playVisibleTerminalSymbolState(
              0,
              options.state,
              {
                ...options.playback,
                signal,
              },
              () => {
                const current = cell.reel.getSlotRenderView(0);
                if (!cell.occupied || current.symbol !== symbol) {
                  throw new ReelError(
                    `Terminal remove occurrence ownership changed at grid cell (${cell.coordinate.x},${cell.coordinate.y}).`,
                  );
                }
                this.releaseCell(cell);
                remaining -= 1;
                if (remaining === 0) options.onComplete?.();
              },
            ),
      ),
      options.signal,
    );
  }

  setVisibleSymbolDimming(
    highlightedPositions: readonly { readonly x: number; readonly y: number }[],
    dimmingAlpha: number,
  ): void {
    this.assertStopped("set visible symbol dimming");
    if (
      !Number.isFinite(dimmingAlpha) ||
      dimmingAlpha < 0 ||
      dimmingAlpha > 1
    ) {
      throw new ReelError("dimmingAlpha must be finite and between 0 and 1.");
    }
    const highlighted = new Set(
      normalizePositions(highlightedPositions, this.#columns, this.#rows).map(
        ({ x, y }) => `${x},${y}`,
      ),
    );
    for (const cell of this.#cells) {
      const key = `${cell.coordinate.x},${cell.coordinate.y}`;
      const isHighlighted = highlighted.has(key);
      cell.dimOverlay.y = 0;
      cell.dimOverlay.alpha = 1;
      cell.dimOverlay.renderable = true;
      cell.reel.setSlotBrightness(0, isHighlighted ? 1 : 1 - dimmingAlpha);
      for (const row of cell.dimRows) {
        row.graphic.alpha =
          row.windowY === 0 && cell.occupied && !isHighlighted
            ? dimmingAlpha
            : 0;
      }
    }
  }

  clearVisibleSymbolDimming(): void {
    for (const cell of this.#cells) {
      cell.dimOverlay.alpha = 0;
      cell.dimOverlay.y = 0;
      cell.dimOverlay.renderable = false;
      resetReelSlotSymbolDimming(cell);
    }
  }

  getCascadeValues(): GridCellCascadeValueMatrix {
    return Object.freeze(
      Array.from({ length: this.#columns }, (_, x) =>
        Object.freeze(
          Array.from({ length: this.#rows }, (_, y) => {
            const cell = this.getCell(x, y);
            if (!cell.occupied) return -1;
            return cell.reel.getSlotRenderView(0).presentationValue;
          }),
        ),
      ),
    );
  }

  startCascadeDrop(plan: GridCellCascadeDropPlan): void {
    this.assertStopped("start cascade dropdown");
    if (this.#activeDrop)
      throw new ReelError("Cascade dropdown is already active.");
    if (plan.columns !== this.#columns || plan.rows !== this.#rows) {
      throw new ReelError(
        `Cascade dropdown dimensions ${plan.columns}x${plan.rows} do not match runtime ${this.#columns}x${this.#rows}.`,
      );
    }
    const prepared: Array<{
      readonly movement: GridCellCascadeDropMovement;
      readonly cell: RuntimeCell;
      readonly occurrence: RenderReelVisibleOccurrence | null;
    }> = [];
    try {
      for (const movement of plan.movements) {
        const cell =
          movement.kind === "existing"
            ? this.getCell(movement.x, movement.sourceY)
            : this.getCell(movement.x, movement.targetY);
        if (movement.kind === "existing") {
          if (!cell.occupied) {
            throw new ReelError(
              `Dropdown source (${movement.x},${movement.sourceY}) is empty.`,
            );
          }
          const symbol = cell.reel.getSlotRenderView(0).symbol;
          if (!symbol) {
            throw new ReelError(
              `Dropdown source occurrence is missing at (${movement.x},${movement.sourceY}).`,
            );
          }
          if (!symbol.hasAnimationCapability("dropdown")) {
            throw new ReelError(
              `Dropdown animation is unavailable at (${movement.x},${movement.sourceY}).`,
            );
          }
          symbol.requestState("dropdown");
          prepared.push({ movement, cell, occurrence: null });
          continue;
        }
        const occurrence = cell.reel.createDetachedOccurrence(
          movement.outputCode,
          movement.outputPresentationValue,
        );
        if (!occurrence.symbol.hasAnimationCapability("dropdown")) {
          cell.reel.releaseDetachedOccurrence(occurrence);
          throw new ReelError(
            `Dropdown animation is unavailable for refill at (${movement.x},${movement.targetY}).`,
          );
        }
        try {
          occurrence.symbol.requestState("dropdown");
        } catch (error) {
          cell.reel.releaseDetachedOccurrence(occurrence);
          throw error;
        }
        prepared.push({ movement, cell, occurrence });
      }
    } catch (error) {
      for (const item of prepared) {
        if (item.occurrence) {
          item.occurrence.symbol.requestState("normal");
          item.cell.reel.releaseDetachedOccurrence(item.occurrence);
        } else {
          item.cell.reel.getSlotRenderView(0).symbol?.requestState("normal");
        }
      }
      throw error;
    }
    const active: ActiveDropMovement[] = [];
    for (const item of prepared) {
      const { movement, cell } = item;
      const occurrence =
        movement.kind === "existing"
          ? cell.reel.takeVisibleOccurrence()
          : item.occurrence;
      if (!occurrence)
        throw new ReelError("Prepared refill occurrence is missing.");
      if (movement.kind === "existing") cell.occupied = false;
      occurrence.symbol.position.set(
        movement.x * (this.#cellWidth + this.#columnGap) + this.#cellWidth / 2,
        movement.sourceY * (this.#cellHeight + this.#rowGap) +
          this.#cellHeight / 2,
      );
      const targetCell = this.getCell(movement.x, movement.targetY);
      occurrence.symbol.zIndex =
        occurrence.symbol.renderPriority * (this.#cells.length + 1) +
        targetCell.coordinate.orderIndex;
      this.addChild(occurrence.symbol);
      active.push(Object.freeze({ movement, occurrence }));
    }
    this.#activeDrop = {
      plan,
      movements: Object.freeze(active),
      elapsedSeconds: 0,
    };
    if (active.length === 0) {
      this.completeDrop();
    } else {
      this.setCascadeMovementMaskActive(true);
    }
  }

  requestVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    for (const position of positions) {
      this.requestVisibleSymbolState(
        position.x,
        position.y,
        state,
        transitionMode,
      );
    }
  }

  playVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): Promise<void> {
    return this.playVisibleSymbolStateBatch(
      [
        {
          positions,
          state,
          options: {
            completion: options.completion,
            ...(options.transitionMode
              ? { transitionMode: options.transitionMode }
              : {}),
          },
        },
      ],
      options.signal ? { signal: options.signal } : undefined,
    );
  }

  playVisibleSymbolStateBatch(
    requests: readonly VisibleSymbolStatePlaybackRequest[],
    options?: VisibleSymbolStatePlaybackBatchOptions,
  ): Promise<void> {
    this.assertStopped("play visible symbol states");
    if (requests.length === 0) {
      throw new ReelError(
        "Visible symbol state playback batch must not be empty.",
      );
    }
    const prepared = requests.flatMap((request) =>
      normalizePositions(
        request.positions,
        this.#columns,
        this.#rows,
        "coalesce",
      ).map((position) => {
        const cell = this.getCell(position.x, position.y);
        if (!cell.occupied) {
          throw new ReelError(
            `Cannot play state for empty grid cell (${position.x},${position.y}).`,
          );
        }
        const playbackOptions: SymbolStatePlaybackOptions = {
          ...request.options,
          ...(options?.signal ? { signal: options.signal } : {}),
        };
        cell.reel.validateVisibleSymbolStatePlayback(
          0,
          request.state,
          playbackOptions,
        );
        return { cell, request };
      }),
    );
    return startSymbolStatePlaybackBatch(
      prepared.map(
        ({ cell, request }) =>
          (signal) =>
            cell.reel.playVisibleSymbolState(0, request.state, {
              ...request.options,
              signal,
            }),
      ),
      options?.signal,
    );
  }

  setVisibleSymbolPresentationValue(
    x: number,
    y: number,
    value: number | null,
  ): void {
    this.assertStopped("set visible symbol presentation value");
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      if (value === null) return;
      throw new ReelError(
        `Empty grid cell (${x},${y}) only accepts a null presentation value.`,
      );
    }
    cell.reel.setVisibleSymbolPresentationValue(0, value);
  }

  setVisibleSymbolImageStringText(
    x: number,
    y: number,
    name: string,
    text: string,
  ): void {
    this.assertStopped("set visible symbol image-string text");
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      throw new ReelError(
        `Cannot set image-string text for empty grid cell (${x},${y}).`,
      );
    }
    cell.reel.setVisibleSymbolImageStringText(0, name, text);
  }

  getVisibleSymbolImageStringText(x: number, y: number, name: string): string {
    this.assertStopped("read visible symbol image-string text");
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      throw new ReelError(
        `Cannot read image-string text for empty grid cell (${x},${y}).`,
      );
    }
    return cell.reel.getVisibleSymbolImageStringText(0, name);
  }

  private createVisibleOccurrenceTransferBatch(options: {
    readonly transfers: readonly GridCellVisibleOccurrenceTransfer[];
  }): InternalVisibleOccurrenceTransferBatch {
    this.assertStopped("prepare visible occurrence transfer batch");
    if (!Array.isArray(options.transfers) || options.transfers.length === 0)
      throw new ReelError(
        "Visible occurrence transfer batch must contain transfers.",
      );
    if (this.#activeTransferCleanup)
      throw new ReelError("A visible occurrence transfer batch is active.");
    const used = new Set<string>();
    const validated = options.transfers.map((transfer, index) => {
      const source = this.getCell(transfer.source.x, transfer.source.y);
      const target = this.getCell(transfer.target.x, transfer.target.y);
      const sourceKey = createCellKey(transfer.source.x, transfer.source.y);
      const targetKey = createCellKey(transfer.target.x, transfer.target.y);
      if (sourceKey === targetKey)
        throw new ReelError(
          `Transfer[${index}] source and target must differ.`,
        );
      if (used.has(sourceKey) || used.has(targetKey))
        throw new ReelError(
          `Transfer[${index}] collides with another transfer position.`,
        );
      used.add(sourceKey);
      used.add(targetKey);
      if (!source.occupied || !target.occupied)
        throw new ReelError(
          `Transfer[${index}] source and target must both be occupied.`,
        );
      if (
        !Number.isSafeInteger(transfer.sourceReplacementCode) ||
        transfer.sourceReplacementCode < -1
      )
        throw new ReelError(
          `Transfer[${index}] sourceReplacementCode must be -1 or a non-negative safe integer.`,
        );
      if (
        transfer.sourceReplacementCode === -1 &&
        transfer.sourceReplacementPresentationValue !== null
      )
        throw new ReelError(
          `Transfer[${index}] sourceReplacementPresentationValue must be null for a hole.`,
        );
      return { transfer, source, target };
    });
    const prepared: Array<{
      readonly transfer: GridCellVisibleOccurrenceTransfer;
      readonly source: RuntimeCell;
      readonly target: RuntimeCell;
      readonly sourceReplacement: RenderReelVisibleOccurrence | null;
      moving: RenderReelVisibleOccurrence | null;
    }> = [];
    try {
      for (const item of validated)
        prepared.push({
          transfer: Object.freeze({
            ...item.transfer,
            source: Object.freeze({ ...item.transfer.source }),
            target: Object.freeze({ ...item.transfer.target }),
          }),
          source: item.source,
          target: item.target,
          sourceReplacement:
            item.transfer.sourceReplacementCode === -1
              ? null
              : item.source.reel.createDetachedOccurrence(
                  item.transfer.sourceReplacementCode,
                  item.transfer.sourceReplacementPresentationValue,
                ),
          moving: null,
        });
    } catch (error) {
      for (const item of prepared)
        if (item.sourceReplacement)
          item.source.reel.releaseDetachedOccurrence(item.sourceReplacement);
      throw error;
    }
    let state: "prepared" | "started" | "finalized" | "cancelled" = "prepared";
    const cleanup = (): void => {
      if (state === "finalized" || state === "cancelled") return;
      for (const item of prepared) {
        if (item.moving) {
          item.source.reel.restoreDetachedVisibleOccurrence(item.moving);
          item.moving = null;
        }
        if (item.sourceReplacement)
          item.source.reel.releaseDetachedOccurrence(item.sourceReplacement);
      }
      this.#transferLayer.removeChildren();
      this.#cascadeMovementMask.visible = false;
      this.#cascadeMovementMask.renderable = false;
      this.#activeTransferCleanup = null;
      state = "cancelled";
    };
    const batch = Object.freeze({
      transfers: Object.freeze(prepared.map((item) => item.transfer)),
      start: (): void => {
        if (state !== "prepared")
          throw new ReelError(
            "Visible occurrence transfer batch can only start once.",
          );
        this.assertStopped("start visible occurrence transfer batch");
        state = "started";
        this.#activeTransferCleanup = cleanup;
        this.#cascadeMovementMask.visible = true;
        this.#cascadeMovementMask.renderable = true;
        this.#transferLayer.mask = this.#cascadeMovementMask;
        try {
          for (const item of prepared) {
            item.moving = item.source.reel.detachVisibleOccurrenceForTransfer();
            this.#transferLayer.addChild(item.moving.symbol);
            const geometry = this.getCellGeometry(item.transfer.source);
            item.moving.symbol.position.set(geometry.x, geometry.y);
            item.moving.symbol.zIndex = item.moving.symbol.renderPriority;
          }
        } catch (error) {
          cleanup();
          throw error;
        }
      },
      setProgress: (progress: number): void => {
        if (state !== "started")
          throw new ReelError(
            "Visible occurrence transfer progress requires a started batch.",
          );
        if (!Number.isFinite(progress) || progress < 0 || progress > 1)
          throw new ReelError(
            "Visible occurrence transfer progress must be between 0 and 1.",
          );
        const eased = 1 - Math.pow(1 - progress, 3);
        for (const item of prepared) {
          const source = this.getCellGeometry(item.transfer.source);
          const target = this.getCellGeometry(item.transfer.target);
          item.moving!.symbol.position.set(
            source.x + (target.x - source.x) * eased,
            source.y + (target.y - source.y) * eased,
          );
        }
      },
      finalize: (): void => {
        if (state !== "started")
          throw new ReelError(
            "Visible occurrence transfer finalization requires a started batch.",
          );
        for (const item of prepared) {
          const moving = item.source.reel.takeVisibleOccurrence();
          const overwritten = item.target.reel.takeVisibleOccurrence();
          item.target.reel.placeVisibleOccurrence(moving);
          if (item.sourceReplacement) {
            item.source.reel.placeVisibleOccurrence(item.sourceReplacement);
          } else {
            item.source.occupied = false;
          }
          this.bumpOccurrenceGeneration(overwritten);
          item.target.reel.releaseDetachedOccurrence(overwritten);
          item.moving = null;
        }
        this.#transferLayer.removeChildren();
        this.#transferLayer.mask = null;
        this.#cascadeMovementMask.visible = false;
        this.#cascadeMovementMask.renderable = false;
        this.#activeTransferCleanup = null;
        state = "finalized";
      },
      cancel: cleanup,
    }) satisfies InternalVisibleOccurrenceTransferBatch;
    return batch;
  }

  transferSymbols(
    input: DirectVisibleOccurrenceTransferBatchInput,
  ): Promise<void> {
    if (this.#activeDirectTransferBatch)
      return Promise.reject(
        new ReelError("A direct visible occurrence transfer is active."),
      );
    if (!Number.isFinite(input.durationMs) || input.durationMs <= 0)
      return Promise.reject(
        new ReelError(
          "Direct transfer durationMs must be finite and positive.",
        ),
      );
    if (input.signal?.aborted)
      return Promise.reject(new ReelError("Direct transfer was aborted."));
    let batch: InternalVisibleOccurrenceTransferBatch;
    try {
      batch = this.createVisibleOccurrenceTransferBatch({
        transfers: input.transfers,
      });
      batch.start();
      batch.setProgress(0);
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise<void>((resolve, reject) => {
      const active: ActiveDirectTransferBatch = {
        batch,
        durationMs: input.durationMs,
        ...(input.signal ? { signal: input.signal } : {}),
        resolve,
        reject,
        elapsedMs: 0,
      };
      if (input.signal) {
        const abortListener = (): void =>
          this.cancelDirectTransfer(
            new ReelError("Direct transfer was aborted."),
          );
        (active as { abortListener?: () => void }).abortListener =
          abortListener;
        input.signal.addEventListener("abort", abortListener, { once: true });
      }
      this.#activeDirectTransferBatch = active;
    });
  }

  dropOccurrences(input: DirectGridCellCascadeDropInput): Promise<void> {
    if (input.signal?.aborted)
      return Promise.reject(new ReelError("Cascade drop was aborted."));
    const totalSeconds = input.movements.reduce(
      (maximum, movement) =>
        Math.max(
          maximum,
          movement.startSeconds + movement.fallSeconds + movement.settleSeconds,
        ),
      0,
    );
    const plan: GridCellCascadeDropPlan = Object.freeze({
      columns: this.#columns,
      rows: this.#rows,
      movements: Object.freeze([...input.movements]),
      valueCommits: Object.freeze([...(input.valueCommits ?? [])]),
      totalSeconds,
    });
    return new Promise<void>((resolve, reject) => {
      try {
        this.startCascadeDrop(plan);
        const active = this.#activeDrop;
        if (!active) {
          resolve();
          return;
        }
        active.resolve = resolve;
        active.reject = reject;
        active.signal = input.signal;
        if (input.signal) {
          const abortListener = (): void =>
            this.cancelDirectDrop(new ReelError("Cascade drop was aborted."));
          active.abortListener = abortListener;
          input.signal.addEventListener("abort", abortListener, { once: true });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  waitForPresentationDelay(
    durationMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!Number.isFinite(durationMs) || durationMs < 0)
      return Promise.reject(
        new ReelError(
          "Presentation delay durationMs must be finite and non-negative.",
        ),
      );
    if (signal?.aborted)
      return Promise.reject(new ReelError("Presentation delay was aborted."));
    if (durationMs === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter: PresentationDelayWaiter = {
        remainingMs: durationMs,
        resolve,
        reject,
        signal,
      };
      if (signal) {
        const abortListener = (): void => {
          if (!this.#presentationDelayWaiters.delete(waiter)) return;
          reject(new ReelError("Presentation delay was aborted."));
        };
        (waiter as { abortListener?: () => void }).abortListener =
          abortListener;
        signal.addEventListener("abort", abortListener, { once: true });
      }
      this.#presentationDelayWaiters.add(waiter);
    });
  }

  getVisibleOccurrenceHandle(x: number, y: number): VisibleOccurrenceHandle {
    if (
      this.#activeScopedTransfer?.started &&
      this.#activeScopedTransfer.input.source.x === x &&
      this.#activeScopedTransfer.input.source.y === y
    )
      throw new ReelError(
        `Visible occurrence at grid cell (${x},${y}) is leased by an active transfer.`,
      );
    const cell = this.getCell(x, y);
    if (!cell.occupied)
      throw new ReelError(
        `Cannot get occurrence for empty grid cell (${x},${y}).`,
      );
    return this.createOccurrenceHandle(this.getCellOccurrence(cell));
  }

  getSymbol(position: SymbolPosition): SymbolHandle {
    const cell = this.getCell(position.x, position.y);
    if (cell.phase === "waiting" || cell.phase === "spinning")
      throw new ReelError(
        `Cannot get symbol at (${position.x},${position.y}) before the cell has landed.`,
      );
    if (!cell.occupied) {
      const getPosition = () => ({
        x: cell.root.x + this.#cellWidth / 2,
        y: cell.root.y + this.#cellHeight / 2,
      });
      return cell.reel.createVisibleEmptySymbolHandle(0, {
        assertUsable: () => {
          if (cell.occupied) throw new ReelError("SymbolHandle is stale.");
        },
        getPosition,
        getAnchor: () =>
          createContainerRenderAnchor(this, () => {
            if (cell.occupied || cell.reel.getSlotRenderView(0).code !== -1)
              throw new ReelError("SymbolHandle is stale.");
            return getPosition();
          }),
      });
    }
    const handle = this.getVisibleOccurrenceHandle(position.x, position.y);
    const occurrence = this.getCellOccurrence(cell);
    const createOwnedSource = (
      ownedOccurrence: RenderReelVisibleOccurrence,
    ) => {
      let released = false;
      return {
        symbol: ownedOccurrence.symbol,
        owned: true,
        assertUsable: () => {
          if (released) throw new ReelError("Owned SymbolHandle is stale.");
        },
        clone: () =>
          createOwnedSource(
            cell.reel.createDetachedOccurrence(
              ownedOccurrence.code,
              ownedOccurrence.symbol.getPresentationValue(),
            ),
          ),
        release: () => {
          if (released) return;
          released = true;
          cell.reel.releaseDetachedOccurrence(ownedOccurrence);
        },
      };
    };
    return createSymbolHandle({
      symbol: occurrence.symbol,
      owned: false,
      assertUsable: () => {
        handle.getSnapshot();
      },
      clone: () =>
        createOwnedSource(
          cell.reel.createDetachedOccurrence(
            occurrence.code,
            occurrence.symbol.getPresentationValue(),
          ),
        ),
      getPosition: () => {
        const geometry = this.getVisibleSymbolGeometrySnapshot(
          position.x,
          position.y,
        );
        return { x: geometry.centerX, y: geometry.centerY };
      },
      getAnchor: () =>
        createContainerRenderAnchor(this, () => {
          handle.getSnapshot();
          const geometry = this.getVisibleSymbolGeometrySnapshot(
            position.x,
            position.y,
          );
          return { x: geometry.centerX, y: geometry.centerY };
        }),
    });
  }

  getSymbols(positions: readonly SymbolPosition[]) {
    const keys = new Set<string>();
    const symbols = positions.map((position) => {
      const key = `${position.x}:${position.y}`;
      if (keys.has(key))
        throw new ReelError(`Duplicate SymbolGroup position (${key}).`);
      keys.add(key);
      return this.getSymbol(position);
    });
    return createSymbolGroup(symbols, {
      getCellRect: (index) => {
        const point = symbols[index]!.getPosition();
        return Object.freeze({
          x: point.x - this.#cellWidth / 2,
          y: point.y - this.#cellHeight / 2,
          width: this.#cellWidth,
          height: this.#cellHeight,
        });
      },
    });
  }

  replaceSymbol(
    position: SymbolPosition,
    target: SymbolReplacementTarget,
  ): SymbolHandle {
    return this.replaceSymbols([{ position, target }]).symbols[0]!;
  }

  replaceSymbols(replacements: readonly SymbolReplacement[]) {
    if (replacements.length === 0)
      throw new ReelError("Symbol replacement batch must not be empty.");
    this.assertStopped("replace visible symbols");
    const keys = new Set<string>();
    const prepared: Array<{
      readonly cell: RuntimeCell;
      readonly wasOccupied: boolean;
      readonly output: RenderReelVisibleOccurrence | null;
      previous: RenderReelVisibleOccurrence | null;
      slotOpened: boolean;
      outputPlaced: boolean;
    }> = [];
    try {
      for (const { position, target } of replacements) {
        const key = `${position.x}:${position.y}`;
        if (keys.has(key))
          throw new ReelError(
            `Duplicate symbol replacement position (${key}).`,
          );
        keys.add(key);
        const cell = this.getCell(position.x, position.y);
        if (target.code === -1 && (target.value ?? null) !== null)
          throw new ReelError(
            "Empty symbol replacement must have a null presentation value.",
          );
        prepared.push({
          cell,
          wasOccupied: cell.occupied,
          output:
            target.code === -1
              ? null
              : cell.reel.createDetachedOccurrence(
                  target.code,
                  target.value ?? null,
                ),
          previous: null,
          slotOpened: false,
          outputPlaced: false,
        });
      }
      for (const item of prepared) {
        item.previous = item.wasOccupied
          ? item.cell.reel.takeVisibleOccurrence()
          : null;
        if (!item.previous) item.cell.reel.openVisibleEmptySlot();
        item.slotOpened = true;
        item.cell.occupied = false;
      }
      for (const item of prepared) {
        if (item.output) item.cell.reel.placeVisibleOccurrence(item.output);
        else item.cell.reel.placeVisibleEmptySlot();
        item.outputPlaced = true;
        item.cell.occupied = item.output !== null;
      }
    } catch (error) {
      for (const item of prepared.toReversed()) {
        if (item.outputPlaced) {
          if (item.output) {
            const placed = item.cell.reel.takeVisibleOccurrence();
            item.cell.reel.releaseDetachedOccurrence(placed);
          } else {
            item.cell.reel.openVisibleEmptySlot();
          }
        } else if (item.output) {
          item.cell.reel.releaseDetachedOccurrence(item.output);
        }
        if (item.slotOpened) {
          if (item.previous)
            item.cell.reel.placeVisibleOccurrence(item.previous);
          else item.cell.reel.placeVisibleEmptySlot();
          item.cell.occupied = item.wasOccupied;
        }
      }
      throw error;
    }
    for (const item of prepared)
      if (item.previous) {
        this.bumpOccurrenceGeneration(item.previous);
        item.cell.reel.releaseDetachedOccurrence(item.previous);
      }
    return this.getSymbols(replacements.map(({ position }) => position));
  }

  async runVisibleOccurrenceTransfer(
    input: VisibleOccurrenceTransferInput,
    choreography: (scope: VisibleOccurrenceTransferScope) => Promise<void>,
  ): Promise<void> {
    if (this.#activeScopedTransfer)
      throw new ReelError("A scoped visible occurrence transfer is active.");
    if (input.signal?.aborted)
      throw new ReelError("Visible occurrence transfer was aborted.");
    const sourceCell = this.getCell(input.source.x, input.source.y);
    const targetCell = this.getCell(input.target.x, input.target.y);
    const movingOccurrence = this.getCellOccurrence(sourceCell);
    const targetOccurrence = this.getCellOccurrence(targetCell);
    const sourceGeometry = this.getVisibleSymbolGeometrySnapshot(
      input.source.x,
      input.source.y,
    );
    const targetGeometry = this.getVisibleSymbolGeometrySnapshot(
      input.target.x,
      input.target.y,
    );
    const batch = this.createVisibleOccurrenceTransferBatch({
      transfers: [input],
    });
    const active: ActiveScopedTransfer = {
      input: Object.freeze({
        ...input,
        source: Object.freeze({ ...input.source }),
        target: Object.freeze({ ...input.target }),
      }),
      batch,
      movingOccurrence,
      targetOccurrence,
      sourceGeometry,
      targetGeometry,
      controller: new AbortController(),
      inputAbortListener: null,
      motion: null,
      elapsedMs: 0,
      started: false,
      arrived: false,
      finalized: false,
      moveResolve: null,
      moveReject: null,
    };
    this.#activeScopedTransfer = active;
    if (input.signal) {
      active.inputAbortListener = (): void =>
        this.cancelActiveScopedTransfer(
          new ReelError("Visible occurrence transfer was aborted."),
        );
      input.signal.addEventListener("abort", active.inputAbortListener, {
        once: true,
      });
    }
    const scope = Object.freeze({
      moving: this.createOccurrenceHandle(movingOccurrence),
      target: this.createOccurrenceHandle(targetOccurrence),
      delay: (durationMs: number, signal?: AbortSignal) =>
        this.waitForScopedTransferDelay(active, durationMs, signal),
      move: (motion: VisibleOccurrenceMotion) =>
        this.startScopedTransferMotion(active, motion),
    }) satisfies VisibleOccurrenceTransferScope;
    try {
      await choreography(scope);
      if (this.#activeScopedTransfer !== active)
        throw new ReelError("Visible occurrence transfer scope is stale.");
      if (!active.arrived)
        throw new ReelError(
          "Visible occurrence transfer choreography must finish move() before returning.",
        );
      active.batch.finalize();
      this.#transferAboveSymbolsLayer.mask = null;
      this.bumpOccurrenceGeneration(active.targetOccurrence);
      active.finalized = true;
      if (active.inputAbortListener)
        input.signal?.removeEventListener("abort", active.inputAbortListener);
      this.#activeScopedTransfer = null;
      this.cleanupStaleOccurrenceEffects();
    } catch (error) {
      if (!active.finalized) active.batch.cancel();
      this.#transferAboveSymbolsLayer.mask = null;
      active.controller.abort();
      if (active.inputAbortListener)
        input.signal?.removeEventListener("abort", active.inputAbortListener);
      active.moveReject?.(
        error instanceof Error ? error : new ReelError(String(error)),
      );
      if (this.#activeScopedTransfer === active)
        this.#activeScopedTransfer = null;
      throw error;
    }
  }

  private startScopedTransferMotion(
    active: ActiveScopedTransfer,
    motion: VisibleOccurrenceMotion,
  ): Promise<void> {
    if (this.#activeScopedTransfer !== active)
      return Promise.reject(
        new ReelError("Visible occurrence transfer scope is stale."),
      );
    if (active.started)
      return Promise.reject(
        new ReelError("Visible occurrence transfer move() can only run once."),
      );
    active.motion = prepareVisibleOccurrenceMotion(
      motion,
      { x: active.sourceGeometry.centerX, y: active.sourceGeometry.centerY },
      { x: active.targetGeometry.centerX, y: active.targetGeometry.centerY },
    );
    active.batch.start();
    active.started = true;
    const destinationLayer =
      motion.stacking.layer === "above-effects"
        ? this.#transferLayer
        : this.#transferAboveSymbolsLayer;
    destinationLayer.mask = this.#cascadeMovementMask;
    destinationLayer.addChild(active.movingOccurrence.symbol);
    active.movingOccurrence.symbol.zIndex = motion.stacking.order;
    return new Promise<void>((resolve, reject) => {
      active.moveResolve = resolve;
      active.moveReject = reject;
    });
  }

  private waitForScopedTransferDelay(
    active: ActiveScopedTransfer,
    durationMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.#activeScopedTransfer !== active)
      return Promise.reject(
        new ReelError("Visible occurrence transfer scope is stale."),
      );
    if (!signal)
      return this.waitForPresentationDelay(
        durationMs,
        active.controller.signal,
      );
    const linked = new AbortController();
    const abort = (): void => linked.abort();
    active.controller.signal.addEventListener("abort", abort, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (active.controller.signal.aborted || signal.aborted) linked.abort();
    return this.waitForPresentationDelay(durationMs, linked.signal).finally(
      () => {
        active.controller.signal.removeEventListener("abort", abort);
        signal.removeEventListener("abort", abort);
      },
    );
  }

  private createOccurrenceHandle(
    occurrence: RenderReelVisibleOccurrence,
  ): VisibleOccurrenceHandle {
    const generation = this.getOccurrenceGeneration(occurrence);
    const assertUsable = (): void => {
      if (
        this.getOccurrenceGeneration(occurrence) !== generation ||
        !this.isOccurrenceOwned(occurrence)
      )
        throw new ReelError("Visible occurrence handle is stale.");
    };
    return Object.freeze({
      getSnapshot: () => {
        assertUsable();
        const state = occurrence.symbol.getStateSnapshot();
        const completion = occurrence.symbol.getAnimationCompletionSnapshot();
        const position = this.findOccurrencePosition(occurrence);
        return Object.freeze({
          x: position.x,
          y: position.y,
          code: occurrence.code,
          kind: occurrence.kind,
          requestedState: state.requestedState,
          resolvedState: state.resolvedState,
          isOnce: state.isOnce,
          ...completion,
        });
      },
      getGeometrySnapshot: () => {
        assertUsable();
        const position = this.findOccurrencePosition(occurrence);
        if (position.moving) {
          return Object.freeze({
            x: position.x,
            y: position.y,
            code: occurrence.code,
            kind: occurrence.kind,
            centerX: occurrence.symbol.x,
            centerY: occurrence.symbol.y,
            cellWidth: this.#cellWidth,
            cellHeight: this.#cellHeight,
          });
        }
        return this.getVisibleSymbolGeometrySnapshot(position.x, position.y);
      },
      setPresentationValue: (value: number | null) => {
        assertUsable();
        const position = this.findOccurrencePosition(occurrence);
        this.getCell(
          position.x,
          position.y,
        ).reel.setVisibleSymbolPresentationValue(0, value);
      },
      playState: (
        state: SymbolStateId,
        options: SymbolStatePlaybackOptions,
      ) => {
        assertUsable();
        return occurrence.symbol.playState(state, options);
      },
      attachEffect: (options: VisibleOccurrenceEffectAttachmentOptions) => {
        assertUsable();
        return this.attachOccurrenceEffect(occurrence, options);
      },
    });
  }

  private async attachOccurrenceEffect(
    occurrence: RenderReelVisibleOccurrence,
    options: VisibleOccurrenceEffectAttachmentOptions,
  ): Promise<VisibleOccurrenceEffectHandle> {
    const generation = this.getOccurrenceGeneration(occurrence);
    const factory = this.#occurrenceEffectPlayerFactory;
    if (!factory)
      throw new ReelError(
        "Visible occurrence effect attachment is not configured for this reel.",
      );
    if (!options.key)
      throw new ReelError(
        "Visible occurrence effect resource key is required.",
      );
    if (options.kind !== "spine" && options.kind !== "vni")
      throw new ReelError(
        `Unknown visible occurrence effect kind "${String(options.kind)}".`,
      );
    const stacking = options.stacking ?? {
      layer: "above-symbols" as const,
      order: 0,
    };
    if (
      (stacking.layer !== "above-symbols" &&
        stacking.layer !== "above-effects") ||
      !Number.isSafeInteger(stacking.order) ||
      stacking.order < 0
    )
      throw new ReelError(
        "Visible occurrence effect stacking must use a known layer and non-negative safe integer order.",
      );
    const parent = new Container();
    const transform = options.transform;
    for (const [name, value] of Object.entries(transform ?? {}))
      if (!Number.isFinite(value))
        throw new ReelError(
          `Visible occurrence effect transform ${name} must be finite.`,
        );
    parent.position.set(transform?.x ?? 0, transform?.y ?? 0);
    parent.scale.set(transform?.scaleX ?? 1, transform?.scaleY ?? 1);
    parent.rotation = transform?.rotation ?? 0;
    parent.zIndex =
      (stacking.layer === "above-effects" ? 1_000_000_000 : 0) + stacking.order;
    occurrence.symbol.overlayLayer.sortableChildren = true;
    occurrence.symbol.overlayLayer.addChild(parent);
    let player: VisibleOccurrenceEffectPlayer;
    try {
      player = await factory({ parent, attachment: options });
    } catch (error) {
      parent.destroy({ children: true });
      throw error;
    }
    if (
      this.getOccurrenceGeneration(occurrence) !== generation ||
      !this.isOccurrenceOwned(occurrence)
    ) {
      player.destroy();
      parent.destroy({ children: true });
      throw new ReelError(
        "Visible occurrence became stale while attaching its effect.",
      );
    }
    const attachment: OccurrenceEffectAttachment = {
      occurrence,
      generation,
      parent,
      player,
      detached: false,
    };
    this.#occurrenceEffects.add(attachment);
    const detach = (): void => {
      if (attachment.detached) return;
      attachment.detached = true;
      this.#occurrenceEffects.delete(attachment);
      player.destroy();
      parent.destroy({ children: true });
    };
    return Object.freeze({
      play: async (
        playback: import("./types.js").VisibleOccurrenceEffectPlaybackOptions,
      ) => {
        if (attachment.detached)
          throw new ReelError("Visible occurrence effect handle is detached.");
        await player.play(playback);
      },
      stop: () => {
        if (!attachment.detached) player.stop();
      },
      detach,
    });
  }

  getVisibleSymbolStateSnapshot(
    x: number,
    y: number,
  ): RenderVisibleSymbolStateSnapshot {
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      return Object.freeze({
        x,
        y,
        code: -1,
        kind: "empty" as const,
        requestedState: null,
        resolvedState: null,
        isOnce: false,
        loopCompletionCount: 0,
        onceCompletionCount: 0,
      });
    }
    const snapshot = cell.reel.getVisibleSymbolStateSnapshot(0);
    return Object.freeze({ ...snapshot, x, y });
  }

  getVisibleSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolStateSnapshot[] {
    return Object.freeze(
      positions.map((position) =>
        this.getVisibleSymbolStateSnapshot(position.x, position.y),
      ),
    );
  }

  getVisibleSymbolGeometrySnapshot(
    x: number,
    y: number,
  ): RenderVisibleSymbolGeometrySnapshot {
    this.assertStopped("read visible symbol geometry");
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      return Object.freeze({
        x,
        y,
        code: -1,
        kind: "empty" as const,
        centerX: cell.root.x + this.#cellWidth / 2,
        centerY: cell.root.y + this.#cellHeight / 2,
        cellWidth: this.#cellWidth,
        cellHeight: this.#cellHeight,
      });
    }
    const snapshot = cell.reel.getVisibleSymbolGeometrySnapshot(0);
    return Object.freeze({
      ...snapshot,
      x,
      y,
      centerX: cell.root.x + snapshot.centerX,
      centerY: cell.root.y + snapshot.centerY,
    });
  }

  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[] {
    return Object.freeze(
      positions.map((position) =>
        this.getVisibleSymbolGeometrySnapshot(position.x, position.y),
      ),
    );
  }

  getSnapshot(): RenderGridCellReelSetSnapshot {
    return Object.freeze({
      spinning: this.isSpinning(),
      completed:
        this.#spinPlan === null &&
        this.#continuousSpin === null &&
        this.#activeDrop === null &&
        this.#activeEffectSweep === null &&
        this.#cells.every(
          (cell) => cell.phase === "completed" || cell.phase === "idle",
        ),
      visibleScene: this.getVisibleScene(),
      cells: Object.freeze(this.#cells.map((cell) => this.snapshotCell(cell))),
      effects: this.#effectController?.getSnapshot() ?? null,
    });
  }

  isSpinning(): boolean {
    return (
      this.#spinPlan !== null ||
      this.#continuousSpin !== null ||
      this.#activeDrop !== null ||
      this.#activeEffectSweep !== null
    );
  }

  getLayer(id: SymbolAreaLayerId): SymbolAreaLayer {
    if (this.destroyed)
      throw new ReelError("Symbol area presentation runtime was destroyed.");
    const controller = this.#areaLayerControllers.get(id);
    if (!controller)
      throw new ReelError(`Unknown symbol area layer "${String(id)}".`);
    return controller.layer;
  }

  async present(
    presentation: (
      context: import("./reel-area.js").SymbolAreaPresentationContext,
    ) => Promise<void>,
    options: import("./reel-area.js").SymbolAreaPresentationOptions = {},
  ): Promise<void> {
    if (this.destroyed)
      throw new ReelError("Symbol area presentation runtime was destroyed.");
    if (this.#areaPresentationAbort)
      throw new ReelError("Symbol area already has an active presentation.");
    if (options.repeat !== undefined && typeof options.repeat !== "boolean")
      throw new ReelError("Symbol area presentation repeat must be boolean.");
    const controller = new AbortController();
    this.#areaPresentationAbort = controller;
    if (!options.repeat) {
      const scope = this.createAreaPresentationScope(controller.signal);
      try {
        await presentation(scope.context);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      } finally {
        scope.cleanup();
        if (this.#areaPresentationAbort === controller)
          this.#areaPresentationAbort = null;
      }
      return;
    }

    let firstCycleSettled = false;
    let resolveFirstCycle!: () => void;
    let rejectFirstCycle!: (error: unknown) => void;
    const firstCycle = new Promise<void>((resolve, reject) => {
      resolveFirstCycle = resolve;
      rejectFirstCycle = reject;
    });
    void (async () => {
      try {
        while (!controller.signal.aborted) {
          const scope = this.createAreaPresentationScope(controller.signal);
          try {
            await presentation(scope.context);
          } finally {
            scope.cleanup();
          }
          if (!firstCycleSettled) {
            firstCycleSettled = true;
            resolveFirstCycle();
          }
        }
      } catch (error) {
        if (!controller.signal.aborted && !firstCycleSettled) {
          firstCycleSettled = true;
          rejectFirstCycle(error);
        } else if (!controller.signal.aborted) {
          this.#areaPresentationFailure =
            error instanceof Error
              ? error
              : new ReelError("Symbol area presentation failed.");
        }
      } finally {
        if (!firstCycleSettled) {
          firstCycleSettled = true;
          resolveFirstCycle();
        }
        if (this.#areaPresentationAbort === controller)
          this.#areaPresentationAbort = null;
      }
    })();
    await firstCycle;
  }

  private createAreaPresentationScope(signal: AbortSignal): {
    readonly context: PresentationScopeContext;
    cleanup(): void;
  } {
    const mounted = new Map<RenderObject, AreaPresentationMountedNode>();
    const cleanupNode = (entry: AreaPresentationMountedNode): void => {
      mounted.delete(entry.node);
      this.cancelAreaPresentationMotionsForNode(entry.node);
      try {
        entry.target.remove(entry.node);
      } catch (error) {
        if (!this.destroyed) throw error;
        getRenderObjectAdapter(entry.node).view.parent?.removeChild(
          getRenderObjectAdapter(entry.node).view,
        );
      }
      if (entry.ownership === "destroy") entry.node.destroy();
    };
    const mount = (
      target: SymbolAreaLayer,
      node: RenderObject,
      options: PresentationNodeMountOptions,
    ): void => {
      if (mounted.has(node))
        throw new ReelError("RenderObject is already mounted in this scope.");
      if (options.ownership !== "detach" && options.ownership !== "destroy")
        throw new ReelError(
          `Unknown presentation node ownership "${String(options.ownership)}".`,
        );
      const objectAdapter = getRenderObjectAdapter(node);
      if (options.ownership === "destroy" && !objectAdapter.owned)
        throw new ReelError(
          "Borrowed RenderObject cannot use destroy ownership.",
        );
      const adapter = getPresentationMountTargetAdapter(target);
      if (options.anchor) {
        const point = resolveRenderAnchor(options.anchor, adapter.view);
        const offset = options.offset ?? { x: 0, y: 0 };
        if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y))
          throw new ReelError(
            "Presentation node offset must contain finite coordinates.",
          );
        node.setPosition({ x: point.x + offset.x, y: point.y + offset.y });
      }
      target.add(node, options.order);
      mounted.set(node, { target, node, ownership: options.ownership });
    };
    const unmount = (node: RenderObject): void => {
      const entry = mounted.get(node);
      if (!entry)
        throw new ReelError("RenderObject is not mounted in this scope.");
      cleanupNode(entry);
    };
    const move = (
      node: RenderObject,
      options: Parameters<PresentationScopeContext["move"]>[1],
    ): Promise<void> => {
      const entry = mounted.get(node);
      if (!entry)
        return Promise.reject(
          new ReelError("Presentation motion node is not mounted."),
        );
      const targetView = getPresentationMountTargetAdapter(entry.target).view;
      const from = getRenderObjectAdapter(node).view.position;
      const to = resolveRenderAnchor(options.to, targetView);
      const prepared = prepareVisibleOccurrenceMotion(
        {
          durationMs: options.durationSeconds * 1000,
          path: options.path ?? { kind: "line" },
          easing: options.easing ?? { kind: "linear" },
          stacking: { layer: "above-effects", order: 0 },
        },
        { x: from.x, y: from.y },
        to,
      );
      return new Promise<void>((resolve, reject) => {
        let motion!: AreaPresentationMotion;
        const abortListener = () => {
          if (!this.#areaPresentationMotions.delete(motion)) return;
          reject(new ReelError("Symbol area presentation was interrupted."));
        };
        motion = {
          node,
          prepared,
          signal,
          abortListener,
          elapsedSeconds: 0,
          resolve,
          reject,
        };
        signal.addEventListener("abort", abortListener, { once: true });
        this.#areaPresentationMotions.add(motion);
      });
    };
    const context: PresentationScopeContext = Object.freeze({
      delay: (seconds: number) =>
        this.waitForAreaPresentationDelay(seconds, signal),
      mount,
      unmount,
      withNode: async <T>(
        target: Parameters<PresentationScopeContext["withNode"]>[0],
        node: RenderObject,
        options: PresentationNodeMountOptions,
        playback: () => Promise<T>,
      ) => {
        mount(target as SymbolAreaLayer, node, options);
        try {
          return await playback();
        } finally {
          const entry = mounted.get(node);
          if (entry) cleanupNode(entry);
        }
      },
      move,
      transfer: async (
        target: Parameters<PresentationScopeContext["transfer"]>[0],
        node: RenderObject,
        options: Parameters<PresentationScopeContext["transfer"]>[2],
      ) => {
        if (!getRenderObjectAdapter(node).owned)
          throw new ReelError("Only an owned RenderObject can be transferred.");
        const adapter = getPresentationMountTargetAdapter(target);
        node.setPosition(resolveRenderAnchor(options.from, adapter.view));
        mount(target as SymbolAreaLayer, node, options);
        try {
          await move(node, options);
        } finally {
          const entry = mounted.get(node);
          if (entry) cleanupNode(entry);
        }
      },
    });
    return {
      context,
      cleanup: () => {
        for (const entry of [...mounted.values()]) cleanupNode(entry);
      },
    };
  }

  private interruptAreaPresentation(): void {
    const controller = this.#areaPresentationAbort;
    if (!controller) return;
    this.#areaPresentationAbort = null;
    controller.abort(
      new ReelError("Symbol area presentation was interrupted."),
    );
  }

  private waitForAreaPresentationDelay(
    seconds: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (!Number.isFinite(seconds) || seconds < 0)
      return Promise.reject(
        new ReelError("Symbol area delay must be finite and non-negative."),
      );
    if (seconds === 0) return Promise.resolve();
    if (signal.aborted)
      return Promise.reject(
        new ReelError("Symbol area presentation was interrupted."),
      );
    return new Promise<void>((resolve, reject) => {
      let waiter!: AreaPresentationDelayWaiter;
      const abortListener = () => {
        this.#areaPresentationDelayWaiters.delete(waiter);
        reject(new ReelError("Symbol area presentation was interrupted."));
      };
      waiter = {
        remainingSeconds: seconds,
        signal,
        resolve,
        reject,
        abortListener,
      };
      signal.addEventListener("abort", abortListener, { once: true });
      this.#areaPresentationDelayWaiters.add(waiter);
    });
  }

  private updateAreaPresentationDelays(deltaSeconds: number): void {
    for (const waiter of [...this.#areaPresentationDelayWaiters]) {
      waiter.remainingSeconds -= deltaSeconds;
      if (waiter.remainingSeconds > 0) continue;
      this.#areaPresentationDelayWaiters.delete(waiter);
      waiter.signal.removeEventListener("abort", waiter.abortListener);
      waiter.resolve();
    }
  }

  private updateAreaPresentationMotions(deltaSeconds: number): void {
    for (const motion of [...this.#areaPresentationMotions]) {
      if (motion.signal.aborted) {
        this.#areaPresentationMotions.delete(motion);
        motion.signal.removeEventListener("abort", motion.abortListener);
        motion.reject(
          new ReelError("Symbol area presentation was interrupted."),
        );
        continue;
      }
      motion.elapsedSeconds = Math.min(
        motion.elapsedSeconds + deltaSeconds,
        motion.prepared.durationMs / 1000,
      );
      motion.node.setPosition(
        motion.prepared.sample(
          motion.elapsedSeconds / (motion.prepared.durationMs / 1000),
        ),
      );
      if (motion.elapsedSeconds < motion.prepared.durationMs / 1000) continue;
      this.#areaPresentationMotions.delete(motion);
      motion.signal.removeEventListener("abort", motion.abortListener);
      motion.resolve();
    }
  }

  private cancelAreaPresentationMotionsForNode(node: RenderObject): void {
    for (const motion of [...this.#areaPresentationMotions]) {
      if (motion.node !== node) continue;
      this.#areaPresentationMotions.delete(motion);
      motion.signal.removeEventListener("abort", motion.abortListener);
      motion.reject(new ReelError("Presentation motion node was unmounted."));
    }
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.interruptAreaPresentation();
    for (const controller of this.#areaLayerControllers.values())
      controller.detachAll();
    this.cancelActiveScopedTransfer(
      new ReelError("Visible occurrence transfer runtime was destroyed."),
    );
    this.#activeTransferCleanup?.();
    this.cancelDirectTransfer(
      new ReelError("Direct transfer runtime was destroyed."),
    );
    this.cancelDirectDrop(new ReelError("Cascade drop runtime was destroyed."));
    for (const waiter of this.#presentationDelayWaiters) {
      waiter.signal?.removeEventListener("abort", waiter.abortListener!);
      waiter.reject(new ReelError("Presentation delay runtime was destroyed."));
    }
    this.#presentationDelayWaiters.clear();
    for (const attachment of [...this.#occurrenceEffects]) {
      attachment.detached = true;
      attachment.player.destroy();
      attachment.parent.destroy({ children: true });
    }
    this.#occurrenceEffects.clear();
    this.cancelContinuous();
    this.#effectController?.destroy();
    super.destroy(options);
  }

  private updatePresentationWaiters(deltaSeconds: number): void {
    const deltaMs = deltaSeconds * 1000;
    for (const waiter of [...this.#presentationDelayWaiters]) {
      waiter.remainingMs -= deltaMs;
      if (waiter.remainingMs > 0) continue;
      this.#presentationDelayWaiters.delete(waiter);
      waiter.signal?.removeEventListener("abort", waiter.abortListener!);
      waiter.resolve();
    }
  }

  private updateDirectTransfer(deltaSeconds: number): void {
    const active = this.#activeDirectTransferBatch;
    if (!active) return;
    active.elapsedMs = Math.min(
      active.elapsedMs + deltaSeconds * 1000,
      active.durationMs,
    );
    active.batch.setProgress(active.elapsedMs / active.durationMs);
    if (active.elapsedMs < active.durationMs) return;
    try {
      active.batch.finalize();
      active.signal?.removeEventListener("abort", active.abortListener!);
      this.#activeDirectTransferBatch = null;
      active.resolve();
    } catch (error) {
      this.cancelDirectTransfer(
        error instanceof Error ? error : new ReelError(String(error)),
      );
    }
  }

  private cancelDirectTransfer(error: Error): void {
    const active = this.#activeDirectTransferBatch;
    if (!active) return;
    this.#activeDirectTransferBatch = null;
    active.signal?.removeEventListener("abort", active.abortListener!);
    active.batch.cancel();
    active.reject(error);
  }

  private cancelDirectDrop(error: Error): void {
    const active = this.#activeDrop;
    if (!active?.reject) return;
    this.#activeDrop = null;
    active.signal?.removeEventListener("abort", active.abortListener!);
    for (const item of active.movements) {
      this.removeChild(item.occurrence.symbol);
      item.occurrence.symbol.requestState("normal");
      if (item.movement.kind === "existing") {
        const source = this.getCell(item.movement.x, item.movement.sourceY);
        source.reel.placeVisibleOccurrence(item.occurrence);
        source.occupied = true;
        source.phase = "completed";
        this.syncCellRenderOrder(source);
      } else {
        const target = this.getCell(item.movement.x, item.movement.targetY);
        target.reel.releaseDetachedOccurrence(item.occurrence);
      }
    }
    this.setCascadeMovementMaskActive(false);
    active.reject(error);
  }

  private updateScopedTransfer(deltaSeconds: number): void {
    const active = this.#activeScopedTransfer;
    if (!active?.started || active.arrived || !active.motion) return;
    if (active.input.signal?.aborted) {
      this.cancelActiveScopedTransfer(
        new ReelError("Visible occurrence transfer was aborted."),
      );
      return;
    }
    active.elapsedMs = Math.min(
      active.motion.durationMs,
      active.elapsedMs + deltaSeconds * 1000,
    );
    const point = active.motion.sample(
      active.elapsedMs / active.motion.durationMs,
    );
    active.movingOccurrence.symbol.position.set(point.x, point.y);
    if (active.elapsedMs < active.motion.durationMs) return;
    active.arrived = true;
    const resolve = active.moveResolve;
    active.moveResolve = null;
    active.moveReject = null;
    resolve?.();
  }

  private cancelActiveScopedTransfer(error: Error): void {
    const active = this.#activeScopedTransfer;
    if (!active || active.finalized) return;
    active.batch.cancel();
    this.#transferAboveSymbolsLayer.mask = null;
    active.controller.abort();
    if (active.inputAbortListener)
      active.input.signal?.removeEventListener(
        "abort",
        active.inputAbortListener,
      );
    active.moveReject?.(error);
    active.moveResolve = null;
    active.moveReject = null;
    this.#activeScopedTransfer = null;
  }

  private updateOccurrenceEffects(deltaSeconds: number): void {
    this.cleanupStaleOccurrenceEffects();
    for (const attachment of this.#occurrenceEffects)
      attachment.player.update(deltaSeconds);
  }

  private cleanupStaleOccurrenceEffects(): void {
    for (const attachment of [...this.#occurrenceEffects]) {
      if (
        this.getOccurrenceGeneration(attachment.occurrence) ===
          attachment.generation &&
        this.isOccurrenceOwned(attachment.occurrence)
      )
        continue;
      attachment.detached = true;
      this.#occurrenceEffects.delete(attachment);
      attachment.player.destroy();
      attachment.parent.destroy({ children: true });
    }
  }

  private getCellOccurrence(cell: RuntimeCell): RenderReelVisibleOccurrence {
    const slot = cell.reel.getSlotRenderView(0);
    if (
      !cell.occupied ||
      !slot?.symbol ||
      slot.code < 0 ||
      slot.kind === "empty"
    )
      throw new ReelError(
        `Cannot resolve visible occurrence at grid cell (${cell.coordinate.x},${cell.coordinate.y}).`,
      );
    return Object.freeze({
      code: slot.code,
      kind: "textured" as const,
      symbol: slot.symbol,
      presentationValue: slot.presentationValue,
    });
  }

  private isOccurrenceOwned(occurrence: RenderReelVisibleOccurrence): boolean {
    if (
      this.#activeScopedTransfer?.movingOccurrence.symbol === occurrence.symbol
    )
      return true;
    return this.#cells.some(
      (cell) => cell.reel.getSlotRenderView(0).symbol === occurrence.symbol,
    );
  }

  private getOccurrenceGeneration(
    occurrence: RenderReelVisibleOccurrence,
  ): number {
    return this.#occurrenceGenerations.get(occurrence.symbol) ?? 0;
  }

  private bumpOccurrenceGeneration(
    occurrence: RenderReelVisibleOccurrence,
  ): void {
    this.#occurrenceGenerations.set(
      occurrence.symbol,
      this.getOccurrenceGeneration(occurrence) + 1,
    );
  }

  private findOccurrencePosition(occurrence: RenderReelVisibleOccurrence): {
    readonly x: number;
    readonly y: number;
    readonly moving: boolean;
  } {
    const active = this.#activeScopedTransfer;
    if (active?.started && active.movingOccurrence.symbol === occurrence.symbol)
      return {
        x: active.input.source.x,
        y: active.input.source.y,
        moving: true,
      };
    for (const cell of this.#cells) {
      const found = cell.reel.getSlotRenderView(0).symbol === occurrence.symbol;
      if (found)
        return {
          x: cell.coordinate.x,
          y: cell.coordinate.y,
          moving: false,
        };
    }
    throw new ReelError("Visible occurrence handle is stale.");
  }

  private getCellGeometry(coordinate: {
    readonly x: number;
    readonly y: number;
  }): {
    readonly x: number;
    readonly y: number;
  } {
    const cell = this.getCell(coordinate.x, coordinate.y);
    const geometry = cell.reel.getVisibleSymbolGeometrySnapshot(0);
    return Object.freeze({
      x: cell.root.x + geometry.centerX,
      y: cell.root.y + geometry.centerY,
    });
  }

  private createRuntimeCell(
    coordinate: GridCellCoordinate,
    registry: ReelSymbolRegistry,
    presentationValueResolver: RenderGridCellReelSetOptions["presentationValueResolver"],
  ): RuntimeCell {
    const root = new Container();
    root.x = coordinate.x * (this.#cellWidth + this.#columnGap);
    root.y = coordinate.y * (this.#cellHeight + this.#rowGap);

    const clipMask = new Graphics()
      .rect(0, 0, this.#cellWidth, this.#cellHeight)
      .fill({ color: 0xffffff, alpha: 1 });
    clipMask.visible = false;
    const clipContent = new Container();

    const reel = new RenderReel({
      reels: this.#reels,
      x: coordinate.x,
      layout: createReelLayout({
        reelCount: this.#columns,
        visibleRows: 1,
        cellWidth: this.#cellWidth,
        cellHeight: this.#cellHeight,
        columnGap: 0,
      }),
      registry,
      ...(this.#bounceStrength === undefined
        ? {}
        : { bounceStrength: this.#bounceStrength }),
      presentationValueResolver:
        presentationValueResolver === undefined
          ? undefined
          : ({ symbolY, code }) =>
              presentationValueResolver({
                x: coordinate.x,
                y: coordinate.y,
                symbolY,
                code,
              }),
    });
    reel.x = 0;

    const dimOverlay = new Container();
    const dimRows = createDimmingRows(this.#cellWidth, this.#cellHeight);
    const slotRenderViewsByWindowY = new Map<
      number,
      RenderReelSlotRenderView
    >();
    for (const slot of reel.getSlotRenderViews()) {
      slotRenderViewsByWindowY.set(slot.windowY, slot);
    }
    dimOverlay.alpha = 0;
    dimOverlay.y = 0;
    dimOverlay.renderable = false;

    reel.addChild(dimOverlay);
    dimOverlay.addChild(...dimRows.map((row) => row.graphic));
    clipContent.addChild(reel);
    root.addChild(clipMask, clipContent);
    this.addChild(root);
    root.zIndex = coordinate.orderIndex;

    return {
      key: createCellKey(coordinate.x, coordinate.y),
      coordinate,
      root,
      clipContent,
      reel,
      clipMask,
      dimOverlay,
      dimRows,
      slotRenderViewsByWindowY,
      planCell: null,
      phase: "idle",
      hasStartedThisSpin: false,
      hasLandedThisSpin: false,
      fadeOutElapsedMs: 0,
      fadeOutStartAlpha: 0,
      targetPresentationValue: null,
      targetLandingState: null,
      occupied: true,
    };
  }

  private updateSpinTimeline(
    deltaSeconds: number,
    started: GridCellCoordinate[],
    landed: GridCellCoordinate[],
    activated: GridCellCoordinate[],
  ): void {
    const plan = this.#spinPlan;
    if (!plan) return;
    const endMs = this.#elapsedMs + deltaSeconds * 1000;
    let cursorMs = this.#elapsedMs;
    let firstBoundary = true;

    while (firstBoundary || cursorMs < endMs) {
      firstBoundary = false;
      this.startEffectsAtBoundary(plan, cursorMs);
      this.updateCellsAndCollectEdges(
        plan,
        cursorMs,
        cursorMs,
        started,
        landed,
        activated,
      );
      if (cursorMs >= endMs) break;
      const nextMs = this.findNextSpinBoundary(plan, cursorMs, endMs);
      const effectResult = this.#effectController?.update(
        (nextMs - cursorMs) / 1000,
      );
      for (const completed of effectResult?.completed ?? []) {
        this.#completedEffects.add(
          createEffectKey(completed.effectId, completed.x, completed.y),
        );
      }
      this.updateCellsAndCollectEdges(
        plan,
        cursorMs,
        nextMs,
        started,
        landed,
        activated,
      );
      cursorMs = nextMs;
    }
    this.#elapsedMs = endMs;
  }

  private releaseCell(cell: RuntimeCell): void {
    const occurrence = this.getCellOccurrence(cell);
    this.bumpOccurrenceGeneration(occurrence);
    cell.reel.releaseVisibleOccurrence();
    cell.occupied = false;
    cell.phase = "completed";
  }

  private startEffectsAtBoundary(
    plan: GridCellReelSpinPlan,
    elapsedMs: number,
  ): void {
    for (const planCell of plan.cells) {
      const effect = planCell.effect;
      if (!effect || effect.startAtMs > elapsedMs) continue;
      const key = createEffectKey(effect.effectId, planCell.x, planCell.y);
      if (this.#startedEffects.has(key)) continue;
      if (effect.activationGate && !this.#activationGateOpen) continue;
      this.#effectController!.startScheduledEffect({
        effectId: effect.effectId,
        position: planCell,
        loopCount: effect.loopCount,
      });
      this.#startedEffects.add(key);
    }
  }

  private findNextSpinBoundary(
    plan: GridCellReelSpinPlan,
    cursorMs: number,
    endMs: number,
  ): number {
    let next = endMs;
    for (const cell of plan.cells) {
      if (cell.stopAtMs > cursorMs) next = Math.min(next, cell.stopAtMs);
      if (cell.startAtMs > cursorMs) next = Math.min(next, cell.startAtMs);
      if (cell.effect && cell.effect.startAtMs > cursorMs) {
        next = Math.min(next, cell.effect.startAtMs);
      }
    }
    return next;
  }

  private updateCellsAndCollectEdges(
    plan: GridCellReelSpinPlan,
    previousElapsedMs: number,
    elapsedMs: number,
    started: GridCellCoordinate[],
    landed: GridCellCoordinate[],
    activated: GridCellCoordinate[],
  ): void {
    for (const cell of this.#cells) {
      const hadStarted = cell.hasStartedThisSpin;
      const hadLanded = cell.hasLandedThisSpin;
      const effect = cell.planCell?.effect;
      if (
        !hadLanded &&
        cell.phase === "spinning" &&
        cell.planCell &&
        elapsedMs >= cell.planCell.stopAtMs &&
        effect
      ) {
        const key = createEffectKey(
          effect.effectId,
          cell.coordinate.x,
          cell.coordinate.y,
        );
        if (!this.#completedEffects.has(key)) {
          throw new ReelError(
            `grid cell (${cell.coordinate.x},${cell.coordinate.y}) cannot land before its effect completes the required real loops.`,
          );
        }
      }
      this.updateCell(cell, previousElapsedMs, elapsedMs);
      if (!hadStarted && cell.hasStartedThisSpin) started.push(cell.coordinate);
      if (!hadLanded && cell.hasLandedThisSpin) {
        if (effect) {
          const key = createEffectKey(
            effect.effectId,
            cell.coordinate.x,
            cell.coordinate.y,
          );
          if (!this.#completedEffects.has(key)) {
            throw new ReelError(
              `grid cell (${cell.coordinate.x},${cell.coordinate.y}) landed before its effect completed the required real loops.`,
            );
          }
        }
        landed.push(cell.coordinate);
        if (
          plan.activationGate &&
          cell.coordinate.x === plan.activationGate.x &&
          cell.coordinate.y === plan.activationGate.y
        ) {
          if (this.#activationGateOpen) {
            throw new ReelError(
              "grid cell activation gate fired more than once.",
            );
          }
          this.#activationGateOpen = true;
          this.#dimmingActivated = true;
          activated.push(cell.coordinate);
        }
      }
    }
  }

  private updateEffectSweep(deltaSeconds: number): boolean {
    const active = this.#activeEffectSweep;
    const controller = this.#effectController;
    if (!active || !controller) return false;
    const endMs = active.elapsedMs + deltaSeconds * 1000;
    let cursorMs = active.elapsedMs;
    let firstBoundary = true;
    while (firstBoundary || cursorMs < endMs) {
      firstBoundary = false;
      active.plan.positions.forEach((position, index) => {
        const startAtMs = index * active.plan.startStepMs;
        const key = createEffectKey(
          active.plan.effectId,
          position.x,
          position.y,
        );
        if (startAtMs <= cursorMs && !active.started.has(key)) {
          controller.startScheduledEffect({
            effectId: active.plan.effectId,
            position,
            loopCount: active.plan.loopCount,
          });
          active.started.add(key);
        }
      });
      if (cursorMs >= endMs) break;
      let nextMs = endMs;
      active.plan.positions.forEach((_, index) => {
        const startAtMs = index * active.plan.startStepMs;
        if (startAtMs > cursorMs) nextMs = Math.min(nextMs, startAtMs);
      });
      const sliceSeconds = (nextMs - cursorMs) / 1000;
      for (const cell of this.#cells) {
        if (cell.occupied) cell.reel.update(sliceSeconds);
      }
      const result = controller.update(sliceSeconds);
      for (const completed of result.completed) {
        active.completed.add(
          createEffectKey(completed.effectId, completed.x, completed.y),
        );
      }
      cursorMs = nextMs;
    }
    active.elapsedMs = endMs;
    if (
      active.started.size === active.plan.positions.length &&
      active.completed.size === active.plan.positions.length
    ) {
      if (controller.getSnapshot().activeCount !== 0) {
        throw new ReelError(
          "grid cell effect sweep completed with active players.",
        );
      }
      this.#activeEffectSweep = null;
      return true;
    }
    return false;
  }

  private updateCell(
    cell: RuntimeCell,
    previousElapsedMs: number,
    elapsedMs: number,
  ): void {
    const planCell = cell.planCell;
    const plan = this.#spinPlan;
    const sliceDeltaMs = Math.max(0, elapsedMs - previousElapsedMs);
    if (!planCell || !plan) {
      if (cell.occupied && sliceDeltaMs > 0) {
        cell.reel.update(sliceDeltaMs / 1000);
        this.syncCellRenderOrder(cell);
      }
      return;
    }

    if (cell.phase === "waiting") {
      const waitingEndMs = Math.min(elapsedMs, planCell.startAtMs);
      const waitingDeltaMs = Math.max(0, waitingEndMs - previousElapsedMs);
      if (cell.occupied && waitingDeltaMs > 0) {
        cell.reel.update(waitingDeltaMs / 1000);
        this.syncCellRenderOrder(cell);
      }
    }

    if (cell.phase === "waiting" && elapsedMs >= planCell.startAtMs) {
      if (!cell.occupied) {
        if (!plan.selective) {
          throw new ReelError(
            `Full grid spin cell (${planCell.x},${planCell.y}) is empty.`,
          );
        }
        cell.reel.resetToY(planCell.axisPlan.startY);
        cell.occupied = true;
      }
      this.setCellClipMask(cell, true);
      cell.reel.start(planCell.axisPlan, {
        targetVisibleSymbols: planCell.targetVisibleSymbols,
        targetVisiblePresentationValues: [cell.targetPresentationValue],
      });
      cell.phase = "spinning";
      cell.hasStartedThisSpin = true;
    }

    if (cell.phase === "spinning") {
      this.updateFadeIn(cell, planCell, plan, elapsedMs);
      const activeStartMs = Math.max(previousElapsedMs, planCell.startAtMs);
      const activeEndMs = Math.min(elapsedMs, planCell.stopAtMs);
      const activeDeltaMs = Math.max(0, activeEndMs - activeStartMs);
      const result = cell.reel.update(activeDeltaMs / 1000);
      this.syncCellRenderOrder(cell);
      if (result.landed) {
        cell.reel.resetToVisibleSymbols(
          planCell.targetVisibleSymbols,
          planCell.axisPlan.finalY,
          [cell.targetPresentationValue],
        );
        cell.occupied = planCell.targetVisibleSymbols[0] !== -1;
        resetReelSlotSymbolsAndRequestLandingState(cell);
        this.syncLandedDimming(cell, planCell, plan);
        this.setCellClipMask(cell, false);
        this.syncCellRenderOrder(cell);
        cell.phase = "landed";
        cell.hasLandedThisSpin = true;
        cell.fadeOutElapsedMs = 0;
        cell.fadeOutStartAlpha = cell.dimOverlay.alpha;
      } else {
        // RenderReel.update() may recycle or replace visible slot symbols. Apply
        // dimming after that work so the current rolling symbols keep the
        // configured tint instead of inheriting a freshly reset white tint.
        this.syncDimmingStrip(cell, plan.dimming);
      }
      if (cell.phase === "landed" && elapsedMs > planCell.stopAtMs) {
        const postLandDeltaMs =
          elapsedMs - Math.max(previousElapsedMs, planCell.stopAtMs);
        this.updateLanded(cell, plan, Math.max(0, postLandDeltaMs));
      }
      return;
    }

    if (cell.phase === "landed") {
      this.updateLanded(cell, plan, sliceDeltaMs);
      return;
    }

    if (cell.phase === "completed" && cell.occupied && sliceDeltaMs > 0) {
      cell.reel.update(sliceDeltaMs / 1000);
      this.syncCellRenderOrder(cell);
    }
  }

  private updateFadeIn(
    cell: RuntimeCell,
    planCell: GridCellReelPlanCell,
    plan: GridCellReelSpinPlan,
    elapsedMs: number,
  ): void {
    const fadeInMs = plan.dimming.fadeInMs;
    if (fadeInMs === 0) {
      cell.dimOverlay.alpha = 1;
      return;
    }
    const progress = clamp01((elapsedMs - planCell.startAtMs) / fadeInMs);
    cell.dimOverlay.alpha = progress;
  }

  private updateLanded(
    cell: RuntimeCell,
    plan: GridCellReelSpinPlan,
    deltaMs: number,
  ): void {
    cell.reel.update(deltaMs / 1000);
    this.syncCellRenderOrder(cell);
    const fadeOutMs = plan.dimming.fadeOutMs;
    if (fadeOutMs === 0) {
      cell.dimOverlay.alpha = 0;
    } else {
      cell.fadeOutElapsedMs = Math.min(
        cell.fadeOutElapsedMs + deltaMs,
        fadeOutMs,
      );
      const progress = clamp01(cell.fadeOutElapsedMs / fadeOutMs);
      cell.dimOverlay.alpha = cell.fadeOutStartAlpha * (1 - progress);
    }
    if (cell.planCell) {
      this.syncLandedDimming(cell, cell.planCell, plan);
    }

    if (cell.dimOverlay.alpha <= 0 && !hasActiveLandingAppear(cell)) {
      cell.dimOverlay.alpha = 0;
      cell.dimOverlay.renderable = false;
      cell.phase = "completed";
    }
  }

  private assertPlanMatchesRuntime(plan: GridCellReelSpinPlan): void {
    if (plan.columns !== this.#columns) {
      throw new ReelError(`grid plan columns must be ${this.#columns}.`);
    }
    if (plan.rows !== this.#rows) {
      throw new ReelError(`grid plan rows must be ${this.#rows}.`);
    }
    if (plan.cells.length === 0 || plan.cells.length > this.#cells.length) {
      throw new ReelError(`grid plan cells length is invalid.`);
    }
    const seen = new Set<string>();
    for (const [index, planCell] of plan.cells.entries()) {
      if (planCell.sequenceIndex !== index) {
        throw new ReelError(
          `grid plan cells[${index}].sequenceIndex must match its position.`,
        );
      }
      const key = createCellKey(planCell.x, planCell.y);
      if (seen.has(key)) {
        throw new ReelError(
          `duplicate grid plan cell (${planCell.x},${planCell.y}).`,
        );
      }
      seen.add(key);
      const cell = this.getCell(planCell.x, planCell.y);
      if (planCell.orderIndex !== cell.coordinate.orderIndex) {
        throw new ReelError(
          `grid plan cells[${index}] does not match runtime order.`,
        );
      }
    }
  }

  private getCell(x: number, y: number): RuntimeCell {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new ReelError("grid cell coordinates must be integers.");
    }
    const cell = this.#cellsByKey.get(createCellKey(x, y));
    if (!cell) {
      throw new ReelError(`Missing grid cell (${x},${y}).`);
    }
    return cell;
  }

  private assertStopped(action: string): void {
    if (this.#spinPlan || this.#activeDrop || this.#activeEffectSweep) {
      throw new ReelError(
        `Cannot ${action} while grid cell reel set is spinning.`,
      );
    }
  }

  private snapshotCell(cell: RuntimeCell): RenderGridCellReelCellSnapshot {
    if (!cell.occupied) {
      return Object.freeze({
        x: cell.coordinate.x,
        y: cell.coordinate.y,
        orderIndex: cell.coordinate.orderIndex,
        phase: cell.phase,
        hasClipMask: false,
        cellX: cell.root.x,
        cellY: cell.root.y,
        reelX: cell.reel.x,
        reelY: cell.reel.y,
        dimmingOnReel: true,
        dimmingOverlayRenderable: false,
        dimmingAlpha: 0,
        symbolDimmingAlpha: 0,
        requestedState: null,
        resolvedState: null,
        isOnce: false,
        onceCompletionCount: null,
        visibleSymbol: -1,
        presentationValue: null,
        occupied: false,
      });
    }
    const slot = cell.reel.getSlotRenderView(0);
    const state = slot.symbol?.getStateSnapshot();
    const isRolling = !slot.symbol && slot.kind === "textured";
    const visibleSymbol = cell.reel.getVisibleScene()[0];
    if (!Number.isInteger(visibleSymbol)) {
      throw new ReelError(
        `grid cell (${cell.coordinate.x},${cell.coordinate.y}) has no visible symbol.`,
      );
    }
    return Object.freeze({
      x: cell.coordinate.x,
      y: cell.coordinate.y,
      orderIndex: cell.coordinate.orderIndex,
      phase: cell.phase,
      hasClipMask:
        cell.root.mask == null && cell.clipContent.mask === cell.clipMask,
      cellX: cell.root.x,
      cellY: cell.root.y,
      reelX: cell.reel.x,
      reelY: cell.reel.y,
      dimmingOnReel: cell.dimOverlay.parent === cell.reel,
      dimmingOverlayRenderable: cell.dimOverlay.renderable,
      dimmingAlpha: this.getVisibleDimmingAlpha(cell),
      symbolDimmingAlpha: this.getVisibleSymbolBrightness(cell),
      requestedState: state?.requestedState ?? (isRolling ? "spinBlur" : null),
      resolvedState: state?.resolvedState ?? (isRolling ? "spinBlur" : null),
      isOnce: state?.isOnce ?? false,
      onceCompletionCount:
        slot.symbol?.getAnimationCompletionSnapshot().onceCompletionCount ??
        null,
      visibleSymbol,
      presentationValue: slot.presentationValue,
      occupied: true,
    });
  }

  private updateDrop(deltaSeconds: number): boolean {
    const active = this.#activeDrop;
    if (!active) return false;
    active.elapsedSeconds = Math.min(
      active.elapsedSeconds + deltaSeconds,
      active.plan.totalSeconds,
    );
    for (const cell of this.#cells) {
      if (cell.occupied) cell.reel.update(deltaSeconds);
    }
    for (const item of active.movements) {
      item.occurrence.symbol.update(deltaSeconds);
      const { movement } = item;
      const elapsed = active.elapsedSeconds - movement.startSeconds;
      const source =
        movement.sourceY * (this.#cellHeight + this.#rowGap) +
        this.#cellHeight / 2;
      const target =
        movement.targetY * (this.#cellHeight + this.#rowGap) +
        this.#cellHeight / 2;
      if (elapsed <= 0) {
        item.occurrence.symbol.y = source;
      } else if (elapsed < movement.fallSeconds) {
        const progress = elapsed / movement.fallSeconds;
        item.occurrence.symbol.y =
          source +
          (target + movement.overshootPixels - source) * progress * progress;
      } else {
        const settle = Math.min(
          1,
          (elapsed - movement.fallSeconds) / movement.settleSeconds,
        );
        item.occurrence.symbol.y =
          target + movement.overshootPixels * (1 - easeOutCubic(settle));
      }
    }
    if (active.elapsedSeconds < active.plan.totalSeconds) return false;
    this.completeDrop();
    return true;
  }

  private completeDrop(): void {
    const active = this.#activeDrop;
    if (!active) return;
    for (const item of active.movements) {
      const target = this.getCell(item.movement.x, item.movement.targetY);
      if (target.occupied) {
        throw new ReelError(
          `Dropdown target (${item.movement.x},${item.movement.targetY}) is occupied.`,
        );
      }
      item.occurrence.symbol.requestState("normal");
      this.removeChild(item.occurrence.symbol);
      target.reel.placeVisibleOccurrence(item.occurrence);
      target.occupied = true;
      target.phase = "completed";
      this.syncCellRenderOrder(target);
    }
    for (const commit of active.plan.valueCommits) {
      const cell = this.getCell(commit.x, commit.y);
      if (!cell.occupied) {
        throw new ReelError(
          `Cannot commit dropdown presentation value to empty grid cell (${commit.x},${commit.y}).`,
        );
      }
      cell.reel.setVisibleSymbolPresentationValue(0, commit.presentationValue);
    }
    active.signal?.removeEventListener("abort", active.abortListener!);
    this.#activeDrop = null;
    this.setCascadeMovementMaskActive(false);
    active.resolve?.();
  }

  private clearDropOccurrences(): void {
    if (!this.#activeDrop) return;
    for (const item of this.#activeDrop.movements) {
      const cell = this.getCell(item.movement.x, item.movement.targetY);
      cell.reel.releaseDetachedOccurrence(item.occurrence);
    }
    this.#activeDrop = null;
    this.setCascadeMovementMaskActive(false);
  }

  private setCascadeMovementMaskActive(active: boolean): void {
    this.mask = active ? this.#cascadeMovementMask : null;
    this.#cascadeMovementMask.visible = active;
    this.#cascadeMovementMask.renderable = active;
    this.#cascadeMovementMask.includeInBuild = false;
    this.#cascadeMovementMask.measurable = false;
  }

  private syncDimmingStrip(
    cell: RuntimeCell,
    dimming: GridCellDimmingPattern,
    activated = this.#dimmingActivated,
  ): void {
    const reelY = cell.reel.getCurrentY();
    cell.dimOverlay.renderable = cell.dimOverlay.alpha > 0;
    const fractionalY = reelY - Math.floor(reelY);
    cell.dimOverlay.y = -fractionalY * this.#cellHeight;
    for (const row of cell.dimRows) {
      const slot = cell.slotRenderViewsByWindowY.get(row.windowY);
      const dimmingAlpha =
        slot && slot.kind !== "empty"
          ? resolveGridCellDimmingAlpha(dimming, slot.code, activated)
          : 0;
      row.graphic.alpha = dimmingAlpha;
      if (slot) {
        cell.reel.setSlotBrightness(
          row.windowY,
          1 - cell.dimOverlay.alpha * dimmingAlpha,
        );
      }
    }
  }

  private syncLandedDimming(
    cell: RuntimeCell,
    planCell: GridCellReelPlanCell,
    plan: GridCellReelSpinPlan,
  ): void {
    cell.dimOverlay.y = 0;
    cell.dimOverlay.renderable = cell.dimOverlay.alpha > 0;
    for (const row of cell.dimRows) {
      const slot = cell.slotRenderViewsByWindowY.get(row.windowY);
      const dimmingAlpha =
        row.windowY === 0
          ? resolveGridCellDimmingAlpha(
              plan.dimming,
              planCell.targetVisibleSymbols[0],
              this.#dimmingActivated,
            )
          : 0;
      row.graphic.alpha = dimmingAlpha;
      if (slot) {
        cell.reel.setSlotBrightness(
          row.windowY,
          1 - cell.dimOverlay.alpha * dimmingAlpha,
        );
      }
    }
  }

  private setCellClipMask(cell: RuntimeCell, enabled: boolean): void {
    cell.clipContent.mask = enabled ? cell.clipMask : null;
    cell.clipMask.visible = enabled;
  }

  private syncCellRenderOrder(cell: RuntimeCell): void {
    const visibleSlot = cell.slotRenderViewsByWindowY.get(0);
    const renderPriority = visibleSlot?.renderPriority ?? 0;
    cell.root.zIndex =
      renderPriority * (this.#order.length + 1) + cell.coordinate.orderIndex;
  }

  private getVisibleDimmingAlpha(cell: RuntimeCell): number {
    const centerY = this.#cellHeight / 2;
    for (const row of cell.dimRows) {
      const rowTop = cell.dimOverlay.y + row.windowY * this.#cellHeight;
      const rowBottom = rowTop + this.#cellHeight;
      if (centerY >= rowTop && centerY < rowBottom) {
        return cell.dimOverlay.alpha * row.graphic.alpha;
      }
    }
    return 0;
  }

  private getVisibleSymbolBrightness(cell: RuntimeCell): number {
    const centerY = this.#cellHeight / 2;
    for (const row of cell.dimRows) {
      const rowTop = cell.dimOverlay.y + row.windowY * this.#cellHeight;
      const rowBottom = rowTop + this.#cellHeight;
      if (centerY >= rowTop && centerY < rowBottom) {
        const slot = cell.slotRenderViewsByWindowY.get(row.windowY);
        if (!slot || slot.kind === "empty") return 0;
        return cell.reel.getSlotBrightness(row.windowY);
      }
    }
    return 0;
  }
}

const EMPTY_GRID_CELL_COORDINATES: readonly GridCellCoordinate[] =
  Object.freeze([]);

const IDLE_UPDATE_RESULT: RenderGridCellReelSetUpdateResult = Object.freeze({
  spinning: false,
  completed: false,
  activity: null,
  startedCells: EMPTY_GRID_CELL_COORDINATES,
  landedCells: EMPTY_GRID_CELL_COORDINATES,
  activationCells: EMPTY_GRID_CELL_COORDINATES,
});

const COMPLETED_IDLE_UPDATE_RESULT: RenderGridCellReelSetUpdateResult =
  Object.freeze({
    spinning: false,
    completed: true,
    activity: null,
    startedCells: EMPTY_GRID_CELL_COORDINATES,
    landedCells: EMPTY_GRID_CELL_COORDINATES,
    activationCells: EMPTY_GRID_CELL_COORDINATES,
  });

const CONTINUOUS_SPIN_UPDATE_RESULT: RenderGridCellReelSetUpdateResult =
  Object.freeze({
    spinning: true,
    completed: false,
    activity: "spin",
    startedCells: EMPTY_GRID_CELL_COORDINATES,
    landedCells: EMPTY_GRID_CELL_COORDINATES,
    activationCells: EMPTY_GRID_CELL_COORDINATES,
  });

const ACTIVE_SPIN_UPDATE_RESULT: RenderGridCellReelSetUpdateResult =
  CONTINUOUS_SPIN_UPDATE_RESULT;

const COMPLETED_SPIN_UPDATE_RESULT: RenderGridCellReelSetUpdateResult =
  Object.freeze({
    spinning: false,
    completed: true,
    activity: "spin",
    startedCells: EMPTY_GRID_CELL_COORDINATES,
    landedCells: EMPTY_GRID_CELL_COORDINATES,
    activationCells: EMPTY_GRID_CELL_COORDINATES,
  });

const DROPDOWN_UPDATE_RESULT: RenderGridCellReelSetUpdateResult = Object.freeze(
  {
    spinning: false,
    completed: false,
    activity: "dropdown",
    startedCells: EMPTY_GRID_CELL_COORDINATES,
    landedCells: EMPTY_GRID_CELL_COORDINATES,
    activationCells: EMPTY_GRID_CELL_COORDINATES,
  },
);

const EFFECT_SWEEP_UPDATE_RESULT: RenderGridCellReelSetUpdateResult =
  Object.freeze({
    spinning: false,
    completed: false,
    activity: "effect-sweep",
    startedCells: EMPTY_GRID_CELL_COORDINATES,
    landedCells: EMPTY_GRID_CELL_COORDINATES,
    activationCells: EMPTY_GRID_CELL_COORDINATES,
  });

function createDimmingRows(
  cellWidth: number,
  cellHeight: number,
): readonly DimmingRow[] {
  return Object.freeze(
    [-2, -1, 0, 1, 2, 3].map((windowY) =>
      Object.freeze({
        windowY,
        graphic: new Graphics()
          .rect(0, windowY * cellHeight, cellWidth, cellHeight)
          .fill({ color: 0x000000, alpha: 1 }),
      }),
    ),
  );
}

function resetReelSlotSymbolsAndRequestLandingState(cell: RuntimeCell): void {
  for (const slot of cell.reel.getSlotRenderViews()) {
    slot.symbol?.reset();
    if (slot.windowY !== 0 || !slot.symbol) continue;
    if (cell.targetLandingState)
      slot.symbol.requestState(cell.targetLandingState, "immediate");
    else slot.symbol.requestLandingAppear("immediate");
  }
}

function validateGridEmptyTargets(
  plan: GridCellReelSpinPlan,
  values: SymbolPresentationValueMatrix | undefined,
  states: readonly (readonly SymbolStateId[])[] | undefined,
): void {
  for (const cell of plan.cells) {
    if (cell.targetVisibleSymbols[0] !== -1) continue;
    if (
      values?.[cell.x]?.[cell.y] !== undefined &&
      values[cell.x]![cell.y] !== null
    )
      throw new ReelError(
        `Grid cell spin empty target (${cell.x},${cell.y}) must have a null presentation value.`,
      );
    if (states?.[cell.x]?.[cell.y] !== undefined)
      throw new ReelError(
        `Grid cell spin empty target (${cell.x},${cell.y}) cannot have a landing state.`,
      );
  }
}

function resetReelSlotSymbolDimming(cell: RuntimeCell): void {
  cell.reel.resetSlotBrightness();
}

function hasActiveLandingAppear(cell: RuntimeCell): boolean {
  return (
    cell.slotRenderViewsByWindowY.get(0)?.symbol?.isLandingAppearActive() ===
    true
  );
}

function parseScene(
  value: SceneMatrix,
  columns: number,
  rows: number,
): SceneMatrix {
  if (!Array.isArray(value) || value.length !== columns) {
    throw new ReelError(`scene length must be ${columns}.`);
  }
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows) {
        throw new ReelError(`scene[${x}] length must be ${rows}.`);
      }
      return Object.freeze(
        column.map((code, y) => {
          if (!Number.isInteger(code) || code < -1) {
            throw new ReelError(
              `scene[${x}][${y}] must be -1 or a non-negative integer.`,
            );
          }
          return code;
        }),
      );
    }),
  );
}

function normalizePositions(
  positions: readonly { readonly x: number; readonly y: number }[],
  columns: number,
  rows: number,
  duplicateMode: "reject" | "coalesce" = "reject",
): readonly { readonly x: number; readonly y: number }[] {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new ReelError("grid positions must not be empty.");
  }
  const seen = new Set<string>();
  const normalized = positions.map((position, index) => {
    if (
      !Number.isInteger(position.x) ||
      position.x < 0 ||
      position.x >= columns ||
      !Number.isInteger(position.y) ||
      position.y < 0 ||
      position.y >= rows
    ) {
      throw new ReelError(`grid positions[${index}] is out of range.`);
    }
    const key = createCellKey(position.x, position.y);
    if (seen.has(key)) {
      if (duplicateMode === "coalesce") return null;
      throw new ReelError(
        `duplicate grid position (${position.x},${position.y}).`,
      );
    }
    seen.add(key);
    return Object.freeze({ x: position.x, y: position.y });
  });
  return Object.freeze(
    normalized.filter(
      (position): position is { readonly x: number; readonly y: number } =>
        position !== null,
    ),
  );
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function parsePresentationValueMatrix(
  value: SymbolPresentationValueMatrix | undefined,
  columns: number,
  rows: number,
): SymbolPresentationValueMatrix | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== columns) {
    throw new ReelError(`presentationValues length must be ${columns}.`);
  }
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows) {
        throw new ReelError(`presentationValues[${x}] length must be ${rows}.`);
      }
      return Object.freeze(
        column.map((candidate, y) => {
          if (candidate === null) return null;
          if (!Number.isSafeInteger(candidate) || candidate <= 0) {
            throw new ReelError(
              `presentationValues[${x}][${y}] must be a positive safe integer or null.`,
            );
          }
          return candidate;
        }),
      );
    }),
  );
}

function parseStateMatrix(
  value: readonly (readonly SymbolStateId[])[] | undefined,
  columns: number,
  rows: number,
): readonly (readonly SymbolStateId[])[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== columns)
    throw new ReelError(`landingStates length must be ${columns}.`);
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows)
        throw new ReelError(`landingStates[${x}] length must be ${rows}.`);
      return Object.freeze(
        column.map((state, y) => {
          if (typeof state !== "string" || state.length === 0)
            throw new ReelError(
              `landingStates[${x}][${y}] must be a non-empty string.`,
            );
          return state;
        }),
      );
    }),
  );
}

function parseFinalYs(
  value: readonly number[],
  columns: number,
): readonly number[] {
  if (!Array.isArray(value) || value.length !== columns) {
    throw new ReelError(`finalYs length must be ${columns}.`);
  }
  return Object.freeze(
    value.map((finalY, x) => {
      if (!Number.isInteger(finalY)) {
        throw new ReelError(`finalYs[${x}] must be an integer.`);
      }
      return finalY;
    }),
  );
}

function parseOrder(
  value: readonly GridCellCoordinate[],
  columns: number,
  rows: number,
): readonly GridCellCoordinate[] {
  const cellCount = columns * rows;
  if (!Array.isArray(value) || value.length !== cellCount) {
    throw new ReelError(`grid cell order length must be ${cellCount}.`);
  }

  const seenCoordinates = new Set<string>();
  const seenOrderIndexes = new Set<number>();
  return Object.freeze(
    value.map((cell, index) => {
      if (!Number.isInteger(cell.x) || cell.x < 0 || cell.x >= columns) {
        throw new ReelError(`grid cell order[${index}].x is out of range.`);
      }
      if (!Number.isInteger(cell.y) || cell.y < 0 || cell.y >= rows) {
        throw new ReelError(`grid cell order[${index}].y is out of range.`);
      }
      if (
        !Number.isInteger(cell.orderIndex) ||
        cell.orderIndex < 0 ||
        cell.orderIndex >= cellCount
      ) {
        throw new ReelError(
          `grid cell order[${index}].orderIndex is out of range.`,
        );
      }
      if (cell.orderIndex !== index) {
        throw new ReelError(
          `grid cell order[${index}].orderIndex must match its position.`,
        );
      }
      const key = createCellKey(cell.x, cell.y);
      if (seenCoordinates.has(key)) {
        throw new ReelError(
          `duplicate grid cell coordinate (${cell.x},${cell.y}).`,
        );
      }
      if (seenOrderIndexes.has(cell.orderIndex)) {
        throw new ReelError(
          `duplicate grid cell orderIndex ${cell.orderIndex}.`,
        );
      }
      seenCoordinates.add(key);
      seenOrderIndexes.add(cell.orderIndex);
      return Object.freeze({
        x: cell.x,
        y: cell.y,
        orderIndex: cell.orderIndex,
      });
    }),
  );
}

function normalizeContinuousPositions(
  value: readonly GridCellSpinPosition[],
  columns: number,
  rows: number,
  cellsByKey: ReadonlyMap<string, RuntimeCell>,
): readonly (GridCellCoordinate & { readonly startGroupIndex: number })[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ReelError("continuous grid spin positions must not be empty.");
  }
  const seen = new Set<string>();
  let previousStartGroupIndex = -1;
  return Object.freeze(
    value.map((position, index) => {
      if (
        !Number.isInteger(position.x) ||
        position.x < 0 ||
        position.x >= columns ||
        !Number.isInteger(position.y) ||
        position.y < 0 ||
        position.y >= rows
      ) {
        throw new ReelError(
          `continuous grid spin positions[${index}] is out of range.`,
        );
      }
      const key = createCellKey(position.x, position.y);
      if (seen.has(key)) {
        throw new ReelError(
          `duplicate continuous grid spin position (${position.x},${position.y}).`,
        );
      }
      seen.add(key);
      const cell = cellsByKey.get(key);
      if (!cell) {
        throw new ReelError(
          `continuous grid spin position (${position.x},${position.y}) is missing.`,
        );
      }
      const startGroupIndex = position.startGroupIndex ?? index;
      if (
        !Number.isSafeInteger(startGroupIndex) ||
        startGroupIndex < 0 ||
        startGroupIndex < previousStartGroupIndex
      ) {
        throw new ReelError(
          `continuous grid spin positions[${index}].startGroupIndex must be a non-negative non-decreasing safe integer.`,
        );
      }
      previousStartGroupIndex = startGroupIndex;
      return Object.freeze({ ...cell.coordinate, startGroupIndex });
    }),
  );
}

function freezeCoordinates(
  coordinates: readonly GridCellCoordinate[],
): readonly GridCellCoordinate[] {
  return Object.freeze(
    coordinates.map((coordinate) =>
      Object.freeze({
        x: coordinate.x,
        y: coordinate.y,
        orderIndex: coordinate.orderIndex,
      }),
    ),
  );
}

function createCellKey(x: number, y: number): string {
  return `${x}:${y}`;
}

function createEffectKey(effectId: string, x: number, y: number): string {
  return `${effectId}:${x}:${y}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive integer.`);
  }
  return value as number;
}

function assertPositiveNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive number.`);
  }
  return value as number;
}

function assertNonNegativeNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) < 0) {
    throw new ReelError(`${label} must be a non-negative number.`);
  }
  return value as number;
}
