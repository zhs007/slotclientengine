export const BOARD = {
  columns: 6,
  rows: 10,
  cellSize: 1.02,
  cellGap: 0.045,
  cellHeight: 0.14,
} as const;

export const GROUND = {
  width: 11.6,
  depth: 17.6,
  height: 0.34,
} as const;

export const VEGETATION = {
  grassCount: 620,
  leafCount: 170,
  flowerCount: 42,
  seed: 0x6a17d39b,
} as const;

export const boardWidth =
  BOARD.columns * BOARD.cellSize + (BOARD.columns - 1) * BOARD.cellGap;
export const boardDepth =
  BOARD.rows * BOARD.cellSize + (BOARD.rows - 1) * BOARD.cellGap;
