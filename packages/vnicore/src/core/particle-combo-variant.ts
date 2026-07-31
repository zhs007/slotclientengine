import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  VNIProjectConfig,
} from "./types.js";
import { validateVNIProject } from "./validation.js";

export interface VNIParticleComboAnimationRef {
  readonly layerId: string;
  readonly animationId: string;
}

export interface VNIParticleComboTarget {
  readonly x: number;
  readonly y: number;
}

export type VNIParticleComboTimingMode =
  | { readonly mode: "preserve-authored-speed" }
  | {
      readonly mode: "fixed-duration";
      readonly durationSeconds: number;
    };

export interface VNIParticleComboTimingDescriptor {
  readonly mode: VNIParticleComboTimingMode["mode"];
  readonly authoredTarget: VNIParticleComboTarget;
  readonly effectiveTarget: VNIParticleComboTarget;
  readonly authoredDistance: number;
  readonly effectiveDistance: number;
  readonly authoredDurationSeconds: number;
  readonly effectiveDurationSeconds: number;
  readonly authoredSpeed: number;
  readonly effectiveSpeed: number;
  readonly startTime: number;
  readonly endTime: number;
  readonly range: {
    readonly unit: "time";
    readonly start: number;
    readonly end: number;
  };
}

export interface VNIParticleComboAnimationDescriptor extends VNIParticleComboAnimationRef {
  readonly layerName: string;
  readonly animationName: string;
  readonly target: VNIParticleComboTarget;
  readonly distance: number;
  readonly durationSeconds: number;
  readonly speed: number;
  readonly startTime: number;
  readonly endTime: number;
}

export interface VNIParticleComboTargetVariant {
  readonly project: VNIProjectConfig;
  readonly animation: VNIParticleComboAnimationRef;
  readonly timing: VNIParticleComboTimingDescriptor;
}

export interface CreateVNIParticleComboTargetVariantOptions {
  readonly project: VNIProjectConfig;
  readonly animation: VNIParticleComboAnimationRef;
  readonly target: VNIParticleComboTarget;
  readonly timing?: VNIParticleComboTimingMode;
}

export function listVNIParticleComboTargetAnimations(
  project: VNIProjectConfig,
): readonly VNIParticleComboAnimationDescriptor[] {
  validateVNIProject(project);
  const descriptors: VNIParticleComboAnimationDescriptor[] = [];

  for (const layer of project.layers) {
    for (const animation of layer.animations) {
      if (!animation.enabled || animation.type !== "particle_combo") continue;
      const target = getParticleComboTarget(animation, layer.id);
      const durationSeconds = assertPositiveFinite(
        animation.duration,
        `particle_combo "${animation.id}" duration`,
      );
      const distance = Math.hypot(target.x, target.y);
      const speed = distance / durationSeconds;
      descriptors.push(
        Object.freeze({
          layerId: layer.id,
          animationId: animation.id,
          layerName: layer.name,
          animationName: animation.name ?? animation.id,
          target: freezeTarget(target),
          distance,
          durationSeconds,
          speed,
          startTime: animation.startTime,
          endTime: animation.startTime + durationSeconds,
        }),
      );
    }
  }

  return Object.freeze(descriptors);
}

