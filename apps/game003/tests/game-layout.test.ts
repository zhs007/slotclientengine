import { describe, expect, it } from "vitest";
import {
  GAME003_ASSET_SIZE,
  GAME003_CELL_HEIGHT,
  GAME003_CELL_WIDTH,
  GAME003_REEL_WINDOW_IN_MAIN_REEL_BG,
  GAME003_SKIN1_LANDSCAPE_SCENE_PARTS,
  GAME003_SKIN1_LANDSCAPE_ART_SIZE,
  GAME003_SKIN1_PORTRAIT_SCENE_PARTS,
  createGame003ScenePartsForVariant,
  createGame003FramePolicy,
  createGame003Layout,
  createGame003ReelLayerLayout,
  createGame003ReelLayout,
  validateGame003ReelWindow,
} from "../src/game-layout.js";
import { GAME003_STATIC_CONFIG } from "../src/generated/game-static.generated.js";

describe("game003 layout", () => {
  it("computes landscape scene parts from focus-relative coordinates", () => {
    const parts = GAME003_SKIN1_LANDSCAPE_SCENE_PARTS;

    expect(parts.groupFrame).toEqual({
      x: 288,
      y: 588,
      width: 1424,
      height: 824,
    });
    expect(parts.mainReelBackground).toEqual({
      x: 582,
      y: 578,
      width: 1130,
      height: 824,
    });
    expect(parts.conveyor).toEqual({
      x: 288,
      y: 602.5,
      width: 284,
      height: 775,
    });
    expect(parts.reelWindow).toEqual({
      x: 717,
      y: 665,
      width: 860,
      height: 650,
    });
    expect(parts.conveyor.y + parts.conveyor.height / 2).toBe(
      parts.mainReelBackground.y + parts.mainReelBackground.height / 2,
    );
    expect(parts.focusRegion).toBe(parts.groupFrame);
  });

  it("computes portrait scene parts from focus-relative coordinates", () => {
    const parts = GAME003_SKIN1_PORTRAIT_SCENE_PARTS;

    expect(parts.groupFrame).toEqual({
      x: 22,
      y: 469.5,
      width: 1130,
      height: 1061,
    });
    expect(parts.mainReelBackground).toEqual({
      x: 22,
      y: 616.5,
      width: 1130,
      height: 824,
    });
    expect(parts.conveyor).toEqual({
      x: 120,
      y: 389.5,
      width: 934,
      height: 227,
    });
    expect(parts.reelWindow).toEqual({
      x: 157,
      y: 703.5,
      width: 860,
      height: 650,
    });
    expect(parts.conveyor.y + parts.conveyor.height).toBe(
      parts.mainReelBackground.y,
    );
    expect(parts.focusRegion).toBe(parts.groupFrame);
  });

  it("uses explicit main reel focus offsets instead of conveyor width formulas", () => {
    const variant = GAME003_STATIC_CONFIG.skins["1"].art.variants.landscape;
    const parts = createGame003ScenePartsForVariant({
      orientation: "landscape",
      artSize: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
      variant: {
        ...variant,
        mainReelBackgroundPositionInFocusRect: { x: 310, y: -8 },
      },
    });

    expect(parts.mainReelBackground).toEqual({
      x: 598,
      y: 580,
      width: 1130,
      height: 824,
    });
    expect(parts.mainReelBackground.x).not.toBe(
      parts.conveyor.x + parts.conveyor.width + 10,
    );
  });

  it("fails fast when game003 conveyor or anchored positions are invalid", () => {
    const variant = GAME003_STATIC_CONFIG.skins["1"].art.variants.landscape;

    expect(() =>
      createGame003ScenePartsForVariant({
        orientation: "landscape",
        artSize: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
        variant: { ...variant, conveyor: undefined },
      }),
    ).toThrow(/conveyor config is required/);

    expect(() =>
      createGame003ScenePartsForVariant({
        orientation: "landscape",
        artSize: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
        variant: {
          ...variant,
          mainReelBackgroundPositionInFocusRect: { x: 900, y: 0 },
        },
      }),
    ).toThrow(/rect mapped/);
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
