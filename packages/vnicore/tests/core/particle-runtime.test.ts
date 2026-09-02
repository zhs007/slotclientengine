import { describe, expect, it } from "vitest";
import {
  VNIParticleRuntime,
  sampleLiveParticleSprites,
  type VNIParticleRuntimeLayer,
} from "../../src/core/particle-runtime";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GStageConfig,
  V5GTransformConfig,
} from "../../src/data/types";

const stage: V5GStageConfig = {
  width: 400,
  height: 300,
  coordinate: "center",
  duration: 4,
  backgroundColor: "#000000",
};

const transform: V5GTransformConfig = {
  x: 10,
  y: 20,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

function particleWall(): V5GAnimationConfig {
  return {
    id: "wall",
    type: "particle_wall",
    startTime: 0,
    duration: 3,
    enabled: true,
    seed: 11,
    params: {
      emitterWidth: 100,
      direction: 270,
      spreadAngle: 15,
      speed: 80,
      lifetimeMin: 0.5,
      lifetimeMax: 1,
      spawnRate: 20,
      size: 24,
      gravity: 0,
      startScaleMin: 0.6,
      startScaleMax: 1,
      endScaleMin: 0.3,
      endScaleMax: 0.8,
      fadeOut: true,
    },
  };
}

function particleTwinkle(): V5GAnimationConfig {
  return {
    id: "twinkle",
    type: "particle_twinkle",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 31,
    params: {
      radius: 80,
      count: 100,
      spawnInterval: 0.2,
      twinkleDuration: 0.5,
      batchMin: 2,
      batchMax: 2,
      size: 24,
    },
  };
}

function imageLayer(animation: V5GAnimationConfig): V5GLayerConfig {
  return {
    id: "layer",
    name: "Layer",
    type: "image",
    assetId: "asset",
    parentId: null,
    visible: true,
    locked: false,
    transform,
    opacity: 1,
    blendMode: "add",
    animations: [animation],
    keyframes: [],
  };
}

function runtimeLayer(layer: V5GLayerConfig): VNIParticleRuntimeLayer {
  return {
    layer,
    textureSize: { width: 100, height: 100 },
    sampledLayer: {
      layerId: layer.id,
      transform,
      baseOpacity: 1,
      opacity: 1,
      visible: true,
      blendMode: "add",
      hasActiveParticleAnimation: true,
    },
  };
}

describe("particle-runtime", () => {
  it("samples live particle positions without depending on Pixi", () => {
    const layer = imageLayer(particleWall());
    const particles = sampleLiveParticleSprites(
      [runtimeLayer(layer)],
      stage,
      1,
    );

    expect(particles.length).toBeGreaterThan(0);
    expect(particles[0].layerId).toBe("layer");
    expect(particles[0].x).toBeTypeOf("number");
    expect(particles[0].y).toBeTypeOf("number");
  });

  it("stops spawning, advances emitted particles, and completes after lifetime", () => {
    const layer = imageLayer(particleWall());
    const runtime = new VNIParticleRuntime([layer]);
    const live = runtime.emit([runtimeLayer(layer)], stage, 1);

    expect(live.particles.length).toBeGreaterThan(0);
    expect(runtime.getLiveParticleCount()).toBe(live.particles.length);

    const firstDrain = runtime.beginDrain();
    expect(firstDrain.isDraining).toBe(true);
    expect(firstDrain.particles).toHaveLength(live.particles.length);

    const draining = runtime.advanceDrain(0.25);
    expect(draining.isDraining).toBe(true);
    const emittedIds = new Set(live.particles.map((particle) => particle.particleId));
    expect(
      draining.particles.every((particle) => emittedIds.has(particle.particleId)),
    ).toBe(true);
    expect(draining.particles).not.toEqual(live.particles);
    expect(
      draining.particles.some((particle) => {
        const previous = live.particles.find(
          (candidate) => candidate.particleId === particle.particleId,
        );
        return previous &&
          (previous.x !== particle.x || previous.y !== particle.y);
      }),
    ).toBe(true);

    const complete = runtime.advanceDrain(0.75);
    expect(complete.isComplete).toBe(true);
    expect(complete.particles).toHaveLength(0);
    expect(runtime.getLiveParticleCount()).toBe(0);
  });

  it("quickly fades orphan particles without removing them synchronously", () => {
    const layer = imageLayer(particleWall());
    const runtime = new VNIParticleRuntime([layer]);
    const live = runtime.emit([runtimeLayer(layer)], stage, 1);
    runtime.beginDrain();

    expect(runtime.fadeOutOrphans(0.1)).toBe(true);
    expect(runtime.getLiveParticleCount()).toBe(live.particles.length);

    const fading = runtime.advanceDrain(0.05);
    expect(fading.isDraining).toBe(true);
    expect(fading.particles.length).toBeGreaterThan(0);
    expect(Math.max(...fading.particles.map((particle) => particle.alpha))).toBeLessThan(
      Math.max(...live.particles.map((particle) => particle.alpha)),
    );

    expect(runtime.advanceDrain(0.05)).toMatchObject({
      particles: [],
      isDraining: false,
      isComplete: true,
    });
    expect(runtime.fadeOutOrphans(0.1)).toBe(false);
  });

  it("continues wall emission from a held active emitter config", () => {
    const animation = { ...particleWall(), duration: 1 };
    const layer = imageLayer(animation);
    const runtime = new VNIParticleRuntime([layer]);
    const configTime = 0.5;

    const first = runtime.emitLive([runtimeLayer(layer)], stage, configTime, 0);
    const afterOriginalDuration = runtime.emitLive(
      [runtimeLayer(layer)],
      stage,
      configTime,
      1.1,
    );

    expect(first.particles.length).toBeGreaterThan(0);
    expect(afterOriginalDuration.particles.length).toBeGreaterThan(0);
    expect(afterOriginalDuration.particles).not.toEqual(first.particles);
    expect(runtime.getLiveParticleCount()).toBe(
      afterOriginalDuration.particles.length,
    );
  });

  it("keeps twinkle particles alive without snapping back across long live segmented loops", () => {
    const layer = imageLayer(particleTwinkle());
    const runtime = new VNIParticleRuntime([layer]);
    const configTime = 0.5;

    const deterministicLoopEntry = sampleLiveParticleSprites(
      [runtimeLayer(layer)],
      stage,
      configTime,
    );
    const first = runtime.emitLive([runtimeLayer(layer)], stage, configTime, 0);
    const afterExhaustingOriginalCount = runtime.emitLive(
      [runtimeLayer(layer)],
      stage,
      configTime,
      10,
    );

    expect(first.particles.length).toBeGreaterThan(0);
    expect(first.particles).toEqual(deterministicLoopEntry);
    expect(afterExhaustingOriginalCount.particles.length).toBeGreaterThan(0);
    expect(afterExhaustingOriginalCount.particles).not.toEqual(first.particles);
  });

  it("resets immediately when there are no live particles to drain", () => {
    const runtime = new VNIParticleRuntime([imageLayer(particleWall())]);

    expect(runtime.beginDrain()).toEqual({
      particles: [],
      isDraining: false,
      isComplete: true,
    });
  });
});
