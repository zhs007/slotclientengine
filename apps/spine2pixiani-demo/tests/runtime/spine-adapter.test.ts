import { describe, expect, it } from "vitest";
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
});