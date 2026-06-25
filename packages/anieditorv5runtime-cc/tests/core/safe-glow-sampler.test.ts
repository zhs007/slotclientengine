import { describe, expect, it } from "vitest";
import {
  getSafeGlowProgress,
  hasActiveSafeGlowAnimation,
  sampleSafeGlowSpritesForLayer,
} from "../../src/core/safe-glow-sampler";
import type { V5GAnimationConfig, V5GLayerConfig } from "../../src/core/types";

const transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 2,
  rotation: 90,
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
    baseOpacity: 0.8,
  };
}

describe("safe-glow-sampler", () => {
  it("samples safe_glow at the exact start frame", () => {
    const glow = safeGlowAnimation({
      spread: 0.2,
      minOpacity: 0.25,
      maxOpacity: 0.75,
      pulses: 2,
    });
    const layer = imageLayer(glow);

    expect(getSafeGlowProgress(glow, -0.01)).toBeNull();
    expect(getSafeGlowProgress(glow, 0)).toBe(0);
    expect(getSafeGlowProgress(glow, 1)).toBeNull();
    expect(hasActiveSafeGlowAnimation(layer, 0)).toBe(true);

    const sprites = sampleSafeGlowSpritesForLayer(layer, sampleState(), 0);

    expect(sprites).toEqual([
      {
        type: "safe_glow",
        layerId: "layer",
        animationId: "safe-glow",
        x: 0,
        y: 0,
        scaleX: 1.2,
        scaleY: 2.4,
        rotation: 1.5708,
        alpha: 0.2,
        blendMode: "normal",
      },
    ]);
  });

  it("uses spread, opacity wave, and fixed normal blend deterministically", () => {
    const layer = imageLayer(
      safeGlowAnimation({
        spread: 0.2,
        minOpacity: 0.2,
        maxOpacity: 0.6,
        pulses: 1,
      }),
    );

    const sprites = sampleSafeGlowSpritesForLayer(layer, sampleState(), 0.25);

    expect(sprites).toHaveLength(1);
    expect(sprites[0]).toMatchObject({
      scaleX: 1.2,
      scaleY: 2.4,
      alpha: 0.32,
      blendMode: "normal",
    });
  });

  it("uses max opacity when pulses is zero", () => {
    const layer = imageLayer(
      safeGlowAnimation({
        spread: 0.1,
        minOpacity: 0.1,
        maxOpacity: 0.5,
        pulses: 0,
      }),
    );

    const sprites = sampleSafeGlowSpritesForLayer(layer, sampleState(), 0.4);

    expect(sprites[0].alpha).toBe(0.4);
  });

  it("returns no sprites for zero spread, tiny alpha, or inactive input", () => {
    expect(
      sampleSafeGlowSpritesForLayer(
        imageLayer(safeGlowAnimation({ spread: 0 })),
        sampleState(),
        0.5,
      ),
    ).toEqual([]);
    expect(
      sampleSafeGlowSpritesForLayer(
        imageLayer(
          safeGlowAnimation({
            minOpacity: 0,
            maxOpacity: 0,
          }),
        ),
        sampleState(),
        0.5,
      ),
    ).toEqual([]);

    const glow = safeGlowAnimation();
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

    expect(hasActiveSafeGlowAnimation(textLayer, 0.5)).toBe(false);
    expect(
      sampleSafeGlowSpritesForLayer(disabledLayer, sampleState(), 0.5),
    ).toEqual([]);
    expect(
      sampleSafeGlowSpritesForLayer(fadeLayer, sampleState(), 0.5),
    ).toEqual([]);
  });

  it("throws for missing or invalid params", () => {
    expect(() =>
      sampleSafeGlowSpritesForLayer(
        imageLayer(safeGlowAnimation({ spread: undefined })),
        sampleState(),
        0.5,
      ),
    ).toThrow('requires numeric param "spread"');
    expect(() =>
      sampleSafeGlowSpritesForLayer(
        imageLayer(safeGlowAnimation({ minOpacity: "0.2" })),
        sampleState(),
        0.5,
      ),
    ).toThrow('requires numeric param "minOpacity"');
  });
});

function safeGlowAnimation(
  params: Partial<V5GAnimationConfig["params"]> = {},
): V5GAnimationConfig {
  const defaults: V5GAnimationConfig["params"] = {
    spread: 0.12,
    minOpacity: 0.12,
    maxOpacity: 0.65,
    pulses: 2,
    keepOriginal: true,
  };
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) delete defaults[key];
    else defaults[key] = value;
  }
  return {
    id: "safe-glow",
    type: "safe_glow",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 1,
    params: defaults,
  };
}
