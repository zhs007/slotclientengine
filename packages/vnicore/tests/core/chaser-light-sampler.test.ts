import { describe, expect, it } from "vitest";
import {
  hasActiveChaserLightAnimation,
  sampleChaserLightSpritesForLayer,
} from "../../src/core/chaser-light-sampler";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GTransformConfig,
} from "../../src/core/types";

const transform: V5GTransformConfig = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

function chaserLight(
  trajectory: number,
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: `chaser-${trajectory}`,
    type: "chaser_light",
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 1,
    params: {
      totalCount: 8,
      spacing: 80,
      lightDuration: 0.08,
      interval: 0.04,
      trajectory,
      radius: 120,
      centerX: 0,
      centerY: 0,
      endX: 240,
      endY: 0,
      curve: 120,
      lightSize: 40,
      dimAlpha: 0.12,
      keepOriginal: true,
    },
    ...overrides,
  };
}

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

describe("chaser-light-sampler", () => {
  it("samples circular, linear, and curved chaser trajectories", () => {
    const samples = [0, 1, 2].map((trajectory) =>
      sampleChaserLightSpritesForLayer(
        layer(chaserLight(trajectory)),
        {
          layerId: "layer",
          transform,
          baseOpacity: 1,
          blendMode: "add",
        },
        { width: 100, height: 100 },
        0.5,
      ),
    );

    expect(samples.map((items) => items.length)).toEqual([8, 8, 8]);
    expect(samples[0][0]).toMatchObject({ type: "chaser_light" });
    expect(samples[1][4].y).not.toBe(samples[2][4].y);
    expect(samples.flat().some((sample) => sample.isLit)).toBe(true);
    expect(samples.flat().every((sample) => sample.alpha > 0)).toBe(true);
  });

  it("reports active image chasers but ignores text layers", () => {
    const imageLayer = layer(chaserLight(0));
    const textLayer: V5GLayerConfig = {
      ...imageLayer,
      type: "text",
      assetId: null,
    };

    expect(hasActiveChaserLightAnimation(imageLayer, 0.2)).toBe(true);
    expect(hasActiveChaserLightAnimation(imageLayer, 1)).toBe(false);
    expect(hasActiveChaserLightAnimation(textLayer, 0.2)).toBe(false);
  });
});
