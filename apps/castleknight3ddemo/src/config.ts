export const BOARD = {
  columns: 5,
  rows: 6,
  cellSize: 1.22,
  cellGap: 0.075,
  cellHeight: 0.12,
  zOffset: 2.35,
} as const;

export const ROOM = {
  width: 12.8,
  depth: 23,
  wallHeight: 8.8,
  floorHeight: 0.42,
} as const;

export const boardWidth =
  BOARD.columns * BOARD.cellSize + (BOARD.columns - 1) * BOARD.cellGap;
export const boardDepth =
  BOARD.rows * BOARD.cellSize + (BOARD.rows - 1) * BOARD.cellGap;
