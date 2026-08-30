export const BOARD = {
  columns: 6,
  rows: 7,
  cellWidth: 1.42,
  cellHeight: 1.38,
  gapX: 0.16,
  gapY: 0.17,
  centerY: -0.35,
} as const;

export const BUBBLES = {
  count: 72,
  minX: -7.2,
  maxX: 7.2,
  minY: -10.5,
  maxY: 10.5,
  minZ: -8,
  maxZ: 4,
  seed: 0x5ea5_2026,
} as const;

export const boardWidth =
  BOARD.columns * BOARD.cellWidth + (BOARD.columns - 1) * BOARD.gapX;
export const boardHeight =
  BOARD.rows * BOARD.cellHeight + (BOARD.rows - 1) * BOARD.gapY;
