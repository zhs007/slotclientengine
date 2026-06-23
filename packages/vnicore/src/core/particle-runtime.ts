import { editorToPixi } from "./coordinates.js";
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
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GStageConfig,
} from "./types.js";

export interface VNIParticleRuntimeLayer {
  layer: V5GLayerConfig;
  sampledLayer: ParticleLayerSampleState & {
    hasActiveParticleAnimation?: boolean;
  };
  textureSize: TextureSize;
}

export interface VNILiveParticleSpriteSample extends ParticleSpriteSample {
  x: number;
  y: number;
}

export interface VNIParticleRuntimeFrame {
  particles: VNILiveParticleSpriteSample[];
  isDraining: boolean;
  isComplete: boolean;
}

interface VNILiveParticleAnimationLayer extends VNIParticleRuntimeLayer {
  runtimeStates: ParticleAnimationRuntimeState[];
}

export class VNIParticleRuntime {
  private lastParticles: VNILiveParticleSpriteSample[] = [];
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
    layers: readonly VNIParticleRuntimeLayer[],
    stage: V5GStageConfig,
    time: number,
  ): VNIParticleRuntimeFrame {
    this.liveAnimationElapsedByKey.clear();
    this.draining = false;
    this.drainElapsed = 0;
    this.drainDuration = 0;
    const particles = sampleLiveParticleSprites(layers, stage, time);
    this.lastParticles = particles;
    return {
      particles,
      isDraining: false,
      isComplete: false,
    };
  }

  emitLive(
    layers: readonly VNIParticleRuntimeLayer[],
    stage: V5GStageConfig,
    configTime: number,
    deltaSeconds: number,
  ): VNIParticleRuntimeFrame {
    this.draining = false;
    this.drainElapsed = 0;
    this.drainDuration = 0;
    const liveLayers = this.prepareLiveParticleLayers(
      layers,
      configTime,
      deltaSeconds,
    );
    const particles = sampleLiveParticleSpritesForRuntime(liveLayers, stage);
    this.lastParticles = particles;
    return {
      particles,
      isDraining: false,
      isComplete: false,
    };
  }

  beginDrain(): VNIParticleRuntimeFrame {
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

  advanceDrain(deltaSeconds: number): VNIParticleRuntimeFrame {
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
    layers: readonly VNIParticleRuntimeLayer[],
    configTime: number,
    deltaSeconds: number,
  ): VNILiveParticleAnimationLayer[] {
    const nextActiveKeys = new Set<string>();
    const liveLayers: VNILiveParticleAnimationLayer[] = [];
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
  layers: readonly VNIParticleRuntimeLayer[],
  stage: V5GStageConfig,
  time: number,
): VNILiveParticleSpriteSample[] {
  const particles: VNILiveParticleSpriteSample[] = [];
  for (const entry of layers) {
    if (entry.sampledLayer.hasActiveParticleAnimation === false) continue;
    const emitter = editorToPixi(
      entry.sampledLayer.transform.x,
      entry.sampledLayer.transform.y,
      stage.width,
      stage.height,
    );
    for (const particle of sampleParticleSpritesForLayer(
      entry.layer,
      entry.sampledLayer,
      entry.textureSize,
      time,
    )) {
      particles.push({
        ...particle,
        x: emitter.x + particle.offsetX,
        y: emitter.y + particle.offsetY,
      });
    }
  }
  return particles;
}

function sampleLiveParticleSpritesForRuntime(
  layers: readonly VNILiveParticleAnimationLayer[],
  stage: V5GStageConfig,
): VNILiveParticleSpriteSample[] {
  const particles: VNILiveParticleSpriteSample[] = [];
  for (const entry of layers) {
    if (entry.sampledLayer.hasActiveParticleAnimation === false) continue;
    const emitter = editorToPixi(
      entry.sampledLayer.transform.x,
      entry.sampledLayer.transform.y,
      stage.width,
      stage.height,
    );
    for (const particle of sampleParticleSpritesForLayerRuntime(
      entry.layer,
      entry.sampledLayer,
      entry.textureSize,
      entry.runtimeStates,
    )) {
      particles.push({
        ...particle,
        x: emitter.x + particle.offsetX,
        y: emitter.y + particle.offsetY,
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
