import {
  createGridCellReelOffsetMatrix,
  createReelLayout,
  type GridCellDimmingPattern,
  type GridCellOrderMode,
  type GridCellReelOffsetMatrix,
  type GridCellReelSpinTiming,
  type ReelLayout,
} from "@slotclientengine/rendercore/reel";
import type { SlotGameFramePolicy } from "@slotclientengine/gameframeworks";
import {
  calculateFocusedArtViewport,
  mapReferenceRectToArt,
  type FocusedArtViewport,
  type RenderViewportSize,
} from "@slotclientengine/rendercore";

export const GAME002_ART_SIZE = Object.freeze({
  width: 2000,
  height: 2000,
});

export const GAME002_STAGE_SIZE = GAME002_ART_SIZE;

export const GAME002_REFERENCE_SIZE = Object.freeze({
  width: 1125,
  height: 2000,
});

export const GAME002_REFERENCE_VISIBLE_RECT_IN_ART = Object.freeze({
  x: 437.5,
  y: 0,
  width: 1125,
  height: 2000,
});

export const GAME002_ASSET_SIZE = Object.freeze({
  background: GAME002_ART_SIZE,
});

export const GAME002_REELS_NAME = "reels-001";
export const GAME002_REEL_COUNT = 6;
export const GAME002_VISIBLE_ROWS = 9;
export const GAME002_CELL_SIZE = 120;
export const GAME002_SKIN1_CELL_WIDTH = 125;
export const GAME002_SKIN1_CELL_HEIGHT = 400 / 3;
export const GAME002_GRID_CELL_REEL_ORDER =
  "top-down-left-right" satisfies GridCellOrderMode;
export const GAME002_GRID_CELL_REEL_TIMING = Object.freeze({
  startStepMs: 16,
  stopStepMs: 16,
  settleAfterLastStartMs: 180,
  minimumSpinCycles: 6,
  speedSymbolsPerSecond: 54,
}) satisfies GridCellReelSpinTiming;
export const GAME002_GRID_CELL_REEL_OFFSETS = createGridCellReelOffsetMatrix({
  columns: GAME002_REEL_COUNT,
  rows: GAME002_VISIBLE_ROWS,
  rowOffsetStep: 16,
}) satisfies GridCellReelOffsetMatrix;
export const GAME002_GRID_CELL_DIMMING = Object.freeze({
  evenAlpha: 0.5,
  oddAlpha: 0.35,
  fadeInMs: 80,
  fadeOutMs: 160,
}) satisfies GridCellDimmingPattern;

export const GAME002_BOARD_FRAME_IN_REFERENCE = Object.freeze({
  x: 200,
  y: 330,
  width: 720,
  height: 1080,
});

export const GAME002_BOARD_FRAME = Object.freeze(
  mapReferenceRectToArt({
    artSize: GAME002_ART_SIZE,
    referenceSize: GAME002_REFERENCE_SIZE,
    referenceRect: GAME002_BOARD_FRAME_IN_REFERENCE,
  }),
);

export const GAME002_SKIN1_BOARD_FRAME = Object.freeze({
  x: 620,
  y: 465,
  width: GAME002_REEL_COUNT * GAME002_SKIN1_CELL_WIDTH,
  height: GAME002_VISIBLE_ROWS * GAME002_SKIN1_CELL_HEIGHT,
});

export const GAME002_DEFAULT_GRID_LAYOUT = Object.freeze({
  boardFrame: GAME002_BOARD_FRAME,
  cellWidth: GAME002_CELL_SIZE,
  cellHeight: GAME002_CELL_SIZE,
}) satisfies Game002GridLayout;

export const GAME002_SKIN1_GRID_LAYOUT = Object.freeze({
  boardFrame: GAME002_SKIN1_BOARD_FRAME,
  cellWidth: GAME002_SKIN1_CELL_WIDTH,
  cellHeight: GAME002_SKIN1_CELL_HEIGHT,
}) satisfies Game002GridLayout;

