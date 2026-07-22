import { isDeterministicEffectAnimationType } from "./animation-sampler.js";
import { clampNumber, roundTo } from "./coordinates.js";
import { seededRandom } from "./particle-sampler.js";
import { getTimelineAnimationProgress } from "./timeline-progress.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GTransformConfig,
} from "./types.js";

export interface VNIEffectLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
  blendMode: V5GBlendMode;
}

export interface VNIEffectTextureSize {
  width: number;
  height: number;
}

export type VNIDeterministicEffectType =
  | "gather_particles"
  | "smoke_mist"
  | "energy_ring"
  | "slash_light"
  | "flame_flicker"
  | "wave_band"
  | "wave_distort"
  | "speed_lines"
  | "drift_fall"
  | "path_particles";

export interface VNIEffectSpriteSample {
  kind: "sprite";
  type: Exclude<VNIDeterministicEffectType, "wave_distort" | "speed_lines">;
  layerId: string;
  animationId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode: V5GBlendMode;
  anchorX: number;
  anchorY: number;
}

export interface VNIWaveDistortSliceSample {
  kind: "wave_distort_slice";
  type: "wave_distort";
  layerId: string;
  animationId: string;
  row: number;
  rows: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode: V5GBlendMode;
}

export interface VNISpeedLineSample {
  kind: "speed_line";
  type: "speed_lines";
  layerId: string;
  animationId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lineWidth: number;
  alpha: number;
  blendMode: V5GBlendMode;
}

export type VNIDeterministicEffectSample =
  | VNIEffectSpriteSample
  | VNIWaveDistortSliceSample
  | VNISpeedLineSample;

const MAX_GATHER_SPRITES = 360;
const MAX_PATH_SPRITES = 360;

export function getDeterministicEffectProgress(
  animation: V5GAnimationConfig,
  time: number,
): number | null {
  if (!isDeterministicEffectAnimationType(animation.type)) return null;
  return getTimelineAnimationProgress(animation, time);
}

export function hasActiveDeterministicEffectAnimation(
  layer: V5GLayerConfig,
  time: number,
): boolean {
  if (!isTextureBackedLayer(layer)) return false;
  return layer.animations.some(
    (animation) =>
      animation.enabled &&
      getDeterministicEffectProgress(animation, time) !== null,
  );
}

export function sampleDeterministicEffectSpritesForLayer(
  layer: V5GLayerConfig,
  sampledLayer: VNIEffectLayerSampleState,
  textureSize: VNIEffectTextureSize,
  time: number,
): VNIDeterministicEffectSample[] {
  if (
    !isTextureBackedLayer(layer) ||
    !layer.visible ||
    sampledLayer.baseOpacity <= 0
  ) {
    return [];
  }

  const samples: VNIDeterministicEffectSample[] = [];
  for (const animation of layer.animations) {
    if (
      !animation.enabled ||
      !isDeterministicEffectAnimationType(animation.type)
    ) {
      continue;
    }
    const progress = getDeterministicEffectProgress(animation, time);
    if (progress === null) continue;
    if (animation.type === "gather_particles") {
      samples.push(
        ...sampleGatherParticles(
          animation,
          sampledLayer,
          textureSize,
          progress,
        ),
      );
    } else if (animation.type === "smoke_mist") {
      samples.push(
        ...sampleSmokeMist(animation, sampledLayer, textureSize, progress),
      );
    } else if (animation.type === "energy_ring") {
      samples.push(...sampleEnergyRing(animation, sampledLayer, progress));
    } else if (animation.type === "slash_light") {
      samples.push(...sampleSlashLight(animation, sampledLayer, progress));
    } else if (animation.type === "flame_flicker") {
      samples.push(
        ...sampleFlameFlicker(animation, sampledLayer, textureSize, progress),
      );
    } else if (animation.type === "wave_band") {
      samples.push(
        ...sampleWaveBand(animation, sampledLayer, textureSize, progress),
      );
    } else if (animation.type === "wave_distort") {
      samples.push(
        ...sampleWaveDistort(animation, sampledLayer, textureSize, progress),
      );
    } else if (animation.type === "speed_lines") {
      samples.push(...sampleSpeedLines(animation, sampledLayer, progress));
    } else if (animation.type === "drift_fall") {
      samples.push(
        ...sampleDriftFall(animation, sampledLayer, textureSize, progress),
      );
    } else if (animation.type === "path_particles") {
      samples.push(
        ...samplePathParticles(animation, sampledLayer, textureSize, progress),
      );
    }
  }
  return samples;
}

