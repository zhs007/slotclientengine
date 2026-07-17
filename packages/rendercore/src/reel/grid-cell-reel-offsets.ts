import { ReelError } from "./errors.js";
import type {
  GridCellReelOffsetMatrix,
  GridCellReelOffsetMatrixOptions,
  ShuffledGridCellReelOffsetMatrixOptions,
} from "./types.js";

export function createGridCellReelOffsetMatrix(
  options: GridCellReelOffsetMatrixOptions,
): GridCellReelOffsetMatrix {
  const columns = assertPositiveInteger(options.columns, "columns");
  const rows = assertPositiveInteger(options.rows, "rows");
  const rowOffsetStep = assertInteger(
    options.rowOffsetStep ?? 0,
    "rowOffsetStep",
  );
  const columnOffsetStep = assertInteger(
    options.columnOffsetStep ?? 0,
    "columnOffsetStep",
  );
  const originOffset = assertInteger(options.originOffset ?? 0, "originOffset");

  return Object.freeze(
    Array.from({ length: columns }, (_, x) =>
      Object.freeze(
        Array.from(
          { length: rows },
          (_, y) => originOffset + x * columnOffsetStep + y * rowOffsetStep,
        ),
      ),
    ),
  );
}

export function createShuffledGridCellReelOffsetMatrix(
  options: ShuffledGridCellReelOffsetMatrixOptions,
): GridCellReelOffsetMatrix {
  const columns = assertPositiveInteger(options.columns, "columns");
  const rows = assertPositiveInteger(options.rows, "rows");
  if (options.reels.getReelCount() !== columns) {
    throw new ReelError(
      `grid columns ${columns} do not match reels reel count ${options.reels.getReelCount()}.`,
    );
  }
  if (typeof options.random !== "function") {
    throw new ReelError("grid cell reel phase random must be a function.");
  }

  return Object.freeze(
    Array.from({ length: columns }, (_, x) => {
      const reelLength = options.reels.getLength(x);
      if (rows > reelLength) {
        throw new ReelError(
          `grid rows ${rows} exceed reel ${x} length ${reelLength}; shuffled phases must be unique within a column.`,
        );
      }
      const phases = Array.from({ length: reelLength }, (_, phase) => phase);
      return Object.freeze(
        Array.from({ length: rows }, (_, y) => {
          const random = options.random();
          if (!Number.isFinite(random) || random < 0 || random >= 1) {
            throw new ReelError(
              "grid cell reel phase random must return a finite number in [0, 1).",
            );
          }
          const selectedIndex = y + Math.floor(random * (reelLength - y));
          [phases[y], phases[selectedIndex]] = [
            phases[selectedIndex]!,
            phases[y]!,
          ];
          const selectedPhase = phases[y];
          if (selectedPhase === undefined) {
            throw new ReelError(
              `grid cell reel phase (${x},${y}) is missing after shuffle.`,
            );
          }
          // Grid-cell plans add y to every reel offset. Subtract it here so
          // the effective local-strip phase is exactly the shuffled phase.
          return selectedPhase - y;
        }),
      );
    }),
  );
}

export function normalizeGridCellReelOffsetMatrix(
  value: GridCellReelOffsetMatrix | undefined,
  columns: number,
  rows: number,
  label = "cellReelOffsets",
): GridCellReelOffsetMatrix {
  const parsedColumns = assertPositiveInteger(columns, "columns");
  const parsedRows = assertPositiveInteger(rows, "rows");
  if (value === undefined) {
    return createGridCellReelOffsetMatrix({
      columns: parsedColumns,
      rows: parsedRows,
    });
  }
  if (!Array.isArray(value) || value.length !== parsedColumns) {
    throw new ReelError(`${label} length must be ${parsedColumns}.`);
  }
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== parsedRows) {
        throw new ReelError(`${label}[${x}] length must be ${parsedRows}.`);
      }
      return Object.freeze(
        column.map((offset, y) =>
          assertInteger(offset, `${label}[${x}][${y}]`),
        ),
      );
    }),
  );
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
