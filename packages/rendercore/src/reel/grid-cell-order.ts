import { ReelError } from "./errors.js";
import type {
  GridCellSweepOrder,
  GridCellSelectiveSpinOrder,
} from "./manifest.js";
import type {
  GridCellCoordinate,
  GridCellOrderMode,
  GridCellSpinPosition,
} from "./types.js";

export function createGridCellOrder(options: {
  readonly columns: number;
  readonly rows: number;
  readonly mode: GridCellOrderMode;
}): readonly GridCellCoordinate[] {
  const columns = assertPositiveInteger(options.columns, "columns");
  const rows = assertPositiveInteger(options.rows, "rows");
  if (options.mode !== "top-down-left-right") {
    throw new ReelError('grid cell order mode must be "top-down-left-right".');
  }

  const order: GridCellCoordinate[] = [];
  for (let x = 0; x < columns; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      order.push(
        Object.freeze({
          x,
          y,
          orderIndex: order.length,
        }),
      );
    }
  }
  return Object.freeze(order);
}

export function orderGridCellPositions(options: {
  readonly positions: readonly { readonly x: number; readonly y: number }[];
  readonly columns: number;
  readonly rows: number;
  readonly mode: GridCellSweepOrder | GridCellSelectiveSpinOrder;
}): readonly GridCellSpinPosition[] {
  const columns = assertPositiveInteger(options.columns, "columns");
  const rows = assertPositiveInteger(options.rows, "rows");
  if (!Array.isArray(options.positions) || options.positions.length === 0)
    throw new ReelError("grid cell positions must not be empty.");
  const seen = new Set<string>();
  const positions = options.positions.map((position, index) => {
    if (
      !Number.isSafeInteger(position.x) ||
      position.x < 0 ||
      position.x >= columns ||
      !Number.isSafeInteger(position.y) ||
      position.y < 0 ||
      position.y >= rows
    )
      throw new ReelError(`grid cell positions[${index}] is out of range.`);
    const key = `${position.x}:${position.y}`;
    if (seen.has(key))
      throw new ReelError(`grid cell position (${key}) is duplicated.`);
    seen.add(key);
    return Object.freeze({ x: position.x, y: position.y });
  });
  if (options.mode === "left-right-bottom-up")
    return Object.freeze(
      [...positions].sort(
        (left, right) => right.y - left.y || left.x - right.x,
      ),
    );

  const byColumn = new Map<number, typeof positions>();
  for (const position of positions) {
    const column = byColumn.get(position.x) ?? [];
    column.push(position);
    byColumn.set(position.x, column);
  }
  return Object.freeze(
    [...byColumn.entries()]
      .sort(([left], [right]) => left - right)
      .flatMap(([, column], columnIndex) =>
        [...column]
          .sort((left, right) => right.y - left.y)
          .map((position, rowIndex) =>
            Object.freeze({
              ...position,
              startGroupIndex: columnIndex + rowIndex,
            }),
          ),
      )
      .sort(
        (left, right) =>
          left.startGroupIndex - right.startGroupIndex ||
          left.x - right.x ||
          right.y - left.y,
      ),
  );
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive integer.`);
  }
  return value as number;
}
