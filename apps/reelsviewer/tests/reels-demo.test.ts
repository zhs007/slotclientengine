import { describe, expect, it } from "vitest";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import { createReelsDemo } from "../src/reels-demo.js";
import { createTextureSet } from "../../../packages/rendercore/tests/reel/helpers.js";

describe("reelsviewer demo", () => {
  it("builds the real GMI spin plan and lands on the GMI scene", () => {
    const demo = createReelsDemo({
      rawGameConfig,
      symbolAssets: createViewerTextures()
    });
    const plan = demo.createSpinPlan();

    expect(demo.finalYs).toEqual([1, 1, 4, 0, 27]);
    expect(plan.axes.every((axis) => axis.travelSymbols >= 50)).toBe(true);
    expect(demo.reelSet.getVisibleScene()).toEqual(demo.scene);

    demo.spin();
    expect(demo.isSpinning()).toBe(true);
    expect(() => demo.spin()).toThrow(/already spinning/);

    let result = demo.update(0.1);
    for (let index = 0; index < 50 && !result.completed; index += 1) {
      result = demo.update(0.1);
    }

    expect(result.completed).toBe(true);
    expect(demo.isSpinning()).toBe(false);
    expect(demo.reelSet.getVisibleScene()).toEqual(demo.scene);
  });

  it("fails if a textured paytable symbol has no spinBlur state texture", () => {
    const textures = createViewerTextures();
    textures.SC = {
      normal: createTextureSet(20, 20).normal,
      states: {}
    } as any;

    expect(() =>
      createReelsDemo({
        rawGameConfig,
        symbolAssets: textures
      })
    ).toThrow(/SC.*spinBlur/);
  });
});

function createViewerTextures() {
  return Object.fromEntries(
    ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10", "CO", "SX"].map(
      (symbol) => [symbol, createTextureSet(20, 20)]
    )
  );
}
