import { clampNumber, roundTo } from "./coordinates.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GTransformConfig,
} from "./types.js";

const MAX_CHASER_LIGHT_SPRITES = 200;

export interface VNIChaserLightLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
  blendMode: V5GBlendMode;
}

export interface VNIChaserLightTextureSize {
  width: number;
  height: number;
}

export interface VNIChaserLightSpriteSample {
  type: "chaser_light";
  layerId: string;
  animationId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  alpha: number;
  blendMode: V5GBlendMode;
  isLit: boolean;
}

export function getChaserLightProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  if (animation.type !== "chaser_light") return null;
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start || time >= end) return null;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

export function hasActiveChaserLightAnimation(
  layer: V5GLayerConfig,
  time: number,
): boolean {
  if (layer.type !== "image") return false;
  return layer.animations.some(
    (animation) =>
      animation.enabled && getChaserLightProgress(animation, time) !== null,
  );
}

export function sampleChaserLightSpritesForLayer(
  layer: V5GLayerConfig,
  sampledLayer: VNIChaserLightLayerSampleState,
  textureSize: VNIChaserLightTextureSize,
  time: number,
): VNIChaserLightSpriteSample[] {
  if (
    layer.type !== "image" ||
    !layer.visible ||
    sampledLayer.baseOpacity <= 0
  ) {
    return [];
  }

  const sprites: VNIChaserLightSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled) continue;
    const progress = getChaserLightProgress(animation, time);
    if (progress === null) continue;
    sprites.push(
      ...sampleChaserLightSprites(animation, sampledLayer, textureSize, time),
    );
  }
  return sprites;
}

function sampleChaserLightSprites(
  animation: V5GAnimationConfig,
  sampledLayer: VNIChaserLightLayerSampleState,
  textureSize: VNIChaserLightTextureSize,
  time: number,
): VNIChaserLightSpriteSample[] {
  const totalCount = Math.round(
    clampChaserNumber(
      getNumberParam(animation, "totalCount"),
      1,
      MAX_CHASER_LIGHT_SPRITES,
    ),
  );
  const spacing = clampChaserNumber(
    getNumberParam(animation, "spacing"),
    0,
    5000,
  );
  const lightDuration = clampChaserNumber(
    getNumberParam(animation, "lightDuration"),
    0.001,
    Math.max(animation.duration, 0.001),
  );
  const interval = clampChaserNumber(
    getNumberParam(animation, "interval"),
    0.001,
    10,
  );
  const trajectory = Math.round(
    clampChaserNumber(getNumberParam(animation, "trajectory"), 0, 2),
  );
  const radius = clampChaserNumber(
    getNumberParam(animation, "radius"),
    0,
    5000,
  );
  const centerX = getNumberParam(animation, "centerX");
  const centerY = -getNumberParam(animation, "centerY");
  const endX = getNumberParam(animation, "endX");
  const endY = -getNumberParam(animation, "endY");
  const curve = getNumberParam(animation, "curve");
  const lightSize = clampChaserNumber(
    getNumberParam(animation, "lightSize"),
    1,
    2000,
  );
  const dimAlpha = clampChaserNumber(
    getNumberParam(animation, "dimAlpha"),
    0,
    1,
  );
  const elapsed = Math.max(0, time - animation.startTime);
  const cycleDuration = Math.max(interval * totalCount + lightDuration, 0.001);
  const textureEdge = Math.max(1, textureSize.width, textureSize.height);
  const baseScale = lightSize / textureEdge;
  const sprites: VNIChaserLightSpriteSample[] = [];

  for (let index = 0; index < totalCount; index += 1) {
    const point = sampleTrajectoryPoint(
      index,
      totalCount,
      elapsed,
      trajectory,
      spacing,
      radius,
      centerX,
      centerY,
      endX,
      endY,
      curve,
    );
    const cycleTime =
      (((elapsed - index * interval) % cycleDuration) + cycleDuration) %
      cycleDuration;
    const isLit = cycleTime <= lightDuration;
    const wave = isLit
      ? Math.sin((cycleTime / Math.max(lightDuration, 0.001)) * Math.PI)
      : 0;
    const alpha =
      sampledLayer.baseOpacity * (isLit ? 0.72 + wave * 0.28 : dimAlpha);
    if (alpha <= 0.002) continue;
    sprites.push({
      type: "chaser_light",
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      x: roundTo(point.x, 4),
      y: roundTo(point.y, 4),
      scale: roundTo(baseScale * (isLit ? 1 + wave * 0.35 : 0.65), 4),
      rotation: roundTo(point.rotation, 4),
      alpha: roundTo(clampNumber(alpha, 0, 1), 4),
      blendMode: isLit ? "add" : sampledLayer.blendMode,
      isLit,
    });
  }

  return sprites;
}

function sampleTrajectoryPoint(
  index: number,
  totalCount: number,
  elapsed: number,
  trajectory: number,
  spacing: number,
  radius: number,
  centerX: number,
  centerY: number,
  endX: number,
  endY: number,
  curve: number,
): { x: number; y: number; rotation: number } {
  const ratio = totalCount <= 1 ? 0 : index / (totalCount - 1);
  if (trajectory === 0) {
    const circumferenceRadius = Math.max(radius, spacing / (Math.PI * 2));
    const angle =
      (index / Math.max(totalCount, 1)) * Math.PI * 2 + elapsed * Math.PI * 2;
    return {
      x: centerX + Math.cos(angle) * circumferenceRadius,
      y: centerY + Math.sin(angle) * circumferenceRadius,
      rotation: angle + Math.PI / 2,
    };
  }
  if (trajectory === 2) {
    const point = quadraticPoint(centerX, centerY, endX, endY, curve, ratio);
    const next = quadraticPoint(
      centerX,
      centerY,
      endX,
      endY,
      curve,
      clampNumber(ratio + 0.01, 0, 1),
    );
    return {
      ...point,
      rotation: Math.atan2(next.y - point.y, next.x - point.x),
    };
  }
  const x = centerX + (endX - centerX) * ratio;
  const y = centerY + (endY - centerY) * ratio;
  return {
    x,
    y,
    rotation: Math.atan2(endY - centerY, endX - centerX),
  };
}

function quadraticPoint(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  curve: number,
  progress: number,
): { x: number; y: number } {
  const t = clampNumber(progress, 0, 1);
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  const controlX = midX + (-dy / length) * curve;
  const controlY = midY + (dx / length) * curve;
  const inv = 1 - t;
  return {
    x: inv * inv * fromX + 2 * inv * t * controlX + t * t * toX,
    y: inv * inv * fromY + 2 * inv * t * controlY + t * t * toY,
  };
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}

function clampChaserNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
