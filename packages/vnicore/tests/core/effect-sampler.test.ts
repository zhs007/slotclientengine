import { describe, expect, it } from "vitest";
import {
  getDeterministicEffectProgress,
  hasActiveDeterministicEffectAnimation,
  sampleDeterministicEffectSpritesForLayer,
  type VNIDeterministicEffectSample,
  type VNIDeterministicEffectType,
} from "../../src/core/effect-sampler";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GTransformConfig,
} from "../../src/core/types";

const transform: V5GTransformConfig = {
  x: 100,
  y: 50,
  scaleX: 1.25,
  scaleY: 0.8,
  rotation: 12,
  anchorX: 0.4,
  anchorY: 0.6,
};

const sampledLayer = {
  layerId: "layer",
  transform,
  baseOpacity: 0.8,
  blendMode: "screen" as const,
};

const textureSize = { width: 120, height: 80 };

const effectTypes = [
  "gather_particles",
  "smoke_mist",
  "energy_ring",
  "slash_light",
  "flame_flicker",
  "wave_band",
  "wave_distort",
  "speed_lines",
  "drift_fall",
  "path_particles",
] as const satisfies readonly VNIDeterministicEffectType[];

const expectedKindByType: Record<
  VNIDeterministicEffectType,
  VNIDeterministicEffectSample["kind"]
> = {
  gather_particles: "sprite",
  smoke_mist: "sprite",
  energy_ring: "sprite",
  slash_light: "sprite",
  flame_flicker: "sprite",
  wave_band: "sprite",
  wave_distort: "wave_distort_slice",
  speed_lines: "speed_line",
  drift_fall: "sprite",
  path_particles: "sprite",
};

const effectParams: Record<
  VNIDeterministicEffectType,
  V5GAnimationConfig["params"]
> = {
  gather_particles: {
    count: 12,
    size: 42,
    sourceOpacity: 0,
    spawnRadius: 360,
    spawnRatio: 0.2,
    targetX: 80,
    targetY: 40,
    travelMode: 1,
    curve: 160,
    spiralTurns: 0.75,
    staggerRatio: 0.28,
    trailCount: 3,
    trailSpacing: 0.04,
    trailFade: 0.55,
    vanishMode: 1,
    vanishRatio: 0.18,
    flashScale: 1.6,
    flashIntensity: 1.35,
  },
  smoke_mist: {
    count: 14,
    size: 96,
    sourceOpacity: 0,
    spawnRadius: 80,
    spread: 320,
    windX: 80,
    windY: 40,
    swirl: 120,
    startAlpha: 0.62,
    fadePower: 1.35,
    grow: 2.1,
    sizeRandom: 0.55,
    rotationSpeed: 0.6,
  },
  energy_ring: {
    ringCount: 3,
    startScale: 0.25,
    endScale: 2.4,
    sourceOpacity: 0,
    alpha: 1,
    stagger: 0.28,
    rotation: 60,
    pulse: 0.08,
    vanishMode: 1,
    additive: true,
  },
  slash_light: {
    mode: 1,
    angle: -25,
    travel: 180,
    lengthScale: 2.4,
    widthScale: 0.55,
    sourceOpacity: 0,
    flashAlpha: 1,
    startScale: 0.18,
    fadeRatio: 0.45,
    curve: 90,
    additive: true,
  },
  flame_flicker: {
    count: 16,
    emitterWidth: 180,
    height: 420,
    direction: 270,
    spreadAngle: 22,
    vanishSpread: 120,
    lengthRandom: 0.35,
    size: 96,
    sway: 54,
    turbulence: 80,
    grow: 1.65,
    sourceOpacity: 0,
    alpha: 0.9,
    flicker: 0.35,
    cycles: 1,
    additive: true,
  },
  wave_band: {
    mode: 0,
    count: 18,
    length: 720,
    amplitude: 70,
    frequency: 2.5,
    speed: 1,
    direction: 0,
    size: 48,
    alpha: 1,
    trailFade: 0.75,
    keepOriginal: false,
    rotateToWave: true,
  },
  wave_distort: {
    rows: 12,
    amplitude: 24,
    frequency: 2,
    cycles: 1,
    speed: 1,
    phaseOffset: 1,
    verticalBob: 0,
    alpha: 1,
    edgeFeather: 0,
    keepOriginal: false,
  },
  speed_lines: {
    mode: 0,
    count: 18,
    radius: 520,
    length: 120,
    speed: 1.4,
    direction: 0,
    spreadAngle: 360,
    lineWidth: 3,
    alpha: 0.75,
    keepOriginal: false,
    fadeOut: true,
  },
  drift_fall: {
    count: 16,
    areaWidth: 900,
    areaHeight: 1600,
    cycles: 1,
    fallSpeed: 260,
    wind: 45,
    swayAmplitude: 42,
    swayFrequency: 1,
    size: 48,
    sizeRandom: 0.45,
    rotationSpeed: 1,
    alpha: 1,
    keepOriginal: false,
    fadeEdges: true,
  },
  path_particles: {
    pathMode: 1,
    count: 12,
    size: 42,
    endX: 360,
    endY: 80,
    curve: 160,
    amplitude: 70,
    frequency: 2.5,
    radiusStart: 240,
    radiusEnd: 60,
    turns: 1.5,
    speed: 1,
    stagger: 1,
    oneShotStagger: 0.25,
    trailCount: 3,
    trailSpacing: 0.035,
    trailFade: 0.55,
    alpha: 1,
    keepOriginal: false,
    rotateToPath: true,
    fadeEnds: true,
    loop: true,
  },
};

