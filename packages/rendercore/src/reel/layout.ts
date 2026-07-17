import { ReelError } from "./errors.js";
import type { ReelLayout, ReelLayoutOptions } from "./types.js";

export function createReelLayout(options: ReelLayoutOptions): ReelLayout {
  const reelCount = assertPositiveInteger(options.reelCount, "reelCount");
  const visibleRows = assertPositiveInteger(options.visibleRows, "visibleRows");
  const cellWidth = assertPositiveNumber(options.cellWidth, "cellWidth");
  const cellHeight = assertPositiveNumber(options.cellHeight, "cellHeight");
  const columnGap = assertNonNegativeNumber(
    options.columnGap ?? 0,
    "columnGap",
  );
  const rowGap = assertNonNegativeNumber(options.rowGap ?? 0, "rowGap");
  const bufferRowsBefore = assertNonNegativeInteger(
    options.bufferRowsBefore ?? 1,
    "bufferRowsBefore",
  );
  const bufferRowsAfter = assertNonNegativeInteger(
    options.bufferRowsAfter ?? 1,
    "bufferRowsAfter",
  );

  return Object.freeze({
    reelCount,
    visibleRows,
    cellWidth,
    cellHeight,
    columnGap,
    rowGap,
    bufferRowsBefore,
    bufferRowsAfter,
    getReelX(x: number): number {
      if (!Number.isInteger(x) || x < 0 || x >= reelCount) {
        throw new ReelError(`reel x ${x} is out of range.`);
      }
      return x * (cellWidth + columnGap);
    },
    getCellY(visibleY: number): number {
      if (!Number.isInteger(visibleY)) {
        throw new ReelError(`visibleY ${visibleY} must be an integer.`);
      }
      return visibleY * (cellHeight + rowGap);
    },
  });
}

export function assertLayoutMatchesReels(
  layout: ReelLayout,
  reelCount: number,
): void {
  if (layout.reelCount !== reelCount) {
    throw new ReelError(
      `layout reelCount ${layout.reelCount} does not match reels reel count ${reelCount}.`,
    );
  }
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive integer.`);
  }
  return value as number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ReelError(`${label} must be a non-negative integer.`);
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
