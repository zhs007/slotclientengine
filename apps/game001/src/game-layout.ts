import type { ReelLayout } from "@slotclientengine/rendercore/reel";

export const GAME_STAGE_SIZE = Object.freeze({ width: 941, height: 1672 });

export const GAME_ASSET_SIZE = Object.freeze({
  background: Object.freeze({ width: 941, height: 1672 }),
  logo: Object.freeze({ width: 881, height: 391 }),
  mainReelsBackground: Object.freeze({ width: 1025, height: 415 }),
  secondaryReelsBackground: Object.freeze({ width: 751, height: 641 }),
});

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Game001Layout {
  readonly stage: typeof GAME_STAGE_SIZE;
  readonly background: Point;
  readonly logo: Point;
  readonly mainReelsBackground: Point;
  readonly secondaryReelsBackground: Point;
  readonly spinButton: Point;
}

export interface MainReelsVisibleWindow {
  readonly cropY: number;
  readonly cropHeight: number;
}

export interface MainReelsLayerLayout {
  readonly rawReelsContentWidth: number;
  readonly rawReelsContentHeight: number;
  readonly mainReelsFitScale: number;
  readonly cropY: number;
  readonly cropHeight: number;
  readonly visibleHeight: number;
  readonly x: number;
  readonly y: number;
}

export function calculateGame001FrameScale(
  viewportWidth: number,
  viewportHeight: number,
  stage: typeof GAME_STAGE_SIZE = GAME_STAGE_SIZE,
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    throw new Error("viewportWidth must be a positive number.");
  }
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new Error("viewportHeight must be a positive number.");
  }
  return Math.min(viewportWidth / stage.width, viewportHeight / stage.height);
}

export function createGame001Layout(): Game001Layout {
  const mainReelsBackgroundY = GAME_ASSET_SIZE.logo.height + 10;
  const secondaryReelsBackgroundY =
    mainReelsBackgroundY + GAME_ASSET_SIZE.mainReelsBackground.height + 10;

  return Object.freeze({
    stage: GAME_STAGE_SIZE,
    background: Object.freeze({ x: 0, y: 0 }),
    logo: Object.freeze({
      x: getCenteredX(GAME_STAGE_SIZE.width, GAME_ASSET_SIZE.logo.width),
      y: 0,
    }),
    mainReelsBackground: Object.freeze({
      x: getCenteredX(
        GAME_STAGE_SIZE.width,
        GAME_ASSET_SIZE.mainReelsBackground.width,
      ),
      y: mainReelsBackgroundY,
    }),
    secondaryReelsBackground: Object.freeze({
      x: getCenteredX(
        GAME_STAGE_SIZE.width,
        GAME_ASSET_SIZE.secondaryReelsBackground.width,
      ),
      y: secondaryReelsBackgroundY,
    }),
    spinButton: Object.freeze({ x: GAME_STAGE_SIZE.width / 2, y: 1550 }),
  });
}

export function getCenteredX(stageWidth: number, assetWidth: number): number {
  if (!Number.isFinite(stageWidth) || stageWidth <= 0) {
    throw new Error("stageWidth must be a positive number.");
  }
  if (!Number.isFinite(assetWidth) || assetWidth <= 0) {
    throw new Error("assetWidth must be a positive number.");
  }
  return (stageWidth - assetWidth) / 2;
}

export function getMainReelsVisibleWindow(
  cellHeight: number,
): MainReelsVisibleWindow {
  if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
    throw new Error("cellHeight must be a positive number.");
  }
  return Object.freeze({
    cropY: 1.5 * cellHeight,
    cropHeight: 2 * cellHeight,
  });
}

export function createMainReelsLayerLayout(
  layout: ReelLayout,
  gameLayout: Game001Layout = createGame001Layout(),
): MainReelsLayerLayout {
  const rawReelsContentWidth =
    layout.reelCount * layout.cellWidth +
    (layout.reelCount - 1) * layout.columnGap;
  const rawReelsContentHeight = layout.visibleRows * layout.cellHeight;
  const { cropY, cropHeight } = getMainReelsVisibleWindow(layout.cellHeight);
  const mainReelsFitScale =
    GAME_ASSET_SIZE.mainReelsBackground.width / rawReelsContentWidth;

  return Object.freeze({
    rawReelsContentWidth,
    rawReelsContentHeight,
    mainReelsFitScale,
    cropY,
    cropHeight,
    visibleHeight: cropHeight * mainReelsFitScale,
    x: gameLayout.mainReelsBackground.x,
    y:
      gameLayout.mainReelsBackground.y +
      (GAME_ASSET_SIZE.mainReelsBackground.height -
        cropHeight * mainReelsFitScale) /
        2 -
      cropY * mainReelsFitScale,
  });
}