function sampleGatherParticles(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  textureSize: VNIEffectTextureSize,
  progress: number,
): VNIEffectSpriteSample[] {
  const count = Math.round(
    clampEffectNumber(getNumberParam(animation, "count"), 1, 220),
  );
  const size = clampEffectNumber(getNumberParam(animation, "size"), 1, 400);
  const spawnRadius = clampEffectNumber(
    getNumberParam(animation, "spawnRadius"),
    0,
    4000,
  );
  const spawnRatio = clampEffectNumber(
    getNumberParam(animation, "spawnRatio"),
    0.01,
    0.8,
  );
  const targetOffsetX = getNumberParam(animation, "targetX");
  const targetOffsetY = -getNumberParam(animation, "targetY");
  const travelMode = Math.round(
    clampEffectNumber(getNumberParam(animation, "travelMode"), 0, 2),
  );
  const curve = getNumberParam(animation, "curve");
  const spiralTurns = clampEffectNumber(
    getNumberParam(animation, "spiralTurns"),
    -8,
    8,
  );
  const staggerRatio = clampEffectNumber(
    getNumberParam(animation, "staggerRatio"),
    0,
    0.9,
  );
  const requestedTrailCount = Math.round(
    clampEffectNumber(getNumberParam(animation, "trailCount"), 0, 10),
  );
  const trailCount = Math.min(
    requestedTrailCount,
    Math.max(0, Math.floor(MAX_GATHER_SPRITES / Math.max(1, count)) - 1),
  );
  const trailSpacing = clampEffectNumber(
    getNumberParam(animation, "trailSpacing"),
    0.005,
    0.25,
  );
  const trailFade = clampEffectNumber(
    getNumberParam(animation, "trailFade"),
    0.05,
    0.95,
  );
  const vanishMode = Math.round(
    clampEffectNumber(getNumberParam(animation, "vanishMode"), 0, 2),
  );
  const vanishRatio = clampEffectNumber(
    getNumberParam(animation, "vanishRatio"),
    0.01,
    0.8,
  );
  const flashScale = clampEffectNumber(
    getNumberParam(animation, "flashScale"),
    0.1,
    8,
  );
  const flashIntensity = clampEffectNumber(
    getNumberParam(animation, "flashIntensity"),
    0.1,
    3,
  );
  const baseTextureScale = size / getTextureLongestEdge(textureSize);
  const effectiveTravelWindow = Math.max(0.001, 1 - staggerRatio);
  const sprites: VNIEffectSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const startOffset =
      count <= 1 ? 0 : (index / Math.max(1, count - 1)) * staggerRatio;
    for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
      const trailProgress = progress - trailIndex * trailSpacing;
      const localProgress =
        (trailProgress - startOffset) / effectiveTravelWindow;
      if (localProgress < 0 || localProgress > 1) continue;
      const point = sampleGatherParticlePoint(
        animation,
        index,
        localProgress,
        spawnRadius,
        spawnRatio,
        targetOffsetX,
        targetOffsetY,
        travelMode,
        curve,
        spiralTurns,
        vanishMode,
        vanishRatio,
        flashScale,
        flashIntensity,
      );
      if (point.alpha <= 0.002) continue;
      const alpha =
        sampledLayer.baseOpacity *
        point.alpha *
        Math.pow(trailFade, trailIndex);
      if (alpha <= 0.002) continue;
      sprites.push(
        createSpriteSample("gather_particles", animation, sampledLayer, {
          x: point.x,
          y: point.y,
          scaleX: Math.max(0.01, baseTextureScale * point.scale),
          scaleY: Math.max(0.01, baseTextureScale * point.scale),
          rotation: point.rotation,
          alpha,
          blendMode: sampledLayer.blendMode,
          anchorX: 0.5,
          anchorY: 0.5,
        }),
      );
    }
  }
  return sprites;
}

