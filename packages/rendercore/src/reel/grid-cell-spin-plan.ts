import { ReelError } from "./errors.js";
import type {
  GridCellCoordinate,
  GridCellDimmingPattern,
  GridCellReelPlanCell,
  GridCellReelSpinPlan,
  GridCellReelSpinTiming,
  ReelAxisSpinPlan,
  ReelSpinDirection,
} from "./types.js";
import type { LogicReels, SceneMatrix } from "@slotclientengine/logiccore";

export function createGridCellReelSpinPlan(options: {
  readonly reels: LogicReels;
  readonly finalYs: readonly number[];
  readonly targetScene: SceneMatrix;
  readonly columns: number;
  readonly rows: number;
  readonly order: readonly GridCellCoordinate[];
  readonly direction?: ReelSpinDirection;
  readonly timing: GridCellReelSpinTiming;
  readonly dimming: GridCellDimmingPattern;
}): GridCellReelSpinPlan {
  const columns = assertPositiveInteger(options.columns, "columns");
  const rows = assertPositiveInteger(options.rows, "rows");
  if (options.reels.getReelCount() !== columns) {
    throw new ReelError(
      `grid columns ${columns} do not match reels reel count ${options.reels.getReelCount()}.`,
    );
  }
  const finalYs = parseFinalYs(options.finalYs, columns);
  const targetScene = parseTargetScene(options.targetScene, columns, rows);
  const order = parseOrder(options.order, columns, rows);
  const timing = parseTiming(options.timing);
  const dimming = parseDimming(options.dimming);
  const direction = parseDirection(options.direction);
  const cellCount = columns * rows;
  const firstStopAtMs =
    (cellCount - 1) * timing.startStepMs + timing.settleAfterLastStartMs;

  const cells = order.map((cell): GridCellReelPlanCell => {
    const startAtMs = cell.orderIndex * timing.startStepMs;
    const stopAtMs = firstStopAtMs + cell.orderIndex * timing.stopStepMs;
    const durationMs = stopAtMs - startAtMs;
    if (durationMs <= 0) {
      throw new ReelError(
        `grid cell (${cell.x},${cell.y}) stopAtMs must be greater than startAtMs.`,
      );
    }

    const finalY = options.reels.normalizeY(cell.x, finalYs[cell.x] + cell.y);
    const durationTravel = Math.ceil(
      (durationMs / 1000) * timing.speedSymbolsPerSecond,
    );
    const travelSymbols = Math.max(timing.minimumSpinCycles, durationTravel);
    const startY =
      direction === "forward"
        ? options.reels.normalizeY(cell.x, finalY - travelSymbols)
        : options.reels.normalizeY(cell.x, finalY + travelSymbols);
    const axisPlan: ReelAxisSpinPlan = Object.freeze({
      x: cell.x,
      finalY,
      startY,
      direction,
      travelSymbols,
      startDelayMs: startAtMs,
      durationMs,
      stopAtMs,
    });

    return Object.freeze({
      x: cell.x,
      y: cell.y,
      orderIndex: cell.orderIndex,
      startAtMs,
      stopAtMs,
      durationMs,
      axisPlan,
      targetVisibleSymbols: Object.freeze([
        targetScene[cell.x][cell.y],
      ]) as readonly [number],
      dimmingAlpha:
        cell.orderIndex % 2 === 0 ? dimming.evenAlpha : dimming.oddAlpha,
    });
  });

  return Object.freeze({
    direction,
    columns,
    rows,
    dimming,
    cells: Object.freeze(cells),
    lastStopAtMs: firstStopAtMs + (cellCount - 1) * timing.stopStepMs,
  });
}

function parseTargetScene(
  value: SceneMatrix,
  columns: number,
  rows: number,
): SceneMatrix {
  if (!Array.isArray(value) || value.length !== columns) {
    throw new ReelError(`targetScene length must be ${columns}.`);
  }
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows) {
        throw new ReelError(`targetScene[${x}] length must be ${rows}.`);
      }
      return Object.freeze(
        column.map((code, y) => {
          if (!Number.isInteger(code) || code < 0) {
            throw new ReelError(
              `targetScene[${x}][${y}] must be a non-negative integer.`,
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
    value.map((finalY, x) => assertInteger(finalY, `finalYs[${x}]`)),
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
  for (const [index, cell] of value.entries()) {
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
    const coordinateKey = `${cell.x}:${cell.y}`;
    if (seenCoordinates.has(coordinateKey)) {
      throw new ReelError(
        `duplicate grid cell coordinate (${cell.x},${cell.y}).`,
      );
    }
    if (seenOrderIndexes.has(cell.orderIndex)) {
      throw new ReelError(`duplicate grid cell orderIndex ${cell.orderIndex}.`);
    }
    seenCoordinates.add(coordinateKey);
    seenOrderIndexes.add(cell.orderIndex);
  }

  return Object.freeze(
    value.map((cell) =>
      Object.freeze({
        x: cell.x,
        y: cell.y,
        orderIndex: cell.orderIndex,
      }),
    ),
  );
}

function parseTiming(value: GridCellReelSpinTiming): GridCellReelSpinTiming {
  return Object.freeze({
    startStepMs: assertNonNegativeNumber(value.startStepMs, "startStepMs"),
    stopStepMs: assertNonNegativeNumber(value.stopStepMs, "stopStepMs"),
    settleAfterLastStartMs: assertNonNegativeNumber(
      value.settleAfterLastStartMs,
      "settleAfterLastStartMs",
    ),
    minimumSpinCycles: assertPositiveInteger(
      value.minimumSpinCycles,
      "minimumSpinCycles",
    ),
    speedSymbolsPerSecond: assertPositiveNumber(
      value.speedSymbolsPerSecond,
      "speedSymbolsPerSecond",
    ),
  });
}

function parseDimming(value: GridCellDimmingPattern): GridCellDimmingPattern {
  return Object.freeze({
    evenAlpha: assertAlpha(value.evenAlpha, "evenAlpha"),
    oddAlpha: assertAlpha(value.oddAlpha, "oddAlpha"),
    fadeInMs: assertNonNegativeNumber(value.fadeInMs, "fadeInMs"),
    fadeOutMs: assertNonNegativeNumber(value.fadeOutMs, "fadeOutMs"),
  });
}

function parseDirection(
  value: ReelSpinDirection | undefined,
): ReelSpinDirection {
  if (value === undefined) {
    return "forward";
  }
  if (value === "forward" || value === "backward") {
    return value;
  }
  throw new ReelError('direction must be "forward" or "backward".');
}

function assertInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new ReelError(`${label} must be an integer.`);
  }
  return value as number;
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

function assertAlpha(value: unknown, label: string): number {
  const parsed = assertNonNegativeNumber(value, label);
  if (parsed > 1) {
    throw new ReelError(`${label} must be between 0 and 1.`);
  }
  return parsed;
}
