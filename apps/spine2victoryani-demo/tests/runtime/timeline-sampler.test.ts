import { describe, expect, it } from "vitest";
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
});