export function createVNIParticleComboTargetVariant(
  options: CreateVNIParticleComboTargetVariantOptions,
): VNIParticleComboTargetVariant {
  assertNonEmptyString(options.animation.layerId, "animation.layerId");
  assertNonEmptyString(options.animation.animationId, "animation.animationId");
  const effectiveTarget = {
    x: assertFinite(options.target.x, "target.x"),
    y: assertFinite(options.target.y, "target.y"),
  };
  const timingMode = options.timing ?? {
    mode: "preserve-authored-speed",
  };
  validateVNIProject(options.project);
  const project = structuredClone(options.project);
  const { layer, animation } = findParticleComboAnimation(
    project,
    options.animation,
  );
  const authoredTarget = getParticleComboTarget(animation, layer.id);
  const authoredDurationSeconds = assertPositiveFinite(
    animation.duration,
    `particle_combo "${animation.id}" duration`,
  );
  const authoredDistance = Math.hypot(authoredTarget.x, authoredTarget.y);
  const effectiveDistance = Math.hypot(effectiveTarget.x, effectiveTarget.y);
  const authoredSpeed = authoredDistance / authoredDurationSeconds;

  let effectiveDurationSeconds: number;
  if (timingMode.mode === "preserve-authored-speed") {
    assertPositiveFinite(
      authoredDistance,
      `particle_combo "${animation.id}" authored target distance`,
    );
    assertPositiveFinite(
      effectiveDistance,
      `particle_combo "${animation.id}" effective target distance`,
    );
    effectiveDurationSeconds = assertPositiveFinite(
      effectiveDistance / authoredSpeed,
      `particle_combo "${animation.id}" effective duration`,
    );
  } else if (timingMode.mode === "fixed-duration") {
    effectiveDurationSeconds = assertPositiveFinite(
      timingMode.durationSeconds,
      "timing.durationSeconds",
    );
  } else {
    const unreachable: never = timingMode;
    throw new Error(
      `Unsupported particle_combo timing mode: ${String(unreachable)}.`,
    );
  }

  const effectiveSpeed = effectiveDistance / effectiveDurationSeconds;
  animation.params.targetX = effectiveTarget.x;
  animation.params.targetY = effectiveTarget.y;
  animation.duration = effectiveDurationSeconds;
  const startTime = animation.startTime;
  const endTime = startTime + effectiveDurationSeconds;
  project.stage.duration = Math.max(project.stage.duration, endTime);
  validateVNIProject(project);

  return Object.freeze({
    project,
    animation: Object.freeze({ ...options.animation }),
    timing: Object.freeze({
      mode: timingMode.mode,
      authoredTarget: freezeTarget(authoredTarget),
      effectiveTarget: freezeTarget(effectiveTarget),
      authoredDistance,
      effectiveDistance,
      authoredDurationSeconds,
      effectiveDurationSeconds,
      authoredSpeed,
      effectiveSpeed,
      startTime,
      endTime,
      range: Object.freeze({
        unit: "time" as const,
        start: startTime,
        end: endTime,
      }),
    }),
  });
}

function findParticleComboAnimation(
  project: VNIProjectConfig,
  ref: VNIParticleComboAnimationRef,
): { layer: V5GLayerConfig; animation: V5GAnimationConfig } {
  const layer = project.layers.find(
    (candidate) => candidate.id === ref.layerId,
  );
  if (!layer) {
    throw new Error(`Unknown VNI layer "${ref.layerId}".`);
  }
  const animation = layer.animations.find(
    (candidate) => candidate.id === ref.animationId,
  );
  if (!animation) {
    throw new Error(
      `Unknown VNI animation "${ref.animationId}" on layer "${ref.layerId}".`,
    );
  }
  if (animation.type !== "particle_combo") {
    throw new Error(
      `VNI animation "${ref.animationId}" on layer "${ref.layerId}" must be particle_combo, got "${animation.type}".`,
    );
  }
  if (!animation.enabled) {
    throw new Error(
      `VNI particle_combo "${ref.animationId}" on layer "${ref.layerId}" must be enabled.`,
    );
  }
  return { layer, animation };
}

function getParticleComboTarget(
  animation: V5GAnimationConfig,
  layerId: string,
): VNIParticleComboTarget {
  return {
    x: assertFinite(
      animation.params.targetX,
      `layer "${layerId}" animation "${animation.id}" params.targetX`,
    ),
    y: assertFinite(
      animation.params.targetY,
      `layer "${layerId}" animation "${animation.id}" params.targetY`,
    ),
  };
}

function assertFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function assertPositiveFinite(value: unknown, path: string): number {
  const number = assertFinite(value, path);
  if (number <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
  return number;
}

function assertNonEmptyString(value: unknown, path: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string.`);
  }
}

function freezeTarget(target: VNIParticleComboTarget): VNIParticleComboTarget {
  return Object.freeze({ x: target.x, y: target.y });
}
