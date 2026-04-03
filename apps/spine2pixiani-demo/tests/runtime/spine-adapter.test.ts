import { describe, expect, it } from "vitest";
import { asset12AnimationData, asset12AnimationNames } from "../../src/data/asset-12-animation-data.js";
import { cabinAnimationData } from "../../src/data/cabin-animation-data.js";

describe("adaptSpineData", () => {
  it("builds the internal model with bones, slots, attachments, and animations", () => {
    expect(cabinAnimationData.bones.length).toBeGreaterThan(10);
    expect(cabinAnimationData.slots.length).toBeGreaterThan(10);
    expect(Object.keys(cabinAnimationData.animations)).toEqual(["cabin", "cabin_s"]);
    expect(cabinAnimationData.animations.cabin.bones.ping2_01.translate.length).toBeGreaterThan(0);
    expect(cabinAnimationData.animations.cabin.slots.ping1_01.color.length).toBeGreaterThan(0);
    expect(cabinAnimationData.slots.find((slot) => slot.name === "ping_g")?.blendMode).toBe("additive");
    expect(cabinAnimationData.attachments.ui31.ui8.textureName).toBe("ui8");
  });

  it("adapts asset 12 animations with shear and drawOrder timelines", () => {
    expect(asset12AnimationNames).toEqual(["bonus1", "bonus2", "bonus3", "bonus4", "bonus5", "fg1", "fg2", "fg3"]);
    expect(asset12AnimationData.bones.length).toBeGreaterThan(150);
    expect(asset12AnimationData.slots.length).toBeGreaterThan(120);
    expect(asset12AnimationData.animations.fg1.bones.zui.shear).toEqual([
      expect.objectContaining({ time: 0.9583, x: 0, y: -2.37 })
    ]);
    expect(asset12AnimationData.animations.fg1.drawOrder).toEqual([
      expect.objectContaining({ time: 1.0417, slotOrder: expect.any(Array) })
    ]);
  });
});