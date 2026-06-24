import { clampNumber, roundTo } from "./coordinates.js";
import { seededRandom } from "./particle-sampler.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GTransformConfig,
} from "./types.js";

export type VNIRenderEffectType = "shatter" | "glow";

export interface VNIRenderEffectLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
  blendMode: V5GBlendMode;
}

export interface VNIRenderEffectTextureSize {
  width: number;
  height: number;
}

export interface VNIShatterPieceSample {
  type: "shatter";
  layerId: string;
  animationId: string;
  localX: number;
  localY: number;
  pieceWidth: number;
  pieceHeight: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode: V5GBlendMode;
}

export interface VNIGlowSpriteSample {
  type: "glow";
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

export type VNIRenderEffectSpriteSample =
  | VNIShatterPieceSample
  | VNIGlowSpriteSample;

export function isRenderEffectAnimationType(
  value: string,
): value is VNIRenderEffectType {
  return value === "shatter" || value === "glow";
}

export function getRenderEffectProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  if (!isRenderEffectAnimationType(animation.type)) return null;
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start || time >= end) return null;
  const progress = clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
  return progress <= 0 ? null : progress;
}

export function hasActiveRenderEffectAnimation(
  layer: V5GLayerConfig,
  time: number,
): boolean {
  if (layer.type !== "image") return false;
  return layer.animations.some(
    (animation) =>
      animation.enabled && getRenderEffectProgress(animation, time) !== null,
  );
}

export function sampleRenderEffectSpritesForLayer(
  layer: V5GLayerConfig,
  sampledLayer: VNIRenderEffectLayerSampleState,
  textureSize: VNIRenderEffectTextureSize,
  time: number,
): VNIRenderEffectSpriteSample[] {
  if (
    layer.type !== "image" ||
    !layer.visible ||
    sampledLayer.baseOpacity <= 0
  ) {
    return [];
  }

  const sprites: VNIRenderEffectSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled) continue;
    const progress = getRenderEffectProgress(animation, time);
    if (progress === null) continue;
    if (animation.type === "shatter") {
      sprites.push(
        ...sampleShatterSprites(animation, sampledLayer, textureSize, progress),
      );
    } else if (animation.type === "glow") {
      sprites.push(
        ...sampleGlowSprites(animation, sampledLayer, textureSize, progress),
      );
    }
  }
  return sprites;
}

