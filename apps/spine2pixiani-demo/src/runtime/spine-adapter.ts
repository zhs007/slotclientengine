import type {
  AttachmentPose,
  AttachmentKeyframe,
  BoneAnimation,
  ColorKeyframe,
  DrawOrderKeyframe,
  NumericKeyframe,
  RawAttachmentFrame,
  RawColorFrame,
  RawDrawOrderFrame,
  RawNumericFrame,
  RawSpineSkeleton,
  SlotAnimation,
  SpineCurve,
  SpineModel,
  VectorKeyframe
} from "./spine-types.js";

function normalizeCurve(curve?: "stepped" | [number, number, number, number]): SpineCurve {
  if (curve === "stepped") {
    return "stepped";
  }

  if (Array.isArray(curve) && curve.length === 4) {
    return curve;
  }

  return "linear";
}

function adaptNumericFrames(frames?: RawNumericFrame[], kind: "angle" | "vector" = "vector") {
  if (!frames) {
    return [];
  }

  if (kind === "angle") {
    return frames.map<NumericKeyframe>((frame) => ({
      time: frame.time,
      value: frame.angle ?? 0,
      curve: normalizeCurve(frame.curve)
    }));
  }

  return frames.map<VectorKeyframe>((frame) => ({
    time: frame.time,
    x: frame.x ?? (kind === "vector" ? 0 : 1),
    y: frame.y ?? (kind === "vector" ? 0 : 1),
    curve: normalizeCurve(frame.curve)
  }));
}

function adaptScaleFrames(frames?: RawNumericFrame[]) {
  return (frames ?? []).map<VectorKeyframe>((frame) => ({
    time: frame.time,
    x: frame.x ?? 1,
    y: frame.y ?? 1,
    curve: normalizeCurve(frame.curve)
  }));
}

function adaptAttachmentFrames(frames?: RawAttachmentFrame[]) {
  return (frames ?? []).map<AttachmentKeyframe>((frame) => ({
    time: frame.time,
    name: frame.name ?? null
  }));
}

function adaptColorFrames(frames?: RawColorFrame[]) {
  return (frames ?? []).map<ColorKeyframe>((frame) => ({
    time: frame.time,
    color: frame.color,
    curve: normalizeCurve(frame.curve)
  }));
}

function expandDrawOrderFrame(slotOrder: string[], frame: RawDrawOrderFrame): string[] {
  const offsets = frame.offsets ?? [];
  if (offsets.length === 0) {
    return [...slotOrder];
  }

  const slotIndices = new Map(slotOrder.map((slotName, index) => [slotName, index]));
  const expandedOrder = new Array<string>(slotOrder.length);
  const unchangedSlots: string[] = [];
  let originalIndex = 0;

  for (const offset of offsets) {
    const slotIndex = slotIndices.get(offset.slot);
    if (slotIndex === undefined) {
      continue;
    }

    while (originalIndex < slotIndex) {
      unchangedSlots.push(slotOrder[originalIndex]);
      originalIndex += 1;
    }

    expandedOrder[slotIndex + offset.offset] = slotOrder[slotIndex];
    originalIndex += 1;
  }

  while (originalIndex < slotOrder.length) {
    unchangedSlots.push(slotOrder[originalIndex]);
    originalIndex += 1;
  }

  for (let index = expandedOrder.length - 1; index >= 0; index -= 1) {
    if (!expandedOrder[index]) {
      expandedOrder[index] = unchangedSlots.pop() ?? slotOrder[index];
    }
  }

  return expandedOrder;
}

function adaptDrawOrderFrames(slotOrder: string[], frames?: RawDrawOrderFrame[]) {
  return (frames ?? []).map<DrawOrderKeyframe>((frame) => ({
    time: frame.time,
    slotOrder: expandDrawOrderFrame(slotOrder, frame)
  }));
}

