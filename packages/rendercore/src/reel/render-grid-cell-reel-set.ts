import { Container, Graphics } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { normalizeGridCellReelOffsetMatrix } from "./grid-cell-reel-offsets.js";
import { resolveGridCellDimmingAlpha } from "./grid-cell-spin-plan.js";
import { createReelLayout } from "./layout.js";
import { RenderReel } from "./render-reel.js";
import type {
  GridCellCoordinate,
  GridCellCascadeDropMovement,
  GridCellCascadeDropPlan,
  GridCellCascadeScene,
  GridCellCascadeValueMatrix,
  GridCellReelOffsetMatrix,
  GridCellReelPhase,
  GridCellReelPlanCell,
  GridCellReelSpinPlan,
  GridCellEffectSweepPlan,
  RenderGridCellReelCellSnapshot,
  RenderGridCellReelSetOptions,
  RenderGridCellReelSetSpinOptions,
  RenderGridCellReelSetSnapshot,
  RenderGridCellReelSetUpdateResult,
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
  PreparedVisibleOccurrenceReplacement,
  PreparedGridCellVisibleOccurrenceTransferBatch,
  GridCellVisibleOccurrenceTransfer,
  ReelSymbolRegistry,
  SymbolPresentationValueMatrix,
  RenderReelVisibleOccurrence,
} from "./types.js";
import type { GridCellEffectController } from "./grid-cell-effect-player.js";
import type { LogicReels, SceneMatrix } from "@slotclientengine/logiccore";
import type {
  SymbolStateId,
  SymbolStateTransitionMode,
} from "../symbol/index.js";

interface RuntimeCell {
  readonly coordinate: GridCellCoordinate;
  readonly root: Container;
  readonly clipContent: Container;
  readonly reel: RenderReel;
  readonly clipMask: Graphics;
  readonly dimOverlay: Container;
  readonly dimRows: readonly DimmingRow[];
  planCell: GridCellReelPlanCell | null;
  phase: GridCellReelPhase;
  hasStartedThisSpin: boolean;
  hasLandedThisSpin: boolean;
  fadeOutElapsedMs: number;
  fadeOutStartAlpha: number;
  targetPresentationValue: number | null;
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
}

interface ActiveEffectSweep {
  readonly plan: GridCellEffectSweepPlan;
  readonly started: Set<string>;
  readonly completed: Set<string>;
  elapsedMs: number;
}

interface DimmingRow {
  readonly windowY: number;
  readonly graphic: Graphics;
}

