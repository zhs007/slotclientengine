import { describe, expect, it } from "vitest";
import {
  GAME003_ASSET_SIZE,
  GAME003_CELL_HEIGHT,
  GAME003_CELL_WIDTH,
  GAME003_REEL_WINDOW_IN_MAIN_REEL_BG,
  GAME003_SCENE_PART_GAP,
  GAME003_SKIN1_LANDSCAPE_SCENE_PARTS,
  GAME003_SKIN1_PORTRAIT_SCENE_PARTS,
  createGame003FramePolicy,
  createGame003Layout,
  createGame003ReelLayerLayout,
  createGame003ReelLayout,
  validateGame003ReelWindow,
} from "../src/game-layout.js";

describe("game003 layout", () => {
  it("computes landscape scene parts with conveyor on the left and bottom aligned", () => {
    const parts = GAME003_SKIN1_LANDSCAPE_SCENE_PARTS;

    expect(parts.groupFrame).toEqual({
      x: 288,
      y: 588,
      width: 1424,
      height: 824,
    });
    expect(parts.conveyor.x).toBe(parts.groupFrame.x);
    expect(parts.mainReelBackground.x).toBe(
      parts.conveyor.x + parts.conveyor.width + GAME003_SCENE_PART_GAP,
    );
    expect(parts.conveyor.y + parts.conveyor.height).toBe(
      parts.mainReelBackground.y + parts.mainReelBackground.height,
    );
    expect(parts.focusRegion).toBe(parts.groupFrame);
  });

  it("computes portrait scene parts with conveyor above and centered", () => {
    const parts = GAME003_SKIN1_PORTRAIT_SCENE_PARTS;

    expect(parts.groupFrame).toEqual({
      x: 22,
      y: 469.5,
      width: 1130,
      height: 1061,
    });
    expect(
      parts.conveyor.y + parts.conveyor.height + GAME003_SCENE_PART_GAP,
    ).toBe(parts.mainReelBackground.y);
    expect(parts.conveyor.x).toBe(
      parts.groupFrame.x + (parts.groupFrame.width - parts.conveyor.width) / 2,
    );
    expect(parts.mainReelBackground.x).toBe(parts.groupFrame.x);
    expect(parts.focusRegion).toBe(parts.groupFrame);
  });

  it("selects backgrounds and focus regions by viewport orientation", () => {
    const landscape = createGame003Layout({
      viewportSize: { width: 1600, height: 1000 },
    });
    expect(landscape.orientation).toBe("landscape");
    expect(landscape.backgroundFrame).toEqual({
      x: 0,
      y: 0,
      width: 2000,
      height: 2000,
    });
    expect(landscape.focusRegion).toEqual(
      GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.focusRegion,
    );

    const portrait = createGame003Layout({
      viewportSize: { width: 1174, height: 2000 },
    });
    expect(portrait.orientation).toBe("portrait");
    expect(portrait.backgroundFrame).toEqual({
      x: 0,
      y: 0,
      width: 1174,
      height: 2000,
    });
    expect(portrait.focusRegion).toEqual(
      GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion,
    );

    expect(
      createGame003Layout({ viewportSize: { width: 1424, height: 1424 } })
        .orientation,
    ).toBe("landscape");
  });

  it("locks reel window calibration and reel layer placement", () => {
    expect(GAME003_REEL_WINDOW_IN_MAIN_REEL_BG).toEqual({
      x: 135,
      y: 87,
      width: 860,
      height: 650,
    });
    expect(GAME003_CELL_WIDTH).toBe(172);
    expect(GAME003_CELL_HEIGHT).toBe(130);
    expect(() => validateGame003ReelWindow()).not.toThrow();
    expect(() =>
      validateGame003ReelWindow({ x: 300, y: 300, width: 900, height: 650 }),
    ).toThrow(/fit inside/);

    const layout = createGame003Layout({
      viewportSize: { width: 1600, height: 1000 },
    });
    const reelLayout = createGame003ReelLayout();
    const layer = createGame003ReelLayerLayout(reelLayout, layout);
    expect(layer).toMatchObject({
      rawReelsContentWidth: 860,
      rawReelsContentHeight: 650,
      x: GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.reelWindow.x,
      y: GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.reelWindow.y,
    });
  });

  it("uses framework focus policy only for canvas sizing, not game003 scene part rules", () => {
    expect(createGame003FramePolicy()).toMatchObject({
      mode: "orientation-focus",
      variants: {
        landscape: {
          maxDesignSize: { width: 2000, height: 2000 },
          focusRect: {
            width: GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.focusRegion.width,
            height: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.height,
          },
        },
        portrait: {
          maxDesignSize: { width: 1174, height: 2000 },
          focusRect: {
            width: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.width,
            height: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.height,
          },
          minFocusMargin: { left: 22, right: 22 },
        },
      },
    });
    expect(GAME003_ASSET_SIZE.mainReelBackground).toEqual({
      width: 1130,
      height: 824,
    });
  });
});
