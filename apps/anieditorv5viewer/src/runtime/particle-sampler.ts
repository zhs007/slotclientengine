import { clampNumber, roundTo } from "./coordinates";
import { isParticleAnimationType } from "./animation-sampler";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GTransformConfig,
} from "../v5g/types";

export interface TextureSize {
  width: number;
  height: number;
}

export interface ParticleLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  opacity: number;
  visible: boolean;
  blendMode: V5GBlendMode;
}

export interface ParticleSpriteSample {
  layerId: string;
  animationId: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  alpha: number;
  blendMode: V5GBlendMode;
}

export function hasActiveParticleAnimation(
  layer: V5GLayerConfig,
  time: number,
): boolean {
  if (layer.type !== "image") return false;
  return layer.animations.some(
    (animation) =>
      animation.enabled &&
      isParticleAnimationType(animation.type) &&
      getParticleProgress(animation, time) !== null,
  );
}

export function getParticleProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  const start = animation.startTime;
  const end = animation.startTime + animation.duration;
  if (time < start || time >= end) return null;
  return clampNumber(
    (time - start) / Math.max(animation.duration, 0.0001),
    0,
    1,
  );
}

export function sampleParticleSpritesForLayer(
  layer: V5GLayerConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  time: number,
): ParticleSpriteSample[] {
  if (layer.type !== "image" || !layer.visible || sampledLayer.opacity <= 0) {
    return [];
  }

  const sprites: ParticleSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled || !isParticleAnimationType(animation.type)) {
      continue;
    }
    const progress = getParticleProgress(animation, time);
    if (progress === null) continue;

    if (animation.type === "particles") {
      sprites.push(
        ...sampleParticleBurst(animation, sampledLayer, textureSize, progress),
      );
    } else if (animation.type === "particle_twinkle") {
      sprites.push(
        ...sampleParticleTwinkle(
          animation,
          sampledLayer,
          textureSize,
          progress,
        ),
      );
    }
  }
  return sprites;
}

export function seededRandom(
  seed: number,
  index: number,
  salt: number,
): number {
  const raw =
    Math.sin(seed * 12.9898 + index * 78.233 + salt * 37.719) * 43758.5453123;
  return raw - Math.floor(raw);
}

function sampleParticleBurst(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  const count = Math.round(
    clampParticleNumber(getNumberParam(animation, "count"), 1, 200),
  );
  const spread = clampParticleNumber(
    getNumberParam(animation, "spread"),
    0,
    1000,
  );
  const speed = clampParticleNumber(
    getNumberParam(animation, "speed"),
    0,
    2000,
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const gravity = clampParticleNumber(
    getNumberParam(animation, "gravity"),
    -2000,
    2000,
  );
  const fadeOut = getOptionalBooleanParam(animation, "fadeOut", true);
  const duration = Math.max(animation.duration, 0.0001);
  const age = progress * duration;
  const alphaBase =
    sampledLayer.opacity * (fadeOut ? Math.pow(1 - progress, 1.35) : 1);
  if (alphaBase <= 0.002) return [];

  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const sprites: ParticleSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const randomA = seededRandom(animation.seed, index, 1);
    const randomB = seededRandom(animation.seed, index, 2);
    const randomC = seededRandom(animation.seed, index, 3);
    const randomD = seededRandom(animation.seed, index, 4);
    const randomE = seededRandom(animation.seed, index, 5);
    const angle = randomA * Math.PI * 2;
    const burstPower = 0.55 + randomB * 0.85;
    const startRadius = spread * 0.22 * randomC;
    const travel = spread * progress + speed * age * burstPower;
    const offsetX = Math.cos(angle) * (startRadius + travel);
    const offsetY =
      Math.sin(angle) * (startRadius + travel) + 0.5 * gravity * age * age;
    const scale = Math.max(
      0.01,
      baseTextureScale * (0.55 + randomD * 0.9) * (1 - progress * 0.25),
    );
    const alpha = alphaBase * (0.55 + randomC * 0.45);
    sprites.push({
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      offsetX: roundTo(offsetX, 4),
      offsetY: roundTo(offsetY, 4),
      scale: roundTo(scale, 4),
      rotation: roundTo(
        (randomE - 0.5) * Math.PI * 0.75 + progress * Math.PI * (0.5 + randomB),
        4,
      ),
      alpha: roundTo(clampNumber(alpha, 0, 1), 4),
      blendMode: sampledLayer.blendMode,
    });
  }

  return sprites;
}

