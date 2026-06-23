import { clampNumber, roundTo } from "./coordinates.js";
import { isParticleAnimationType } from "./animation-sampler.js";
import type {
  V5GAnimationConfig,
  V5GBlendMode,
  V5GLayerConfig,
  V5GTransformConfig,
} from "./types.js";

export interface TextureSize {
  width: number;
  height: number;
}

export interface ParticleLayerSampleState {
  layerId: string;
  transform: V5GTransformConfig;
  baseOpacity: number;
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

export interface ParticleAnimationRuntimeState {
  animationId: string;
  elapsed: number;
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
  if (
    layer.type !== "image" ||
    !layer.visible ||
    sampledLayer.baseOpacity <= 0
  ) {
    return [];
  }

  const sprites: ParticleSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled || !isParticleAnimationType(animation.type)) {
      continue;
    }
    const progress = getParticleProgress(animation, time);
    if (progress === null) continue;
    if (progress <= 0) continue;

    const particleOpacity =
      animation.type === "particle_combo"
        ? sampledLayer.baseOpacity
        : sampledLayer.opacity;
    if (particleOpacity <= 0) continue;
    const particleLayer = { ...sampledLayer, opacity: particleOpacity };

    if (animation.type === "particles") {
      sprites.push(
        ...sampleParticleBurst(animation, particleLayer, textureSize, progress),
      );
    } else if (animation.type === "particle_twinkle") {
      sprites.push(
        ...sampleParticleTwinkle(
          animation,
          particleLayer,
          textureSize,
          progress * Math.max(animation.duration, 0.0001),
        ),
      );
    } else if (animation.type === "particle_wall") {
      sprites.push(
        ...sampleParticleWall(animation, particleLayer, textureSize, progress),
      );
    } else if (animation.type === "particle_combo") {
      sprites.push(
        ...sampleParticleCombo(animation, particleLayer, textureSize, progress),
      );
    }
  }
  return sprites;
}

