import {
  getParticleProgress,
  sampleParticleSpritesForLayer,
  sampleParticleSpritesForLayerRuntime,
  type ParticleAnimationRuntimeState,
  type ParticleLayerSampleState,
  type ParticleSpriteSample,
  type TextureSize,
} from "./particle-sampler.js";
import { isParticleAnimationType } from "./animation-sampler.js";
import type { V5GAnimationConfig, V5GLayerConfig } from "./types.js";

export interface V5GParticleRuntimeLayer {
  layer: V5GLayerConfig;
  sampledLayer: ParticleLayerSampleState & {
    hasActiveParticleAnimation?: boolean;
  };
  textureSize: TextureSize;
}

export interface V5GLiveParticleSpriteSample extends ParticleSpriteSample {
  x: number;
  y: number;
}

export interface V5GParticleRuntimeFrame {
  particles: V5GLiveParticleSpriteSample[];
  isDraining: boolean;
  isComplete: boolean;
}

interface V5GLiveParticleAnimationLayer extends V5GParticleRuntimeLayer {
  runtimeStates: ParticleAnimationRuntimeState[];
}

export class V5GParticleRuntime {
  private lastParticles: V5GLiveParticleSpriteSample[] = [];
  private liveAnimationElapsedByKey = new Map<string, number>();
  private draining = false;
  private drainElapsed = 0;
  private drainDuration = 0;
  private readonly maxDrainDuration: number;

  constructor(projectLayers: readonly V5GLayerConfig[]) {
    this.maxDrainDuration = getMaxParticleDrainDuration(projectLayers);
  }

  reset(): void {
    this.lastParticles = [];
    this.liveAnimationElapsedByKey.clear();
    this.draining = false;
    this.drainElapsed = 0;
    this.drainDuration = 0;
  }

  emit(
    layers: readonly V5GParticleRuntimeLayer[],
    time: number,
  ): V5GParticleRuntimeFrame {
    this.liveAnimationElapsedByKey.clear();
    this.draining = false;
    this.drainElapsed = 0;
    this.drainDuration = 0;
    const particles = sampleLiveParticleSprites(layers, time);
    this.lastParticles = particles;
    return {
      particles,
      isDraining: false,
      isComplete: false,
    };
  }

  emitLive(
    layers: readonly V5GParticleRuntimeLayer[],
    configTime: number,
    deltaSeconds: number,
  ): V5GParticleRuntimeFrame {
    this.draining = false;
    this.drainElapsed = 0;
    this.drainDuration = 0;
    const liveLayers = this.prepareLiveParticleLayers(
      layers,
      configTime,
      deltaSeconds,
    );
    const particles = sampleLiveParticleSpritesForRuntime(liveLayers);
    this.lastParticles = particles;
    return {
      particles,
      isDraining: false,
      isComplete: false,
    };
  }

  beginDrain(): V5GParticleRuntimeFrame {
    this.liveAnimationElapsedByKey.clear();
    if (this.lastParticles.length === 0 || this.maxDrainDuration <= 0) {
      this.reset();
      return {
        particles: [],
        isDraining: false,
        isComplete: true,
      };
    }
    this.draining = true;
    this.drainElapsed = 0;
    this.drainDuration = this.maxDrainDuration;
    return {
      particles: this.lastParticles,
      isDraining: true,
      isComplete: false,
    };
  }

  advanceDrain(deltaSeconds: number): V5GParticleRuntimeFrame {
    if (!this.draining) {
      return {
        particles: this.lastParticles,
        isDraining: false,
        isComplete: this.lastParticles.length === 0,
      };
    }
    this.drainElapsed += deltaSeconds;
    const ratio = this.drainElapsed / this.drainDuration;
    if (ratio >= 1) {
      this.reset();
      return {
        particles: [],
        isDraining: false,
        isComplete: true,
      };
    }
    const alphaMultiplier = Math.max(0, 1 - ratio);
    return {
      particles: this.lastParticles
        .map((particle) => ({
          ...particle,
          alpha: particle.alpha * alphaMultiplier,
        }))
        .filter((particle) => particle.alpha > 0.002),
      isDraining: true,
      isComplete: false,
    };
  }

  isDraining(): boolean {
    return this.draining;
  }

