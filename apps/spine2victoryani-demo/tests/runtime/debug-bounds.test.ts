import { describe, expect, it } from "vitest";
import { cabinAnimationData } from "../../src/data/cabin-animation-data.js";
import {
  computeAttachmentSceneQuad,
  computeBoneSelectionBounds,
  computeSlotSelectionBounds,
  createBoneFallbackSelectionBounds,
  createBoneSubtreeSlotIndex,
  mergeAxisAlignedBounds
} from "../../src/runtime/debug-bounds.js";
import { composeAttachmentTransform, computeWorldBoneTransforms, sampleAnimationPose } from "../../src/runtime/timeline-sampler.js";
import { composeWorldTransform } from "../../src/runtime/transform.js";

describe("debug-bounds", () => {
  it("projects attachment corners into scene space", () => {
    const bounds = computeAttachmentSceneQuad(
      composeWorldTransform({
        x: 48,
        y: 16,
        rotation: 0,
        scaleX: 2,
        scaleY: 1.5
      }),
      {
        width: 20,
        height: 12
      }
    );

    expect(bounds.center).toEqual({ x: 48, y: -16 });
    expect(bounds.corners).toEqual([
      { x: 28, y: -25 },
      { x: 68, y: -25 },
      { x: 68, y: -7 },
      { x: 28, y: -7 }
    ]);
  });

  it("matches slot selection center with the composed attachment transform", () => {
    const pose = sampleAnimationPose(cabinAnimationData, "cabin", 0.5, true);
    const worldBones = computeWorldBoneTransforms(cabinAnimationData, pose.bones);
    const slotPose = Object.values(pose.slots).find((slot) => slot.attachment);
    if (!slotPose) {
      throw new Error("Expected at least one visible slot in sampled pose");
    }

    const attachmentWorld = composeAttachmentTransform(worldBones[slotPose.boneName], slotPose.attachment!);
    const bounds = computeSlotSelectionBounds(worldBones[slotPose.boneName], slotPose);

    expect(bounds).not.toBeNull();
    expect(bounds?.center.x).toBeCloseTo(attachmentWorld.x, 5);
    expect(bounds?.center.y).toBeCloseTo(-attachmentWorld.y, 5);
    expect(bounds?.aabb.width).toBeGreaterThan(0);
    expect(bounds?.aabb.height).toBeGreaterThan(0);
  });

  it("builds subtree unions for bones and falls back when no attachment is visible", () => {
    const pose = sampleAnimationPose(cabinAnimationData, "cabin", 0.5, true);
    const worldBones = computeWorldBoneTransforms(cabinAnimationData, pose.bones);
    const slotIndex = createBoneSubtreeSlotIndex(cabinAnimationData);
    const boneName = "ping2_01";
    const bounds = computeBoneSelectionBounds(pose, worldBones, boneName, slotIndex.get(boneName) ?? []);

    expect(bounds).not.toBeNull();
    expect(bounds?.kind).toBe("bone");
    expect(bounds?.aabb.width).toBeGreaterThan(0);
    expect(bounds?.aabb.height).toBeGreaterThan(0);

    const fallback = computeBoneSelectionBounds(pose, worldBones, boneName, []);
    expect(fallback?.kind).toBe("fallback");
    expect(fallback).toEqual(createBoneFallbackSelectionBounds(worldBones[boneName]));
  });

  it("merges multiple slot bounds and skips empty attachments", () => {
    const pose = sampleAnimationPose(cabinAnimationData, "cabin", 1.5, true);
    const worldBones = computeWorldBoneTransforms(cabinAnimationData, pose.bones);
    const hiddenSlotBounds = computeSlotSelectionBounds(worldBones[pose.slots.ping1_01.boneName], pose.slots.ping1_01);
    const visibleSlotPose = Object.values(pose.slots).find((slot) => slot.attachment);

    if (!visibleSlotPose) {
      throw new Error("Expected a visible slot when validating merged bounds");
    }

    const visibleSlotBounds = computeSlotSelectionBounds(
      worldBones[visibleSlotPose.boneName],
      visibleSlotPose
    );

    expect(hiddenSlotBounds).toBeNull();
    expect(visibleSlotBounds).not.toBeNull();

    const mergedBounds = mergeAxisAlignedBounds([visibleSlotBounds!.aabb]);
    expect(mergedBounds).toMatchObject(visibleSlotBounds!.aabb);
  });

  it("keeps mirrored slot bounds symmetric for ui_k and ui_k2 branches", () => {
    const pose = sampleAnimationPose(cabinAnimationData, "cabin", 0, true);
    const worldBones = computeWorldBoneTransforms(cabinAnimationData, pose.bones);
    const leftBounds = computeSlotSelectionBounds(worldBones[pose.slots.ui13.boneName], pose.slots.ui13);
    const rightBounds = computeSlotSelectionBounds(worldBones[pose.slots.ui18.boneName], pose.slots.ui18);

    expect(leftBounds).not.toBeNull();
    expect(rightBounds).not.toBeNull();
    expect(rightBounds?.center.x).toBeCloseTo(-leftBounds!.center.x, 5);
    expect(rightBounds?.center.y).toBeCloseTo(leftBounds!.center.y, 5);
    expect(rightBounds?.aabb.width).toBeCloseTo(leftBounds!.aabb.width, 5);
    expect(rightBounds?.aabb.height).toBeCloseTo(leftBounds!.aabb.height, 5);
  });
});