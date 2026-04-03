import { describe, expect, it } from "vitest";
import { cabinAnimationData } from "../../src/data/cabin-animation-data.js";
import { computeWorldBoneTransforms, sampleAnimationPose } from "../../src/runtime/timeline-sampler.js";
import {
  applyWorldTransformToScenePoint,
  composeWorldTransform,
  createMatrixFromTransform,
  deriveWorldTransform,
  multiplyAffineMatrices
} from "../../src/runtime/transform.js";

describe("transform", () => {
  it("preserves child rotation under a mirrored parent using affine composition", () => {
    const mirroredParent = composeWorldTransform({
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: -1,
      scaleY: 1
    });

    const child = composeWorldTransform(
      {
        x: 0,
        y: 0,
        rotation: 90,
        scaleX: 1,
        scaleY: 1
      },
      mirroredParent
    );

    expect(child.matrix.a).toBeCloseTo(0, 6);
    expect(child.matrix.b).toBeCloseTo(1, 6);
    expect(child.matrix.c).toBeCloseTo(1, 6);
    expect(child.matrix.d).toBeCloseTo(0, 6);

    const scenePoint = applyWorldTransformToScenePoint(child, { x: 10, y: 0 });
    expect(scenePoint.x).toBeCloseTo(0, 6);
    expect(scenePoint.y).toBeCloseTo(-10, 6);
  });

  it("matches manual affine multiplication for composed attachment transforms", () => {
    const bone = composeWorldTransform({
      x: 120,
      y: 80,
      rotation: 35,
      scaleX: -1,
      scaleY: 0.75
    });

    const attachmentMatrix = createMatrixFromTransform({
      x: -30,
      y: 25,
      rotation: -20,
      scaleX: 1.2,
      scaleY: 0.8
    });

    const composed = composeWorldTransform(
      {
        x: -30,
        y: 25,
        rotation: -20,
        scaleX: 1.2,
        scaleY: 0.8
      },
      bone
    );
    const manual = deriveWorldTransform(multiplyAffineMatrices(bone.matrix, attachmentMatrix));

    expect(composed.matrix).toEqual(manual.matrix);
  });

  it("keeps ui_k and ui_k2 sample branches mirrored in the default pose", () => {
    const pose = sampleAnimationPose(cabinAnimationData, "cabin", 0, true);
    const worldBones = computeWorldBoneTransforms(cabinAnimationData, pose.bones);

    expect(worldBones.ui_k2.x).toBeCloseTo(-worldBones.ui_k.x, 5);
    expect(worldBones.ui_k2.y).toBeCloseTo(worldBones.ui_k.y, 5);
    expect(worldBones.ui1.x).toBeCloseTo(-worldBones.ui01.x, 5);
    expect(worldBones.ui1.y).toBeCloseTo(worldBones.ui01.y, 5);
    expect(worldBones.ui2.x).toBeCloseTo(-worldBones.ui02.x, 5);
    expect(worldBones.ui2.y).toBeCloseTo(worldBones.ui02.y, 5);
  });
});