function computeAnimationDuration(animation: {
  bones?: Record<string, { rotate?: RawNumericFrame[]; translate?: RawNumericFrame[]; scale?: RawNumericFrame[]; shear?: RawNumericFrame[] }>;
  slots?: Record<string, { attachment?: RawAttachmentFrame[]; color?: RawColorFrame[] }>;
  drawOrder?: RawDrawOrderFrame[];
}) {
  let duration = 0;
  for (const slot of Object.values(animation.slots ?? {})) {
    for (const frame of slot.attachment ?? []) {
      duration = Math.max(duration, frame.time);
    }
    for (const frame of slot.color ?? []) {
      duration = Math.max(duration, frame.time);
    }
  }
  for (const bone of Object.values(animation.bones ?? {})) {
    for (const frame of bone.rotate ?? []) {
      duration = Math.max(duration, frame.time);
    }
    for (const frame of bone.translate ?? []) {
      duration = Math.max(duration, frame.time);
    }
    for (const frame of bone.scale ?? []) {
      duration = Math.max(duration, frame.time);
    }
    for (const frame of bone.shear ?? []) {
      duration = Math.max(duration, frame.time);
    }
  }
  for (const frame of animation.drawOrder ?? []) {
    duration = Math.max(duration, frame.time);
  }
  return duration;
}

function adaptAttachment(name: string, attachmentName: string, source: AttachmentPose | Record<string, number | string | undefined>): AttachmentPose {
  return {
    name: attachmentName,
    textureName: String((source as { path?: string }).path ?? attachmentName),
    x: Number((source as { x?: number }).x ?? 0),
    y: Number((source as { y?: number }).y ?? 0),
    rotation: Number((source as { rotation?: number }).rotation ?? 0),
    scaleX: Number((source as { scaleX?: number }).scaleX ?? 1),
    scaleY: Number((source as { scaleY?: number }).scaleY ?? 1),
    width: Number((source as { width?: number }).width ?? 0),
    height: Number((source as { height?: number }).height ?? 0)
  };
}

export function adaptSpineData(raw: RawSpineSkeleton): SpineModel {
  const bones = raw.bones.map((bone) => ({
    name: bone.name,
    parentName: bone.parent ?? null,
    x: bone.x ?? 0,
    y: bone.y ?? 0,
    rotation: bone.rotation ?? 0,
    scaleX: bone.scaleX ?? 1,
    scaleY: bone.scaleY ?? 1,
    shearX: bone.shearX ?? 0,
    shearY: bone.shearY ?? 0
  }));

  const slots: SpineModel["slots"] = raw.slots.map((slot) => ({
    name: slot.name,
    boneName: slot.bone,
    attachmentName: slot.attachment ?? null,
    color: slot.color ?? "ffffffff",
    blendMode: slot.blend === "additive" ? "additive" : "normal"
  }));

  const attachments: SpineModel["attachments"] = {};
  const attachmentNames = new Set<string>();
  for (const [slotName, slotAttachments] of Object.entries(raw.skins.default)) {
    attachments[slotName] = {};
    for (const [attachmentName, attachment] of Object.entries(slotAttachments)) {
      attachments[slotName][attachmentName] = adaptAttachment(slotName, attachmentName, attachment);
      attachmentNames.add(attachments[slotName][attachmentName].textureName);
    }
  }

  const animations = Object.fromEntries(
    Object.entries(raw.animations).map(([animationName, animation]) => {
      const bonesAnimation: Record<string, BoneAnimation> = {};
      for (const [boneName, bone] of Object.entries(animation.bones ?? {})) {
        bonesAnimation[boneName] = {
          rotate: adaptNumericFrames(bone.rotate, "angle") as NumericKeyframe[],
          translate: adaptNumericFrames(bone.translate) as VectorKeyframe[],
          scale: adaptScaleFrames(bone.scale),
          shear: adaptNumericFrames(bone.shear) as VectorKeyframe[]
        };
      }

      const slotsAnimation: Record<string, SlotAnimation> = {};
      for (const [slotName, slot] of Object.entries(animation.slots ?? {})) {
        slotsAnimation[slotName] = {
          attachment: adaptAttachmentFrames(slot.attachment),
          color: adaptColorFrames(slot.color)
        };
      }

      const drawOrder = adaptDrawOrderFrames(slots.map((slot) => slot.name), animation.drawOrder);

      return [
        animationName,
        {
          name: animationName,
          duration: computeAnimationDuration(animation),
          bones: bonesAnimation,
          slots: slotsAnimation,
          drawOrder
        }
      ];
    })
  );

  return {
    skeleton: {
      width: raw.skeleton.width ?? 0,
      height: raw.skeleton.height ?? 0,
      fps: raw.skeleton.fps ?? 24
    },
    bones,
    boneOrder: bones.map((bone) => bone.name),
    slots,
    slotOrder: slots.map((slot) => slot.name),
    attachments,
    attachmentNames: [...attachmentNames],
    animations
  };
}