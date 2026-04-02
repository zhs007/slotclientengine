import { composeAttachmentTransform } from "./timeline-sampler.js";
import type { AttachmentPose, SampledAnimationPose, SlotPose, SpineModel, WorldTransform } from "./spine-types.js";

export type ScenePoint = {
  x: number;
  y: number;
};

export type AxisAlignedBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type SelectionBounds = {
  kind: "slot" | "bone" | "fallback";
  corners: [ScenePoint, ScenePoint, ScenePoint, ScenePoint];
  aabb: AxisAlignedBounds;
  center: ScenePoint;
};

export function computeAttachmentSceneQuad(
  transform: WorldTransform,
  attachment: Pick<AttachmentPose, "width" | "height">
): SelectionBounds {
  const halfWidth = attachment.width / 2;
  const halfHeight = attachment.height / 2;
  const corners = [
    projectScenePoint(transform, -halfWidth, -halfHeight),
    projectScenePoint(transform, halfWidth, -halfHeight),
    projectScenePoint(transform, halfWidth, halfHeight),
    projectScenePoint(transform, -halfWidth, halfHeight)
  ] as [ScenePoint, ScenePoint, ScenePoint, ScenePoint];
  const aabb = computeAxisAlignedBounds(corners);

  return {
    kind: "slot",
    corners,
    aabb,
    center: {
      x: (corners[0].x + corners[2].x) / 2,
      y: (corners[0].y + corners[2].y) / 2
    }
  };
}

export function computeSlotSelectionBounds(worldBone: WorldTransform | undefined, slotPose: SlotPose): SelectionBounds | null {
  if (!worldBone || !slotPose.attachment) {
    return null;
  }

  return computeAttachmentSceneQuad(composeAttachmentTransform(worldBone, slotPose.attachment), slotPose.attachment);
}

export function computeAxisAlignedBounds(points: readonly ScenePoint[]): AxisAlignedBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

export function mergeAxisAlignedBounds(boundsList: readonly AxisAlignedBounds[]): AxisAlignedBounds | null {
  if (boundsList.length === 0) {
    return null;
  }

  return finalizeBounds({
    minX: Math.min(...boundsList.map((bounds) => bounds.minX)),
    minY: Math.min(...boundsList.map((bounds) => bounds.minY)),
    maxX: Math.max(...boundsList.map((bounds) => bounds.maxX)),
    maxY: Math.max(...boundsList.map((bounds) => bounds.maxY)),
    width: 0,
    height: 0
  });
}

export function createSelectionBoundsFromAabb(
  kind: SelectionBounds["kind"],
  bounds: AxisAlignedBounds
): SelectionBounds {
  const normalizedBounds = finalizeBounds(bounds);
  const corners = axisAlignedBoundsToQuad(normalizedBounds);

  return {
    kind,
    corners,
    aabb: normalizedBounds,
    center: {
      x: (normalizedBounds.minX + normalizedBounds.maxX) / 2,
      y: (normalizedBounds.minY + normalizedBounds.maxY) / 2
    }
  };
}

export function createBoneFallbackSelectionBounds(worldBone: WorldTransform | undefined, size = 56): SelectionBounds | null {
  if (!worldBone) {
    return null;
  }

  const halfSize = size / 2;
  return createSelectionBoundsFromAabb("fallback", {
    minX: worldBone.x - halfSize,
    minY: -worldBone.y - halfSize,
    maxX: worldBone.x + halfSize,
    maxY: -worldBone.y + halfSize,
    width: size,
    height: size
  });
}

export function createBoneSubtreeSlotIndex(model: SpineModel) {
  const childBonesByParent = new Map<string | null, string[]>();
  const slotsByBone = new Map<string, string[]>();
  const slotNamesByBone = new Map<string, string[]>();

  for (const bone of model.bones) {
    const childBones = childBonesByParent.get(bone.parentName) ?? [];
    childBones.push(bone.name);
    childBonesByParent.set(bone.parentName, childBones);
  }

  for (const slot of model.slots) {
    const slotNames = slotsByBone.get(slot.boneName) ?? [];
    slotNames.push(slot.name);
    slotsByBone.set(slot.boneName, slotNames);
  }

  const collectSlotNames = (boneName: string): string[] => {
    const collected = [...(slotsByBone.get(boneName) ?? [])];
    for (const childBoneName of childBonesByParent.get(boneName) ?? []) {
      collected.push(...collectSlotNames(childBoneName));
    }
    slotNamesByBone.set(boneName, collected);
    return collected;
  };

  for (const bone of model.bones) {
    if (!slotNamesByBone.has(bone.name)) {
      collectSlotNames(bone.name);
    }
  }

  return slotNamesByBone;
}

export function computeBoneSelectionBounds(
  pose: SampledAnimationPose,
  worldBones: Record<string, WorldTransform>,
  boneName: string,
  slotNames: readonly string[]
): SelectionBounds | null {
  const slotBounds = slotNames
    .map((slotName) => {
      const slotPose = pose.slots[slotName];
      return slotPose ? computeSlotSelectionBounds(worldBones[slotPose.boneName], slotPose) : null;
    })
    .filter((bounds): bounds is SelectionBounds => bounds !== null);

  const mergedBounds = mergeAxisAlignedBounds(slotBounds.map((bounds) => bounds.aabb));
  if (mergedBounds) {
    return createSelectionBoundsFromAabb("bone", mergedBounds);
  }

  return createBoneFallbackSelectionBounds(worldBones[boneName]);
}

function projectScenePoint(transform: WorldTransform, localX: number, localY: number): ScenePoint {
  const radians = (-transform.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: transform.x + localX * transform.scaleX * cos - localY * transform.scaleY * sin,
    y: -transform.y + localX * transform.scaleX * sin + localY * transform.scaleY * cos
  };
}

function axisAlignedBoundsToQuad(bounds: AxisAlignedBounds): [ScenePoint, ScenePoint, ScenePoint, ScenePoint] {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY }
  ];
}

function finalizeBounds(bounds: AxisAlignedBounds): AxisAlignedBounds {
  return {
    ...bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY
  };
}