function sampleParticleTwinkle(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  const count = Math.round(
    clampParticleNumber(getNumberParam(animation, "count"), 1, 1000),
  );
  const radius = clampParticleNumber(
    getNumberParam(animation, "radius"),
    0,
    3000,
  );
  const spawnInterval = clampParticleNumber(
    getNumberParam(animation, "spawnInterval"),
    0.01,
    10,
  );
  const twinkleDuration = clampParticleNumber(
    getNumberParam(animation, "twinkleDuration"),
    0.03,
    10,
  );
  const batchMin = Math.round(
    clampParticleNumber(getNumberParam(animation, "batchMin"), 1, 100),
  );
  const batchMax = Math.round(
    clampParticleNumber(getNumberParam(animation, "batchMax"), batchMin, 100),
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const duration = Math.max(animation.duration, 0.0001);
  const elapsed = progress * duration;
  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const sprites: ParticleSpriteSample[] = [];
  let spawnedCount = 0;

  for (let batchIndex = 0; spawnedCount < count; batchIndex += 1) {
    const spawnTime = batchIndex * spawnInterval;
    if (spawnTime > elapsed) break;
    const batchRandom = seededRandom(animation.seed, batchIndex, 11);
    const batchCount = Math.min(
      count - spawnedCount,
      batchMin + Math.floor(batchRandom * (batchMax - batchMin + 1)),
    );
    for (let itemIndex = 0; itemIndex < batchCount; itemIndex += 1) {
      const particleIndex = spawnedCount + itemIndex;
      const localAge = (elapsed - spawnTime) / twinkleDuration;
      if (localAge < 0 || localAge > 1) continue;
      const randomA = seededRandom(animation.seed, particleIndex, 21);
      const randomB = seededRandom(animation.seed, particleIndex, 22);
      const randomC = seededRandom(animation.seed, particleIndex, 23);
      const randomD = seededRandom(animation.seed, particleIndex, 24);
      const angle = randomA * Math.PI * 2;
      const distance = Math.sqrt(randomB) * radius;
      const waveAlpha = Math.sin(localAge * Math.PI);
      const shimmer =
        0.78 + 0.22 * Math.sin(localAge * Math.PI * 6 + randomC * 6);
      const alpha = sampledLayer.opacity * Math.max(0, waveAlpha * shimmer);
      if (alpha <= 0.002) continue;
      sprites.push({
        layerId: sampledLayer.layerId,
        animationId: animation.id,
        offsetX: roundTo(Math.cos(angle) * distance, 4),
        offsetY: roundTo(Math.sin(angle) * distance, 4),
        scale: roundTo(
          Math.max(0.01, baseTextureScale * (0.65 + randomC * 0.85)),
          4,
        ),
        rotation: roundTo((randomD - 0.5) * Math.PI * 2, 4),
        alpha: roundTo(clampNumber(alpha, 0, 1), 4),
        blendMode: sampledLayer.blendMode,
      });
    }
    spawnedCount += batchCount;
  }

  return sprites;
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

function clampParticleNumber(value: number, min: number, max: number): number {
  return clampNumber(Number.isFinite(value) ? value : min, min, max);
}

function getTextureLongestEdge(textureSize: TextureSize): number {
  const width = Number(textureSize.width);
  const height = Number(textureSize.height);
  const longestEdge = Math.max(width, height);
  return Number.isFinite(longestEdge) && longestEdge > 0 ? longestEdge : 1;
}
