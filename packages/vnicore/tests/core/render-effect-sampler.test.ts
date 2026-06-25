import { describe, expect, it } from "vitest";
import {
  getRenderEffectProgress,
  hasActiveRenderEffectAnimation,
  isRenderEffectAnimationType,
  sampleRenderEffectSpritesForLayer,
} from "../../src/core/render-effect-sampler";
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

function imageLayer(animation: V5GAnimationConfig): V5GLayerConfig {
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
    blendMode: "normal",
    animations: [animation],
    keyframes: [],
  };
}

function sampleState() {
  return {
    layerId: "layer",
    transform,
    baseOpacity: 1,
    blendMode: "normal" as const,
  };
}

describe("render-effect-sampler", () => {
  it("identifies render effect animations and suppresses exact start frames", () => {
    const glow = glowAnimation();

    expect(isRenderEffectAnimationType("glow")).toBe(true);
    expect(isRenderEffectAnimationType("shatter")).toBe(true);
    expect(isRenderEffectAnimationType("safe_glow")).toBe(false);
    expect(isRenderEffectAnimationType("particle_combo")).toBe(false);
    expect(getRenderEffectProgress(glow, -0.1)).toBeNull();
    expect(getRenderEffectProgress(glow, 0)).toBeNull();
    expect(getRenderEffectProgress(glow, 0.5)).toBe(0.5);
    expect(getRenderEffectProgress(glow, 1)).toBeNull();
    expect(hasActiveRenderEffectAnimation(imageLayer(glow), 0)).toBe(false);
    expect(hasActiveRenderEffectAnimation(imageLayer(glow), 0.5)).toBe(true);
  });

  it("samples glow sprites with deterministic blend and alpha", () => {
    const layer = imageLayer(
      glowAnimation({
        intensity: 1,
        spread: 0.2,
        minAlpha: 0.2,
        maxAlpha: 0.8,
        pulses: 0,
        blendMode: 1,
        keepOriginal: false,
      }),
    );

    const sprites = sampleRenderEffectSpritesForLayer(
      layer,
      sampleState(),
      { width: 100, height: 100 },
      0.5,
    );

    expect(sprites).toHaveLength(2);
    expect(sprites.every((sprite) => sprite.type === "glow")).toBe(true);
    expect(sprites.map((sprite) => sprite.blendMode)).toEqual([
      "screen",
      "screen",
    ]);
    expect(sprites[0].scaleX).toBeGreaterThan(sprites[1].scaleX);
    expect(sprites[0].alpha).toBeGreaterThan(sprites[1].alpha);
  });

  it("samples shatter pieces deterministically and honors fadeOut", () => {
    const layer = imageLayer(shatterAnimation({ fadeOut: false }));
    const first = sampleRenderEffectSpritesForLayer(
      layer,
      sampleState(),
      { width: 128, height: 96 },
      0.5,
    );
    const second = sampleRenderEffectSpritesForLayer(
      layer,
      sampleState(),
      { width: 128, height: 96 },
      0.5,
    );

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first[0]).toMatchObject({
      type: "shatter",
      layerId: "layer",
      animationId: "shatter",
      blendMode: "normal",
    });
  });

  it("returns no sprites when effect input cannot render", () => {
    const layer = imageLayer(glowAnimation({ intensity: 0 }));

    expect(
      sampleRenderEffectSpritesForLayer(
        { ...layer, visible: false },
        sampleState(),
        { width: 100, height: 100 },
        0.5,
      ),
    ).toEqual([]);
    expect(
      sampleRenderEffectSpritesForLayer(
        layer,
        { ...sampleState(), baseOpacity: 0 },
        { width: 100, height: 100 },
        0.5,
      ),
    ).toEqual([]);
    expect(
      sampleRenderEffectSpritesForLayer(
        layer,
        sampleState(),
        { width: 100, height: 100 },
        0.5,
      ),
    ).toEqual([]);
  });

  it("ignores non-image, disabled, and non-effect animations", () => {
    const glow = glowAnimation();
    const textLayer: V5GLayerConfig = {
      ...imageLayer(glow),
      type: "text",
      assetId: null,
    };
    const disabledLayer = imageLayer({ ...glow, enabled: false });
    const fadeLayer = imageLayer({
      id: "fade",
      type: "fade",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 1,
      params: { fromOpacity: 0, toOpacity: 1 },
    });

    expect(hasActiveRenderEffectAnimation(textLayer, 0.5)).toBe(false);
    expect(
      sampleRenderEffectSpritesForLayer(
        disabledLayer,
        sampleState(),
        { width: 100, height: 100 },
        0.5,
      ),
    ).toEqual([]);
    expect(
      sampleRenderEffectSpritesForLayer(
        fadeLayer,
        sampleState(),
        { width: 100, height: 100 },
        0.5,
      ),
    ).toEqual([]);
  });

  it("covers glow blend variants and invalid params", () => {
    const addSprites = sampleRenderEffectSpritesForLayer(
      imageLayer(glowAnimation({ blendMode: 0 })),
      sampleState(),
      { width: 100, height: 100 },
      0.25,
    );
    const lightenSprites = sampleRenderEffectSpritesForLayer(
      imageLayer(glowAnimation({ blendMode: 2 })),
      { ...sampleState(), transform: { ...transform, rotation: 90 } },
      { width: 100, height: 100 },
      0.25,
    );

    expect(addSprites[0].blendMode).toBe("add");
    expect(lightenSprites[0].blendMode).toBe("lighten");
    expect(lightenSprites[0].rotation).toBeCloseTo(Math.PI / 2);
    expect(() =>
      sampleRenderEffectSpritesForLayer(
        imageLayer(glowAnimation({ intensity: "bad" })),
        sampleState(),
        { width: 100, height: 100 },
        0.5,
      ),
    ).toThrow('requires numeric param "intensity"');
    expect(() =>
      sampleRenderEffectSpritesForLayer(
        imageLayer(glowAnimation({ keepOriginal: "bad" })),
        sampleState(),
        { width: 100, height: 100 },
        0.5,
      ),
    ).not.toThrow();
  });

  it("clamps shatter bounds and fades out near the end", () => {
    const oversized = sampleRenderEffectSpritesForLayer(
      imageLayer(
        shatterAnimation({
          count: 999,
          pieceSize: 0,
          force: 99999,
          spreadAngle: 999,
          gravity: -9999,
          spin: 999,
        }),
      ),
      { ...sampleState(), transform: { ...transform, anchorX: 0, anchorY: 1 } },
      { width: 0, height: 0 },
      0.5,
    );
    const faded = sampleRenderEffectSpritesForLayer(
      imageLayer(shatterAnimation({ fadeOut: true })),
      sampleState(),
      { width: 128, height: 96 },
      0.999,
    );

    expect(oversized.length).toBeGreaterThan(0);
    expect(oversized[0].type).toBe("shatter");
    if (oversized[0].type !== "shatter") {
      throw new Error("Expected shatter sample.");
    }
    expect(oversized[0].pieceWidth).toBe(1);
    expect(faded).toEqual([]);
  });
});

function glowAnimation(
  params: Partial<V5GAnimationConfig["params"]> = {},
): V5GAnimationConfig {
  return {
    id: "glow",
    type: "glow",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 1,
    params: {
      intensity: 0.75,
      spread: 0.12,
      minAlpha: 0.15,
      maxAlpha: 0.75,
      pulses: 2,
      blendMode: 0,
      keepOriginal: true,
      ...params,
    },
  };
}

function shatterAnimation(
  params: Partial<V5GAnimationConfig["params"]> = {},
): V5GAnimationConfig {
  return {
    id: "shatter",
    type: "shatter",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 11,
    params: {
      count: 8,
      pieceSize: 32,
      force: 200,
      impactAngle: 90,
      spreadAngle: 120,
      gravity: 500,
      spin: 4,
      sourceOpacity: 0,
      fadeOut: true,
      ...params,
    },
  };
}
