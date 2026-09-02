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
} from "../data/types.js";

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
  private lastRuntimeLayers: VNILiveParticleAnimationLayer[] = [];
  private lastStage: V5GStageConfig | null = null;
  private drainLayers: VNILiveParticleAnimationLayer[] = [];
  private drainStage: V5GStageConfig | null = null;
  private drainRemainingSeconds = 0;
  private draining = false;
  private forcedFadeElapsed = 0;
  private forcedFadeDuration: number | null = null;

  constructor(_projectLayers: readonly V5GLayerConfig[]) {}

  reconfigure(_projectLayers: readonly V5GLayerConfig[]): void {
    this.reset();
  }

  reset(): void {
    this.lastParticles = [];
    this.liveAnimationElapsedByKey.clear();
    this.lastRuntimeLayers = [];
    this.lastStage = null;
    this.drainLayers = [];
    this.drainStage = null;
    this.drainRemainingSeconds = 0;
    this.draining = false;
    this.forcedFadeElapsed = 0;
    this.forcedFadeDuration = null;
  }

  emit(
    layers: readonly VNIParticleRuntimeLayer[],
    stage: V5GStageConfig,
    time: number,
  ): VNIParticleRuntimeFrame {
    this.liveAnimationElapsedByKey.clear();
    this.clearDrainState();
    const particles = sampleLiveParticleSprites(layers, stage, time);
    this.lastParticles = particles;
    this.lastRuntimeLayers = this.prepareAuthoredParticleLayers(layers, time);
    this.lastStage = { ...stage };
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
    simulationTime?: number,
  ): VNIParticleRuntimeFrame {
    this.clearDrainState();
    const liveLayers = this.prepareLiveParticleLayers(
      layers,
      configTime,
      deltaSeconds,
      simulationTime,
    );
    const particles = sampleLiveParticleSpritesForRuntime(liveLayers, stage);
    this.lastParticles = particles;
    this.lastRuntimeLayers = liveLayers.map(cloneRuntimeLayer);
    this.lastStage = { ...stage };
    return {
      particles,
      isDraining: false,
      isComplete: false,
    };
  }

  beginDrain(): VNIParticleRuntimeFrame {
    this.liveAnimationElapsedByKey.clear();
    if (this.lastRuntimeLayers.length === 0) {
      this.reset();
      return {
        particles: [],
        isDraining: false,
        isComplete: true,
      };
    }
    this.draining = true;
    this.drainLayers = this.lastRuntimeLayers.map((entry) => ({
      ...cloneRuntimeLayer(entry),
      runtimeStates: entry.runtimeStates.map((state) => ({
        ...state,
        emissionElapsedLimit: state.elapsed,
      })),
    }));
    this.drainStage = this.lastStage;
    this.drainRemainingSeconds = getDrainRemainingSeconds(this.drainLayers);
    if (this.drainRemainingSeconds <= 0) {
      this.reset();
      return {
        particles: [],
        isDraining: false,
        isComplete: true,
      };
    }
    this.forcedFadeElapsed = 0;
    this.forcedFadeDuration = null;
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
    const stage = this.drainStage;
    if (!stage) {
      this.reset();
      return {
        particles: [],
        isDraining: false,
        isComplete: true,
      };
    }
    for (const entry of this.drainLayers) {
      for (const state of entry.runtimeStates) {
        state.elapsed += deltaSeconds;
      }
    }
    this.drainRemainingSeconds = Math.max(
      0,
      this.drainRemainingSeconds - deltaSeconds,
    );
    let particles = sampleLiveParticleSpritesForRuntime(
      this.drainLayers,
      stage,
    );
    if (this.forcedFadeDuration !== null) {
      this.forcedFadeElapsed += deltaSeconds;
      const ratio = this.forcedFadeElapsed / this.forcedFadeDuration;
      if (ratio >= 1) {
        this.reset();
        return {
          particles: [],
          isDraining: false,
          isComplete: true,
        };
      }
      const alphaMultiplier = Math.max(0, 1 - ratio);
      particles = particles
        .map((particle) => ({
          ...particle,
          alpha: particle.alpha * alphaMultiplier,
        }))
        .filter((particle) => particle.alpha > 0.002);
    }
    if (this.drainRemainingSeconds <= 0) {
      this.reset();
      return {
        particles: [],
        isDraining: false,
        isComplete: true,
      };
    }
    this.lastParticles = particles;
    return {
      particles,
      isDraining: true,
      isComplete: false,
    };
  }

  fadeOutOrphans(durationSeconds: number): boolean {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error(
        "VNI orphan particle fade duration must be a positive finite number.",
      );
    }
    if (!this.draining) return false;
    if (this.forcedFadeDuration === null) {
      this.forcedFadeElapsed = 0;
      this.forcedFadeDuration = durationSeconds;
    }
    return true;
  }

  isDraining(): boolean {
    return this.draining;
  }

  getLiveParticleCount(): number {
    return this.lastParticles.length;
  }

  private clearDrainState(): void {
    this.draining = false;
    this.drainLayers = [];
    this.drainStage = null;
    this.drainRemainingSeconds = 0;
    this.forcedFadeElapsed = 0;
    this.forcedFadeDuration = null;
  }

  private prepareAuthoredParticleLayers(
    layers: readonly VNIParticleRuntimeLayer[],
    time: number,
  ): VNILiveParticleAnimationLayer[] {
    const runtimeLayers: VNILiveParticleAnimationLayer[] = [];
    for (const entry of layers) {
      const runtimeStates: ParticleAnimationRuntimeState[] = [];
      for (const animation of entry.layer.animations) {
        if (!animation.enabled || !isParticleAnimationType(animation.type)) {
          continue;
        }
        if (getParticleProgress(animation, time) === null) continue;
        runtimeStates.push({
          animationId: animation.id,
          elapsed: Math.max(0, time - animation.startTime),
          loopingEmission: false,
        });
      }
      if (runtimeStates.length > 0) {
        runtimeLayers.push({
          ...cloneRuntimeLayerBase(entry),
          runtimeStates,
        });
      }
    }
    return runtimeLayers;
  }

  private prepareLiveParticleLayers(
    layers: readonly VNIParticleRuntimeLayer[],
    configTime: number,
    deltaSeconds: number,
    simulationTime?: number,
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
        if (configProgress === null) continue;
        const key = getLiveAnimationKey(entry.layer.id, animation.id);
        const configuredElapsed = Math.max(0, configTime - animation.startTime);
        const simulationElapsed =
          simulationTime === undefined
            ? configuredElapsed
            : Math.max(0, simulationTime - animation.startTime);
        const previousElapsed = this.liveAnimationElapsedByKey.get(key);
        const elapsed = getLiveParticleElapsed(
          simulationElapsed,
          previousElapsed,
          deltaSeconds,
        );
        this.liveAnimationElapsedByKey.set(key, elapsed);
        nextActiveKeys.add(key);
        runtimeStates.push({
          animationId: animation.id,
          elapsed,
          loopingEmission: true,
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

function getLiveParticleElapsed(
  configuredElapsed: number,
  previousElapsed: number | undefined,
  deltaSeconds: number,
): number {
  return previousElapsed === undefined
    ? configuredElapsed
    : Math.max(configuredElapsed, previousElapsed + Math.max(0, deltaSeconds));
}

function cloneRuntimeLayerBase(
  entry: VNIParticleRuntimeLayer,
): VNIParticleRuntimeLayer {
  return {
    ...entry,
    sampledLayer: {
      ...entry.sampledLayer,
      transform: { ...entry.sampledLayer.transform },
    },
    textureSize: { ...entry.textureSize },
  };
}

function cloneRuntimeLayer(
  entry: VNILiveParticleAnimationLayer,
): VNILiveParticleAnimationLayer {
  return {
    ...cloneRuntimeLayerBase(entry),
    runtimeStates: entry.runtimeStates.map((state) => ({ ...state })),
  };
}

function getDrainRemainingSeconds(
  layers: readonly VNILiveParticleAnimationLayer[],
): number {
  let remaining = 0;
  for (const entry of layers) {
    const animationById = new Map(
      entry.layer.animations.map((animation) => [animation.id, animation]),
    );
    for (const state of entry.runtimeStates) {
      const animation = animationById.get(state.animationId);
      if (!animation) continue;
      remaining = Math.max(
        remaining,
        getAnimationDrainRemainingSeconds(animation, state.elapsed),
      );
    }
  }
  return remaining;
}

function getAnimationDrainRemainingSeconds(
  animation: V5GAnimationConfig,
  elapsed: number,
): number {
  if (animation.type === "particle_wall") {
    return getNumberParam(animation, "lifetimeMax");
  }
  if (animation.type === "particle_stream") {
    return getNumberParam(animation, "lifetime");
  }
  if (animation.type === "particle_twinkle") {
    return getNumberParam(animation, "twinkleDuration");
  }
  return Math.max(0, animation.duration - elapsed);
}

function getNumberParam(animation: V5GAnimationConfig, key: string): number {
  const value = animation.params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(
    `V5G animation "${animation.id}" ${animation.type} requires numeric param "${key}".`,
  );
}