function animation(
  type: VNIDeterministicEffectType,
  params: V5GAnimationConfig["params"] = effectParams[type],
): V5GAnimationConfig {
  return {
    id: `anim-${type}`,
    type,
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 13,
    params,
  };
}

function layer(
  animations: V5GAnimationConfig[],
  overrides: Partial<V5GLayerConfig> = {},
): V5GLayerConfig {
  return {
    id: "layer",
    name: "Layer",
    type: "image",
    assetId: "asset",
    parentId: null,
    groupId: "group_default",
    visible: true,
    locked: false,
    transform,
    opacity: 1,
    blendMode: "screen",
    animations,
    keyframes: [],
    ...overrides,
  };
}

function sequenceLayer(animations: V5GAnimationConfig[]): V5GLayerConfig {
  return layer(animations, {
    type: "sequence",
    assetId: null,
    sequence: {
      frameAssetIds: ["frame-a", "frame-b"],
      cycleDuration: 0.2,
      loop: true,
    },
  });
}

function samplesFor(
  type: VNIDeterministicEffectType,
  params: V5GAnimationConfig["params"] = effectParams[type],
  time = 0.5,
): VNIDeterministicEffectSample[] {
  return sampleDeterministicEffectSpritesForLayer(
    layer([animation(type, params)]),
    sampledLayer,
    textureSize,
    time,
  );
}