export const GAME002_FOCUS_MARGIN = Object.freeze({
  left: 60,
  right: 60,
  top: 60,
  bottom: 60,
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

export interface Game002GridLayout {
  readonly boardFrame: Rect;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export interface Game002LayoutOptions {
  readonly viewportSize?: RenderViewportSize;
  readonly gridLayout?: Game002GridLayout;
}

export interface Game002Layout {
  readonly artSize: typeof GAME002_ART_SIZE;
  readonly stage: typeof GAME002_ART_SIZE;
  readonly viewportSize: RenderViewportSize;
  readonly visibleRect: FocusedArtViewport["visibleRect"];
  readonly worldOffset: FocusedArtViewport["worldOffset"];
  readonly background: Point;
  readonly backgroundFrame: Rect;
  readonly boardFrame: Rect;
  readonly boardFrameInViewport: Rect;
}

export interface Game002ReelLayerLayout {
  readonly rawReelsContentWidth: number;
  readonly rawReelsContentHeight: number;
  readonly x: number;
  readonly y: number;
  readonly stageVisibleFrame: Rect;
  readonly viewportVisibleFrame: Rect;
}

type Game002LayoutInput = RenderViewportSize | Game002LayoutOptions;

export function calculateGame002FrameScale(
  viewportWidth: number,
  viewportHeight: number,
  stage: typeof GAME002_ART_SIZE = GAME002_ART_SIZE,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    throw new Error("viewportWidth must be a positive number.");
  }
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new Error("viewportHeight must be a positive number.");
  }
  return Math.min(viewportWidth / stage.width, viewportHeight / stage.height);
}

export function createGame002FramePolicy(
  gridLayout: Game002GridLayout = GAME002_DEFAULT_GRID_LAYOUT,
): SlotGameFramePolicy {
  validateGame002GridLayout(gridLayout);
  return Object.freeze({
    mode: "focus",
    maxDesignSize: GAME002_ART_SIZE,
    preferredPortraitSize: GAME002_REFERENCE_SIZE,
    focusRect: Object.freeze({
      width: gridLayout.boardFrame.width,
      height: gridLayout.boardFrame.height,
    }),
    minFocusMargin: GAME002_FOCUS_MARGIN,
  });
}

export function createGame002Layout(
  input: Game002LayoutInput = GAME002_REFERENCE_SIZE,
): Game002Layout {
  const { viewportSize, gridLayout } = normalizeGame002LayoutInput(input);
  validateGame002GridLayout(gridLayout);
  const viewport = calculateFocusedArtViewport({
    artSize: GAME002_ART_SIZE,
    viewportSize,
    focusRect: gridLayout.boardFrame,
    minMargin: GAME002_FOCUS_MARGIN,
  });
  return Object.freeze({
    artSize: GAME002_ART_SIZE,
    stage: GAME002_ART_SIZE,
    viewportSize: viewport.viewportSize,
    visibleRect: viewport.visibleRect,
    worldOffset: viewport.worldOffset,
    background: Object.freeze({ x: 0, y: 0 }),
    backgroundFrame: Object.freeze({
      x: 0,
      y: 0,
      width: GAME002_ART_SIZE.width,
      height: GAME002_ART_SIZE.height,
    }),
    boardFrame: gridLayout.boardFrame,
    boardFrameInViewport: viewport.focusRectInViewport,
  });
}

export function validateGame002GridLayout(
  gridLayout: Game002GridLayout = GAME002_DEFAULT_GRID_LAYOUT,
): void {
  validateGame002BoardFrame(
    gridLayout.boardFrame,
    GAME002_ART_SIZE,
    gridLayout.cellWidth,
    gridLayout.cellHeight,
  );
}

export function validateGame002BoardFrame(
  frame: Rect = GAME002_BOARD_FRAME,
  stage: typeof GAME002_ART_SIZE = GAME002_ART_SIZE,
  cellWidth = GAME002_CELL_SIZE,
  cellHeight = GAME002_CELL_SIZE,
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
  if (!Number.isFinite(cellWidth) || cellWidth <= 0) {
    throw new Error("game002 cell width must be a positive number.");
  }
  if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
    throw new Error("game002 cell height must be a positive number.");
  }
  if (!numbersClose(frame.width, GAME002_REEL_COUNT * cellWidth)) {
    throw new Error("game002 board width must be reelCount * cellWidth.");
  }
  if (!numbersClose(frame.height, GAME002_VISIBLE_ROWS * cellHeight)) {
    throw new Error("game002 board height must be visibleRows * cellHeight.");
  }
  if (
    frame.x + frame.width > stage.width ||
    frame.y + frame.height > stage.height
  ) {
    throw new Error("game002 board frame must fit inside the stage.");
  }
}

export function createGame002ReelLayout(
  gridLayout: Game002GridLayout = GAME002_DEFAULT_GRID_LAYOUT,
): ReelLayout {
  validateGame002GridLayout(gridLayout);
  return createReelLayout({
    reelCount: GAME002_REEL_COUNT,
    visibleRows: GAME002_VISIBLE_ROWS,
    cellWidth: gridLayout.cellWidth,
    cellHeight: gridLayout.cellHeight,
    columnGap: 0,
  });
}

export function createGame002ReelLayerLayout(
  layout: ReelLayout,
  gameLayout: Game002Layout = createGame002Layout(),
): Game002ReelLayerLayout {
  validateGame002BoardFrame(
    gameLayout.boardFrame,
    gameLayout.stage,
    layout.cellWidth,
    layout.cellHeight,
  );
  if (layout.reelCount !== GAME002_REEL_COUNT) {
    throw new Error("game002 reel layout reelCount must be 6.");
  }
  if (layout.visibleRows !== GAME002_VISIBLE_ROWS) {
    throw new Error("game002 reel layout visibleRows must be 9.");
  }
  if (
    !numbersClose(
      gameLayout.boardFrame.width,
      layout.reelCount * layout.cellWidth,
    ) ||
    !numbersClose(
      gameLayout.boardFrame.height,
      layout.visibleRows * layout.cellHeight,
    )
  ) {
    throw new Error("game002 reel layout cell size must match board frame.");
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
    viewportVisibleFrame: gameLayout.boardFrameInViewport,
  });
}

function normalizeGame002LayoutInput(input: Game002LayoutInput): {
  readonly viewportSize: RenderViewportSize;
  readonly gridLayout: Game002GridLayout;
} {
  if ("width" in input && "height" in input) {
    return {
      viewportSize: input,
      gridLayout: GAME002_DEFAULT_GRID_LAYOUT,
    };
  }
  return {
    viewportSize: input.viewportSize ?? GAME002_REFERENCE_SIZE,
    gridLayout: input.gridLayout ?? GAME002_DEFAULT_GRID_LAYOUT,
  };
}

function numbersClose(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}
