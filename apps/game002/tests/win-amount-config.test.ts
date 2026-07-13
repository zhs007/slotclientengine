import { describe, expect, it } from "vitest";
import { createGame002Layout } from "../src/game-layout.js";
import {
  createGame002WinAmountAnimationConfig,
  createGame002WinAmountLayout,
} from "../src/win-amount-config.js";

describe("game002 win amount config", () => {
  it("anchors the amount overlay to the configured board and full art", () => {
    const layout = createGame002Layout();
    expect(createGame002WinAmountLayout(layout)).toEqual({
      minorTextPosition: {
        x: layout.boardFrame.x + layout.boardFrame.width / 2,
        y: layout.boardFrame.y + layout.boardFrame.height - 28,
      },
      majorTextPosition: {
        x: layout.boardFrame.x + layout.boardFrame.width / 2,
        y: layout.boardFrame.y + layout.boardFrame.height / 2,
      },
      tierStageRect: layout.backgroundFrame,
    });
  });

  it("uses the copied manifest as the sole tier timing source", () => {
    const config = createGame002WinAmountAnimationConfig(createGame002Layout());
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
    expect(config.tiers.map((tier) => tier.loopStartTime)).toEqual([1, 1, 1]);
    expect(config.tiers.map((tier) => tier.loopEndTime)).toEqual([
      2.5, 2.5, 2.5,
    ]);
  });
});
