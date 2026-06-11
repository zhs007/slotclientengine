import { describe, expect, it } from "vitest";
import { createReelLayout } from "@slotclientengine/rendercore/reel";
import {
  GAME_ASSET_SIZE,
  GAME_STAGE_SIZE,
  calculateGame001FrameScale,
  createGame001Layout,
  createMainReelsLayerLayout,
  getCenteredX,
  getMainReelsVisibleWindow,
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

  it("uses a half-row crop above and below the middle row", () => {
    expect(getMainReelsVisibleWindow(30)).toEqual({
      cropY: 45,
      cropHeight: 60,
    });
    expect(() => getMainReelsVisibleWindow(0)).toThrow(/cellHeight/);
  });

  it("derives the main reels fit scale from raw content width", () => {
    const reelLayout = createReelLayout({
      reelCount: 5,
      visibleRows: 5,
      cellWidth: 30,
      cellHeight: 30,
      columnGap: 8,
    });
    const layerLayout = createMainReelsLayerLayout(reelLayout);

    expect(layerLayout.rawReelsContentWidth).toBe(182);
    expect(layerLayout.rawReelsContentHeight).toBe(150);
    expect(layerLayout.mainReelsFitScale).toBe(
      GAME_ASSET_SIZE.mainReelsBackground.width / 182,
    );
    expect(layerLayout.cropY).toBe(45);
    expect(layerLayout.cropHeight).toBe(60);
    expect(layerLayout.visibleHeight).toBe(60 * layerLayout.mainReelsFitScale);
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
