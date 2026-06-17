import { describe, expect, it } from "vitest";
import {
  getParticleProgress,
  hasActiveParticleAnimation,
  sampleParticleSpritesForLayer,
  seededRandom,
  type ParticleLayerSampleState,
} from "../../src/runtime/particle-sampler";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GTransformConfig,
} from "../../src/v5g/types";

const transform: V5GTransformConfig = {
  x: 100,
  y: 50,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

const sampledLayer: ParticleLayerSampleState = {
  layerId: "layer",
  transform,
  opacity: 0.8,
  visible: true,
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
    opacity: 1,
    blendMode: "add",
    animations: [animation],
    keyframes: [],
  };
}

function particleBurst(
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: "particles",
    type: "particles",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 99,
    params: {
      count: 4,
      spread: 20,
      speed: 30,
      size: 16,
      gravity: 10,
      fadeOut: true,
    },
    ...overrides,
  };
}

function particleTwinkle(
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: "twinkle",
    type: "particle_twinkle",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 7,
    params: {
      radius: 80,
      count: 5,
      spawnInterval: 0.1,
      twinkleDuration: 0.5,
      batchMin: 2,
      batchMax: 2,
      size: 16,
    },
    ...overrides,
  };
}

describe("particle-sampler", () => {
  it("returns stable seeded random values", () => {
    expect(seededRandom(1, 2, 3)).toBe(seededRandom(1, 2, 3));
    expect(seededRandom(1, 2, 3)).not.toBe(seededRandom(1, 2, 4));
  });

  it("samples particle bursts deterministically and clamps count", () => {
    const animation = particleBurst({
      params: {
        count: 500,
        spread: 20,
        speed: 30,
        size: 16,
        gravity: 10,
        fadeOut: true,
      },
    });
    const first = sampleParticleSpritesForLayer(
      layer(animation),
      sampledLayer,
      { width: 100, height: 50 },
      0.5,
    );
    const second = sampleParticleSpritesForLayer(
      layer(animation),
      sampledLayer,
      { width: 100, height: 50 },
      0.5,
    );

    expect(first).toHaveLength(200);
    expect(first).toEqual(second);
    expect(first[0].alpha).toBeGreaterThan(0);
    expect(first[0].blendMode).toBe("add");
  });

  it("samples particle twinkle batches and stops at the end boundary", () => {
    const animation = particleTwinkle();
    const sampled = sampleParticleSpritesForLayer(
      layer(animation),
      sampledLayer,
      { width: 100, height: 50 },
      0.25,
    );

    expect(sampled).toHaveLength(5);
    expect(sampled.every((particle) => particle.alpha > 0)).toBe(true);
    expect(getParticleProgress(animation, 1)).toBeNull();
    expect(
      sampleParticleSpritesForLayer(
        layer(animation),
        sampledLayer,
        { width: 100, height: 50 },
        1,
      ),
    ).toHaveLength(0);
  });

  it("detects active particle animations only inside coverage", () => {
    const particleLayer = layer(particleBurst());

    expect(hasActiveParticleAnimation(particleLayer, 0.5)).toBe(true);
    expect(hasActiveParticleAnimation(particleLayer, 1)).toBe(false);
    expect(hasActiveParticleAnimation(particleLayer, -0.1)).toBe(false);
  });
});