export class RenderGridCellReelSet extends Container {
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
  readonly #transferLayer: Container;
  readonly #effectController: GridCellEffectController | null;
  #spinPlan: GridCellReelSpinPlan | null = null;
  #activeDrop: ActiveDrop | null = null;
  #activeEffectSweep: ActiveEffectSweep | null = null;
  #startedEffects = new Set<string>();
  #completedEffects = new Set<string>();
  #activationGateOpen = false;
  #dimmingActivated = false;
  #elapsedMs = 0;
  #activeTransferRollback: (() => void) | null = null;

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
    this.#transferLayer = new Container();
    this.#transferLayer.sortableChildren = true;
    this.#transferLayer.zIndex = this.#cells.length * 20_000;
    this.addChild(this.#transferLayer);
    this.#effectController = options.effectController ?? null;
    if (this.#effectController) {
      this.#effectController.container.zIndex = this.#cells.length * 10_000;
      this.addChild(this.#effectController.container);
    }
  }

  prepareEffects(): Promise<void> | void {
    return this.#effectController?.prepare();
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
    this.#activeTransferRollback?.();
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
      cell.occupied = true;
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
    if (this.#spinPlan) {
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
      cell.dimOverlay.alpha = 0;
      cell.dimOverlay.y = 0;
      cell.dimOverlay.renderable = false;
      resetReelSlotSymbolDimming(cell);
      this.setCellClipMask(cell, false);
      this.syncCellRenderOrder(cell);
    }
  }

  update(deltaSeconds: number): RenderGridCellReelSetUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    if (this.#activeDrop) {
      const completed = this.updateDrop(deltaSeconds);
      return Object.freeze({
        spinning: false,
        completed,
        activity: completed ? null : "dropdown",
        startedCells: Object.freeze([]),
        landedCells: Object.freeze([]),
        activationCells: Object.freeze([]),
      });
    }
    if (this.#activeEffectSweep) {
      const completed = this.updateEffectSweep(deltaSeconds);
      return Object.freeze({
        spinning: false,
        completed,
        activity: completed ? null : "effect-sweep",
        startedCells: Object.freeze([]),
        landedCells: Object.freeze([]),
        activationCells: Object.freeze([]),
      });
    }
    let startedCells: readonly GridCellCoordinate[] = Object.freeze([]);
    let landedCells: readonly GridCellCoordinate[] = Object.freeze([]);
    let activationCells: readonly GridCellCoordinate[] = Object.freeze([]);
    if (this.#spinPlan) {
      const edges = this.updateSpinTimeline(deltaSeconds);
      startedCells = freezeCoordinates(edges.started);
      landedCells = freezeCoordinates(edges.landed);
      activationCells = freezeCoordinates(edges.activated);
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

    return Object.freeze({
      spinning: this.#spinPlan !== null,
      completed,
      activity: this.#spinPlan !== null || completed ? "spin" : null,
      startedCells,
      landedCells,
      activationCells,
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

  hasVisibleSymbolStateCapability(
    x: number,
    y: number,
    state: SymbolStateId,
  ): boolean {
    this.assertStopped("query visible symbol state capability");
    const cell = this.getCell(x, y);
    if (!cell.occupied) return false;
    const slot = cell.reel
      .getSlotSnapshots()
      .find((candidate) => candidate.windowY === 0);
    return slot?.symbol?.hasAnimationCapability(state) ?? false;
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
      cell.reel.releaseVisibleOccurrence();
      cell.occupied = false;
      cell.phase = "completed";
    }
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
      const symbol = cell.reel
        .getSlotSnapshots()
        .find((slot) => slot.windowY === 0)?.symbol;
      if (symbol) {
        symbol.alpha = 1;
        symbol.tint = createBrightnessTint(
          isHighlighted ? 1 : 1 - dimmingAlpha,
        );
      }
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
            const slot = cell.reel
              .getSlotSnapshots()
              .find((candidate) => candidate.windowY === 0);
            return slot?.presentationValue ?? null;
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
    assertCascadeMatrixEqual(
      this.getVisibleScene(),
      plan.sourceScene,
      "dropdown source scene",
    );
    assertCascadeMatrixEqual(
      this.getCascadeValues(),
      plan.sourceValues,
      "dropdown source values",
    );
    const active: ActiveDropMovement[] = [];
    for (const movement of plan.movements) {
      const cell =
        movement.kind === "existing"
          ? this.getCell(movement.x, movement.sourceY)
          : this.getCell(movement.x, movement.targetY);
      if (movement.kind === "existing" && !cell.occupied) {
        throw new ReelError(
          `Dropdown source (${movement.x},${movement.sourceY}) is empty.`,
        );
      }
      const occurrence =
        movement.kind === "existing"
          ? cell.reel.takeVisibleOccurrence()
          : cell.reel.createDetachedOccurrence(
              movement.code,
              movement.presentationValue,
            );
      if (
        occurrence.code !== movement.code ||
        occurrence.presentationValue !== movement.presentationValue
      ) {
        throw new ReelError(
          `Dropdown source occurrence changed at (${movement.x},${movement.sourceY}).`,
        );
      }
      if (movement.kind === "existing") cell.occupied = false;
      if (occurrence.symbol.hasAnimationCapability("dropdown")) {
        occurrence.symbol.requestState("dropdown");
      } else {
        occurrence.symbol.requestState("normal");
      }
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

  setVisibleSymbolPresentationValue(
    x: number,
    y: number,
    value: number | null,
  ): void {
    this.assertStopped("set visible symbol presentation value");
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      throw new ReelError(
        `Cannot set presentation value for empty grid cell (${x},${y}).`,
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

  prepareVisibleOccurrenceReplacement(options: {
    readonly x: number;
    readonly y: number;
    readonly expectedCode: number;
    readonly outputCode: number;
    readonly outputPresentationValue: number | null;
  }): PreparedVisibleOccurrenceReplacement {
    this.assertStopped("prepare visible occurrence replacement");
    const cell = this.getCell(options.x, options.y);
    if (!cell.occupied) {
      throw new ReelError(
        `Cannot replace empty grid cell (${options.x},${options.y}).`,
      );
    }
    const input = cell.reel.getVisibleSymbolStateSnapshot(0);
    if (input.code !== options.expectedCode) {
      throw new ReelError(
        `Cannot replace grid cell (${options.x},${options.y}): expected code ${options.expectedCode}, received ${input.code}.`,
      );
    }
    const output = cell.reel.createDetachedOccurrence(
      options.outputCode,
      options.outputPresentationValue,
    );
    let state: "prepared" | "committed" | "rolled-back" = "prepared";
    const rollback = (): void => {
      if (state !== "prepared") return;
      cell.reel.releaseDetachedOccurrence(output);
      state = "rolled-back";
    };
    return Object.freeze({
      x: options.x,
      y: options.y,
      inputCode: options.expectedCode,
      outputCode: options.outputCode,
      commit: (): void => {
        if (state === "committed") return;
        if (state !== "prepared") {
          throw new ReelError(
            `Cannot commit rolled-back replacement at grid cell (${options.x},${options.y}).`,
          );
        }
        this.assertStopped("commit visible occurrence replacement");
        const current = cell.reel.getVisibleSymbolStateSnapshot(0);
        if (current.code !== options.expectedCode) {
          throw new ReelError(
            `Cannot commit replacement at grid cell (${options.x},${options.y}): expected code ${options.expectedCode}, received ${current.code}.`,
          );
        }
        const previous = cell.reel.takeVisibleOccurrence();
        try {
          cell.reel.placeVisibleOccurrence(output);
        } catch (error) {
          cell.reel.placeVisibleOccurrence(previous);
          throw error;
        }
        cell.reel.releaseDetachedOccurrence(previous);
        state = "committed";
      },
      rollback,
      destroy: rollback,
    });
  }

  prepareVisibleOccurrenceTransferBatch(options: {
    readonly transfers: readonly GridCellVisibleOccurrenceTransfer[];
  }): PreparedGridCellVisibleOccurrenceTransferBatch {
    this.assertStopped("prepare visible occurrence transfer batch");
    if (!Array.isArray(options.transfers) || options.transfers.length === 0)
      throw new ReelError(
        "Visible occurrence transfer batch must contain transfers.",
      );
    if (this.#activeTransferRollback)
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
      const sourceSnapshot = source.reel.getVisibleSymbolStateSnapshot(0);
      const targetSnapshot = target.reel.getVisibleSymbolStateSnapshot(0);
      if (sourceSnapshot.code !== transfer.expectedSourceCode)
        throw new ReelError(
          `Transfer[${index}] expected source code ${transfer.expectedSourceCode}, received ${sourceSnapshot.code}.`,
        );
      if (targetSnapshot.code !== transfer.expectedTargetCode)
        throw new ReelError(
          `Transfer[${index}] expected target code ${transfer.expectedTargetCode}, received ${targetSnapshot.code}.`,
        );
      return { transfer, source, target };
    });
    const prepared: Array<{
      readonly transfer: GridCellVisibleOccurrenceTransfer;
      readonly source: RuntimeCell;
      readonly target: RuntimeCell;
      readonly sourceReplacement: RenderReelVisibleOccurrence;
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
          sourceReplacement: item.source.reel.createDetachedOccurrence(
            item.transfer.sourceReplacementCode,
            item.transfer.sourceReplacementPresentationValue,
          ),
          moving: null,
        });
    } catch (error) {
      for (const item of prepared)
        item.source.reel.releaseDetachedOccurrence(item.sourceReplacement);
      throw error;
    }
    let state: "prepared" | "started" | "committed" | "rolled-back" =
      "prepared";
    const rollback = (): void => {
      if (state === "committed" || state === "rolled-back") return;
      for (const item of prepared) {
        if (item.moving) {
          item.source.reel.restoreDetachedVisibleOccurrence(item.moving);
          item.moving = null;
        }
        item.source.reel.releaseDetachedOccurrence(item.sourceReplacement);
      }
      this.#transferLayer.removeChildren();
      this.#cascadeMovementMask.visible = false;
      this.#cascadeMovementMask.renderable = false;
      this.#activeTransferRollback = null;
      state = "rolled-back";
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
        this.#activeTransferRollback = rollback;
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
          rollback();
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
      commit: (): void => {
        if (state !== "started")
          throw new ReelError(
            "Visible occurrence transfer commit requires a started batch.",
          );
        for (const item of prepared) {
          const moving = item.source.reel.takeVisibleOccurrence();
          const overwritten = item.target.reel.takeVisibleOccurrence();
          item.target.reel.placeVisibleOccurrence(moving);
          item.source.reel.placeVisibleOccurrence(item.sourceReplacement);
          item.target.reel.releaseDetachedOccurrence(overwritten);
          item.moving = null;
        }
        this.#transferLayer.removeChildren();
        this.#transferLayer.mask = null;
        this.#cascadeMovementMask.visible = false;
        this.#cascadeMovementMask.renderable = false;
        this.#activeTransferRollback = null;
        state = "committed";
      },
      rollback,
      destroy: rollback,
    }) satisfies PreparedGridCellVisibleOccurrenceTransferBatch;
    return batch;
  }

  getVisibleSymbolStateSnapshot(
    x: number,
    y: number,
  ): RenderVisibleSymbolStateSnapshot {
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      throw new ReelError(`Cannot snapshot empty grid cell (${x},${y}).`);
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
      throw new ReelError(
        `Cannot read geometry for empty grid cell (${x},${y}).`,
      );
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
      spinning:
        this.#spinPlan !== null ||
        this.#activeDrop !== null ||
        this.#activeEffectSweep !== null,
      completed:
        this.#spinPlan === null &&
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

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.#activeTransferRollback?.();
    this.#effectController?.destroy();
    super.destroy(options);
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
      coordinate,
      root,
      clipContent,
      reel,
      clipMask,
      dimOverlay,
      dimRows,
      planCell: null,
      phase: "idle",
      hasStartedThisSpin: false,
      hasLandedThisSpin: false,
      fadeOutElapsedMs: 0,
      fadeOutStartAlpha: 0,
      targetPresentationValue: null,
      occupied: true,
    };
  }

  private updateSpinTimeline(deltaSeconds: number): {
    readonly started: readonly GridCellCoordinate[];
    readonly landed: readonly GridCellCoordinate[];
    readonly activated: readonly GridCellCoordinate[];
  } {
    const plan = this.#spinPlan;
    if (!plan) {
      return { started: [], landed: [], activated: [] };
    }
    const endMs = this.#elapsedMs + deltaSeconds * 1000;
    const started: GridCellCoordinate[] = [];
    const landed: GridCellCoordinate[] = [];
    const activated: GridCellCoordinate[] = [];
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
    return { started, landed, activated };
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
    if (!planCell || !plan) {
      return;
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
        resetReelSlotSymbolsAndRequestLandingAppear(cell);
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
        this.syncDimmingStrip(cell, plan);
      }
      if (cell.phase === "landed" && elapsedMs > planCell.stopAtMs) {
        const postLandDeltaMs =
          elapsedMs - Math.max(previousElapsedMs, planCell.stopAtMs);
        this.updateLanded(cell, plan, Math.max(0, postLandDeltaMs));
      }
      return;
    }

    if (cell.phase === "landed") {
      this.updateLanded(cell, plan, elapsedMs - previousElapsedMs);
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
        visibleSymbol: -1,
        presentationValue: null,
        occupied: false,
      });
    }
    const slot = cell.reel
      .getSlotSnapshots()
      .find((candidate) => candidate.windowY === 0);
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
      requestedState: slot?.requestedState ?? null,
      visibleSymbol,
      presentationValue: slot?.presentationValue ?? null,
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
    this.#activeDrop = null;
    this.setCascadeMovementMaskActive(false);
    assertCascadeMatrixEqual(
      this.getVisibleScene(),
      active.plan.targetScene,
      "dropdown target scene",
    );
    assertCascadeMatrixEqual(
      this.getCascadeValues(),
      active.plan.targetValues,
      "dropdown target values",
    );
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
    plan: GridCellReelSpinPlan,
  ): void {
    const reelY = cell.reel.getSnapshot().currentY;
    cell.dimOverlay.renderable = cell.dimOverlay.alpha > 0;
    const fractionalY = reelY - Math.floor(reelY);
    cell.dimOverlay.y = -fractionalY * this.#cellHeight;
    const slotsByWindowY = new Map(
      cell.reel.getSlotSnapshots().map((slot) => [slot.windowY, slot] as const),
    );
    for (const row of cell.dimRows) {
      const slot = slotsByWindowY.get(row.windowY);
      const dimmingAlpha =
        slot && slot.kind !== "empty"
          ? resolveGridCellDimmingAlpha(
              plan.dimming,
              slot.code,
              this.#dimmingActivated,
            )
          : 0;
      row.graphic.alpha = dimmingAlpha;
      if (slot?.symbol) {
        slot.symbol.alpha = 1;
        slot.symbol.tint = createBrightnessTint(
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
      const slot = cell.reel
        .getSlotSnapshots()
        .find((candidate) => candidate.windowY === row.windowY);
      const dimmingAlpha =
        row.windowY === 0
          ? resolveGridCellDimmingAlpha(
              plan.dimming,
              planCell.targetVisibleSymbols[0],
              this.#dimmingActivated,
            )
          : 0;
      row.graphic.alpha = dimmingAlpha;
      if (slot?.symbol) {
        slot.symbol.alpha = 1;
        slot.symbol.tint = createBrightnessTint(
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
    const visibleSlot = cell.reel
      .getSlotSnapshots()
      .find((slot) => slot.windowY === 0);
    const renderPriority = visibleSlot?.symbol?.renderPriority ?? 0;
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
        const symbol = cell.reel
          .getSlotSnapshots()
          .find((slot) => slot.windowY === row.windowY)?.symbol;
        if (!symbol) return 0;
        return (((symbol.tint as number) >> 16) & 0xff) / 255;
      }
    }
    return 0;
  }
}

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

function resetReelSlotSymbolsAndRequestLandingAppear(cell: RuntimeCell): void {
  for (const slot of cell.reel.getSlotSnapshots()) {
    slot.symbol?.reset();
    if (slot.windowY === 0) slot.symbol?.requestLandingAppear();
  }
}

function resetReelSlotSymbolDimming(cell: RuntimeCell): void {
  for (const slot of cell.reel.getSlotSnapshots()) {
    if (slot.symbol) {
      slot.symbol.alpha = 1;
      slot.symbol.tint = 0xffffff;
    }
  }
}

function createBrightnessTint(brightness: number): number {
  const channel = Math.round(clamp01(brightness) * 255);
  return (channel << 16) | (channel << 8) | channel;
}

function hasActiveLandingAppear(cell: RuntimeCell): boolean {
  return cell.reel
    .getSlotSnapshots()
    .some(
      (slot) =>
        slot.windowY === 0 && slot.symbol?.isLandingAppearActive() === true,
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
          if (!Number.isInteger(code) || code < 0) {
            throw new ReelError(
              `scene[${x}][${y}] must be a non-negative integer.`,
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
): readonly { readonly x: number; readonly y: number }[] {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new ReelError("grid positions must not be empty.");
  }
  const seen = new Set<string>();
  return Object.freeze(
    positions.map((position, index) => {
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
        throw new ReelError(
          `duplicate grid position (${position.x},${position.y}).`,
        );
      }
      seen.add(key);
      return Object.freeze({ x: position.x, y: position.y });
    }),
  );
}

function assertCascadeMatrixEqual(
  actual: readonly (readonly (number | null)[])[],
  expected: readonly (readonly (number | null)[])[],
  label: string,
): void {
  if (actual.length !== expected.length) {
    throw new ReelError(
      `${label} column count differs: actual=${actual.length}; expected=${expected.length}.`,
    );
  }
  for (const [x, column] of actual.entries()) {
    const expectedColumn = expected[x];
    if (!expectedColumn || column.length !== expectedColumn.length) {
      throw new ReelError(
        `${label}[${x}] row count differs: actual=${column.length}; expected=${expectedColumn?.length ?? "missing"}.`,
      );
    }
    for (const [y, value] of column.entries()) {
      const expectedValue = expectedColumn[y];
      if (value !== expectedValue) {
        throw new ReelError(
          `${label}[${x}][${y}] differs: actual(runtime)=${String(value)}; expected(plan)=${String(expectedValue)}.`,
        );
      }
    }
  }
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
