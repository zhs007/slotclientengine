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
  grassCount: 7200,
  distantGrassCount: 5000,
  accentGrassCount: 150,
  leafCount: 240,
  flowerCount: 42,
  accentFlowerCount: 14,
  seed: 0x6a17d39b,
} as const;

export const SYMBOLS = {
  count: BOARD.columns * BOARD.rows,
} as const;

export const boardWidth =
  BOARD.columns * BOARD.cellSize + (BOARD.columns - 1) * BOARD.cellGap;
export const boardDepth =
  BOARD.rows * BOARD.cellSize + (BOARD.rows - 1) * BOARD.cellGap;
