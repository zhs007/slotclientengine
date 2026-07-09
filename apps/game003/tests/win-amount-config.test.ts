import { describe, expect, it } from "vitest";
import {
  GAME003_SKIN1_LANDSCAPE_SCENE_PARTS,
  GAME003_SKIN1_PORTRAIT_SCENE_PARTS,
  createGame003Layout,
} from "../src/game-layout.js";
import {
  createGame003WinAmountAnimationConfig,
  createGame003WinAmountLayout,
} from "../src/win-amount-config.js";

describe("game003 win amount config", () => {
  it("maps static anchors to current orientation reel area", () => {
    const portrait = createGame003Layout({
      viewportSize: { width: 1174, height: 2000 },
    });
    const landscape = createGame003Layout({
      viewportSize: { width: 1600, height: 1000 },
    });

    expect(createGame003WinAmountLayout(portrait)).toMatchObject({
      minorTextPosition: {
        x:
          GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.x +
          GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.width / 2,
        y:
          GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.y +
          GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.height -
          28,
      },
      majorTextPosition: {
        x:
          GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.x +
          GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.width / 2,
        y:
          GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.y +
          GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.height / 2,
      },
      tierStageRect: portrait.backgroundFrame,
    });
    expect(createGame003WinAmountLayout(landscape).minorTextPosition.x).toBe(
      GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.reelArea.x +
        GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.reelArea.width / 2,
    );
  });

  it("creates rendercore config from generated resources and shared formatter", () => {
    const config = createGame003WinAmountAnimationConfig(createGame003Layout());

    expect(config.formatter(100)).toBe("$1.00");
    expect(config.thresholdMultipliers).toEqual({
      minor: 1,
      big: 15,
      super: 30,
      mega: 50,
    });
    expect(config.tiers.map((tier) => tier.id)).toEqual([
      "bigwin",
      "superwin",
      "megawin",
    ]);
    expect(config.tiers.map((tier) => tier.durationSeconds)).toEqual([
      2.9, 2.9, 2.9,
    ]);
    expect(config.tiers.map((tier) => tier.loopEndTime)).toEqual([
      2.5, 2.5, 2.5,
    ]);
    expect(config.tiers[2].vniProject.stage.duration).toBe(2.9);
  });
});
