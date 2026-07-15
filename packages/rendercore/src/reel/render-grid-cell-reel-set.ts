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
  RenderGridCellReelCellSnapshot,
  RenderGridCellReelSetOptions,
  RenderGridCellReelSetSpinOptions,
  RenderGridCellReelSetSnapshot,
  RenderGridCellReelSetUpdateResult,
  RenderVisibleSymbolGeometrySnapshot,
  RenderVisibleSymbolStateSnapshot,
  ReelSymbolRegistry,
  SymbolPresentationValueMatrix,
  RenderReelVisibleOccurrence,
} from "./types.js";
import type { LogicReels, SceneMatrix } from "@slotclientengine/logiccore";
import type { SymbolStateId } from "../symbol/index.js";

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
  readonly #bounceStrength: number | undefined;
  readonly #order: readonly GridCellCoordinate[];
  readonly #cells: readonly RuntimeCell[];
  readonly #cellsByKey: ReadonlyMap<string, RuntimeCell>;
  readonly #cascadeMovementMask: Graphics;
  #spinPlan: GridCellReelSpinPlan | null = null;
  #activeDrop: ActiveDrop | null = null;
  #elapsedMs = 0;

  constructor(options: RenderGridCellReelSetOptions) {
    super();
    this.sortableChildren = true;
    this.#columns = assertPositiveInteger(options.columns, "columns");
    this.#rows = assertPositiveInteger(options.rows, "rows");
    this.#cellWidth = assertPositiveNumber(options.cellWidth, "cellWidth");
    this.#cellHeight = assertPositiveNumber(options.cellHeight, "cellHeight");
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
        this.#columns * this.#cellWidth,
        this.#rows * this.#cellHeight,
      )
      .fill({ color: 0xffffff, alpha: 1 });
    this.#cascadeMovementMask.visible = false;
    this.#cascadeMovementMask.renderable = false;
    this.#cascadeMovementMask.includeInBuild = false;
    this.#cascadeMovementMask.measurable = false;
    this.addChild(this.#cascadeMovementMask);
  }

  resetToScene(
    scene: SceneMatrix,
    finalYs: readonly number[],
    cellReelOffsets?: GridCellReelOffsetMatrix,
    presentationValues?: SymbolPresentationValueMatrix,
  ): void {
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
    this.assertPlanMatchesRuntime(plan);
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
      });
    }
    const previousElapsedMs = this.#elapsedMs;
    if (this.#spinPlan) {
      this.#elapsedMs += deltaSeconds * 1000;
      for (const cell of this.#cells) {
        this.updateCell(cell, previousElapsedMs, this.#elapsedMs);
      }
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
      startedCells: freezeCoordinates(
        this.#cells
          .filter((cell) => cell.hasStartedThisSpin)
          .map((cell) => cell.coordinate),
      ),
      landedCells: freezeCoordinates(
        this.#cells
          .filter((cell) => cell.hasLandedThisSpin)
          .map((cell) => cell.coordinate),
      ),
    });
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

  requestVisibleSymbolState(x: number, y: number, state: SymbolStateId): void {
    this.assertStopped("request visible symbol state");
    const cell = this.getCell(x, y);
    if (!cell.occupied) {
      throw new ReelError(
        `Cannot request state for empty grid cell (${x},${y}).`,
      );
    }
    cell.reel.requestVisibleSymbolState(0, state);
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
        movement.x * this.#cellWidth + this.#cellWidth / 2,
        movement.sourceY * this.#cellHeight + this.#cellHeight / 2,
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
  ): void {
    for (const position of positions) {
      this.requestVisibleSymbolState(position.x, position.y, state);
    }
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
      spinning: this.#spinPlan !== null || this.#activeDrop !== null,
      completed:
        this.#spinPlan === null &&
        this.#activeDrop === null &&
        this.#cells.every(
          (cell) => cell.phase === "completed" || cell.phase === "idle",
        ),
      visibleScene: this.getVisibleScene(),
      cells: Object.freeze(this.#cells.map((cell) => this.snapshotCell(cell))),
    });
  }

  private createRuntimeCell(
    coordinate: GridCellCoordinate,
    registry: ReelSymbolRegistry,
    presentationValueResolver: RenderGridCellReelSetOptions["presentationValueResolver"],
  ): RuntimeCell {
    const root = new Container();
    root.x = coordinate.x * this.#cellWidth;
    root.y = coordinate.y * this.#cellHeight;

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
        this.syncLandedDimming(cell, planCell);
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
      this.syncLandedDimming(cell, cell.planCell);
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
    if (this.#spinPlan || this.#activeDrop) {
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
      const source = movement.sourceY * this.#cellHeight + this.#cellHeight / 2;
      const target = movement.targetY * this.#cellHeight + this.#cellHeight / 2;
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
      item.occurrence.symbol.returnToDefaultState();
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
          ? resolveGridCellDimmingAlpha(plan.dimming, slot.code)
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
  ): void {
    cell.dimOverlay.y = 0;
    cell.dimOverlay.renderable = cell.dimOverlay.alpha > 0;
    for (const row of cell.dimRows) {
      const dimmingAlpha = row.windowY === 0 ? planCell.dimmingAlpha : 0;
      row.graphic.alpha = dimmingAlpha;
      const slot = cell.reel
        .getSlotSnapshots()
        .find((candidate) => candidate.windowY === row.windowY);
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
  if (
    actual.length !== expected.length ||
    actual.some(
      (column, x) =>
        column.length !== expected[x]?.length ||
        column.some((value, y) => value !== expected[x]?.[y]),
    )
  ) {
    throw new ReelError(`${label} does not match cascade plan.`);
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