function sampleShatterSprites(
  animation: V5GAnimationConfig,
  sampledLayer: VNIRenderEffectLayerSampleState,
  textureSize: VNIRenderEffectTextureSize,
  progress: number,
): VNIShatterPieceSample[] {
  const maxCount = Math.round(
    clampRenderEffectNumber(getNumberParam(animation, "count"), 1, 600),
  );
  const pieceSize = clampRenderEffectNumber(
    getNumberParam(animation, "pieceSize"),
    4,
    1024,
  );
  const force = clampRenderEffectNumber(
    getNumberParam(animation, "force"),
    0,
    5000,
  );
  const impactAngle = getNumberParam(animation, "impactAngle");
  const spreadAngle = clampRenderEffectNumber(
    getNumberParam(animation, "spreadAngle"),
    0,
    360,
  );
  const gravity = clampRenderEffectNumber(
    getNumberParam(animation, "gravity"),
    -5000,
    8000,
  );
  const spin = clampRenderEffectNumber(
    getNumberParam(animation, "spin"),
    0,
    60,
  );
  const fadeOut = getOptionalBooleanParam(animation, "fadeOut", true);
  const duration = Math.max(animation.duration, 0.0001);
  const age = progress * duration;
  const alphaBase =
    sampledLayer.baseOpacity * (fadeOut ? Math.pow(1 - progress, 1.2) : 1);
  if (alphaBase <= 0.002) return [];

  const textureWidth = Math.max(1, textureSize.width);
  const textureHeight = Math.max(1, textureSize.height);
  const cols = Math.max(1, Math.ceil(textureWidth / pieceSize));
  const rows = Math.max(1, Math.ceil(textureHeight / pieceSize));
  const totalPieces = cols * rows;
  const drawCount = Math.min(maxCount, totalPieces);
  const step = totalPieces <= drawCount ? 1 : totalPieces / drawCount;
  const scaleX = sampledLayer.transform.scaleX;
  const scaleY = sampledLayer.transform.scaleY;
  const rotationRad = (sampledLayer.transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  const anchorOffsetX = (0.5 - sampledLayer.transform.anchorX) * textureWidth;
  const anchorOffsetY = (0.5 - sampledLayer.transform.anchorY) * textureHeight;
  const pieces: VNIShatterPieceSample[] = [];

  for (let drawIndex = 0; drawIndex < drawCount; drawIndex += 1) {
    const pieceIndex = Math.min(
      totalPieces - 1,
      Math.floor(
        drawIndex * step +
          seededRandom(animation.seed, drawIndex, 401) * Math.max(1, step),
      ),
    );
    const col = pieceIndex % cols;
    const row = Math.floor(pieceIndex / cols);
    const x0 = (col / cols) * textureWidth;
    const y0 = (row / rows) * textureHeight;
    const x1 = ((col + 1) / cols) * textureWidth;
    const y1 = ((row + 1) / rows) * textureHeight;
    const pieceWidth = Math.max(1, x1 - x0);
    const pieceHeight = Math.max(1, y1 - y0);
    const localX = x0 + pieceWidth / 2 - textureWidth / 2 + anchorOffsetX;
    const localY = y0 + pieceHeight / 2 - textureHeight / 2 + anchorOffsetY;
    const baseX = (localX * cos - localY * sin) * scaleX;
    const baseY = (localX * sin + localY * cos) * scaleY;
    const randomA = seededRandom(animation.seed, pieceIndex, 411);
    const randomB = seededRandom(animation.seed, pieceIndex, 412);
    const randomC = seededRandom(animation.seed, pieceIndex, 413);
    const randomD = seededRandom(animation.seed, pieceIndex, 414);
    const angle =
      ((impactAngle + (randomA - 0.5) * spreadAngle) * Math.PI) / 180;
    const velocity = force * (0.35 + randomB * 0.95);
    const travelX = Math.cos(angle) * velocity * age;
    const travelY =
      Math.sin(angle) * velocity * age + 0.5 * gravity * age * age;

    pieces.push({
      type: "shatter",
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      localX: roundTo(localX, 4),
      localY: roundTo(localY, 4),
      pieceWidth: roundTo(pieceWidth, 4),
      pieceHeight: roundTo(pieceHeight, 4),
      x: roundTo(baseX + travelX, 4),
      y: roundTo(baseY + travelY, 4),
      scaleX: roundTo(scaleX, 4),
      scaleY: roundTo(scaleY, 4),
      rotation: roundTo(
        rotationRad + (randomC - 0.5) * spin * Math.PI * progress,
        4,
      ),
      alpha: roundTo(clampNumber(alphaBase * (0.72 + randomD * 0.28), 0, 1), 4),
      blendMode: sampledLayer.blendMode,
    });
  }

  return pieces;
}

function sampleGlowSprites(
  animation: V5GAnimationConfig,
  sampledLayer: VNIRenderEffectLayerSampleState,
  _textureSize: VNIRenderEffectTextureSize,
  progress: number,
): VNIGlowSpriteSample[] {
  const intensity = clampRenderEffectNumber(
    getNumberParam(animation, "intensity"),
    0,
    5,
  );
  if (intensity <= 0.001) return [];
  const spread = clampRenderEffectNumber(
    getNumberParam(animation, "spread"),
    0,
    2,
  );
  const minAlpha = clampRenderEffectNumber(
    getNumberParam(animation, "minAlpha"),
    0,
    1,
  );
  const maxAlpha = clampRenderEffectNumber(
    getNumberParam(animation, "maxAlpha"),
    0,
    1,
  );
  const pulses = clampRenderEffectNumber(
    getNumberParam(animation, "pulses"),
    0,
    60,
  );
  const blendModeIndex = Math.round(
    clampRenderEffectNumber(getNumberParam(animation, "blendMode"), 0, 2),
  );
  const wave =
    pulses <= 0 ? 1 : (1 - Math.cos(progress * Math.PI * 2 * pulses)) / 2;
  const alpha =
    sampledLayer.baseOpacity * intensity * lerpNumber(minAlpha, maxAlpha, wave);
  if (alpha <= 0.002) return [];
  const blendMode =
    blendModeIndex === 1 ? "screen" : blendModeIndex === 2 ? "lighten" : "add";
  const glowScale = 1 + spread * (0.6 + wave * 0.8);
  const rotation = roundTo(
    (sampledLayer.transform.rotation * Math.PI) / 180,
    4,
  );

  return [
    {
      type: "glow",
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      x: 0,
      y: 0,
      scaleX: roundTo(sampledLayer.transform.scaleX * glowScale, 4),
      scaleY: roundTo(sampledLayer.transform.scaleY * glowScale, 4),
      rotation,
      alpha: roundTo(clampNumber(alpha * 0.65, 0, 1), 4),
      blendMode,
    },
    {
      type: "glow",
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      x: 0,
      y: 0,
      scaleX: roundTo(sampledLayer.transform.scaleX, 4),
      scaleY: roundTo(sampledLayer.transform.scaleY, 4),
      rotation,
      alpha: roundTo(clampNumber(alpha * 0.35, 0, 1), 4),
      blendMode,
    },
  ];
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}

function getOptionalBooleanParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: boolean,
): boolean {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a boolean.`,
  );
}

function clampRenderEffectNumber(
  value: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function lerpNumber(from: number, to: number, ratio: number): number {
  return from + (to - from) * clampNumber(ratio, 0, 1);
}
