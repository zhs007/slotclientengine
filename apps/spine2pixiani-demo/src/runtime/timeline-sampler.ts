import type {
  AttachmentKeyframe,
  BonePose,
  ColorKeyframe,
  NumericKeyframe,
  SampledAnimationPose,
  SlotPose,
  SpineCurve,
  SpineModel,
  VectorKeyframe,
  WorldTransform
} from "./spine-types.js";
import { composeWorldTransform } from "./transform.js";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function evaluateCubicBezier(t: number, [x1, y1, x2, y2]: [number, number, number, number]) {
  const sampleCurveX = (time: number) => {
    const inverse = 1 - time;
    return 3 * inverse * inverse * time * x1 + 3 * inverse * time * time * x2 + time * time * time;
  };
  const sampleCurveY = (time: number) => {
    const inverse = 1 - time;
    return 3 * inverse * inverse * time * y1 + 3 * inverse * time * time * y2 + time * time * time;
  };
  const sampleCurveDerivativeX = (time: number) => {
    const inverse = 1 - time;
    return 3 * inverse * inverse * x1 + 6 * inverse * time * (x2 - x1) + 3 * time * time * (1 - x2);
  };

  let estimate = t;
  for (let index = 0; index < 6; index += 1) {
    const error = sampleCurveX(estimate) - t;
    const derivative = sampleCurveDerivativeX(estimate);
    if (Math.abs(error) < 1e-6 || Math.abs(derivative) < 1e-6) {
      break;
    }
    estimate -= error / derivative;
  }

  return sampleCurveY(clamp(estimate, 0, 1));
}

function easeProgress(progress: number, curve: SpineCurve) {
  if (curve === "stepped") {
    return 0;
  }

  if (curve === "linear") {
    return progress;
  }

  return evaluateCubicBezier(progress, curve);
}

function normalizeLoopTime(duration: number, elapsedSeconds: number, loop: boolean) {
  if (duration <= 0) {
    return 0;
  }

  if (!loop) {
    return clamp(elapsedSeconds, 0, duration);
  }

  const wrapped = elapsedSeconds % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}

function normalizeAngle(angle: number) {
  let normalized = angle;
  while (normalized > 180) {
    normalized -= 360;
  }
  while (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

function sampleNumeric(frames: NumericKeyframe[], time: number, fallback: number, angle = false) {
  if (frames.length === 0) {
    return fallback;
  }

  const first = frames[0];
  if (time < first.time) {
    return fallback;
  }

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (time >= frame.time) {
      const next = frames[index + 1];
      if (!next || next.time === frame.time || frame.curve === "stepped") {
        return frame.value;
      }

      const progress = easeProgress((time - frame.time) / (next.time - frame.time), frame.curve);
      if (angle) {
        return frame.value + normalizeAngle(next.value - frame.value) * progress;
      }
      return frame.value + (next.value - frame.value) * progress;
    }
  }

  return fallback;
}

function sampleVector(frames: VectorKeyframe[], time: number, fallback: { x: number; y: number }) {
  if (frames.length === 0) {
    return fallback;
  }

  const first = frames[0];
  if (time < first.time) {
    return fallback;
  }

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (time >= frame.time) {
      const next = frames[index + 1];
      if (!next || next.time === frame.time || frame.curve === "stepped") {
        return {
          x: frame.x,
          y: frame.y
        };
      }

      const progress = easeProgress((time - frame.time) / (next.time - frame.time), frame.curve);
      return {
        x: frame.x + (next.x - frame.x) * progress,
        y: frame.y + (next.y - frame.y) * progress
      };
    }
  }

  return fallback;
}

function sampleColor(frames: ColorKeyframe[], time: number, fallback: string) {
  if (frames.length === 0) {
    return fallback;
  }

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (time >= frames[index].time) {
      return frames[index].color;
    }
  }

  return fallback;
}

function sampleAttachment(frames: AttachmentKeyframe[], time: number, fallback: string | null) {
  if (frames.length === 0) {
    return fallback;
  }

  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (time >= frames[index].time) {
      return frames[index].name;
    }
  }

  return fallback;
}

export function sampleAnimationPose(
  model: SpineModel,
  animationName: string,
  elapsedSeconds: number,
  loop = true
): SampledAnimationPose {
  const animation = model.animations[animationName];
  if (!animation) {
    throw new Error(`Unknown animation: ${animationName}`);
  }

  const time = normalizeLoopTime(animation.duration, elapsedSeconds, loop);
  const bones: Record<string, BonePose> = {};
  for (const bone of model.bones) {
    const timelines = animation.bones[bone.name];
    const translate = sampleVector(timelines?.translate ?? [], time, { x: 0, y: 0 });
    const scale = sampleVector(timelines?.scale ?? [], time, { x: 1, y: 1 });
    const rotation = sampleNumeric(timelines?.rotate ?? [], time, 0, true);

    bones[bone.name] = {
      x: bone.x + translate.x,
      y: bone.y + translate.y,
      rotation: bone.rotation + rotation,
      scaleX: bone.scaleX * scale.x,
      scaleY: bone.scaleY * scale.y
    };
  }

  const slots: Record<string, SlotPose> = {};
  for (const slot of model.slots) {
    const timelines = animation.slots[slot.name];
    const attachmentName = sampleAttachment(timelines?.attachment ?? [], time, slot.attachmentName);
    const color = sampleColor(timelines?.color ?? [], time, slot.color);
    const attachment = attachmentName ? model.attachments[slot.name]?.[attachmentName] ?? null : null;

    slots[slot.name] = {
      slotName: slot.name,
      boneName: slot.boneName,
      attachmentName,
      attachment,
      color,
      blendMode: slot.blendMode
    };
  }

  return {
    animationName,
    time,
    duration: animation.duration,
    bones,
    slots,
    drawOrder: [...model.slotOrder]
  };
}

export function computeWorldBoneTransforms(model: SpineModel, localBones: Record<string, BonePose>) {
  const worldBones: Record<string, WorldTransform> = {};

  for (const bone of model.bones) {
    const local = localBones[bone.name];
    const parent = bone.parentName ? worldBones[bone.parentName] : undefined;
    worldBones[bone.name] = composeWorldTransform(local, parent);
  }

  return worldBones;
}

export function composeAttachmentTransform(bone: WorldTransform, attachment: NonNullable<SlotPose["attachment"]>) {
  return composeWorldTransform(attachment, bone);
}