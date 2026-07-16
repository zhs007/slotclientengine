import {
  createGridCellReelOffsetMatrix,
  createReelLayout,
  type GridCellOrderMode,
  type GridCellReelOffsetMatrix,
  type ReelLayout,
} from "@slotclientengine/rendercore/reel";
import type { SlotGameFramePolicy } from "@slotclientengine/gameframeworks";
import {
  calculateFocusedArtViewport,
  createMaximizedFocusedArtViewportPolicy,
  mapArtRectToViewport,
  mapReferenceRectToArt,
  type FocusedArtViewport,
  type RenderViewportSize,
} from "@slotclientengine/rendercore";
import { GAME002_BACKGROUND_MANIFEST } from "./background-config.js";

export const GAME002_ART_SIZE = GAME002_BACKGROUND_MANIFEST.artSize;

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

export const GAME002_REELS_NAME = "reels-001";
export const GAME002_REEL_COUNT = 6;
export const GAME002_VISIBLE_ROWS = 9;
export const GAME002_CELL_SIZE = 120;
export const GAME002_GRID_CELL_REEL_ORDER =
  "top-down-left-right" satisfies GridCellOrderMode;
export const GAME002_GRID_CELL_REEL_OFFSETS = createGridCellReelOffsetMatrix({
  columns: GAME002_REEL_COUNT,
  rows: GAME002_VISIBLE_ROWS,
  rowOffsetStep: 16,
}) satisfies GridCellReelOffsetMatrix;
const GAME002_BRIGHT_SPIN_SYMBOLS = new Set(["WL", "CN"]);

export interface Game002GridCellDimming {
  readonly resolveSymbolDimmingAlpha: (symbol: string) => number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
}

export function createGame002GridCellDimming(
  dimmingAlpha: number,
): Game002GridCellDimming {
  if (!Number.isFinite(dimmingAlpha) || dimmingAlpha < 0 || dimmingAlpha > 1) {
    throw new Error(
      "game002 spin dimmingAlpha must be a finite number between 0 and 1.",
    );
  }
  return Object.freeze({
    resolveSymbolDimmingAlpha: (symbol: string) =>
      GAME002_BRIGHT_SPIN_SYMBOLS.has(symbol) ? 0 : dimmingAlpha,
    fadeInMs: 80,
    fadeOutMs: 160,
  });
}

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

export const GAME002_GRID_LAYOUT = Object.freeze({
  boardFrame: GAME002_BOARD_FRAME,
  cellWidth: GAME002_CELL_SIZE,
  cellHeight: GAME002_CELL_SIZE,
}) satisfies Game002GridLayout;

export const GAME002_FOCUS_REGION = GAME002_BACKGROUND_MANIFEST.adaptation
  .focusRect satisfies Game002FocusRegion;

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

export interface Game002FocusRegion {
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
  readonly gridLayout: Game002GridLayout;
  readonly focusRegion: Game002FocusRegion;
}

export interface Game002Layout {
  readonly artSize: typeof GAME002_ART_SIZE;
  readonly stage: typeof GAME002_ART_SIZE;
  readonly viewportSize: RenderViewportSize;
  readonly visibleRect: FocusedArtViewport["visibleRect"];
  readonly worldOffset: FocusedArtViewport["worldOffset"];
  readonly focusRegion: Game002FocusRegion;
  readonly focusRegionInViewport: Rect;
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
  focusRegion: Game002FocusRegion = GAME002_FOCUS_REGION,
): SlotGameFramePolicy {
  validateGame002FocusRegion(focusRegion);
  return createMaximizedFocusedArtViewportPolicy({
    artSize: GAME002_ART_SIZE,
    focusRect: focusRegion,
  });
}

export function createGame002Layout(
  input: Game002LayoutInput = GAME002_REFERENCE_SIZE,
): Game002Layout {
  const { viewportSize, gridLayout, focusRegion } =
    normalizeGame002LayoutInput(input);
  validateGame002GridLayout(gridLayout);
  validateGame002FocusRegion(focusRegion);
  const viewport = calculateFocusedArtViewport({
    artSize: GAME002_ART_SIZE,
    viewportSize,
    focusRect: focusRegion,
  });
  const boardFrameInViewport = mapArtRectToViewport({
    artSize: GAME002_ART_SIZE,
    visibleRect: viewport.visibleRect,
    rect: gridLayout.boardFrame,
  });
  return Object.freeze({
    artSize: GAME002_ART_SIZE,
    stage: GAME002_ART_SIZE,
    viewportSize: viewport.viewportSize,
    visibleRect: viewport.visibleRect,
    worldOffset: viewport.worldOffset,
    focusRegion,
    focusRegionInViewport: viewport.focusRectInViewport,
    background: Object.freeze({ x: 0, y: 0 }),
    backgroundFrame: Object.freeze({
      x: 0,
      y: 0,
      width: GAME002_ART_SIZE.width,
      height: GAME002_ART_SIZE.height,
    }),
    boardFrame: gridLayout.boardFrame,
    boardFrameInViewport,
  });
}

export function validateGame002GridLayout(
  gridLayout: Game002GridLayout = GAME002_GRID_LAYOUT,
): void {
  validateGame002BoardFrame(
    gridLayout.boardFrame,
    GAME002_ART_SIZE,
    gridLayout.cellWidth,
    gridLayout.cellHeight,
  );
}

export function validateGame002FocusRegion(
  focusRegion: Game002FocusRegion,
  artSize: typeof GAME002_ART_SIZE = GAME002_ART_SIZE,
): void {
  if (!focusRegion) {
    throw new Error("game002 focusRegion must be configured.");
  }
  if (!Number.isFinite(focusRegion.x) || focusRegion.x < 0) {
    throw new Error("game002 focusRegion x must be a non-negative number.");
  }
  if (!Number.isFinite(focusRegion.y) || focusRegion.y < 0) {
    throw new Error("game002 focusRegion y must be a non-negative number.");
  }
  if (!Number.isFinite(focusRegion.width) || focusRegion.width <= 0) {
    throw new Error("game002 focusRegion width must be a positive number.");
  }
  if (!Number.isFinite(focusRegion.height) || focusRegion.height <= 0) {
    throw new Error("game002 focusRegion height must be a positive number.");
  }
  if (
    focusRegion.x + focusRegion.width > artSize.width ||
    focusRegion.y + focusRegion.height > artSize.height
  ) {
    throw new Error("game002 focusRegion must fit inside the art size.");
  }
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
  gridLayout: Game002GridLayout = GAME002_GRID_LAYOUT,
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
  readonly focusRegion: Game002FocusRegion;
} {
  if ("width" in input && "height" in input) {
    return {
      viewportSize: input,
      gridLayout: GAME002_GRID_LAYOUT,
      focusRegion: GAME002_FOCUS_REGION,
    };
  }
  if (!input.gridLayout) {
    throw new Error("game002 gridLayout must be configured.");
  }
  if (!input.focusRegion) {
    throw new Error("game002 focusRegion must be configured.");
  }
  return {
    viewportSize: input.viewportSize ?? GAME002_REFERENCE_SIZE,
    gridLayout: input.gridLayout,
    focusRegion: input.focusRegion,
  };
}

function numbersClose(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}
