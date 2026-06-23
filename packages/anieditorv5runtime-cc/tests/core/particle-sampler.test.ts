import { describe, expect, it } from "vitest";
import {
  sampleParticleSpritesForLayer,
  sampleParticleSpritesForLayerRuntime,
  type ParticleLayerSampleState,
} from "../../src/core/particle-sampler";
import type { V5GAnimationConfig, V5GLayerConfig } from "../../src/core/types";

const transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

const sampledLayer: ParticleLayerSampleState = {
  layerId: "layer",
  transform,
  baseOpacity: 0.8,
  opacity: 0,
  visible: false,
  blendMode: "add",
};

function layer(animation: V5GAnimationConfig): V5GLayerConfig {
  return {
    id: "layer",
    name: "Layer",
    type: "image",
    assetId: "asset",
    parentId: null,
    visible: true,
    locked: false,
    transform,
    opacity: 0.8,
    blendMode: "add",
    animations: [animation],
    keyframes: [],
  };
}

function particleWall(
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: "wall",
    type: "particle_wall",
    startTime: 0,
    duration: 2,
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
    ...overrides,
  };
}

function particleCombo(): V5GAnimationConfig {
  return {
    id: "combo",
    type: "particle_combo",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 7,
    params: {
      count: 6,
      size: 16,
      sourceOpacity: 0,
      spawnMode: 1,
      spawnRadius: 40,
      spawnRatio: 0.2,
      targetX: 20,
      targetY: 30,
      travelMode: 1,
      curve: 10,
      orbitRadius: 20,
      orbitTurns: 1,
      orbitSpeed: 1,
      orbitRatio: 0.4,
      staggerRatio: 0,
      trailCount: 0,
      trailSpacing: 0.03,
      trailFade: 0.6,
      vanishMode: 0,
      vanishRatio: 0.2,
      flashScale: 1.2,
      flashIntensity: 1,
    },
  };
}

describe("particle-sampler", () => {
  it("does not emit particles at the exact animation start", () => {
    expect(
      sampleParticleSpritesForLayer(
        layer(particleWall()),
        { ...sampledLayer, opacity: 0.8, visible: true },
        { width: 100, height: 100 },
        0,
      ),
    ).toHaveLength(0);
  });

  it("samples particle_wall deterministically and through runtime elapsed", () => {
    const wallLayer = layer(particleWall());
    const deterministic = sampleParticleSpritesForLayer(
      wallLayer,
      { ...sampledLayer, opacity: 0.8, visible: true },
      { width: 100, height: 100 },
      0.75,
    );
    const runtime = sampleParticleSpritesForLayerRuntime(
      wallLayer,
      { ...sampledLayer, opacity: 0.8, visible: true },
      { width: 100, height: 100 },
      [{ animationId: "wall", elapsed: 1.4 }],
    );

    expect(deterministic.length).toBeGreaterThan(0);
    expect(runtime.length).toBeGreaterThan(0);
    expect(runtime).not.toEqual(deterministic);
  });

  it("samples particle_combo from baseOpacity when sourceOpacity hides the image", () => {
    const particles = sampleParticleSpritesForLayer(
      layer(particleCombo()),
      sampledLayer,
      { width: 100, height: 100 },
      0.5,
    );

    expect(particles.length).toBeGreaterThan(0);
    expect(particles.every((particle) => particle.alpha > 0)).toBe(true);
  });
});
