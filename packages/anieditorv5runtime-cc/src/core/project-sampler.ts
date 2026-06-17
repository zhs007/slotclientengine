import { clampNumber, roundTo } from "./coordinates.js";
import { sampleLayerAnimationsAtTime } from "./animation-sampler.js";
import { hasActiveParticleAnimation } from "./particle-sampler.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GProjectConfig,
  V5GTransformConfig,
} from "./types.js";

export interface SampledLayerState {
  layerId: string;
  transform: V5GTransformConfig;
  opacity: number;
  visible: boolean;
  renderImageDisplay: boolean;
  hasActiveParticleAnimation: boolean;
  blendMode: V5GBlendMode;
}

export interface SampledProjectState {
  time: number;
  layers: SampledLayerState[];
}

export function sampleProjectAtTime(
  project: V5GProjectConfig,
  time: number,
): SampledProjectState {
  const clampedTime = roundTo(clampNumber(time, 0, project.stage.duration), 4);
  return {
    time: clampedTime,
    layers: project.layers.map((layer) =>
      sampleLayerAtTime(layer, clampedTime),
    ),
  };
}

export function sampleLayerAtTime(
  layer: V5GLayerConfig,
  time: number,
): SampledLayerState {
  const sampled = sampleLayerAnimationsAtTime(
    {
      transform: { ...layer.transform },
      opacity: layer.opacity,
    },
    layer.animations,
    time,
  );
  const hasAnyEnabled = layer.animations.some((animation) => animation.enabled);
  const hasPendingOpacityEntry = layer.animations.some(
    (animation) =>
      animation.enabled &&
      isOpacityEntryAnimation(animation) &&
      time < animation.startTime,
  );
  const hasActiveCoverage = hasAnyEnabled
    ? layer.animations.some(
        (animation) =>
          animation.enabled &&
          time >= animation.startTime &&
          time <= animation.startTime + animation.duration,
      )
    : true;
  const opacity =
    hasPendingOpacityEntry || (hasAnyEnabled && !hasActiveCoverage)
      ? 0
      : roundTo(clampNumber(sampled.opacity, 0, 1), 4);
  const activeParticleAnimation =
    opacity > 0 && hasActiveParticleAnimation(layer, time);
  const visible = layer.visible && opacity > 0;

  return {
    layerId: layer.id,
    transform: sampled.transform,
    opacity,
    visible,
    renderImageDisplay: visible && !activeParticleAnimation,
    hasActiveParticleAnimation: activeParticleAnimation,
    blendMode: layer.blendMode,
  };
}

function isOpacityEntryAnimation(animation: V5GAnimationConfig): boolean {
  if (animation.type === "fade") {
    return getNumberParam(animation, "fromOpacity") === 0;
  }
  if (animation.type === "slide_in") {
    return getBooleanParam(animation, "fadeIn", true);
  }
  if (animation.type === "bounce_in") {
    return getBooleanParam(animation, "fadeIn", true);
  }
  if (animation.type === "scale_in") {
    return getBooleanParam(animation, "fadeIn", true);
  }
  return false;
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.NaN;
}

function getBooleanParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: boolean,
): boolean {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  return value === true;
}
