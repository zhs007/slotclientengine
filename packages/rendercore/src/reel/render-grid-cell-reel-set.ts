import { Container, Graphics } from "pixi.js";
import { assertValidDeltaSeconds } from "../symbol/ani.js";
import { ReelError } from "./errors.js";
import { normalizeGridCellReelOffsetMatrix } from "./grid-cell-reel-offsets.js";
import { createReelLayout } from "./layout.js";
import { RenderReel } from "./render-reel.js";
import type {
  GridCellCoordinate,
  GridCellReelOffsetMatrix,
  GridCellReelPhase,
  GridCellReelPlanCell,
  GridCellReelSpinPlan,
  RenderGridCellReelCellSnapshot,
  RenderGridCellReelSetOptions,
  RenderGridCellReelSetSnapshot,
  RenderGridCellReelSetUpdateResult,
  ReelSymbolRegistry,
} from "./types.js";
import type { LogicReels, SceneMatrix } from "@slotclientengine/logiccore";

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
  readonly #order: readonly GridCellCoordinate[];
  readonly #cells: readonly RuntimeCell[];
  readonly #cellsByKey: ReadonlyMap<string, RuntimeCell>;
  #spinPlan: GridCellReelSpinPlan | null = null;
  #elapsedMs = 0;

  constructor(options: RenderGridCellReelSetOptions) {
    super();
    this.#columns = assertPositiveInteger(options.columns, "columns");
    this.#rows = assertPositiveInteger(options.rows, "rows");
    this.#cellWidth = assertPositiveNumber(options.cellWidth, "cellWidth");
    this.#cellHeight = assertPositiveNumber(options.cellHeight, "cellHeight");
    if (options.reels.getReelCount() !== this.#columns) {
      throw new ReelError(
        `grid columns ${this.#columns} do not match reels reel count ${options.reels.getReelCount()}.`,
      );
    }
    this.#reels = options.reels;
    this.#order = parseOrder(options.order, this.#columns, this.#rows);

    const cells = this.#order.map((coordinate) =>
      this.createRuntimeCell(coordinate, options.registry),
    );
    this.#cells = Object.freeze(cells);
    this.#cellsByKey = new Map(
      cells.map((cell) => [
        createCellKey(cell.coordinate.x, cell.coordinate.y),
        cell,
      ]),
    );
  }

  resetToScene(
    scene: SceneMatrix,
    finalYs: readonly number[],
    cellReelOffsets?: GridCellReelOffsetMatrix,
  ): void {
    const parsedScene = parseScene(scene, this.#columns, this.#rows);
    const parsedFinalYs = parseFinalYs(finalYs, this.#columns);
    const parsedCellReelOffsets = normalizeGridCellReelOffsetMatrix(
      cellReelOffsets,
      this.#columns,
      this.#rows,
    );
    this.#spinPlan = null;
    this.#elapsedMs = 0;

    for (const cell of this.#cells) {
      const { x, y } = cell.coordinate;
      const cellFinalY = this.#reels.normalizeY(
        x,
        parsedFinalYs[x] + y + parsedCellReelOffsets[x][y],
      );
      cell.reel.resetToVisibleSymbols([parsedScene[x][y]], cellFinalY);
      cell.planCell = null;
      cell.phase = "completed";
      cell.hasStartedThisSpin = false;
      cell.hasLandedThisSpin = false;
      cell.fadeOutElapsedMs = 0;
      cell.fadeOutStartAlpha = 0;
      cell.dimOverlay.alpha = 0;
      cell.dimOverlay.y = 0;
      this.setCellClipMask(cell, false);
    }
  }

  spin(plan: GridCellReelSpinPlan): void {
    if (this.#spinPlan) {
      throw new ReelError(
        "Cannot start a new grid cell reel spin while another spin is active.",
      );
    }
    this.assertPlanMatchesRuntime(plan);

    this.#spinPlan = plan;
    this.#elapsedMs = 0;
    for (const cell of this.#cells) {
      const planCell = plan.cells[cell.coordinate.orderIndex];
      cell.planCell = planCell;
      cell.phase = "waiting";
      cell.hasStartedThisSpin = false;
      cell.hasLandedThisSpin = false;
      cell.fadeOutElapsedMs = 0;
      cell.fadeOutStartAlpha = 0;
      cell.dimOverlay.alpha = 0;
      cell.dimOverlay.y = 0;
      this.setCellClipMask(cell, false);
    }
  }

  update(deltaSeconds: number): RenderGridCellReelSetUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    const previousElapsedMs = this.#elapsedMs;
    if (this.#spinPlan) {
      this.#elapsedMs += deltaSeconds * 1000;
      for (const cell of this.#cells) {
        this.updateCell(cell, previousElapsedMs, this.#elapsedMs);
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

  getSnapshot(): RenderGridCellReelSetSnapshot {
    return Object.freeze({
      spinning: this.#spinPlan !== null,
      completed:
        this.#spinPlan === null &&
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
    });
    reel.x = 0;

    const dimOverlay = new Container();
    const dimRows = createDimmingRows(this.#cellWidth, this.#cellHeight);
    dimOverlay.alpha = 0;
    dimOverlay.y = 0;

    reel.addChild(dimOverlay);
    dimOverlay.addChild(...dimRows.map((row) => row.graphic));
    clipContent.addChild(reel);
    root.addChild(clipMask, clipContent);
    this.addChild(root);

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
      this.setCellClipMask(cell, true);
      cell.reel.start(planCell.axisPlan, {
        targetVisibleSymbols: planCell.targetVisibleSymbols,
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
      if (result.landed) {
        cell.reel.resetToVisibleSymbols(
          planCell.targetVisibleSymbols,
          planCell.axisPlan.finalY,
        );
        resetReelSlotSymbols(cell);
        this.syncLandedDimming(cell, planCell);
        this.setCellClipMask(cell, false);
        cell.phase = "landed";
        cell.hasLandedThisSpin = true;
        cell.fadeOutElapsedMs = 0;
        cell.fadeOutStartAlpha = cell.dimOverlay.alpha;
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
      this.syncDimmingStrip(cell, plan);
      return;
    }
    const progress = clamp01((elapsedMs - planCell.startAtMs) / fadeInMs);
    cell.dimOverlay.alpha = progress;
    this.syncDimmingStrip(cell, plan);
  }

  private updateLanded(
    cell: RuntimeCell,
    plan: GridCellReelSpinPlan,
    deltaMs: number,
  ): void {
    if (cell.planCell) {
      this.syncLandedDimming(cell, cell.planCell);
    }
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

    if (cell.dimOverlay.alpha <= 0) {
      cell.dimOverlay.alpha = 0;
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
    if (plan.cells.length !== this.#cells.length) {
      throw new ReelError(
        `grid plan cells length must be ${this.#cells.length}.`,
      );
    }
    const seen = new Set<string>();
    for (const [index, planCell] of plan.cells.entries()) {
      if (planCell.orderIndex !== index) {
        throw new ReelError(
          `grid plan cells[${index}].orderIndex must match its position.`,
        );
      }
      const key = createCellKey(planCell.x, planCell.y);
      if (seen.has(key)) {
        throw new ReelError(
          `duplicate grid plan cell (${planCell.x},${planCell.y}).`,
        );
      }
      seen.add(key);
      const cell = this.#cells[index];
      if (
        !cell ||
        planCell.x !== cell.coordinate.x ||
        planCell.y !== cell.coordinate.y
      ) {
        throw new ReelError(
          `grid plan cells[${index}] does not match runtime order.`,
        );
      }
    }
  }

  private getCell(x: number, y: number): RuntimeCell {
    const cell = this.#cellsByKey.get(createCellKey(x, y));
    if (!cell) {
      throw new ReelError(`Missing grid cell (${x},${y}).`);
    }
    return cell;
  }

  private snapshotCell(cell: RuntimeCell): RenderGridCellReelCellSnapshot {
    const slot = cell.reel
      .getSlotSnapshots()
      .find((candidate) => candidate.container.visible);
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
      dimmingAlpha: this.getVisibleDimmingAlpha(cell),
      requestedState: slot?.requestedState ?? null,
      visibleSymbol,
    });
  }

  private syncDimmingStrip(
    cell: RuntimeCell,
    plan: GridCellReelSpinPlan,
  ): void {
    const reelY = cell.reel.getSnapshot().currentY;
    const baseY = Math.floor(reelY);
    const fractionalY = reelY - baseY;
    cell.dimOverlay.y = -fractionalY * this.#cellHeight;
    for (const row of cell.dimRows) {
      row.graphic.alpha =
        (baseY + row.windowY + cell.coordinate.orderIndex) % 2 === 0
          ? plan.dimming.evenAlpha
          : plan.dimming.oddAlpha;
    }
  }

  private syncLandedDimming(
    cell: RuntimeCell,
    planCell: GridCellReelPlanCell,
  ): void {
    cell.dimOverlay.y = 0;
    for (const row of cell.dimRows) {
      row.graphic.alpha = row.windowY === 0 ? planCell.dimmingAlpha : 0;
    }
  }

  private setCellClipMask(cell: RuntimeCell, enabled: boolean): void {
    cell.clipContent.mask = enabled ? cell.clipMask : null;
    cell.clipMask.visible = enabled;
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

function resetReelSlotSymbols(cell: RuntimeCell): void {
  for (const slot of cell.reel.getSlotSnapshots()) {
    slot.symbol?.reset();
  }
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
