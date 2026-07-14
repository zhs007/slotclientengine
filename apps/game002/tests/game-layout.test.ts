import { describe, expect, it } from "vitest";
import {
  GAME002_ART_SIZE,
  GAME002_BOARD_FRAME,
  GAME002_BOARD_FRAME_IN_REFERENCE,
  GAME002_CELL_SIZE,
  GAME002_FOCUS_REGION,
  GAME002_GRID_CELL_DIMMING,
  GAME002_GRID_CELL_REEL_ORDER,
  GAME002_GRID_CELL_REEL_TIMING,
  GAME002_GRID_LAYOUT,
  GAME002_REFERENCE_SIZE,
  GAME002_REFERENCE_VISIBLE_RECT_IN_ART,
  GAME002_REEL_COUNT,
  GAME002_VISIBLE_ROWS,
  calculateGame002FrameScale,
  createGame002FramePolicy,
  createGame002Layout,
  createGame002ReelLayerLayout,
  createGame002ReelLayout,
  validateGame002BoardFrame,
  validateGame002FocusRegion,
} from "../src/game-layout.js";
import { GAME002_BACKGROUND_MANIFEST } from "../src/background-config.js";

describe("game002-s3 layout", () => {
  it("locks the single s3 art, focus and 6 x 9 board contract", () => {
    const layout = createGame002Layout();
    const reelLayout = createGame002ReelLayout();
    const layerLayout = createGame002ReelLayerLayout(reelLayout, layout);

    expect(GAME002_ART_SIZE).toEqual({ width: 2000, height: 2000 });
    expect(GAME002_ART_SIZE).toBe(GAME002_BACKGROUND_MANIFEST.artSize);
    expect(GAME002_FOCUS_REGION).toBe(
      GAME002_BACKGROUND_MANIFEST.adaptation.focusRect,
    );
    expect(GAME002_REFERENCE_SIZE).toEqual({ width: 1125, height: 2000 });
    expect(GAME002_REFERENCE_VISIBLE_RECT_IN_ART).toEqual({
      x: 437.5,
      y: 0,
      width: 1125,
      height: 2000,
    });
    expect(GAME002_FOCUS_REGION).toEqual({
      x: 577.5,
      y: 270,
      width: 840,
      height: 1200,
    });
    expect(GAME002_GRID_LAYOUT).toEqual({
      boardFrame: GAME002_BOARD_FRAME,
      cellWidth: 120,
      cellHeight: 120,
    });
    expect(layout.boardFrame).toEqual(GAME002_BOARD_FRAME);
    expect(layout.boardFrameInViewport).toEqual(
      GAME002_BOARD_FRAME_IN_REFERENCE,
    );
    expect(reelLayout).toMatchObject({
      reelCount: 6,
      visibleRows: 9,
      cellWidth: 120,
      cellHeight: 120,
      columnGap: 0,
    });
    expect(layerLayout).toMatchObject({
      x: 637.5,
      y: 330,
      rawReelsContentWidth: 720,
      rawReelsContentHeight: 1080,
    });
    expect(GAME002_BOARD_FRAME.width).toBe(
      GAME002_REEL_COUNT * GAME002_CELL_SIZE,
    );
    expect(GAME002_BOARD_FRAME.height).toBe(
      GAME002_VISIBLE_ROWS * GAME002_CELL_SIZE,
    );
  });

  it("delegates focus viewport mapping for portrait, square and wide frames", () => {
    const portrait = createGame002Layout({
      viewportSize: { width: 1125, height: 2000 },
      gridLayout: GAME002_GRID_LAYOUT,
      focusRegion: GAME002_FOCUS_REGION,
    });
    const square = createGame002Layout({
      viewportSize: { width: 1200, height: 1200 },
      gridLayout: GAME002_GRID_LAYOUT,
      focusRegion: GAME002_FOCUS_REGION,
    });
    const wide = createGame002Layout({
      viewportSize: { width: 2000, height: 1200 },
      gridLayout: GAME002_GRID_LAYOUT,
      focusRegion: GAME002_FOCUS_REGION,
    });

    expect(portrait.worldOffset).toEqual({ x: -437.5, y: -0 });
    expect(square.worldOffset).toEqual({ x: -397.5, y: -270 });
    expect(wide.worldOffset).toEqual({ x: -0, y: -270 });
    const framePolicy = createGame002FramePolicy();
    expect(framePolicy.mode).toBe("maximized-focus");
    if (framePolicy.mode !== "maximized-focus") {
      throw new Error("game002 must use the maximized-focus frame policy.");
    }
    expect(
      framePolicy.resolveViewportSize({ width: 1200, height: 1200 }),
    ).toEqual({
      width: 1200,
      height: 1200,
    });
    expect(
      framePolicy.resolveViewportSize({ width: 1920, height: 1080 }),
    ).toEqual({
      width: 2000,
      height: 1200,
    });
    const phoneFrame = framePolicy.resolveViewportSize({
      width: 390,
      height: 844,
    });
    expect(phoneFrame.width).toBe(840);
    expect(phoneFrame.height).toBeCloseTo((840 * 844) / 390, 10);

    for (const viewportSize of [
      phoneFrame,
      { width: 1200, height: 1200 },
      { width: 2000, height: 1200 },
    ]) {
      const layout = createGame002Layout({
        viewportSize,
        gridLayout: GAME002_GRID_LAYOUT,
        focusRegion: GAME002_FOCUS_REGION,
      });
      expect(layout.boardFrameInViewport.x).toBeGreaterThanOrEqual(0);
      expect(layout.boardFrameInViewport.y).toBeGreaterThanOrEqual(0);
      expect(
        layout.boardFrameInViewport.x + layout.boardFrameInViewport.width,
      ).toBeLessThanOrEqual(layout.viewportSize.width);
      expect(
        layout.boardFrameInViewport.y + layout.boardFrameInViewport.height,
      ).toBeLessThanOrEqual(layout.viewportSize.height);
      expect(layout.focusRegionInViewport.x).toBeGreaterThanOrEqual(0);
      expect(layout.focusRegionInViewport.y).toBeGreaterThanOrEqual(0);
      expect(
        layout.focusRegionInViewport.x + layout.focusRegionInViewport.width,
      ).toBeLessThanOrEqual(layout.viewportSize.width);
      expect(
        layout.focusRegionInViewport.y + layout.focusRegionInViewport.height,
      ).toBeLessThanOrEqual(layout.viewportSize.height);
    }
  });

  it("keeps grid timing/dimming stable and validates explicit geometry", () => {
    expect(GAME002_GRID_CELL_REEL_ORDER).toBe("top-down-left-right");
    expect(GAME002_GRID_CELL_REEL_TIMING).toEqual({
      startStepMs: 16,
      stopStepMs: 16,
      settleAfterLastStartMs: 180,
      minimumSpinCycles: 6,
      speedSymbolsPerSecond: 54,
    });
    expect(GAME002_GRID_CELL_DIMMING).toEqual({
      evenAlpha: 0.5,
      oddAlpha: 0.35,
      fadeInMs: 80,
      fadeOutMs: 160,
    });
    expect(() => validateGame002BoardFrame()).not.toThrow();
    expect(() =>
      validateGame002FocusRegion(GAME002_FOCUS_REGION),
    ).not.toThrow();
    expect(() =>
      validateGame002BoardFrame({ ...GAME002_BOARD_FRAME, width: 721 }),
    ).toThrow(/width/);
    expect(() =>
      validateGame002FocusRegion({ ...GAME002_FOCUS_REGION, y: 1000 }),
    ).toThrow(/art size/);
    expect(calculateGame002FrameScale(1000, 1000)).toBe(0.5);
  });
});
