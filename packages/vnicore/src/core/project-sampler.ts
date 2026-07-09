import { clampNumber, roundTo } from "./coordinates.js";
import { sampleLayerAnimationsAtTime } from "./animation-sampler.js";
import { hasActiveChaserLightAnimation } from "./chaser-light-sampler.js";
import { hasActiveDeterministicEffectAnimation } from "./effect-sampler.js";
import { hasActiveParticleAnimation } from "./particle-sampler.js";
import { hasActiveRenderEffectAnimation } from "./render-effect-sampler.js";
import { hasActiveSafeGlowAnimation } from "./safe-glow-sampler.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GProjectConfig,
  V5GTransformConfig,
} from "./types.js";

const VISUAL_ENTRY_SCALE_THRESHOLD = 0.011;

export interface SampledLayerState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
  opacity: number;
  visible: boolean;
  renderImageDisplay: boolean;
  hasActiveParticleAnimation: boolean;
  hasActiveChaserLightAnimation: boolean;
  hasActiveRenderEffect: boolean;
  hasActiveDeterministicEffect: boolean;
  hasActiveSafeGlowAnimation: boolean;
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
  const hasActiveScaleEntryStart = layer.animations.some(
    (animation) =>
      animation.enabled &&
      isScaleEntryAnimation(animation) &&
      isSameSampleTime(time, animation.startTime),
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
    hasActiveScaleEntryStart || (hasAnyEnabled && !hasActiveCoverage)
      ? 0
      : roundTo(clampNumber(sampled.opacity, 0, 1), 4);
  const baseOpacity = roundTo(clampNumber(layer.opacity, 0, 1), 4);
  const activeParticleAnimation =
    layer.visible && baseOpacity > 0 && hasActiveParticleAnimation(layer, time);
  const activeChaserLight =
    layer.visible &&
    baseOpacity > 0 &&
    hasActiveChaserLightAnimation(layer, time);
  const activeRenderEffect =
    layer.visible &&
    baseOpacity > 0 &&
    hasActiveRenderEffectAnimation(layer, time);
  const activeDeterministicEffect =
    layer.visible &&
    baseOpacity > 0 &&
    hasActiveDeterministicEffectAnimation(layer, time);
  const activeSafeGlow =
    layer.visible && baseOpacity > 0 && hasActiveSafeGlowAnimation(layer, time);
  const visible =
    layer.visible &&
    (opacity > 0 ||
      activeChaserLight ||
      activeRenderEffect ||
      activeDeterministicEffect ||
      activeSafeGlow);

  return {
    layerId: layer.id,
    transform: sampled.transform,
    baseOpacity,
    opacity,
    visible,
    renderImageDisplay: layer.visible && opacity > 0,
    hasActiveParticleAnimation: activeParticleAnimation,
    hasActiveChaserLightAnimation: activeChaserLight,
    hasActiveRenderEffect: activeRenderEffect,
    hasActiveDeterministicEffect: activeDeterministicEffect,
    hasActiveSafeGlowAnimation: activeSafeGlow,
    blendMode: layer.blendMode,
  };
}

function isScaleEntryAnimation(animation: V5GAnimationConfig): boolean {
  if (animation.type === "scale_up") {
    return (
      getNumberParam(animation, "fromScaleX") <= VISUAL_ENTRY_SCALE_THRESHOLD ||
      getNumberParam(animation, "fromScaleY") <= VISUAL_ENTRY_SCALE_THRESHOLD
    );
  }
  if (animation.type === "scale_in" || animation.type === "bounce_in") {
    return (
      getNumberParam(animation, "fromScale") <= VISUAL_ENTRY_SCALE_THRESHOLD
    );
  }
  return false;
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return Number.NaN;
}

function isSameSampleTime(left: number, right: number): boolean {
  return roundTo(left - right, 4) === 0;
}
