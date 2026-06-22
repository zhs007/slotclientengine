import type { ReelLayout } from "@slotclientengine/rendercore/reel";

export const GAME_STAGE_SIZE = Object.freeze({ width: 941, height: 1672 });

export const GAME_ASSET_SIZE = Object.freeze({
  background: Object.freeze({ width: 941, height: 1672 }),
  logo: Object.freeze({ width: 881, height: 391 }),
  mainReelsBackground: Object.freeze({ width: 1025, height: 415 }),
  secondaryReelsBackground: Object.freeze({ width: 751, height: 641 }),
});

export const GAME001_LOCKED_AXIS_INDEX = 3;
export const GAME001_LOCKED_CENTER_Y = 2;

export const GAME001_MAIN_REELS_CALIBRATION = Object.freeze({
  backgroundLocalFrame: Object.freeze({
    x: 25,
    y: 96,
    width: 975,
    height: 281,
  }),
  columnCentersX: Object.freeze([125, 319, 514, 708, 902]),
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

export interface Game001MainReelsCalibration {
  readonly backgroundLocalFrame: Rect;
  readonly columnCentersX: readonly number[];
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

export interface MainReelsVisibleWindowOptions {
  readonly maxVisibleHeight?: number;
  readonly fitScale?: number;
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
  readonly stageColumnCentersX: readonly number[];
  readonly stageVisibleFrame: Rect;
  readonly lockedAxis: {
    readonly xIndex: typeof GAME001_LOCKED_AXIS_INDEX;
    readonly sceneY: typeof GAME001_LOCKED_CENTER_Y;
    readonly stageCenterX: number;
    readonly stageCenterY: number;
    readonly localCenterX: number;
    readonly localCenterY: number;
  };
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
  options: MainReelsVisibleWindowOptions = {},
): MainReelsVisibleWindow {
  if (!Number.isFinite(cellHeight) || cellHeight <= 0) {
    throw new Error("cellHeight must be a positive number.");
  }
  let cropHeight = 2 * cellHeight;
  if (
    options.maxVisibleHeight !== undefined ||
    options.fitScale !== undefined
  ) {
    if (
      options.maxVisibleHeight === undefined ||
      !Number.isFinite(options.maxVisibleHeight) ||
      options.maxVisibleHeight <= 0
    ) {
      throw new Error("maxVisibleHeight must be a positive number.");
    }
    if (
      options.fitScale === undefined ||
      !Number.isFinite(options.fitScale) ||
      options.fitScale <= 0
    ) {
      throw new Error("fitScale must be a positive number.");
    }
    cropHeight = Math.min(
      cropHeight,
      options.maxVisibleHeight / options.fitScale,
    );
  }
  const centerY = (GAME001_LOCKED_CENTER_Y + 0.5) * cellHeight;
  return Object.freeze({
    cropY: centerY - cropHeight / 2,
    cropHeight,
  });
}

export function validateGame001MainReelsCalibration(
  calibration: Game001MainReelsCalibration = GAME001_MAIN_REELS_CALIBRATION,
  options: {
    readonly lockedAxisIndex?: number;
    readonly lockedCenterY?: number;
    readonly backgroundSize?: {
      readonly width: number;
      readonly height: number;
    };
  } = {},
): void {
  const backgroundSize =
    options.backgroundSize ?? GAME_ASSET_SIZE.mainReelsBackground;
  const frame = calibration.backgroundLocalFrame;
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!Number.isFinite(frame[key]) || frame[key] <= 0) {
      throw new Error(`main reels calibration frame.${key} must be positive.`);
    }
  }
  if (
    frame.x + frame.width > backgroundSize.width ||
    frame.y + frame.height > backgroundSize.height
  ) {
    throw new Error("main reels calibration frame must fit reels1bk.png.");
  }
  if (calibration.columnCentersX.length !== 5) {
    throw new Error("main reels calibration must define 5 column centers.");
  }
  for (const [index, centerX] of calibration.columnCentersX.entries()) {
    if (!Number.isFinite(centerX)) {
      throw new Error(
        `main reels calibration column center ${index} must be finite.`,
      );
    }
    if (index > 0 && centerX <= calibration.columnCentersX[index - 1]) {
      throw new Error("main reels calibration column centers must increase.");
    }
    if (centerX < frame.x || centerX > frame.x + frame.width) {
      throw new Error(
        `main reels calibration column center ${index} must be inside frame.`,
      );
    }
  }
  const lockedAxisIndex = options.lockedAxisIndex ?? GAME001_LOCKED_AXIS_INDEX;
  if (lockedAxisIndex !== 3) {
    throw new Error("GAME001_LOCKED_AXIS_INDEX must be 3.");
  }
  const lockedCenterY = options.lockedCenterY ?? GAME001_LOCKED_CENTER_Y;
  if (lockedCenterY !== 2) {
    throw new Error("GAME001_LOCKED_CENTER_Y must be 2.");
  }
}

export function createMainReelsLayerLayout(
  layout: ReelLayout,
  gameLayout: Game001Layout = createGame001Layout(),
): MainReelsLayerLayout {
  validateGame001MainReelsCalibration();
  if (
    layout.reelCount !== GAME001_MAIN_REELS_CALIBRATION.columnCentersX.length
  ) {
    throw new Error("main reels layout reelCount must be 5.");
  }
  const rawReelsContentWidth =
    layout.reelCount * layout.cellWidth +
    (layout.reelCount - 1) * layout.columnGap;
  const rawReelsContentHeight = layout.visibleRows * layout.cellHeight;
  const rawFirstCenterX = layout.getReelX(0) + layout.cellWidth / 2;
  const rawLastCenterX =
    layout.getReelX(layout.reelCount - 1) + layout.cellWidth / 2;
  const rawCenterDistance = rawLastCenterX - rawFirstCenterX;
  if (!Number.isFinite(rawCenterDistance) || rawCenterDistance <= 0) {
    throw new Error("main reels raw center distance must be positive.");
  }
  const columnCentersX = GAME001_MAIN_REELS_CALIBRATION.columnCentersX;
  const mainReelsFitScale =
    (columnCentersX[columnCentersX.length - 1] - columnCentersX[0]) /
    rawCenterDistance;
  const backgroundFrame = GAME001_MAIN_REELS_CALIBRATION.backgroundLocalFrame;
  const targetVisibleTop = gameLayout.mainReelsBackground.y + backgroundFrame.y;
  const targetVisibleHeight = backgroundFrame.height;
  const { cropY, cropHeight } = getMainReelsVisibleWindow(layout.cellHeight, {
    maxVisibleHeight: targetVisibleHeight,
    fitScale: mainReelsFitScale,
  });
  const x =
    gameLayout.mainReelsBackground.x +
    columnCentersX[0] -
    rawFirstCenterX * mainReelsFitScale;
  const y =
    targetVisibleTop +
    (targetVisibleHeight - cropHeight * mainReelsFitScale) / 2 -
    cropY * mainReelsFitScale;
  const stageColumnCentersX = Object.freeze(
    columnCentersX.map((centerX) => gameLayout.mainReelsBackground.x + centerX),
  );
  const stageVisibleFrame = Object.freeze({
    x: gameLayout.mainReelsBackground.x + backgroundFrame.x,
    y: targetVisibleTop,
    width: backgroundFrame.width,
    height: backgroundFrame.height,
  });
  const lockedLocalCenterX =
    layout.getReelX(GAME001_LOCKED_AXIS_INDEX) + layout.cellWidth / 2;
  const lockedLocalCenterY = cropY + cropHeight / 2;

  return Object.freeze({
    rawReelsContentWidth,
    rawReelsContentHeight,
    mainReelsFitScale,
    cropY,
    cropHeight,
    visibleHeight: cropHeight * mainReelsFitScale,
    x,
    y,
    stageColumnCentersX,
    stageVisibleFrame,
    lockedAxis: Object.freeze({
      xIndex: GAME001_LOCKED_AXIS_INDEX,
      sceneY: GAME001_LOCKED_CENTER_Y,
      stageCenterX:
        gameLayout.mainReelsBackground.x +
        columnCentersX[GAME001_LOCKED_AXIS_INDEX],
      stageCenterY: stageVisibleFrame.y + stageVisibleFrame.height / 2,
      localCenterX: lockedLocalCenterX,
      localCenterY: lockedLocalCenterY,
    }),
  });
}
