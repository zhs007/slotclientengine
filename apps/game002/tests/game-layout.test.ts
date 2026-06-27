import { describe, expect, it } from "vitest";
import {
  GAME002_ART_SIZE,
  GAME002_ASSET_SIZE,
  GAME002_BOARD_FRAME,
  GAME002_BOARD_FRAME_IN_REFERENCE,
  GAME002_CELL_SIZE,
  GAME002_FOCUS_MARGIN,
  GAME002_GRID_CELL_DIMMING,
  GAME002_GRID_CELL_REEL_ORDER,
  GAME002_GRID_CELL_REEL_TIMING,
  GAME002_SKIN1_BOARD_FRAME,
  GAME002_SKIN1_CELL_HEIGHT,
  GAME002_SKIN1_CELL_WIDTH,
  GAME002_SKIN1_GRID_LAYOUT,
  GAME002_REFERENCE_SIZE,
  GAME002_REFERENCE_VISIBLE_RECT_IN_ART,
  GAME002_REEL_COUNT,
  GAME002_STAGE_SIZE,
  GAME002_VISIBLE_ROWS,
  calculateGame002FrameScale,
  createGame002FramePolicy,
  createGame002Layout,
  createGame002ReelLayerLayout,
  createGame002ReelLayout,
  validateGame002BoardFrame,
} from "../src/game-layout.js";