  getLiveParticleCount(): number {
    return this.lastParticles.length;
  }

  private prepareLiveParticleLayers(
    layers: readonly V5GParticleRuntimeLayer[],
    configTime: number,
    deltaSeconds: number,
  ): V5GLiveParticleAnimationLayer[] {
    const nextActiveKeys = new Set<string>();
    const liveLayers: V5GLiveParticleAnimationLayer[] = [];
    for (const entry of layers) {
      const runtimeStates: ParticleAnimationRuntimeState[] = [];
      for (const animation of entry.layer.animations) {
        if (!animation.enabled || !isParticleAnimationType(animation.type)) {
          continue;
        }
        const configProgress = getParticleProgress(animation, configTime);
        if (configProgress === null || configProgress <= 0) continue;
        const key = getLiveAnimationKey(entry.layer.id, animation.id);
        const configuredElapsed = Math.max(0, configTime - animation.startTime);
        const previousElapsed = this.liveAnimationElapsedByKey.get(key);
        const elapsed =
          previousElapsed === undefined
            ? configuredElapsed
            : Math.max(
                configuredElapsed,
                previousElapsed + Math.max(0, deltaSeconds),
              );
        this.liveAnimationElapsedByKey.set(key, elapsed);
        nextActiveKeys.add(key);
        runtimeStates.push({
          animationId: animation.id,
          elapsed,
        });
      }
      if (runtimeStates.length > 0) {
        liveLayers.push({ ...entry, runtimeStates });
      }
    }
    for (const key of this.liveAnimationElapsedByKey.keys()) {
      if (!nextActiveKeys.has(key)) {
        this.liveAnimationElapsedByKey.delete(key);
      }
    }
    return liveLayers;
  }
}

export function sampleLiveParticleSprites(
  layers: readonly V5GParticleRuntimeLayer[],
  time: number,
): V5GLiveParticleSpriteSample[] {
  const particles: V5GLiveParticleSpriteSample[] = [];
  for (const entry of layers) {
    if (entry.sampledLayer.hasActiveParticleAnimation === false) continue;
    for (const particle of sampleParticleSpritesForLayer(
      entry.layer,
      entry.sampledLayer,
      entry.textureSize,
      time,
    )) {
      particles.push({
        ...particle,
        x: entry.sampledLayer.transform.x + particle.offsetX,
        y: entry.sampledLayer.transform.y - particle.offsetY,
      });
    }
  }
  return particles;
}

function sampleLiveParticleSpritesForRuntime(
  layers: readonly V5GLiveParticleAnimationLayer[],
): V5GLiveParticleSpriteSample[] {
  const particles: V5GLiveParticleSpriteSample[] = [];
  for (const entry of layers) {
    if (entry.sampledLayer.hasActiveParticleAnimation === false) continue;
    for (const particle of sampleParticleSpritesForLayerRuntime(
      entry.layer,
      entry.sampledLayer,
      entry.textureSize,
      entry.runtimeStates,
    )) {
      particles.push({
        ...particle,
        x: entry.sampledLayer.transform.x + particle.offsetX,
        y: entry.sampledLayer.transform.y - particle.offsetY,
      });
    }
  }
  return particles;
}

function getLiveAnimationKey(layerId: string, animationId: string): string {
  return `${layerId}\u0000${animationId}`;
}

function getMaxParticleDrainDuration(
  layers: readonly V5GLayerConfig[],
): number {
  let maxDuration = 0;
  for (const layer of layers) {
    for (const animation of layer.animations) {
      if (!animation.enabled || !isParticleAnimationType(animation.type)) {
        continue;
      }
      maxDuration = Math.max(maxDuration, getParticleDrainDuration(animation));
    }
  }
  return maxDuration;
}

function getParticleDrainDuration(animation: V5GAnimationConfig): number {
  if (animation.type === "particle_wall") {
    return getNumberParam(animation, "lifetimeMax");
  }
  if (animation.type === "particle_stream") {
    return getNumberParam(animation, "lifetime");
  }
  if (animation.type === "particle_twinkle") {
    return getNumberParam(animation, "twinkleDuration");
  }
  if (animation.type === "particle_combo") {
    return Math.max(animation.duration, 0);
  }
  return Math.max(animation.duration, 0);
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}
