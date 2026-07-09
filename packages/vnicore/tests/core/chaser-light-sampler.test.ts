import { describe, expect, it } from "vitest";
import {
  hasActiveChaserLightAnimation,
  sampleChaserLightSpritesForLayer,
} from "../../src/core/chaser-light-sampler";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GBlendMode,
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

function sample(
  animation: V5GAnimationConfig,
  time: number,
  blendMode: V5GBlendMode = "normal",
) {
  return sampleChaserLightSpritesForLayer(
    layer(animation),
    {
      layerId: "layer",
      transform,
      baseOpacity: 1,
      blendMode,
    },
    { width: 100, height: 100 },
    time,
  );
}

function samplePositions(
  samples: ReturnType<typeof sampleChaserLightSpritesForLayer>,
) {
  return samples.map((item) => ({
    x: item.x,
    y: item.y,
    rotation: item.rotation,
  }));
}

describe("chaser-light-sampler", () => {
  it("samples circular, linear, and curved chaser trajectories", () => {
    const samples = [0, 1, 2].map((trajectory) =>
      sample(chaserLight(trajectory), 0.5, "add"),
    );

    expect(samples.map((items) => items.length)).toEqual([8, 8, 8]);
    expect(samples[0][0]).toMatchObject({ type: "chaser_light" });
    expect(samples[1][4].y).not.toBe(samples[2][4].y);
    expect(samples.flat().some((sample) => sample.isLit)).toBe(true);
    expect(samples.flat().every((sample) => sample.alpha > 0)).toBe(true);
  });

  it("keeps circular light positions fixed and matches the editor arc formula", () => {
    const animation = chaserLight(0);
    const startSamples = sample(animation, 0);
    const laterSamples = sample(animation, 0.12);

    expect(samplePositions(laterSamples)).toEqual(
      samplePositions(startSamples),
    );
    expect(startSamples[0]).toMatchObject({
      x: 0,
      y: -120,
      rotation: 0,
      alpha: 1,
      blendMode: "add",
      isLit: true,
    });
    expect(startSamples[0].scale).toBeCloseTo(0.4504);

    const secondAngle = 80 / 120 - Math.PI / 2;
    expect(startSamples[1].x).toBeCloseTo(
      Number((Math.cos(secondAngle) * 120).toFixed(4)),
    );
    expect(startSamples[1].y).toBeCloseTo(
      Number((Math.sin(secondAngle) * 120).toFixed(4)),
    );
    expect(startSamples[1].rotation).toBeCloseTo(
      Number((secondAngle + Math.PI / 2).toFixed(4)),
    );
    expect(startSamples[1]).toMatchObject({
      alpha: 0.12,
      blendMode: "normal",
      isLit: false,
    });
    expect(startSamples[1].scale).toBe(0.4);
  });

  it("offsets lit windows by lightDuration plus interval", () => {
    const animation = chaserLight(0);
    const beforeSecondLight = sample(animation, 0.04).filter(
      (item) => item.isLit,
    );
    const atSecondLight = sample(animation, 0.12).filter((item) => item.isLit);

    expect(beforeSecondLight).toHaveLength(1);
    expect(beforeSecondLight[0].x).toBe(0);
    expect(beforeSecondLight[0].y).toBe(-120);

    expect(atSecondLight).toHaveLength(1);
    expect(atSecondLight[0].x).toBe(sample(animation, 0)[1].x);
    expect(atSecondLight[0].y).toBe(sample(animation, 0)[1].y);
  });

  it("keeps linear and curved trajectory points fixed across time", () => {
    for (const trajectory of [1, 2]) {
      const animation = chaserLight(trajectory);
      expect(samplePositions(sample(animation, 0.04))).toEqual(
        samplePositions(sample(animation, 0.64)),
      );
    }
  });

  it("omits fully dimmed dark sprites without changing lit timing", () => {
    const animation = chaserLight(0, {
      params: {
        ...chaserLight(0).params,
        dimAlpha: 0,
      },
    });
    const firstWindow = sample(animation, 0);
    const secondWindow = sample(animation, 0.12);

    expect(firstWindow).toHaveLength(1);
    expect(firstWindow[0]).toMatchObject({
      x: 0,
      y: -120,
      isLit: true,
    });
    expect(secondWindow).toHaveLength(1);
    expect(secondWindow[0].x).toBe(sample(chaserLight(0), 0)[1].x);
    expect(secondWindow[0].y).toBe(sample(chaserLight(0), 0)[1].y);
    expect(secondWindow[0].isLit).toBe(true);
  });

  it("reports active image chasers but ignores text layers", () => {
    const imageLayer = layer(chaserLight(0));
    const textLayer: V5GLayerConfig = {
      ...imageLayer,
      type: "text",
      assetId: null,
    };

    expect(hasActiveChaserLightAnimation(imageLayer, 0.2)).toBe(true);
    expect(hasActiveChaserLightAnimation(imageLayer, 1)).toBe(true);
    expect(hasActiveChaserLightAnimation(imageLayer, 1.01)).toBe(false);
    expect(hasActiveChaserLightAnimation(textLayer, 0.2)).toBe(false);
  });
});