function sampleSmokeMist(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  textureSize: VNIEffectTextureSize,
  progress: number,
): VNIEffectSpriteSample[] {
  const count = Math.round(
    clampEffectNumber(getNumberParam(animation, "count"), 1, 180),
  );
  const size = clampEffectNumber(getNumberParam(animation, "size"), 1, 800);
  const spawnRadius = clampEffectNumber(
    getNumberParam(animation, "spawnRadius"),
    0,
    3000,
  );
  const spread = clampEffectNumber(
    getNumberParam(animation, "spread"),
    0,
    5000,
  );
  const windX = getNumberParam(animation, "windX");
  const windY = -getNumberParam(animation, "windY");
  const swirl = getNumberParam(animation, "swirl");
  const startAlpha = clampEffectNumber(
    getNumberParam(animation, "startAlpha"),
    0,
    1,
  );
  const fadePower = clampEffectNumber(
    getNumberParam(animation, "fadePower"),
    0.1,
    5,
  );
  const grow = clampEffectNumber(getNumberParam(animation, "grow"), 0.1, 8);
  const sizeRandom = clampEffectNumber(
    getNumberParam(animation, "sizeRandom"),
    0,
    2,
  );
  const rotationSpeed = clampEffectNumber(
    getNumberParam(animation, "rotationSpeed"),
    -10,
    10,
  );
  const baseTextureScale = size / getTextureLongestEdge(textureSize);
  const duration = Math.max(animation.duration, 0.0001);
  const eased = easeOutQuad(progress);
  const sprites: VNIEffectSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const randomA = seededRandom(animation.seed, index, 1001);
    const randomB = seededRandom(animation.seed, index, 1002);
    const randomC = seededRandom(animation.seed, index, 1003);
    const randomD = seededRandom(animation.seed, index, 1004);
    const randomE = seededRandom(animation.seed, index, 1005);
    const randomF = seededRandom(animation.seed, index, 1006);
    const startAngle = randomA * Math.PI * 2;
    const startDistance = Math.sqrt(randomB) * spawnRadius;
    const outwardAngle = startAngle + (randomC - 0.5) * 0.9;
    const outwardDistance = spread * (0.35 + randomD * 0.85);
    const drift =
      Math.sin(progress * Math.PI) * swirl * (randomE < 0.5 ? -1 : 1);
    const tangentX = -Math.sin(outwardAngle);
    const tangentY = Math.cos(outwardAngle);
    const x =
      Math.cos(startAngle) * startDistance +
      Math.cos(outwardAngle) * outwardDistance * eased +
      tangentX * drift +
      windX * progress * duration * (0.35 + randomF * 0.9);
    const y =
      Math.sin(startAngle) * startDistance +
      Math.sin(outwardAngle) * outwardDistance * eased +
      tangentY * drift +
      windY * progress * duration * (0.35 + randomF * 0.9);
    const edgeFade = Math.pow(Math.max(0, 1 - progress), fadePower);
    const appear = Math.min(1, progress / 0.12);
    const alpha =
      sampledLayer.baseOpacity *
      startAlpha *
      edgeFade *
      appear *
      (0.55 + randomC * 0.45);
    if (alpha <= 0.002) continue;
    const randomScale = Math.max(0.08, 1 + (randomB - 0.5) * sizeRandom * 2);
    const scale = baseTextureScale * randomScale * lerpNumber(1, grow, eased);
    sprites.push(
      createSpriteSample("smoke_mist", animation, sampledLayer, {
        x,
        y,
        scaleX: Math.max(0.01, scale),
        scaleY: Math.max(0.01, scale),
        rotation:
          (randomE - 0.5) * Math.PI * 2 +
          progress * Math.PI * 2 * rotationSpeed * (0.35 + randomA * 0.8),
        alpha,
        blendMode: sampledLayer.blendMode,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    );
  }
  return sprites;
}

function sampleEnergyRing(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  progress: number,
): VNIEffectSpriteSample[] {
  const ringCount = Math.round(
    clampEffectNumber(getNumberParam(animation, "ringCount"), 1, 8),
  );
  const startScale = clampEffectNumber(
    getNumberParam(animation, "startScale"),
    0.01,
    20,
  );
  const endScale = clampEffectNumber(
    getNumberParam(animation, "endScale"),
    0.01,
    50,
  );
  const alphaBase =
    sampledLayer.baseOpacity *
    clampEffectNumber(getNumberParam(animation, "alpha"), 0, 1);
  const stagger = clampEffectNumber(
    getNumberParam(animation, "stagger"),
    0,
    0.95,
  );
  const rotationDegrees = getNumberParam(animation, "rotation");
  const pulse = clampEffectNumber(getNumberParam(animation, "pulse"), 0, 1);
  const vanishMode = Math.round(
    clampEffectNumber(getNumberParam(animation, "vanishMode"), 0, 2),
  );
  const additive = getOptionalBooleanParam(animation, "additive", true);
  const travelWindow = Math.max(0.001, 1 - stagger);
  const sprites: VNIEffectSpriteSample[] = [];

  for (let index = 0; index < ringCount; index += 1) {
    const startOffset =
      ringCount <= 1 ? 0 : (index / Math.max(1, ringCount - 1)) * stagger;
    const local = (progress - startOffset) / travelWindow;
    if (local < 0 || local > 1) continue;
    const eased = easeOutQuad(local);
    const alphaCurve =
      vanishMode === 2
        ? Math.sin(local * Math.PI)
        : vanishMode === 1
          ? Math.pow(1 - eased, 1.35)
          : 1 - local;
    const alpha = alphaBase * Math.max(0, alphaCurve);
    if (alpha <= 0.002) continue;
    const ringScale =
      lerpNumber(startScale, endScale, eased) *
      (1 + Math.sin(local * Math.PI) * pulse);
    sprites.push(
      createSpriteSample("energy_ring", animation, sampledLayer, {
        x: 0,
        y: 0,
        scaleX: sampledLayer.transform.scaleX * ringScale,
        scaleY: sampledLayer.transform.scaleY * ringScale,
        rotation:
          (sampledLayer.transform.rotation * Math.PI) / 180 +
          ((rotationDegrees * Math.PI) / 180) * local +
          index * 0.17,
        alpha,
        blendMode: additive ? "add" : sampledLayer.blendMode,
        anchorX: sampledLayer.transform.anchorX,
        anchorY: sampledLayer.transform.anchorY,
      }),
    );
  }
  return sprites;
}

function sampleSlashLight(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  progress: number,
): VNIEffectSpriteSample[] {
  const mode = Math.round(
    clampEffectNumber(getNumberParam(animation, "mode"), 0, 2),
  );
  const angleRad = (getNumberParam(animation, "angle") * Math.PI) / 180;
  const travel = getNumberParam(animation, "travel");
  const lengthScale = clampEffectNumber(
    getNumberParam(animation, "lengthScale"),
    0.01,
    50,
  );
  const widthScale = clampEffectNumber(
    getNumberParam(animation, "widthScale"),
    0.01,
    20,
  );
  const flashAlpha = clampEffectNumber(
    getNumberParam(animation, "flashAlpha"),
    0,
    1,
  );
  const startScale = clampEffectNumber(
    getNumberParam(animation, "startScale"),
    0.01,
    2,
  );
  const fadeRatio = clampEffectNumber(
    getNumberParam(animation, "fadeRatio"),
    0.05,
    0.95,
  );
  const curve = getNumberParam(animation, "curve");
  const additive = getOptionalBooleanParam(animation, "additive", true);
  const alphaBase = sampledLayer.baseOpacity * flashAlpha;
  const slashCount = mode === 2 ? 2 : 1;
  const appear = clampNumber(progress / 0.22, 0, 1);
  const fadeStart = Math.max(0.001, 1 - fadeRatio);
  const fade =
    progress <= fadeStart
      ? 1
      : 1 - clampNumber((progress - fadeStart) / fadeRatio, 0, 1);
  const flash = Math.sin(clampNumber(progress, 0, 1) * Math.PI);
  const reveal = lerpNumber(startScale, 1, easeOutQuad(appear));
  const alpha = alphaBase * Math.max(0, fade) * Math.max(0.25, flash);
  if (alpha <= 0.002) return [];
  const sprites: VNIEffectSpriteSample[] = [];

  for (let index = 0; index < slashCount; index += 1) {
    const crossAngle = angleRad + (index === 1 ? Math.PI / 2 : 0);
    const dirX = Math.cos(crossAngle);
    const dirY = Math.sin(crossAngle);
    const perpX = -dirY;
    const perpY = dirX;
    const localProgress =
      mode === 2 && index === 1
        ? clampNumber(progress * 1.12 - 0.08, 0, 1)
        : progress;
    const sweep = (localProgress - 0.5) * travel;
    const curveOffset =
      mode === 0
        ? 0
        : Math.sin(localProgress * Math.PI) * curve * (index === 1 ? -0.75 : 1);
    sprites.push(
      createSpriteSample("slash_light", animation, sampledLayer, {
        x: dirX * sweep + perpX * curveOffset,
        y: dirY * sweep + perpY * curveOffset,
        scaleX: sampledLayer.transform.scaleX * lengthScale * reveal,
        scaleY: sampledLayer.transform.scaleY * widthScale * (1 + flash * 0.18),
        rotation:
          (sampledLayer.transform.rotation * Math.PI) / 180 +
          crossAngle +
          flash * 0.08,
        alpha: alpha * (index === 1 ? 0.82 : 1),
        blendMode: additive ? "add" : sampledLayer.blendMode,
        anchorX: sampledLayer.transform.anchorX,
        anchorY: sampledLayer.transform.anchorY,
      }),
    );
  }
  return sprites;
}

function sampleFlameFlicker(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  textureSize: VNIEffectTextureSize,
  progress: number,
): VNIEffectSpriteSample[] {
  const count = Math.round(
    clampEffectNumber(getNumberParam(animation, "count"), 1, 160),
  );
  const emitterWidth = clampEffectNumber(
    getNumberParam(animation, "emitterWidth"),
    0,
    3000,
  );
  const height = clampEffectNumber(
    getNumberParam(animation, "height"),
    1,
    5000,
  );
  const direction = (getNumberParam(animation, "direction") * Math.PI) / 180;
  const spreadAngle =
    (clampEffectNumber(getNumberParam(animation, "spreadAngle"), 0, 180) *
      Math.PI) /
    180;
  const vanishSpread = clampEffectNumber(
    getNumberParam(animation, "vanishSpread"),
    0,
    3000,
  );
  const lengthRandom = clampEffectNumber(
    getNumberParam(animation, "lengthRandom"),
    0,
    1,
  );
  const size = clampEffectNumber(getNumberParam(animation, "size"), 1, 800);
  const sway = clampEffectNumber(getNumberParam(animation, "sway"), 0, 2000);
  const turbulence = clampEffectNumber(
    getNumberParam(animation, "turbulence"),
    0,
    3000,
  );
  const grow = clampEffectNumber(getNumberParam(animation, "grow"), 0.1, 8);
  const alphaBase =
    sampledLayer.baseOpacity *
    clampEffectNumber(getNumberParam(animation, "alpha"), 0, 1);
  const flicker = clampEffectNumber(getNumberParam(animation, "flicker"), 0, 1);
  const legacySpeed = getOptionalNumberParam(animation, "speed", 1);
  const cycles = Math.max(
    1,
    Math.round(
      clampEffectNumber(
        getOptionalNumberParam(animation, "cycles", legacySpeed),
        1,
        60,
      ),
    ),
  );
  const additive = getOptionalBooleanParam(animation, "additive", true);
  const baseTextureScale = size / getTextureLongestEdge(textureSize);
  const loopPhase = progress * cycles;
  const travel = positiveModulo(loopPhase, 1);
  const dirX = Math.cos(direction);
  const dirY = Math.sin(direction);
  const emitterPerpX = -dirY;
  const emitterPerpY = dirX;
  const sprites: VNIEffectSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const randomA = seededRandom(animation.seed, index, 1101);
    const randomB = seededRandom(animation.seed, index, 1102);
    const randomC = seededRandom(animation.seed, index, 1103);
    const randomD = seededRandom(animation.seed, index, 1104);
    const randomE = seededRandom(animation.seed, index, 1105);
    const randomF = seededRandom(animation.seed, index, 1106);
    const randomG = seededRandom(animation.seed, index, 1107);
    const local = positiveModulo(randomA + travel, 1);
    const eased = easeOutQuad(local);
    const edgeAlpha = Math.sin(local * Math.PI);
    const flickerWave =
      1 -
      flicker * 0.5 +
      flicker * Math.sin(loopPhase * Math.PI * 14 + randomB * 9);
    const alpha =
      alphaBase * Math.max(0, edgeAlpha) * clampNumber(flickerWave, 0.1, 1.5);
    if (alpha <= 0.002) continue;
    const particleAngle = direction + (randomC - 0.5) * spreadAngle;
    const particleDirX = Math.cos(particleAngle);
    const particleDirY = Math.sin(particleAngle);
    const particlePerpX = -particleDirY;
    const particlePerpY = particleDirX;
    const startOffset = (randomB - 0.5) * emitterWidth;
    const distanceScale = 1 - lengthRandom * randomD;
    const distance = height * distanceScale * eased;
    const endSpread = (randomF - 0.5) * vanishSpread * Math.pow(local, 1.35);
    const wave =
      Math.sin(local * Math.PI * 2 + randomE * Math.PI * 2) *
      sway *
      (0.15 + local * 0.85);
    const jitterAlong = (randomG - 0.5) * turbulence * 0.25 * local;
    const jitterSide = (randomE - 0.5) * turbulence * local;
    const x =
      emitterPerpX * startOffset +
      particleDirX * (distance + jitterAlong) +
      particlePerpX * (wave + jitterSide + endSpread);
    const y =
      emitterPerpY * startOffset +
      particleDirY * (distance + jitterAlong) +
      particlePerpY * (wave + jitterSide + endSpread);
    const midGrow = 1 + Math.sin(local * Math.PI) * (grow - 1);
    const taper = lerpNumber(0.65, 0.28, local);
    const scale = baseTextureScale * (0.55 + randomD * 0.8) * midGrow * taper;
    sprites.push(
      createSpriteSample("flame_flicker", animation, sampledLayer, {
        x,
        y,
        scaleX: Math.max(0.01, scale * (1 + flicker * 0.18)),
        scaleY: Math.max(0.01, scale * (1 + flicker * 0.18)),
        rotation:
          particleAngle +
          Math.PI / 2 +
          (randomA - 0.5) * 0.45 +
          Math.sin(local * Math.PI * 4 + randomB * Math.PI * 2) * 0.22,
        alpha,
        blendMode: additive ? "add" : sampledLayer.blendMode,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    );
  }
  return sprites;
}

function sampleWaveBand(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  textureSize: VNIEffectTextureSize,
  progress: number,
): VNIEffectSpriteSample[] {
  const mode = Math.round(
    clampEffectNumber(getNumberParam(animation, "mode"), 0, 2),
  );
  const count = Math.round(
    clampEffectNumber(getNumberParam(animation, "count"), 2, 160),
  );
  const length = clampEffectNumber(
    getNumberParam(animation, "length"),
    1,
    8000,
  );
  const amplitude = clampEffectNumber(
    getNumberParam(animation, "amplitude"),
    0,
    3000,
  );
  const frequency = clampEffectNumber(
    getNumberParam(animation, "frequency"),
    0,
    30,
  );
  const speed = clampEffectNumber(getNumberParam(animation, "speed"), 0.05, 8);
  const direction = (getNumberParam(animation, "direction") * Math.PI) / 180;
  const size = clampEffectNumber(getNumberParam(animation, "size"), 1, 800);
  const alphaBase =
    sampledLayer.baseOpacity *
    clampEffectNumber(getNumberParam(animation, "alpha"), 0, 1);
  const trailFade = clampEffectNumber(
    getNumberParam(animation, "trailFade"),
    0.05,
    1,
  );
  const rotateToWave = getOptionalBooleanParam(animation, "rotateToWave", true);
  const dirX = Math.cos(direction);
  const dirY = Math.sin(direction);
  const perpX = -dirY;
  const perpY = dirX;
  const baseTextureScale = size / getTextureLongestEdge(textureSize);
  const flow = positiveModulo(progress * speed, 1);
  const sprites: VNIEffectSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const baseT = count <= 1 ? 0 : index / Math.max(1, count - 1);
    let t = baseT;
    let visible = 1;
    if (mode === 0) {
      t = positiveModulo(baseT + flow, 1);
      visible = Math.sin(baseT * Math.PI);
    } else if (mode === 1) {
      const head = progress * (1 + 1 / count);
      const local = head - baseT;
      if (local < 0 || local > 1) continue;
      visible = Math.sin(clampNumber(local, 0, 1) * Math.PI);
    } else {
      const centerDistance = Math.abs(baseT - 0.5) * 2;
      const local = progress * 1.25 - centerDistance * 0.65;
      if (local < 0 || local > 1) continue;
      visible = Math.sin(clampNumber(local, 0, 1) * Math.PI);
    }
    const along = (t - 0.5) * length;
    const wave = Math.sin((t * frequency + flow) * Math.PI * 2);
    const x = dirX * along + perpX * amplitude * wave;
    const y = dirY * along + perpY * amplitude * wave;
    const edge = Math.pow(Math.max(0, Math.sin(baseT * Math.PI)), 1.25);
    const alpha =
      alphaBase * Math.max(0, visible) * lerpNumber(trailFade, 1, edge);
    if (alpha <= 0.002) continue;
    const scale = baseTextureScale * (0.75 + edge * 0.35);
    let rotation = 0;
    if (rotateToWave) {
      const slope =
        Math.cos((t * frequency + flow) * Math.PI * 2) *
        Math.PI *
        2 *
        frequency *
        amplitude;
      rotation = direction + Math.atan2(slope, length);
    }
    sprites.push(
      createSpriteSample("wave_band", animation, sampledLayer, {
        x,
        y,
        scaleX: Math.max(0.01, scale),
        scaleY: Math.max(0.01, scale),
        rotation,
        alpha,
        blendMode: sampledLayer.blendMode,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    );
  }
  return sprites;
}

function sampleWaveDistort(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  textureSize: VNIEffectTextureSize,
  progress: number,
): VNIWaveDistortSliceSample[] {
  const rows = Math.round(
    clampEffectNumber(getNumberParam(animation, "rows"), 2, 120),
  );
  const amplitude = clampEffectNumber(
    getNumberParam(animation, "amplitude"),
    0,
    500,
  );
  const frequency = clampEffectNumber(
    getNumberParam(animation, "frequency"),
    0,
    20,
  );
  const legacySpeed = getOptionalNumberParam(animation, "speed", 1);
  const cycles = Math.max(
    1,
    Math.round(
      clampEffectNumber(
        getOptionalNumberParam(animation, "cycles", Math.abs(legacySpeed)),
        1,
        60,
      ),
    ),
  );
  const flowDirection = legacySpeed < 0 ? -1 : 1;
  const phaseOffset = clampEffectNumber(
    getNumberParam(animation, "phaseOffset"),
    -10,
    10,
  );
  const verticalBob = clampEffectNumber(
    getNumberParam(animation, "verticalBob"),
    0,
    300,
  );
  const alphaBase =
    sampledLayer.baseOpacity *
    clampEffectNumber(getNumberParam(animation, "alpha"), 0, 1);
  const edgeFeather = clampEffectNumber(
    getNumberParam(animation, "edgeFeather"),
    0,
    1,
  );
  const textureWidth = Math.max(1, Number(textureSize.width) || 1);
  const textureHeight = Math.max(1, Number(textureSize.height) || 1);
  const safeRows = Math.max(2, rows);
  const rotationRad = (sampledLayer.transform.rotation * Math.PI) / 180;
  const flow = progress * cycles * flowDirection;
  const bob = Math.sin(progress * Math.PI * 2 * cycles) * verticalBob;
  const anchorOffsetX = (0.5 - sampledLayer.transform.anchorX) * textureWidth;
  const anchorOffsetY = (0.5 - sampledLayer.transform.anchorY) * textureHeight;
  const slices: VNIWaveDistortSliceSample[] = [];

  for (let row = 0; row < safeRows; row += 1) {
    const y0 = (row / safeRows) * textureHeight;
    const y1 = ((row + 1) / safeRows) * textureHeight;
    const sliceHeight = Math.max(1, y1 - y0);
    const centerT = (row + 0.5) / safeRows;
    const wave = Math.sin(
      (centerT * frequency * phaseOffset + flow) * Math.PI * 2,
    );
    const secondWave = Math.sin(
      (centerT * (frequency * 0.55 + 0.25) - flow) * Math.PI * 2,
    );
    const offsetX = amplitude * (wave * 0.78 + secondWave * 0.22);
    const edge = Math.sin(centerT * Math.PI);
    const alpha =
      alphaBase *
      (edgeFeather > 0 ? lerpNumber(Math.max(0, edge), 1, 1 - edgeFeather) : 1);
    if (alpha <= 0.002) continue;
    const localY = y0 + sliceHeight / 2 - textureHeight * 0.5 + anchorOffsetY;
    slices.push({
      kind: "wave_distort_slice",
      type: "wave_distort",
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      row,
      rows: safeRows,
      frameX: 0,
      frameY: roundTo(y0, 4),
      frameWidth: roundTo(textureWidth, 4),
      frameHeight: roundTo(sliceHeight, 4),
      x: roundTo(offsetX + anchorOffsetX, 4),
      y: roundTo(localY + bob, 4),
      scaleX: roundTo(sampledLayer.transform.scaleX, 4),
      scaleY: roundTo(sampledLayer.transform.scaleY, 4),
      rotation: roundTo(rotationRad, 4),
      alpha: roundTo(clampNumber(alpha, 0, 1), 4),
      blendMode: sampledLayer.blendMode,
    });
  }
  return slices;
}

function sampleSpeedLines(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  progress: number,
): VNISpeedLineSample[] {
  const mode = Math.round(
    clampEffectNumber(getNumberParam(animation, "mode"), 0, 2),
  );
  const count = Math.round(
    clampEffectNumber(getNumberParam(animation, "count"), 4, 180),
  );
  const radius = clampEffectNumber(
    getNumberParam(animation, "radius"),
    20,
    4000,
  );
  const length = clampEffectNumber(
    getNumberParam(animation, "length"),
    4,
    1000,
  );
  const speed = clampEffectNumber(getNumberParam(animation, "speed"), 0.05, 8);
  const direction = (getNumberParam(animation, "direction") * Math.PI) / 180;
  const spreadAngle =
    (clampEffectNumber(getNumberParam(animation, "spreadAngle"), 1, 360) *
      Math.PI) /
    180;
  const lineWidth = clampEffectNumber(
    getNumberParam(animation, "lineWidth"),
    0.5,
    40,
  );
  const alphaBase =
    sampledLayer.baseOpacity *
    clampEffectNumber(getNumberParam(animation, "alpha"), 0, 1);
  const fadeOut = getOptionalBooleanParam(animation, "fadeOut", true);
  const travel = positiveModulo(progress * speed, 1);
  const lines: VNISpeedLineSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const randomA = seededRandom(animation.seed, index, 701);
    const randomB = seededRandom(animation.seed, index, 702);
    const randomC = seededRandom(animation.seed, index, 703);
    const randomD = seededRandom(animation.seed, index, 704);
    const local = positiveModulo(randomA + travel, 1);
    const fade = fadeOut ? Math.sin(local * Math.PI) : 1;
    const alpha = alphaBase * Math.max(0.04, fade) * (0.5 + randomB * 0.5);
    if (alpha <= 0.002) continue;
    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;
    if (mode === 1) {
      const dirX = Math.cos(direction);
      const dirY = Math.sin(direction);
      const perpX = -dirY;
      const perpY = dirX;
      const travelDistance = (local - 0.5) * radius * 2;
      const sideOffset = (randomC - 0.5) * radius * 2;
      const headX = dirX * travelDistance + perpX * sideOffset;
      const headY = dirY * travelDistance + perpY * sideOffset;
      const segmentLength = length * (0.45 + randomD * 0.9);
      x1 = headX - dirX * segmentLength;
      y1 = headY - dirY * segmentLength;
      x2 = headX;
      y2 = headY;
    } else {
      const angle =
        direction +
        (randomB - 0.5) * spreadAngle +
        (mode === 2 ? progress * 0.35 : 0);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const distance =
        mode === 2 ? Math.pow(local, 1.7) * radius : local * radius;
      const segmentLength =
        length * (0.35 + local * 0.85) * (0.7 + randomC * 0.6);
      const startDistance = Math.max(0, distance - segmentLength);
      x1 = dirX * startDistance;
      y1 = dirY * startDistance;
      x2 = dirX * distance;
      y2 = dirY * distance;
    }
    lines.push({
      kind: "speed_line",
      type: "speed_lines",
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      x1: roundTo(x1, 4),
      y1: roundTo(y1, 4),
      x2: roundTo(x2, 4),
      y2: roundTo(y2, 4),
      lineWidth: roundTo(lineWidth * (0.55 + randomD * 0.7), 4),
      alpha: roundTo(clampNumber(alpha, 0, 1), 4),
      blendMode: sampledLayer.blendMode,
    });
  }
  return lines;
}

function sampleDriftFall(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  textureSize: VNIEffectTextureSize,
  progress: number,
): VNIEffectSpriteSample[] {
  const count = Math.round(
    clampEffectNumber(getNumberParam(animation, "count"), 1, 180),
  );
  const areaWidth = clampEffectNumber(
    getNumberParam(animation, "areaWidth"),
    20,
    6000,
  );
  const areaHeight = clampEffectNumber(
    getNumberParam(animation, "areaHeight"),
    20,
    6000,
  );
  const legacyFallSpeed = getOptionalNumberParam(animation, "fallSpeed", 260);
  const cycles = Math.max(
    1,
    Math.round(
      clampEffectNumber(
        getOptionalNumberParam(
          animation,
          "cycles",
          legacyFallSpeed / Math.max(1, areaHeight),
        ),
        1,
        60,
      ),
    ),
  );
  const wind = clampEffectNumber(
    getNumberParam(animation, "wind"),
    -2000,
    2000,
  );
  const swayAmplitude = clampEffectNumber(
    getNumberParam(animation, "swayAmplitude"),
    0,
    1000,
  );
  const swayFrequency = Math.round(
    clampEffectNumber(getNumberParam(animation, "swayFrequency"), 0, 20),
  );
  const size = clampEffectNumber(getNumberParam(animation, "size"), 1, 400);
  const sizeRandom = clampEffectNumber(
    getNumberParam(animation, "sizeRandom"),
    0,
    2,
  );
  const rotationSpeed = Math.round(
    clampEffectNumber(getNumberParam(animation, "rotationSpeed"), -20, 20),
  );
  const alphaBase =
    sampledLayer.baseOpacity *
    clampEffectNumber(getNumberParam(animation, "alpha"), 0, 1);
  const loopPhase = progress * cycles;
  const baseTextureScale = size / getTextureLongestEdge(textureSize);
  const fadeEdges = getOptionalBooleanParam(animation, "fadeEdges", true);
  const sprites: VNIEffectSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const randomA = seededRandom(animation.seed, index, 801);
    const randomB = seededRandom(animation.seed, index, 802);
    const randomC = seededRandom(animation.seed, index, 803);
    const randomD = seededRandom(animation.seed, index, 804);
    const randomE = seededRandom(animation.seed, index, 805);
    const fallLocal = positiveModulo(randomA + loopPhase, 1);
    const baseX = (randomC - 0.5) * areaWidth;
    const baseY = (fallLocal - 0.5) * areaHeight;
    const sway =
      Math.sin(
        loopPhase * Math.PI * 2 * swayFrequency + randomE * Math.PI * 2,
      ) *
      swayAmplitude *
      (0.45 + randomB * 0.75);
    const windOffset = (fallLocal - 0.5) * wind * 0.35;
    const edgeAlpha = fadeEdges
      ? Math.min(1, Math.sin(fallLocal * Math.PI) * 1.35)
      : 1;
    const alpha = alphaBase * edgeAlpha * (0.55 + randomD * 0.45);
    if (alpha <= 0.002) continue;
    const scaleRandom = Math.max(0.05, 1 + (randomB - 0.5) * sizeRandom * 2);
    sprites.push(
      createSpriteSample("drift_fall", animation, sampledLayer, {
        x: baseX + sway + windOffset,
        y: baseY,
        scaleX: Math.max(0.01, baseTextureScale * scaleRandom),
        scaleY: Math.max(0.01, baseTextureScale * scaleRandom),
        rotation:
          (randomE - 0.5) * Math.PI * 2 +
          loopPhase * Math.PI * 2 * rotationSpeed,
        alpha,
        blendMode: sampledLayer.blendMode,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    );
  }
  return sprites;
}

function samplePathParticles(
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  textureSize: VNIEffectTextureSize,
  progress: number,
): VNIEffectSpriteSample[] {
  const pathMode = Math.round(
    clampEffectNumber(getNumberParam(animation, "pathMode"), 0, 4),
  );
  const count = Math.round(
    clampEffectNumber(getNumberParam(animation, "count"), 1, 160),
  );
  const size = clampEffectNumber(getNumberParam(animation, "size"), 1, 400);
  const endX = getNumberParam(animation, "endX");
  const endY = -getNumberParam(animation, "endY");
  const curve = getNumberParam(animation, "curve");
  const amplitude = clampEffectNumber(
    getNumberParam(animation, "amplitude"),
    0,
    2000,
  );
  const frequency = clampEffectNumber(
    getNumberParam(animation, "frequency"),
    0,
    20,
  );
  const radiusStart = clampEffectNumber(
    getNumberParam(animation, "radiusStart"),
    0,
    3000,
  );
  const radiusEnd = clampEffectNumber(
    getNumberParam(animation, "radiusEnd"),
    0,
    3000,
  );
  const turns = clampEffectNumber(getNumberParam(animation, "turns"), -10, 10);
  const speed = clampEffectNumber(getNumberParam(animation, "speed"), 0.05, 8);
  const stagger = clampEffectNumber(getNumberParam(animation, "stagger"), 0, 1);
  const oneShotStagger = clampEffectNumber(
    getNumberParam(animation, "oneShotStagger"),
    0,
    0.95,
  );
  const requestedTrailCount = Math.round(
    clampEffectNumber(getNumberParam(animation, "trailCount"), 0, 10),
  );
  const trailCount = Math.min(
    requestedTrailCount,
    Math.max(0, Math.floor(MAX_PATH_SPRITES / Math.max(1, count)) - 1),
  );
  const trailSpacing = clampEffectNumber(
    getNumberParam(animation, "trailSpacing"),
    0.005,
    0.25,
  );
  const trailFade = clampEffectNumber(
    getNumberParam(animation, "trailFade"),
    0.05,
    0.95,
  );
  const alphaBase =
    sampledLayer.baseOpacity *
    clampEffectNumber(getNumberParam(animation, "alpha"), 0, 1);
  const rotateToPath = getOptionalBooleanParam(animation, "rotateToPath", true);
  const fadeEnds = getOptionalBooleanParam(animation, "fadeEnds", true);
  const loop = getOptionalBooleanParam(animation, "loop", true);
  const baseTextureScale = size / getTextureLongestEdge(textureSize);
  const travel = loop ? positiveModulo(progress * speed, 1) : progress;
  const oneShotStaggerWindow = loop ? 0 : oneShotStagger;
  const oneShotTravelWindow = Math.max(0.001, 1 - oneShotStaggerWindow);
  const sprites: VNIEffectSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const randomA = seededRandom(animation.seed, index, 901);
    const randomB = seededRandom(animation.seed, index, 902);
    const randomC = seededRandom(animation.seed, index, 903);
    const offset = count <= 1 ? 0 : (index / Math.max(1, count - 1)) * stagger;
    const oneShotStartOffset =
      count <= 1 ? 0 : (index / Math.max(1, count - 1)) * oneShotStaggerWindow;
    for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
      const local = loop
        ? positiveModulo(travel + offset - trailIndex * trailSpacing, 1)
        : (travel - oneShotStartOffset) / oneShotTravelWindow -
          trailIndex * trailSpacing;
      if (!loop && (local < 0 || local > 1)) continue;
      const edgeAlpha = fadeEnds
        ? Math.min(1, Math.sin(local * Math.PI) * 1.45)
        : 1;
      const alpha =
        alphaBase *
        edgeAlpha *
        Math.pow(trailFade, trailIndex) *
        (0.6 + randomB * 0.4);
      if (alpha <= 0.002) continue;
      const point = samplePathParticlePoint(
        pathMode,
        local,
        endX,
        endY,
        curve,
        amplitude,
        frequency,
        radiusStart,
        radiusEnd,
        turns,
      );
      const scale =
        baseTextureScale *
        (0.75 + randomA * 0.55) *
        (trailIndex === 0 ? 1 : 0.86);
      sprites.push(
        createSpriteSample("path_particles", animation, sampledLayer, {
          x: point.x,
          y: point.y,
          scaleX: Math.max(0.01, scale),
          scaleY: Math.max(0.01, scale),
          rotation: rotateToPath
            ? point.rotation
            : (randomC - 0.5) * Math.PI * 2 + local * Math.PI * 2,
          alpha,
          blendMode: sampledLayer.blendMode,
          anchorX: 0.5,
          anchorY: 0.5,
        }),
      );
    }
  }
  return sprites;
}

interface ParticlePoint {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  rotation: number;
}

function sampleGatherParticlePoint(
  animation: V5GAnimationConfig,
  index: number,
  progress: number,
  spawnRadius: number,
  spawnRatio: number,
  targetOffsetX: number,
  targetOffsetY: number,
  travelMode: number,
  curve: number,
  spiralTurns: number,
  vanishMode: number,
  vanishRatio: number,
  flashScale: number,
  flashIntensity: number,
): ParticlePoint {
  const p = clampNumber(progress, 0, 1);
  const randomA = seededRandom(animation.seed, index, 951);
  const randomB = seededRandom(animation.seed, index, 952);
  const randomC = seededRandom(animation.seed, index, 953);
  const randomD = seededRandom(animation.seed, index, 954);
  const randomE = seededRandom(animation.seed, index, 955);
  const randomF = seededRandom(animation.seed, index, 956);
  const startAngle = randomA * Math.PI * 2;
  const startDistance = Math.sqrt(randomB) * spawnRadius;
  const startX = Math.cos(startAngle) * startDistance;
  const startY = Math.sin(startAngle) * startDistance;
  const travelStart = spawnRatio;
  const vanishStart = Math.max(travelStart + 0.001, 1 - vanishRatio);
  const travelDuration = Math.max(0.001, vanishStart - travelStart);
  const appearPhase = clampNumber(p / Math.max(spawnRatio, 0.001), 0, 1);
  const travelPhase = clampNumber((p - travelStart) / travelDuration, 0, 1);
  const vanishPhase = clampNumber(
    (p - vanishStart) / Math.max(vanishRatio, 0.001),
    0,
    1,
  );
  const easedAppear = easeOutQuad(appearPhase);
  const easedTravel = easeInOutQuad(travelPhase);
  const easedVanish = easeOutQuad(vanishPhase);

  let x = startX;
  let y = startY;
  if (p >= travelStart) {
    if (travelMode === 2) {
      const dx = startX - targetOffsetX;
      const dy = startY - targetOffsetY;
      const distance = Math.hypot(dx, dy);
      const baseAngle = Math.atan2(dy, dx);
      const angle =
        baseAngle +
        easedTravel * Math.PI * 2 * spiralTurns +
        (randomC - 0.5) * 0.55;
      const radius = distance * (1 - easedTravel);
      const drift =
        curve * Math.sin(easedTravel * Math.PI) * (randomD < 0.5 ? -1 : 1);
      x =
        targetOffsetX +
        Math.cos(angle) * radius +
        Math.cos(angle + Math.PI / 2) * drift;
      y =
        targetOffsetY +
        Math.sin(angle) * radius +
        Math.sin(angle + Math.PI / 2) * drift;
    } else if (travelMode === 1) {
      const curved = quadraticPoint(
        startX,
        startY,
        targetOffsetX,
        targetOffsetY,
        curve * (randomD < 0.5 ? -1 : 1),
        easedTravel,
      );
      x = curved.x;
      y = curved.y;
    } else {
      x = lerpNumber(startX, targetOffsetX, easedTravel);
      y = lerpNumber(startY, targetOffsetY, easedTravel);
    }
  }

  let alpha = p < travelStart ? easedAppear : 1;
  let scale =
    (0.55 + randomE * 0.9) * (p < travelStart ? 0.25 + easedAppear * 0.75 : 1);
  if (vanishPhase > 0) {
    if (vanishMode === 1) {
      const flash = Math.sin(vanishPhase * Math.PI);
      alpha *= Math.max(
        0,
        1 - easedVanish * 0.85 + flash * (flashIntensity - 1) * 0.4,
      );
      scale *= 1 + flash * (flashScale - 1);
    } else if (vanishMode === 2) {
      scale *= lerpNumber(1, flashScale, easedVanish);
      alpha *= Math.max(0, 1 - easedVanish);
    } else {
      alpha *= Math.max(0, 1 - easedVanish);
    }
  }

  return {
    x,
    y,
    alpha: Math.max(0, alpha),
    scale,
    rotation:
      (randomF - 0.5) * Math.PI * 2 + p * Math.PI * 2 * (0.25 + randomC),
  };
}

function samplePathParticlePoint(
  pathMode: number,
  progress: number,
  endX: number,
  endY: number,
  curve: number,
  amplitude: number,
  frequency: number,
  radiusStart: number,
  radiusEnd: number,
  turns: number,
  sampleOffset = 0.002,
  skipRotation = false,
): { x: number; y: number; rotation: number } {
  const t = positiveModulo(progress, 1);
  let point: { x: number; y: number };
  if (pathMode === 4) {
    const angle = -Math.PI / 2 + t * Math.PI * 2 * turns;
    point = { x: Math.cos(angle) * radiusEnd, y: Math.sin(angle) * radiusEnd };
  } else if (pathMode === 3) {
    const angle = -Math.PI / 2 + t * Math.PI * 2 * turns;
    const radius = lerpNumber(radiusStart, radiusEnd, t);
    point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  } else if (pathMode === 2) {
    const baseX = lerpNumber(0, endX, t);
    const baseY = lerpNumber(0, endY, t);
    const length = Math.hypot(endX, endY) || 1;
    const wave = Math.sin(t * Math.PI * 2 * frequency);
    point = {
      x: baseX + (-endY / length) * amplitude * wave,
      y: baseY + (endX / length) * amplitude * wave,
    };
  } else if (pathMode === 1) {
    point = quadraticPoint(0, 0, endX, endY, curve, t);
  } else {
    point = { x: lerpNumber(0, endX, t), y: lerpNumber(0, endY, t) };
  }
  if (skipRotation) return { ...point, rotation: 0 };
  const next = samplePathParticlePoint(
    pathMode,
    t + sampleOffset,
    endX,
    endY,
    curve,
    amplitude,
    frequency,
    radiusStart,
    radiusEnd,
    turns,
    sampleOffset,
    true,
  );
  return {
    ...point,
    rotation: Math.atan2(next.y - point.y, next.x - point.x),
  };
}

function createSpriteSample(
  type: VNIEffectSpriteSample["type"],
  animation: V5GAnimationConfig,
  sampledLayer: VNIEffectLayerSampleState,
  input: Omit<
    VNIEffectSpriteSample,
    "kind" | "type" | "layerId" | "animationId"
  >,
): VNIEffectSpriteSample {
  return {
    kind: "sprite",
    type,
    layerId: sampledLayer.layerId,
    animationId: animation.id,
    x: roundTo(input.x, 4),
    y: roundTo(input.y, 4),
    scaleX: roundTo(input.scaleX, 4),
    scaleY: roundTo(input.scaleY, 4),
    rotation: roundTo(input.rotation, 4),
    alpha: roundTo(clampNumber(input.alpha, 0, 1), 4),
    blendMode: input.blendMode,
    anchorX: roundTo(input.anchorX, 4),
    anchorY: roundTo(input.anchorY, 4),
  };
}

function isTextureBackedLayer(layer: V5GLayerConfig): boolean {
  return layer.type === "image" || layer.type === "sequence";
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}

function getOptionalNumberParam(
  animation: V5GAnimationConfig,
  key: string,
  fallback: number,
): number {
  const value = animation.params[key];
  if (value === undefined) return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} param "${key}" must be a finite number.`,
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

function clampEffectNumber(value: number, min: number, max: number): number {
  return clampNumber(Number.isFinite(value) ? value : min, min, max);
}

function getTextureLongestEdge(textureSize: VNIEffectTextureSize): number {
  const longestEdge = Math.max(textureSize.width, textureSize.height);
  return Number.isFinite(longestEdge) && longestEdge > 0 ? longestEdge : 1;
}

function positiveModulo(value: number, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor <= 0) return 0;
  return ((value % divisor) + divisor) % divisor;
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

function easeOutQuad(progress: number): number {
  const t = clampNumber(progress, 0, 1);
  return 1 - (1 - t) * (1 - t);
}

function easeInOutQuad(progress: number): number {
  const t = clampNumber(progress, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerpNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * clampNumber(progress, 0, 1);
}
