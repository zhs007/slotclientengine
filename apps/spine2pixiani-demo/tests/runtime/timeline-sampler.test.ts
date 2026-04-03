import { describe, expect, it } from "vitest";
import { asset12AnimationData } from "../../src/data/asset-12-animation-data.js";
import { cabinAnimationData } from "../../src/data/cabin-animation-data.js";
import { computeWorldBoneTransforms, sampleAnimationPose } from "../../src/runtime/timeline-sampler.js";

describe("sampleAnimationPose", () => {
  it("samples slot attachment and color timelines", () => {
    const earlyPose = sampleAnimationPose(cabinAnimationData, "cabin", 0.2, true);
    const latePose = sampleAnimationPose(cabinAnimationData, "cabin", 1.5, true);

    expect(earlyPose.slots.ping1_01.attachmentName).toBe("ping1_01");
    expect(latePose.slots.ping1_01.attachmentName).toBeNull();
    expect(sampleAnimationPose(cabinAnimationData, "cabin_s", 0, true).slots.ui31.color).toBe("ffffff9f");
  });

  it("applies translated world transforms through the bone hierarchy", () => {
    const pose = sampleAnimationPose(cabinAnimationData, "cabin", 0.5, true);
    const worldBones = computeWorldBoneTransforms(cabinAnimationData, pose.bones);

    expect(worldBones.ping2_01.x).not.toBe(cabinAnimationData.bones.find((bone) => bone.name === "ping2_01")?.x);
    expect(worldBones.ping2_01.rotation).toBeCloseTo(6, 0);
  });

  it("samples shear and drawOrder timelines for asset 12", () => {
    const earlyPose = sampleAnimationPose(asset12AnimationData, "fg1", 1, true);
    const latePose = sampleAnimationPose(asset12AnimationData, "fg1", 1.1, true);

    expect(earlyPose.bones.zui.shearY).toBeCloseTo(-2.37, 2);
    expect(earlyPose.drawOrder).toEqual(asset12AnimationData.slotOrder);
    expect(latePose.drawOrder).not.toEqual(asset12AnimationData.slotOrder);
    expect(latePose.drawOrder[0]).toBe("heidi");
    expect(latePose.drawOrder.at(-1)).toBe("icon00");
  });
});