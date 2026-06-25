import {
  createReelLayout,
  type ReelLayout,
} from "@slotclientengine/rendercore/reel";

export const GAME002_STAGE_SIZE = Object.freeze({
  width: 1125,
  height: 2000,
});

export const GAME002_ASSET_SIZE = Object.freeze({
  background: Object.freeze({ width: 1125, height: 2000 }),
});

export const GAME002_REELS_NAME = "reels-001";
export const GAME002_REEL_COUNT = 6;
export const GAME002_VISIBLE_ROWS = 9;
export const GAME002_CELL_SIZE = 120;

export const GAME002_BOARD_FRAME = Object.freeze({
  x: 200,
  y: 330,
  width: 720,
  height: 1080,
});

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Game002Layout {
  readonly stage: typeof GAME002_STAGE_SIZE;
  readonly background: Point;
  readonly boardFrame: typeof GAME002_BOARD_FRAME;
}

export interface Game002ReelLayerLayout {
  readonly rawReelsContentWidth: number;
  readonly rawReelsContentHeight: number;
  readonly x: number;
  readonly y: number;
  readonly stageVisibleFrame: Rect;
}

export function calculateGame002FrameScale(
  viewportWidth: number,
  viewportHeight: number,
  stage: typeof GAME002_STAGE_SIZE = GAME002_STAGE_SIZE,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    throw new Error("viewportWidth must be a positive number.");
  }
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new Error("viewportHeight must be a positive number.");
  }
  return Math.min(viewportWidth / stage.width, viewportHeight / stage.height);
}

export function createGame002Layout(): Game002Layout {
  validateGame002BoardFrame();
  return Object.freeze({
    stage: GAME002_STAGE_SIZE,
    background: Object.freeze({ x: 0, y: 0 }),
    boardFrame: GAME002_BOARD_FRAME,
  });
}

export function validateGame002BoardFrame(
  frame: Rect = GAME002_BOARD_FRAME,
  stage: typeof GAME002_STAGE_SIZE = GAME002_STAGE_SIZE,
): void {
  if (!Number.isFinite(frame.x) || frame.x < 0) {
    throw new Error("game002 board frame x must be a non-negative number.");
  }
  if (!Number.isFinite(frame.y) || frame.y < 0) {
    throw new Error("game002 board frame y must be a non-negative number.");
  }
  if (!Number.isFinite(frame.width) || frame.width <= 0) {
    throw new Error("game002 board frame width must be a positive number.");
  }
  if (!Number.isFinite(frame.height) || frame.height <= 0) {
    throw new Error("game002 board frame height must be a positive number.");
  }
  if (frame.width !== GAME002_REEL_COUNT * GAME002_CELL_SIZE) {
    throw new Error("game002 board width must be 6 * 120.");
  }
  if (frame.height !== GAME002_VISIBLE_ROWS * GAME002_CELL_SIZE) {
    throw new Error("game002 board height must be 9 * 120.");
  }
  if (
    frame.x + frame.width > stage.width ||
    frame.y + frame.height > stage.height
  ) {
    throw new Error("game002 board frame must fit inside the stage.");
  }
}

export function createGame002ReelLayout(): ReelLayout {
  return createReelLayout({
    reelCount: GAME002_REEL_COUNT,
    visibleRows: GAME002_VISIBLE_ROWS,
    cellWidth: GAME002_CELL_SIZE,
    cellHeight: GAME002_CELL_SIZE,
    columnGap: 0,
  });
}

export function createGame002ReelLayerLayout(
  layout: ReelLayout,
  gameLayout: Game002Layout = createGame002Layout(),
): Game002ReelLayerLayout {
  validateGame002BoardFrame(gameLayout.boardFrame, gameLayout.stage);
  if (layout.reelCount !== GAME002_REEL_COUNT) {
    throw new Error("game002 reel layout reelCount must be 6.");
  }
  if (layout.visibleRows !== GAME002_VISIBLE_ROWS) {
    throw new Error("game002 reel layout visibleRows must be 9.");
  }
  if (
    layout.cellWidth !== GAME002_CELL_SIZE ||
    layout.cellHeight !== GAME002_CELL_SIZE
  ) {
    throw new Error("game002 reel layout cell size must be 120 x 120.");
  }
  if (layout.columnGap !== 0) {
    throw new Error("game002 reel layout columnGap must be 0.");
  }

  return Object.freeze({
    rawReelsContentWidth:
      layout.reelCount * layout.cellWidth +
      (layout.reelCount - 1) * layout.columnGap,
    rawReelsContentHeight: layout.visibleRows * layout.cellHeight,
    x: gameLayout.boardFrame.x,
    y: gameLayout.boardFrame.y,
    stageVisibleFrame: gameLayout.boardFrame,
  });
}