describe("effect-sampler", () => {
  it("samples every deterministic effect type with stable output", () => {
    for (const type of effectTypes) {
      const first = samplesFor(type);
      const second = samplesFor(type);

      expect(first.length, type).toBeGreaterThan(0);
      expect(first).toEqual(second);
      expect(new Set(first.map((sample) => sample.kind))).toEqual(
        new Set([expectedKindByType[type]]),
      );
      expect(first.every((sample) => sample.layerId === "layer")).toBe(true);
      expect(
        first.every((sample) => sample.animationId === `anim-${type}`),
      ).toBe(true);
    }
  });

  it("keeps deterministic effects active at exact start and end boundaries", () => {
    const effect = animation("smoke_mist");
    const image = layer([effect]);
    const sequence = sequenceLayer([effect]);

    expect(getDeterministicEffectProgress(effect, -0.01)).toBeNull();
    expect(getDeterministicEffectProgress(effect, 0)).toBe(0);
    expect(getDeterministicEffectProgress(effect, 1)).toBe(1);
    expect(getDeterministicEffectProgress(effect, 1.01)).toBeNull();
    expect(hasActiveDeterministicEffectAnimation(image, 0)).toBe(true);
    expect(hasActiveDeterministicEffectAnimation(sequence, 1)).toBe(true);
    expect(hasActiveDeterministicEffectAnimation(sequence, 1.01)).toBe(false);
  });

  it("rejects unsupported hosts and inactive source input", () => {
    const effect = animation("energy_ring");
    const textLayer = layer([effect], { type: "text", assetId: null });

    expect(hasActiveDeterministicEffectAnimation(textLayer, 0.5)).toBe(false);
    expect(
      sampleDeterministicEffectSpritesForLayer(
        layer([effect], { visible: false }),
        sampledLayer,
        textureSize,
        0.5,
      ),
    ).toEqual([]);
    expect(
      sampleDeterministicEffectSpritesForLayer(
        layer([effect]),
        { ...sampledLayer, baseOpacity: 0 },
        textureSize,
        0.5,
      ),
    ).toEqual([]);
    expect(
      sampleDeterministicEffectSpritesForLayer(
        layer([{ ...effect, enabled: false }]),
        sampledLayer,
        textureSize,
        0.5,
      ),
    ).toEqual([]);
  });

  it("covers motion variants without changing public sample shapes", () => {
    const variants: Array<{
      type: VNIDeterministicEffectType;
      params: V5GAnimationConfig["params"];
      time: number;
    }> = [
      {
        type: "gather_particles",
        params: {
          ...effectParams.gather_particles,
          travelMode: 0,
          vanishMode: 0,
        },
        time: 0.35,
      },
      {
        type: "gather_particles",
        params: {
          ...effectParams.gather_particles,
          travelMode: 2,
          vanishMode: 2,
        },
        time: 0.85,
      },
      {
        type: "energy_ring",
        params: { ...effectParams.energy_ring, vanishMode: 0, additive: false },
        time: 0.35,
      },
      {
        type: "energy_ring",
        params: { ...effectParams.energy_ring, vanishMode: 2 },
        time: 0.55,
      },
      {
        type: "slash_light",
        params: { ...effectParams.slash_light, mode: 0, additive: false },
        time: 0.35,
      },
      {
        type: "slash_light",
        params: { ...effectParams.slash_light, mode: 2 },
        time: 0.45,
      },
      {
        type: "wave_band",
        params: { ...effectParams.wave_band, mode: 1, rotateToWave: false },
        time: 0.55,
      },
      {
        type: "wave_band",
        params: { ...effectParams.wave_band, mode: 2 },
        time: 0.75,
      },
      {
        type: "speed_lines",
        params: { ...effectParams.speed_lines, mode: 1, fadeOut: false },
        time: 0.2,
      },
      {
        type: "speed_lines",
        params: { ...effectParams.speed_lines, mode: 2 },
        time: 0.65,
      },
      {
        type: "path_particles",
        params: { ...effectParams.path_particles, pathMode: 0 },
        time: 0.4,
      },
      {
        type: "path_particles",
        params: { ...effectParams.path_particles, pathMode: 2 },
        time: 0.4,
      },
      {
        type: "path_particles",
        params: { ...effectParams.path_particles, pathMode: 3 },
        time: 0.4,
      },
      {
        type: "path_particles",
        params: { ...effectParams.path_particles, pathMode: 4 },
        time: 0.4,
      },
      {
        type: "path_particles",
        params: {
          ...effectParams.path_particles,
          loop: false,
          rotateToPath: false,
          fadeEnds: false,
        },
        time: 0.8,
      },
      {
        type: "drift_fall",
        params: { ...effectParams.drift_fall, fadeEdges: false },
        time: 0.6,
      },
    ];

    for (const variant of variants) {
      const samples = samplesFor(variant.type, variant.params, variant.time);
      expect(samples.length, variant.type).toBeGreaterThan(0);
      expect(new Set(samples.map((sample) => sample.kind))).toEqual(
        new Set([expectedKindByType[variant.type]]),
      );
    }
  });

  it("supports the three explicit legacy speed fields", () => {
    const flameLegacy: V5GAnimationConfig["params"] = {
      ...effectParams.flame_flicker,
      speed: 2,
    };
    delete flameLegacy.cycles;
    const waveLegacy: V5GAnimationConfig["params"] = {
      ...effectParams.wave_distort,
      speed: -2,
    };
    delete waveLegacy.cycles;
    const driftLegacy: V5GAnimationConfig["params"] = {
      ...effectParams.drift_fall,
      fallSpeed: 400,
    };
    delete driftLegacy.cycles;

    expect(
      samplesFor("flame_flicker", flameLegacy, 0.45).length,
    ).toBeGreaterThan(0);
    expect(samplesFor("wave_distort", waveLegacy, 0.45).length).toBeGreaterThan(
      0,
    );
    expect(samplesFor("drift_fall", driftLegacy, 0.45).length).toBeGreaterThan(
      0,
    );
  });

  it("caps trail sprite counts and keeps sequence layers texture-backed", () => {
    const capped = samplesFor(
      "gather_particles",
      {
        ...effectParams.gather_particles,
        count: 220,
        trailCount: 10,
        staggerRatio: 0,
      },
      0.5,
    );
    const sequenceSamples = sampleDeterministicEffectSpritesForLayer(
      sequenceLayer([animation("wave_distort")]),
      sampledLayer,
      { width: 60, height: 30 },
      0.5,
    );

    expect(capped.length).toBeLessThanOrEqual(360);
    expect(sequenceSamples.length).toBeGreaterThan(0);
    expect(sequenceSamples[0].type).toBe("wave_distort");
  });

  it("fails explicitly for missing or malformed params", () => {
    expect(() =>
      samplesFor("gather_particles", {
        ...effectParams.gather_particles,
        count: "bad",
      }),
    ).toThrow('requires numeric param "count"');
    expect(() =>
      samplesFor("flame_flicker", {
        ...effectParams.flame_flicker,
        speed: "fast",
      }),
    ).toThrow('param "speed" must be a finite number');
    expect(() =>
      samplesFor("energy_ring", {
        ...effectParams.energy_ring,
        additive: "yes",
      }),
    ).toThrow('param "additive" must be a boolean');
  });
});
