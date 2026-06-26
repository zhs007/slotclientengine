import { clampNumber, roundTo } from "./coordinates.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GTransformConfig,
} from "./types.js";

export interface VNISafeGlowLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
  blendMode: V5GBlendMode;
}

export interface VNISafeGlowSpriteSample {
  type: "safe_glow";
  layerId: string;
  animationId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode: V5GBlendMode;
}

export function getSafeGlowProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  if (animation.type !== "safe_glow") return null;
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start || time >= end) return null;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

export function hasActiveSafeGlowAnimation(
  layer: V5GLayerConfig,
  time: number,
): boolean {
  if (layer.type !== "image") return false;
  return layer.animations.some(
    (animation) =>
      animation.enabled && getSafeGlowProgress(animation, time) !== null,
  );
}

export function sampleSafeGlowSpritesForLayer(
  layer: V5GLayerConfig,
  sampledLayer: VNISafeGlowLayerSampleState,
  time: number,
): VNISafeGlowSpriteSample[] {
  if (
    layer.type !== "image" ||
    !layer.visible ||
    sampledLayer.baseOpacity <= 0
  ) {
    return [];
  }

  const sprites: VNISafeGlowSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled) continue;
    const progress = getSafeGlowProgress(animation, time);
    if (progress === null) continue;
    const sprite = sampleSafeGlowSprite(animation, sampledLayer, progress);
    if (sprite) sprites.push(sprite);
  }
  return sprites;
}

function sampleSafeGlowSprite(
  animation: V5GAnimationConfig,
  sampledLayer: VNISafeGlowLayerSampleState,
  progress: number,
): VNISafeGlowSpriteSample | null {
  const spread = clampSafeGlowNumber(getNumberParam(animation, "spread"), 0, 1);
  const minOpacity = clampSafeGlowNumber(
    getNumberParam(animation, "minOpacity"),
    0,
    1,
  );
  const maxOpacity = clampSafeGlowNumber(
    getNumberParam(animation, "maxOpacity"),
    0,
    1,
  );
  const pulses = clampSafeGlowNumber(
    getNumberParam(animation, "pulses"),
    0,
    60,
  );
  const wave =
    pulses <= 0 ? 1 : (1 - Math.cos(progress * Math.PI * 2 * pulses)) / 2;
  const alpha =
    sampledLayer.baseOpacity * lerpNumber(minOpacity, maxOpacity, wave);
  if (alpha <= 0.002 || spread <= 0.001) return null;

  const glowScale = 1 + spread;
  return {
    type: "safe_glow",
    layerId: sampledLayer.layerId,
    animationId: animation.id,
    x: 0,
    y: 0,
    scaleX: roundTo(sampledLayer.transform.scaleX * glowScale, 4),
    scaleY: roundTo(sampledLayer.transform.scaleY * glowScale, 4),
    rotation: roundTo((sampledLayer.transform.rotation * Math.PI) / 180, 4),
    alpha: roundTo(clampNumber(alpha, 0, 1), 4),
    blendMode: sampledLayer.blendMode,
  };
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}

function clampSafeGlowNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function lerpNumber(from: number, to: number, ratio: number): number {
  return from + (to - from) * clampNumber(ratio, 0, 1);
}
