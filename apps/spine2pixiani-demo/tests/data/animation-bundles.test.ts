import { describe, expect, it } from "vitest";
import { animationBundles, getAnimationBundle } from "../../src/data/animation-bundles.js";

describe("animationBundles", () => {
  it("registers both cabin and asset 12 bundles", () => {
    expect(animationBundles.map((bundle) => bundle.id)).toEqual(["cabin", "asset-12"]);
    expect(getAnimationBundle("asset-12")).toMatchObject({
      defaultAnimationName: "bonus1",
      animationNames: ["bonus1", "bonus2", "bonus3", "bonus4", "bonus5", "fg1", "fg2", "fg3"]
    });
  });
});