describe("game002 layout", () => {
  it("locks art size, reference crop and mapped board frame", () => {
    const layout = createGame002Layout();

    expect(GAME002_ART_SIZE).toEqual({ width: 2000, height: 2000 });
    expect(GAME002_STAGE_SIZE).toEqual(GAME002_ART_SIZE);
    expect(GAME002_REFERENCE_SIZE).toEqual({ width: 1125, height: 2000 });
    expect(GAME002_REFERENCE_VISIBLE_RECT_IN_ART).toEqual({
      x: 437.5,
      y: 0,
      width: 1125,
      height: 2000,
    });
    expect(GAME002_ASSET_SIZE.background).toEqual({
      width: 2000,
      height: 2000,
    });
    expect(layout.background).toEqual({ x: 0, y: 0 });
    expect(layout.backgroundFrame).toEqual({
      x: 0,
      y: 0,
      width: 2000,
      height: 2000,
    });
    expect(GAME002_BOARD_FRAME_IN_REFERENCE).toEqual({
      x: 200,
      y: 330,
      width: 720,
      height: 1080,
    });
    expect(layout.boardFrame).toEqual({
      x: 637.5,
      y: 330,
      width: 720,
      height: 1080,
    });
    expect(layout.visibleRect).toEqual(GAME002_REFERENCE_VISIBLE_RECT_IN_ART);
    expect(layout.boardFrameInViewport).toEqual(
      GAME002_BOARD_FRAME_IN_REFERENCE,
    );
    expect(GAME002_BOARD_FRAME.width).toBe(
      GAME002_REEL_COUNT * GAME002_CELL_SIZE,
    );
    expect(GAME002_BOARD_FRAME.height).toBe(
      GAME002_VISIBLE_ROWS * GAME002_CELL_SIZE,
    );
  });

  it("locks skin 1 to the larger background grid instead of cropping the bottom row", () => {
    const layout = createGame002Layout({
      gridLayout: GAME002_SKIN1_GRID_LAYOUT,
    });
    const reelLayout = createGame002ReelLayout(GAME002_SKIN1_GRID_LAYOUT);
    const layerLayout = createGame002ReelLayerLayout(reelLayout, layout);

    expect(GAME002_SKIN1_CELL_WIDTH).toBe(125);
    expect(GAME002_SKIN1_CELL_HEIGHT).toBeCloseTo(133.3333333333);
    expect(GAME002_SKIN1_BOARD_FRAME).toEqual({
      x: 620,
      y: 465,
      width: 750,
      height: 1200,
    });
    expect(layout.boardFrame).toEqual(GAME002_SKIN1_BOARD_FRAME);
    expect(layout.boardFrameInViewport).toEqual({
      x: 182.5,
      y: 465,
      width: 750,
      height: 1200,
    });
    expect(reelLayout).toMatchObject({
      reelCount: 6,
      visibleRows: 9,
      cellWidth: 125,
      cellHeight: 400 / 3,
      columnGap: 0,
    });
    expect(layerLayout).toMatchObject({
      rawReelsContentWidth: 750,
      rawReelsContentHeight: 1200,
      x: 620,
      y: 465,
      stageVisibleFrame: GAME002_SKIN1_BOARD_FRAME,
      viewportVisibleFrame: layout.boardFrameInViewport,
    });
  });

  it("validates board frame dimensions and stage containment", () => {
    expect(() => validateGame002BoardFrame()).not.toThrow();
    expect(() =>
      validateGame002BoardFrame({ ...GAME002_BOARD_FRAME, x: -1 }),
    ).toThrow(/x/);
    expect(() =>
      validateGame002BoardFrame({ ...GAME002_BOARD_FRAME, width: 721 }),
    ).toThrow(/width/);
    expect(() =>
      validateGame002BoardFrame({ ...GAME002_BOARD_FRAME, height: 1079 }),
    ).toThrow(/height/);
    expect(() =>
      validateGame002BoardFrame(
        { ...GAME002_SKIN1_BOARD_FRAME, height: 1080 },
        GAME002_STAGE_SIZE,
        GAME002_SKIN1_CELL_WIDTH,
        GAME002_SKIN1_CELL_HEIGHT,
      ),
    ).toThrow(/height/);
    expect(() =>
      validateGame002BoardFrame({
        ...GAME002_BOARD_FRAME,
        y: 950,
      }),
    ).toThrow(/inside/);
  });

  it("creates a 6 x 9 120px reel layout at the board origin", () => {
    const reelLayout = createGame002ReelLayout();
    const layerLayout = createGame002ReelLayerLayout(reelLayout);

    expect(reelLayout.reelCount).toBe(6);
    expect(reelLayout.visibleRows).toBe(9);
    expect(reelLayout.cellWidth).toBe(120);
    expect(reelLayout.cellHeight).toBe(120);
    expect(reelLayout.columnGap).toBe(0);
    expect(layerLayout).toMatchObject({
      rawReelsContentWidth: 720,
      rawReelsContentHeight: 1080,
      x: 637.5,
      y: 330,
      stageVisibleFrame: GAME002_BOARD_FRAME,
      viewportVisibleFrame: GAME002_BOARD_FRAME_IN_REFERENCE,
    });
  });

  it("calculates focused art viewports for portrait, square and landscape", () => {
    expect(createGame002Layout({ width: 1125, height: 2000 })).toMatchObject({
      visibleRect: { x: 437.5, y: 0, width: 1125, height: 2000 },
      worldOffset: { x: -437.5, y: -0 },
      boardFrameInViewport: { x: 200, y: 330, width: 720, height: 1080 },
    });
    expect(createGame002Layout({ width: 1200, height: 1200 })).toMatchObject({
      visibleRect: { x: 397.5, y: 270, width: 1200, height: 1200 },
      worldOffset: { x: -397.5, y: -270 },
      boardFrameInViewport: { x: 240, y: 60, width: 720, height: 1080 },
    });
    expect(createGame002Layout({ width: 2000, height: 1200 })).toMatchObject({
      visibleRect: { x: 0, y: 270, width: 2000, height: 1200 },
      worldOffset: { x: -0, y: -270 },
      boardFrameInViewport: { x: 637.5, y: 60, width: 720, height: 1080 },
    });
  });

  it("creates the game002 framework focus policy", () => {
    expect(createGame002FramePolicy()).toEqual({
      mode: "focus",
      maxDesignSize: GAME002_ART_SIZE,
      preferredPortraitSize: GAME002_REFERENCE_SIZE,
      focusRect: { width: 720, height: 1080 },
      minFocusMargin: GAME002_FOCUS_MARGIN,
    });
    expect(createGame002FramePolicy(GAME002_SKIN1_GRID_LAYOUT)).toMatchObject({
      mode: "focus",
      focusRect: { width: 750, height: 1200 },
    });
  });

  it("locks grid cell reel order, timing and dimming parameters", () => {
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
  });

  it("rejects reel layer layouts that drift from the 6 x 9 board contract", () => {
    const reelLayout = createGame002ReelLayout();

    expect(() =>
      createGame002ReelLayerLayout({ ...reelLayout, reelCount: 5 }),
    ).toThrow(/reelCount/);
    expect(() =>
      createGame002ReelLayerLayout({ ...reelLayout, visibleRows: 8 }),
    ).toThrow(/visibleRows/);
    expect(() =>
      createGame002ReelLayerLayout({ ...reelLayout, cellWidth: 119 }),
    ).toThrow(/board width/);
    expect(() =>
      createGame002ReelLayerLayout({ ...reelLayout, columnGap: 1 }),
    ).toThrow(/columnGap/);
  });

  it("scales the complete stage into the viewport and rejects invalid viewport sizes", () => {
    expect(calculateGame002FrameScale(2000, 2000)).toBe(1);
    expect(calculateGame002FrameScale(4000, 4000)).toBe(2);
    expect(calculateGame002FrameScale(1920, 1080)).toBeCloseTo(1080 / 2000);
    expect(calculateGame002FrameScale(1000, 2000)).toBe(0.5);
    expect(() => calculateGame002FrameScale(0, 100)).toThrow(/viewportWidth/);
    expect(() => calculateGame002FrameScale(100, 0)).toThrow(/viewportHeight/);
  });
});
