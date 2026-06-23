import { describe, expect, it } from "vitest";
import {
  getParticleProgress,
  hasActiveParticleAnimation,
  sampleParticleSpritesForLayer,
  seededRandom,
  type ParticleLayerSampleState,
} from "../../src/core/particle-sampler";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GTransformConfig,
} from "../../src/core/types";

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
  baseOpacity: 0.8,
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
      emitterWidth: 300,
      direction: 270,
      spreadAngle: 15,
      speed: 200,
      lifetimeMin: 0.8,
      lifetimeMax: 2,
      spawnRate: 30,
      size: 48,
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

function particleCombo(
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: "combo",
    type: "particle_combo",
    startTime: 0,
    duration: 1.6,
    enabled: true,
    seed: 13,
    params: {
      count: 12,
      size: 42,
      sourceOpacity: 0,
      spawnMode: 1,
      spawnRadius: 90,
      spawnRatio: 0.18,
      targetX: 320,
      targetY: 40,
      travelMode: 1,
      curve: 160,
      orbitRadius: 80,
      orbitTurns: 1,
      orbitSpeed: 1,
      orbitRatio: 0.35,
      staggerRatio: 0.28,
      trailCount: 4,
      trailSpacing: 0.045,
      trailFade: 0.55,
      vanishMode: 1,
      vanishRatio: 0.18,
      flashScale: 1.6,
      flashIntensity: 1.4,
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

  it("keeps particle sampling deterministic for scaled runtime textures", () => {
    const animation = particleBurst();
    const fullTexture = sampleParticleSpritesForLayer(
      layer(animation),
      sampledLayer,
      { width: 730, height: 735 },
      0.5,
    );
    const runtimeTexture = sampleParticleSpritesForLayer(
      layer(animation),
      sampledLayer,
      { width: 365, height: 368 },
      0.5,
    );
    const runtimeTextureAgain = sampleParticleSpritesForLayer(
      layer(animation),
      sampledLayer,
      { width: 365, height: 368 },
      0.5,
    );

    expect(runtimeTexture).toEqual(runtimeTextureAgain);
    expect(runtimeTexture[0].scale).toBeGreaterThan(fullTexture[0].scale);
  });

  it("samples particle wall deterministically", () => {
    const animation = particleWall();
    const first = sampleParticleSpritesForLayer(
      layer(animation),
      sampledLayer,
      { width: 120, height: 80 },
      1,
    );
    const second = sampleParticleSpritesForLayer(
      layer(animation),
      sampledLayer,
      { width: 120, height: 80 },
      1,
    );

    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({
      layerId: "layer",
      animationId: "wall",
      blendMode: "add",
    });
  });

  it("samples particle combo deterministically when sourceOpacity hides the image", () => {
    const animation = particleCombo();
    const hiddenImageLayer: ParticleLayerSampleState = {
      ...sampledLayer,
      opacity: 0,
    };
    const first = sampleParticleSpritesForLayer(
      layer(animation),
      hiddenImageLayer,
      { width: 100, height: 50 },
      0.8,
    );
    const second = sampleParticleSpritesForLayer(
      layer(animation),
      hiddenImageLayer,
      { width: 100, height: 50 },
      0.8,
    );

    expect(first.length).toBeGreaterThan(0);
    expect(first).toEqual(second);
    expect(first.every((particle) => particle.alpha > 0)).toBe(true);
  });

  it("keeps wall and combo target sizes stable for scaled runtime textures", () => {
    const wallFull = sampleParticleSpritesForLayer(
      layer(particleWall()),
      sampledLayer,
      { width: 730, height: 735 },
      1,
    );
    const wallRuntime = sampleParticleSpritesForLayer(
      layer(particleWall()),
      sampledLayer,
      { width: 365, height: 368 },
      1,
    );
    const comboFull = sampleParticleSpritesForLayer(
      layer(particleCombo()),
      sampledLayer,
      { width: 730, height: 735 },
      0.8,
    );
    const comboRuntime = sampleParticleSpritesForLayer(
      layer(particleCombo()),
      sampledLayer,
      { width: 365, height: 368 },
      0.8,
    );

    expect(wallRuntime[0].scale).toBeGreaterThan(wallFull[0].scale);
    expect(comboRuntime[0].scale).toBeGreaterThan(comboFull[0].scale);
  });

  it("samples alternate particle combo vanish modes", () => {
    const fadeVanish = sampleParticleSpritesForLayer(
      layer(
        particleCombo({ params: { ...particleCombo().params, vanishMode: 0 } }),
      ),
      sampledLayer,
      { width: 100, height: 50 },
      1.45,
    );
    const scaleVanish = sampleParticleSpritesForLayer(
      layer(
        particleCombo({ params: { ...particleCombo().params, vanishMode: 2 } }),
      ),
      sampledLayer,
      { width: 100, height: 50 },
      1.45,
    );

    expect(fadeVanish.length).toBeGreaterThan(0);
    expect(scaleVanish.length).toBeGreaterThan(0);
    expect(fadeVanish).not.toEqual(scaleVanish);
  });

  it("fails fast for invalid particle params and tolerates unusable texture bounds", () => {
    expect(() =>
      sampleParticleSpritesForLayer(
        layer(
          particleBurst({
            params: { ...particleBurst().params, fadeOut: "yes" },
          }),
        ),
        sampledLayer,
        { width: 100, height: 50 },
        0.5,
      ),
    ).toThrow("must be a boolean");
    expect(() =>
      sampleParticleSpritesForLayer(
        layer(
          particleCombo({
            params: { ...particleCombo().params, count: "bad" },
          }),
        ),
        sampledLayer,
        { width: 100, height: 50 },
        0.5,
      ),
    ).toThrow('requires numeric param "count"');

    const sampled = sampleParticleSpritesForLayer(
      layer(particleBurst()),
      sampledLayer,
      { width: 0, height: 0 },
      0.5,
    );
    expect(sampled[0].scale).toBeGreaterThan(1);
  });

  it("samples particle twinkle batches and stops at the end boundary", () => {
    const animation = particleTwinkle();
    expect(
      sampleParticleSpritesForLayer(
        layer(animation),
        sampledLayer,
        { width: 100, height: 50 },
        0,
      ),
    ).toHaveLength(0);

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

  it("suppresses new particle effects at the exact start and end boundaries", () => {
    for (const animation of [particleWall(), particleCombo()]) {
      expect(
        sampleParticleSpritesForLayer(
          layer(animation),
          sampledLayer,
          { width: 100, height: 50 },
          0,
        ),
      ).toHaveLength(0);
      expect(
        sampleParticleSpritesForLayer(
          layer(animation),
          sampledLayer,
          { width: 100, height: 50 },
          animation.duration,
        ),
      ).toHaveLength(0);
    }
  });

  it("detects active particle animations only inside coverage", () => {
    const particleLayer = layer(particleBurst());
    const comboLayer = layer(particleCombo());

    expect(hasActiveParticleAnimation(particleLayer, 0)).toBe(true);
    expect(hasActiveParticleAnimation(particleLayer, 0.5)).toBe(true);
    expect(hasActiveParticleAnimation(particleLayer, 1)).toBe(false);
    expect(hasActiveParticleAnimation(particleLayer, -0.1)).toBe(false);
    expect(hasActiveParticleAnimation(comboLayer, 0.8)).toBe(true);
  });
});
