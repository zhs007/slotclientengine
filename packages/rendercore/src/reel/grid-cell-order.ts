import { ReelError } from "./errors.js";
import type { GridCellCoordinate, GridCellOrderMode } from "./types.js";

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

function assertPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive integer.`);
  }
  return value as number;
}
