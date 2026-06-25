import { describe, expect, it } from "vitest";
import {
  GAME002_ASSET_SIZE,
  GAME002_BOARD_FRAME,
  GAME002_CELL_SIZE,
  GAME002_GRID_CELL_DIMMING,
  GAME002_GRID_CELL_REEL_ORDER,
  GAME002_GRID_CELL_REEL_TIMING,
  GAME002_REEL_COUNT,
  GAME002_STAGE_SIZE,
  GAME002_VISIBLE_ROWS,
  calculateGame002FrameScale,
  createGame002Layout,
  createGame002ReelLayerLayout,
  createGame002ReelLayout,
  validateGame002BoardFrame,
} from "../src/game-layout.js";

describe("game002 layout", () => {
  it("locks the stage, background and board frame to task 49 pixels", () => {
    const layout = createGame002Layout();

    expect(GAME002_STAGE_SIZE).toEqual({ width: 1125, height: 2000 });
    expect(GAME002_ASSET_SIZE.background).toEqual({
      width: 1125,
      height: 2000,
    });
    expect(layout.background).toEqual({ x: 0, y: 0 });
    expect(layout.boardFrame).toEqual({
      x: 200,
      y: 330,
      width: 720,
      height: 1080,
    });
    expect(GAME002_BOARD_FRAME.width).toBe(
      GAME002_REEL_COUNT * GAME002_CELL_SIZE,
    );
    expect(GAME002_BOARD_FRAME.height).toBe(
      GAME002_VISIBLE_ROWS * GAME002_CELL_SIZE,
    );
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
      x: 200,
      y: 330,
      stageVisibleFrame: GAME002_BOARD_FRAME,
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
    ).toThrow(/cell size/);
    expect(() =>
      createGame002ReelLayerLayout({ ...reelLayout, columnGap: 1 }),
    ).toThrow(/columnGap/);
  });

  it("scales the complete stage into the viewport and rejects invalid viewport sizes", () => {
    expect(calculateGame002FrameScale(1125, 2000)).toBe(1);
    expect(calculateGame002FrameScale(2250, 4000)).toBe(2);
    expect(calculateGame002FrameScale(1920, 1080)).toBeCloseTo(1080 / 2000);
    expect(calculateGame002FrameScale(562.5, 2000)).toBe(0.5);
    expect(() => calculateGame002FrameScale(0, 100)).toThrow(/viewportWidth/);
    expect(() => calculateGame002FrameScale(100, 0)).toThrow(/viewportHeight/);
  });
});