export function sampleParticleSpritesForLayerRuntime(
  layer: V5GLayerConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  runtimeStates: readonly ParticleAnimationRuntimeState[],
): ParticleSpriteSample[] {
  if (
    layer.type !== "image" ||
    !layer.visible ||
    sampledLayer.baseOpacity <= 0
  ) {
    return [];
  }

  const stateByAnimationId = new Map(
    runtimeStates.map((state) => [state.animationId, state] as const),
  );
  const sprites: ParticleSpriteSample[] = [];
  for (const animation of layer.animations) {
    if (!animation.enabled || !isParticleAnimationType(animation.type)) {
      continue;
    }
    const runtimeState = stateByAnimationId.get(animation.id);
    if (!runtimeState || runtimeState.elapsed <= 0) continue;

    const particleOpacity =
      animation.type === "particle_combo"
        ? sampledLayer.baseOpacity
        : sampledLayer.opacity;
    if (particleOpacity <= 0) continue;
    const particleLayer = { ...sampledLayer, opacity: particleOpacity };

    if (animation.type === "particles") {
      const progress = getRuntimeProgress(animation, runtimeState.elapsed);
      if (progress === null) continue;
      sprites.push(
        ...sampleParticleBurst(animation, particleLayer, textureSize, progress),
      );
    } else if (animation.type === "particle_twinkle") {
      sprites.push(
        ...sampleParticleTwinkle(
          animation,
          particleLayer,
          textureSize,
          runtimeState.elapsed,
        ),
      );
    } else if (animation.type === "particle_wall") {
      sprites.push(
        ...sampleParticleWallFromElapsed(
          animation,
          particleLayer,
          textureSize,
          runtimeState.elapsed,
        ),
      );
    } else if (animation.type === "particle_combo") {
      const progress = getRuntimeProgress(animation, runtimeState.elapsed);
      if (progress === null) continue;
      sprites.push(
        ...sampleParticleCombo(animation, particleLayer, textureSize, progress),
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
  elapsed: number,
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

function sampleParticleWall(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  return sampleParticleWallFromElapsed(
    animation,
    sampledLayer,
    textureSize,
    progress * Math.max(animation.duration, 0.0001),
  );
}

function sampleParticleWallFromElapsed(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  elapsed: number,
): ParticleSpriteSample[] {
  const emitterWidth = clampParticleNumber(
    getNumberParam(animation, "emitterWidth"),
    0,
    3000,
  );
  const direction = clampParticleNumber(
    getNumberParam(animation, "direction"),
    0,
    360,
  );
  const spreadAngle = clampParticleNumber(
    getNumberParam(animation, "spreadAngle"),
    0,
    180,
  );
  const speed = clampParticleNumber(
    getNumberParam(animation, "speed"),
    0,
    2000,
  );
  const lifetimeMin = clampParticleNumber(
    getNumberParam(animation, "lifetimeMin"),
    0.05,
    10,
  );
  const lifetimeMax = clampParticleNumber(
    getNumberParam(animation, "lifetimeMax"),
    lifetimeMin,
    10,
  );
  const spawnRate = clampParticleNumber(
    getNumberParam(animation, "spawnRate"),
    1,
    500,
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const gravity = clampParticleNumber(
    getNumberParam(animation, "gravity"),
    -2000,
    2000,
  );
  const startScaleMin = clampParticleNumber(
    getNumberParam(animation, "startScaleMin"),
    0.01,
    2,
  );
  const startScaleMax = clampParticleNumber(
    getNumberParam(animation, "startScaleMax"),
    startScaleMin,
    2,
  );
  const endScaleMin = clampParticleNumber(
    getNumberParam(animation, "endScaleMin"),
    0.01,
    2,
  );
  const endScaleMax = clampParticleNumber(
    getNumberParam(animation, "endScaleMax"),
    endScaleMin,
    2,
  );
  const fadeOut = getOptionalBooleanParam(animation, "fadeOut", true);
  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const dirRad = (direction * Math.PI) / 180;
  const dirX = Math.cos(dirRad);
  const dirY = Math.sin(dirRad);
  const perpX = -dirY;
  const perpY = dirX;
  const totalSpawnCount = Math.floor(elapsed * spawnRate);
  const sprites: ParticleSpriteSample[] = [];

  for (let index = 0; index < totalSpawnCount; index += 1) {
    const randomA = seededRandom(animation.seed, index, 101);
    const randomB = seededRandom(animation.seed, index, 102);
    const randomC = seededRandom(animation.seed, index, 103);
    const randomD = seededRandom(animation.seed, index, 104);
    const randomE = seededRandom(animation.seed, index, 105);
    const lifetime = lifetimeMin + randomA * (lifetimeMax - lifetimeMin);
    const spawnTime =
      totalSpawnCount <= 1 ? 0 : (index / (totalSpawnCount - 1)) * elapsed;
    const localAge = (elapsed - spawnTime) / Math.max(lifetime, 0.0001);
    if (localAge < 0 || localAge > 1) continue;

    const widthOffset = (randomB - 0.5) * emitterWidth;
    const spreadRad = (randomC - 0.5) * 2 * ((spreadAngle * Math.PI) / 180);
    const flyDirX = Math.cos(dirRad + spreadRad);
    const flyDirY = Math.sin(dirRad + spreadRad);
    const distance = speed * localAge * lifetime;
    const ageSeconds = localAge * lifetime;
    const startScaleValue =
      startScaleMin + randomD * (startScaleMax - startScaleMin);
    const endScaleValue = endScaleMin + randomE * (endScaleMax - endScaleMin);
    const scale = Math.max(
      0.01,
      baseTextureScale *
        (startScaleValue + (endScaleValue - startScaleValue) * localAge),
    );
    const alpha = fadeOut
      ? sampledLayer.opacity * Math.max(0, 1 - localAge)
      : sampledLayer.opacity;
    if (alpha <= 0.002) continue;

    sprites.push({
      layerId: sampledLayer.layerId,
      animationId: animation.id,
      offsetX: roundTo(perpX * widthOffset + flyDirX * distance, 4),
      offsetY: roundTo(
        perpY * widthOffset +
          flyDirY * distance +
          0.5 * gravity * ageSeconds * ageSeconds,
        4,
      ),
      scale: roundTo(scale, 4),
      rotation: roundTo(
        (randomA - 0.5) * Math.PI * 0.5 + localAge * Math.PI * (0.5 + randomB),
        4,
      ),
      alpha: roundTo(clampNumber(alpha, 0, 1), 4),
      blendMode: sampledLayer.blendMode,
    });
  }

  return sprites;
}

function sampleParticleCombo(
  animation: V5GAnimationConfig,
  sampledLayer: ParticleLayerSampleState,
  textureSize: TextureSize,
  progress: number,
): ParticleSpriteSample[] {
  const count = Math.round(
    clampParticleNumber(getNumberParam(animation, "count"), 1, 300),
  );
  const size = clampParticleNumber(getNumberParam(animation, "size"), 1, 400);
  const spawnMode = Math.round(
    clampParticleNumber(getNumberParam(animation, "spawnMode"), 0, 1),
  );
  const spawnRadius = clampParticleNumber(
    getNumberParam(animation, "spawnRadius"),
    0,
    3000,
  );
  const spawnRatio = clampParticleNumber(
    getNumberParam(animation, "spawnRatio"),
    0.01,
    0.8,
  );
  const targetOffsetX = getNumberParam(animation, "targetX");
  const targetOffsetY = -getNumberParam(animation, "targetY");
  const travelMode = Math.round(
    clampParticleNumber(getNumberParam(animation, "travelMode"), 0, 2),
  );
  const curve = getNumberParam(animation, "curve");
  const orbitRadius = clampParticleNumber(
    getNumberParam(animation, "orbitRadius"),
    0,
    3000,
  );
  const orbitTurns = clampParticleNumber(
    getNumberParam(animation, "orbitTurns"),
    -10,
    10,
  );
  const orbitSpeed = clampParticleNumber(
    getNumberParam(animation, "orbitSpeed"),
    0.1,
    5,
  );
  const orbitRatio = clampParticleNumber(
    getNumberParam(animation, "orbitRatio") / orbitSpeed,
    0.03,
    0.95,
  );
  const staggerRatio = clampParticleNumber(
    getNumberParam(animation, "staggerRatio"),
    0,
    0.9,
  );
  const trailCount = Math.round(
    clampParticleNumber(getNumberParam(animation, "trailCount"), 0, 12),
  );
  const trailSpacing = clampParticleNumber(
    getNumberParam(animation, "trailSpacing"),
    0.005,
    0.25,
  );
  const trailFade = clampParticleNumber(
    getNumberParam(animation, "trailFade"),
    0.05,
    0.95,
  );
  const vanishMode = Math.round(
    clampParticleNumber(getNumberParam(animation, "vanishMode"), 0, 2),
  );
  const vanishRatio = clampParticleNumber(
    getNumberParam(animation, "vanishRatio"),
    0.01,
    0.8,
  );
  const flashScale = clampParticleNumber(
    getNumberParam(animation, "flashScale"),
    0.1,
    8,
  );
  const flashIntensity = clampParticleNumber(
    getNumberParam(animation, "flashIntensity"),
    0.1,
    3,
  );
  const textureEdge = getTextureLongestEdge(textureSize);
  const baseTextureScale = size / textureEdge;
  const effectiveTravelWindow = Math.max(0.001, 1 - staggerRatio);
  const sprites: ParticleSpriteSample[] = [];

  for (let index = 0; index < count; index += 1) {
    const stagger =
      count <= 1 ? 0 : (index / Math.max(1, count - 1)) * staggerRatio;
    for (let trailIndex = trailCount; trailIndex >= 0; trailIndex -= 1) {
      const trailProgress = progress - trailIndex * trailSpacing;
      const localProgress = (trailProgress - stagger) / effectiveTravelWindow;
      if (localProgress < 0 || localProgress > 1) continue;
      const point = sampleParticleComboPoint(
        animation,
        index,
        localProgress,
        spawnMode,
        spawnRadius,
        spawnRatio,
        targetOffsetX,
        targetOffsetY,
        travelMode,
        curve,
        orbitRadius,
        orbitTurns,
        orbitRatio,
        vanishMode,
        vanishRatio,
        flashScale,
        flashIntensity,
      );
      if (point.alpha <= 0.002) continue;
      const trailAlpha = Math.pow(trailFade, trailIndex);
      const alpha = sampledLayer.opacity * point.alpha * trailAlpha;
      if (alpha <= 0.002) continue;
      sprites.push({
        layerId: sampledLayer.layerId,
        animationId: animation.id,
        offsetX: roundTo(point.x, 4),
        offsetY: roundTo(point.y, 4),
        scale: roundTo(Math.max(0.01, baseTextureScale * point.scale), 4),
        rotation: roundTo(point.rotation, 4),
        alpha: roundTo(clampNumber(alpha, 0, 1), 4),
        blendMode: sampledLayer.blendMode,
      });
    }
  }

  return sprites;
}

interface ParticleComboPoint {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  rotation: number;
}

function sampleParticleComboPoint(
  animation: V5GAnimationConfig,
  index: number,
  progress: number,
  spawnMode: number,
  spawnRadius: number,
  spawnRatio: number,
  targetOffsetX: number,
  targetOffsetY: number,
  travelMode: number,
  curve: number,
  orbitRadius: number,
  orbitTurns: number,
  orbitRatio: number,
  vanishMode: number,
  vanishRatio: number,
  flashScale: number,
  flashIntensity: number,
): ParticleComboPoint {
  const p = clampNumber(progress, 0, 1);
  const randomA = seededRandom(animation.seed, index, 301);
  const randomB = seededRandom(animation.seed, index, 302);
  const randomC = seededRandom(animation.seed, index, 303);
  const randomD = seededRandom(animation.seed, index, 304);
  const randomE = seededRandom(animation.seed, index, 305);
  const spawnAngle = randomA * Math.PI * 2;
  const spawnDistance = Math.sqrt(randomB) * spawnRadius;
  const spawnX = Math.cos(spawnAngle) * spawnDistance;
  const spawnY = Math.sin(spawnAngle) * spawnDistance;
  const targetX = targetOffsetX;
  const targetY = targetOffsetY;
  const travelStart = spawnRatio;
  const vanishStart = Math.max(travelStart + 0.001, 1 - vanishRatio);
  const travelDuration = Math.max(0.001, vanishStart - travelStart);
  const spawnPhase = clampNumber(p / Math.max(spawnRatio, 0.001), 0, 1);
  const travelPhase = clampNumber((p - travelStart) / travelDuration, 0, 1);
  const vanishPhase = clampNumber(
    (p - vanishStart) / Math.max(vanishRatio, 0.001),
    0,
    1,
  );
  const easedSpawn = easeOutQuad(spawnPhase);
  const easedTravel = easeInOutQuad(travelPhase);
  const easedVanish = easeOutQuad(vanishPhase);

  let x = spawnX;
  let y = spawnY;
  if (p < travelStart) {
    if (spawnMode === 1) {
      x = spawnX * easedSpawn;
      y = spawnY * easedSpawn;
    }
  } else if (travelMode === 2) {
    const orbitEnd = clampNumber(orbitRatio, 0.03, 0.95);
    if (travelPhase <= orbitEnd) {
      const orbitPhase = clampNumber(travelPhase / orbitEnd, 0, 1);
      const orbitAngle =
        spawnAngle + orbitPhase * Math.PI * 2 * orbitTurns + randomC * Math.PI;
      const orbitEase = easeInOutQuad(orbitPhase);
      x =
        spawnX + Math.cos(orbitAngle) * orbitRadius * (0.35 + orbitEase * 0.65);
      y =
        spawnY + Math.sin(orbitAngle) * orbitRadius * (0.35 + orbitEase * 0.65);
    } else {
      const flyPhase = clampNumber(
        (travelPhase - orbitEnd) / (1 - orbitEnd),
        0,
        1,
      );
      const flyEase = easeInOutQuad(flyPhase);
      const orbitAngle =
        spawnAngle + Math.PI * 2 * orbitTurns + randomC * Math.PI;
      const fromX = spawnX + Math.cos(orbitAngle) * orbitRadius;
      const fromY = spawnY + Math.sin(orbitAngle) * orbitRadius;
      const curved = quadraticPoint(
        fromX,
        fromY,
        targetX,
        targetY,
        curve * 0.45 * (randomD < 0.5 ? -1 : 1),
        flyEase,
      );
      x = curved.x;
      y = curved.y;
    }
  } else if (travelMode === 1) {
    const curved = quadraticPoint(
      spawnX,
      spawnY,
      targetX,
      targetY,
      curve,
      easedTravel,
    );
    x = curved.x;
    y = curved.y;
  } else {
    x = lerpNumber(spawnX, targetX, easedTravel);
    y = lerpNumber(spawnY, targetY, easedTravel);
  }

  let alpha = p < travelStart ? easeOutQuad(spawnPhase) : 1;
  let scale = 0.65 + randomE * 0.7;
  if (p < travelStart) scale *= 0.25 + easedSpawn * 0.75;
  if (vanishPhase > 0) {
    if (vanishMode === 1) {
      const flash = Math.sin(vanishPhase * Math.PI);
      alpha *= Math.max(
        0,
        1 - easedVanish * 0.75 + flash * (flashIntensity - 1) * 0.35,
      );
      scale *= 1 + flash * (flashScale - 1);
    } else if (vanishMode === 2) {
      scale *= lerpNumber(1, flashScale, easedVanish);
      alpha *= Math.max(0, 1 - easedVanish);
    } else {
      alpha *= Math.max(0, 1 - easedVanish);
    }
  }

  const rotation =
    (randomC - 0.5) * Math.PI * 2 + p * Math.PI * 2 * (0.35 + randomD);
  return { x, y, alpha: Math.max(0, alpha), scale, rotation };
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

function getRuntimeProgress(
  animation: V5GAnimationConfig,
  elapsed: number,
): number | null {
  const duration = Math.max(animation.duration, 0.0001);
  if (elapsed < 0 || elapsed >= duration) return null;
  return clampNumber(elapsed / duration, 0, 1);
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
