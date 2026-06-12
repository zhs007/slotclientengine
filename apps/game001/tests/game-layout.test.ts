import { describe, expect, it } from "vitest";
import { createReelLayout } from "@slotclientengine/rendercore/reel";
import {
  GAME001_LOCKED_AXIS_INDEX,
  GAME001_LOCKED_CENTER_Y,
  GAME001_MAIN_REELS_CALIBRATION,
  GAME_ASSET_SIZE,
  GAME_STAGE_SIZE,
  calculateGame001FrameScale,
  createGame001Layout,
  createMainReelsLayerLayout,
  getCenteredX,
  getMainReelsVisibleWindow,
  validateGame001MainReelsCalibration,
} from "../src/game-layout.js";

describe("game001 layout", () => {
  it("keeps the fixed stage and static asset coordinates", () => {
    const layout = createGame001Layout();

    expect(GAME_STAGE_SIZE).toEqual({ width: 941, height: 1672 });
    expect(layout.logo).toEqual({ x: 30, y: 0 });
    expect(layout.mainReelsBackground).toEqual({ x: -42, y: 401 });
    expect(layout.secondaryReelsBackground).toEqual({ x: 95, y: 826 });
    expect(GAME_ASSET_SIZE.mainReelsBackground.width).toBeGreaterThan(
      GAME_STAGE_SIZE.width,
    );
  });

  it("calculates centered x and rejects invalid dimensions", () => {
    expect(getCenteredX(100, 40)).toBe(30);
    expect(() => getCenteredX(0, 40)).toThrow(/stageWidth/);
    expect(() => getCenteredX(100, 0)).toThrow(/assetWidth/);
  });

  it("uses a centered crop and can cap it to the background frame height", () => {
    expect(getMainReelsVisibleWindow(30)).toEqual({
      cropY: 45,
      cropHeight: 60,
    });
    expect(
      getMainReelsVisibleWindow(30, { maxVisibleHeight: 50, fitScale: 1 }),
    ).toEqual({
      cropY: 50,
      cropHeight: 50,
    });
    expect(() => getMainReelsVisibleWindow(0)).toThrow(/cellHeight/);
    expect(() =>
      getMainReelsVisibleWindow(30, { maxVisibleHeight: 0, fitScale: 1 }),
    ).toThrow(/maxVisibleHeight/);
    expect(() =>
      getMainReelsVisibleWindow(30, { maxVisibleHeight: 50, fitScale: 0 }),
    ).toThrow(/fitScale/);
  });

  it("validates game001 main reels calibration and locked axis constants", () => {
    expect(GAME001_LOCKED_AXIS_INDEX).toBe(3);
    expect(GAME001_LOCKED_CENTER_Y).toBe(2);
    expect(GAME001_MAIN_REELS_CALIBRATION.columnCentersX).toEqual([
      125, 319, 514, 708, 902,
    ]);
    expect(GAME001_MAIN_REELS_CALIBRATION.columnCentersX).toHaveLength(5);
    expect(GAME001_MAIN_REELS_CALIBRATION.columnCentersX[3]).toBe(708);
    expect(() => validateGame001MainReelsCalibration()).not.toThrow();
    expect(() =>
      validateGame001MainReelsCalibration({
        ...GAME001_MAIN_REELS_CALIBRATION,
        columnCentersX: [125, 319, 319, 708, 902],
      }),
    ).toThrow(/increase/);
    expect(() =>
      validateGame001MainReelsCalibration(
        GAME001_MAIN_REELS_CALIBRATION,
        { lockedAxisIndex: 2 },
      ),
    ).toThrow(/LOCKED_AXIS/);
    expect(() =>
      validateGame001MainReelsCalibration(
        GAME001_MAIN_REELS_CALIBRATION,
        { lockedCenterY: 1 },
      ),
    ).toThrow(/LOCKED_CENTER/);
  });

  it("calibrates the main reels layer from reel frame and column centers", () => {
    const reelLayout = createReelLayout({
      reelCount: 5,
      visibleRows: 5,
      cellWidth: 30,
      cellHeight: 30,
      columnGap: 8,
    });
    const layerLayout = createMainReelsLayerLayout(reelLayout);
    const oldFullBackgroundScale =
      GAME_ASSET_SIZE.mainReelsBackground.width /
      layerLayout.rawReelsContentWidth;
    const expectedCropHeight =
      GAME001_MAIN_REELS_CALIBRATION.backgroundLocalFrame.height /
      layerLayout.mainReelsFitScale;
    const expectedCropY = 75 - expectedCropHeight / 2;

    expect(layerLayout.rawReelsContentWidth).toBe(182);
    expect(layerLayout.rawReelsContentHeight).toBe(150);
    expect(layerLayout.mainReelsFitScale).not.toBe(oldFullBackgroundScale);
    expect(layerLayout.mainReelsFitScale).toBeCloseTo(777 / 152);
    expect(layerLayout.cropY).toBeCloseTo(expectedCropY);
    expect(layerLayout.cropHeight).toBeCloseTo(expectedCropHeight);
    expect(layerLayout.visibleHeight).toBeCloseTo(
      GAME001_MAIN_REELS_CALIBRATION.backgroundLocalFrame.height,
    );
    expect(layerLayout.stageColumnCentersX).toEqual([83, 277, 472, 666, 860]);
    expect(layerLayout.stageVisibleFrame).toEqual({
      x: -17,
      y: 497,
      width: 975,
      height: 281,
    });

    for (const x of [0, 1, 2, 4]) {
      const rawCenter =
        reelLayout.getReelX(x) + reelLayout.cellWidth / 2;
      const mappedCenter =
        layerLayout.x + rawCenter * layerLayout.mainReelsFitScale;
      expect(
        Math.abs(mappedCenter - layerLayout.stageColumnCentersX[x]),
      ).toBeLessThanOrEqual(1);
    }

    expect(layerLayout.lockedAxis).toEqual({
      xIndex: 3,
      sceneY: 2,
      stageCenterX: 666,
      stageCenterY: 637.5,
      localCenterX: 129,
      localCenterY: 75,
    });
  });

  it("keeps the frame at stage pixels and scales the complete stage into the viewport", () => {
    expect(calculateGame001FrameScale(941, 1672)).toBe(1);
    expect(calculateGame001FrameScale(1882, 3344)).toBe(2);
    expect(calculateGame001FrameScale(1920, 1080)).toBeCloseTo(1080 / 1672);
    expect(calculateGame001FrameScale(470.5, 1672)).toBe(0.5);
    expect(calculateGame001FrameScale(941, 836)).toBe(0.5);
    expect(() => calculateGame001FrameScale(0, 100)).toThrow(/viewportWidth/);
    expect(() => calculateGame001FrameScale(100, 0)).toThrow(/viewportHeight/);
  });
});
