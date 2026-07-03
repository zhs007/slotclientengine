import { describe, expect, it } from "vitest";
import {
  V5GParticleRuntime,
  sampleLiveParticleSprites,
  type V5GParticleRuntimeLayer,
} from "../../src/core/particle-runtime";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GTransformConfig,
} from "../../src/core/types";

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

function runtimeLayer(layer: V5GLayerConfig): V5GParticleRuntimeLayer {
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
  it("samples live particle positions in Cocos center coordinates", () => {
    const layer = imageLayer(particleWall());
    const particles = sampleLiveParticleSprites([runtimeLayer(layer)], 1);

    expect(particles.length).toBeGreaterThan(0);
    expect(particles[0].layerId).toBe("layer");
    expect(particles[0].x).toBeCloseTo(10 + particles[0].offsetX);
    expect(particles[0].y).toBeCloseTo(20 - particles[0].offsetY);
    expect(
      particles.some((particle) => particle.offsetY < 0 && particle.y > 20),
    ).toBe(true);
  });

  it("keeps emitted particles during drain and completes after lifetime", () => {
    const layer = imageLayer(particleWall());
    const runtime = new V5GParticleRuntime([layer]);
    const live = runtime.emit([runtimeLayer(layer)], 1);

    expect(live.particles.length).toBeGreaterThan(0);
    expect(runtime.getLiveParticleCount()).toBe(live.particles.length);

    const firstDrain = runtime.beginDrain();
    expect(firstDrain.isDraining).toBe(true);
    expect(firstDrain.particles).toHaveLength(live.particles.length);

    const fading = runtime.advanceDrain(0.5);
    expect(fading.isDraining).toBe(true);
    expect(fading.particles[0].alpha).toBeLessThan(live.particles[0].alpha);

    const complete = runtime.advanceDrain(0.5);
    expect(complete.isComplete).toBe(true);
    expect(complete.particles).toHaveLength(0);
    expect(runtime.getLiveParticleCount()).toBe(0);
  });

  it("force stops live particles and remains stable on repeated calls", () => {
    const layer = imageLayer(particleWall());
    const runtime = new V5GParticleRuntime([layer]);
    const live = runtime.emit([runtimeLayer(layer)], 1);

    expect(live.particles.length).toBeGreaterThan(0);
    expect(runtime.getLiveParticleCount()).toBe(live.particles.length);

    expect(runtime.forceStopAll()).toEqual({
      particles: [],
      isDraining: false,
      isComplete: true,
    });
    expect(runtime.getLiveParticleCount()).toBe(0);
    expect(runtime.isDraining()).toBe(false);
    expect(runtime.forceStopAll()).toEqual({
      particles: [],
      isDraining: false,
      isComplete: true,
    });
  });

  it("force stops particle drain and clears old drain state", () => {
    const layer = imageLayer(particleWall());
    const runtime = new V5GParticleRuntime([layer]);
    runtime.emit([runtimeLayer(layer)], 1);
    expect(runtime.beginDrain().isDraining).toBe(true);

    const stopped = runtime.forceStopAll();
    expect(stopped).toEqual({
      particles: [],
      isDraining: false,
      isComplete: true,
    });
    expect(runtime.isDraining()).toBe(false);
    expect(runtime.advanceDrain(0.25)).toEqual({
      particles: [],
      isDraining: false,
      isComplete: true,
    });
  });

  it("continues wall emission from a held active emitter config", () => {
    const animation = { ...particleWall(), duration: 1 };
    const layer = imageLayer(animation);
    const runtime = new V5GParticleRuntime([layer]);
    const configTime = 0.5;

    const first = runtime.emitLive([runtimeLayer(layer)], configTime, 0);
    const afterOriginalDuration = runtime.emitLive(
      [runtimeLayer(layer)],
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

  it("resets immediately when there are no live particles to drain", () => {
    const runtime = new V5GParticleRuntime([imageLayer(particleWall())]);

    expect(runtime.beginDrain()).toEqual({
      particles: [],
      isDraining: false,
      isComplete: true,
    });
  });
});
