import { describe, expect, it } from "vitest";
import {
  sampleLayerAtTime,
  sampleProjectAtTime,
} from "../../src/runtime/project-sampler";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GProjectConfig,
} from "../../src/v5g/types";

const transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

function layer(
  overrides: Partial<V5GLayerConfig> = {},
  animations: V5GAnimationConfig[] = [
    {
      id: "fade",
      type: "fade",
      startTime: 1,
      duration: 1,
      enabled: true,
      seed: 1,
      params: { fromOpacity: 0, toOpacity: 1, easing: "linear" },
    },
  ],
): V5GLayerConfig {
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
    blendMode: "normal",
    animations,
    keyframes: [],
    ...overrides,
  };
}

describe("project-sampler", () => {
  it("hides animated layers before animation coverage", () => {
    expect(sampleLayerAtTime(layer(), 0.5).opacity).toBe(0);
    expect(sampleLayerAtTime(layer(), 0.5).visible).toBe(false);
  });

  it("shows layers at animation start and end boundaries", () => {
    expect(sampleLayerAtTime(layer(), 1).visible).toBe(false);
    const atEnd = sampleLayerAtTime(layer(), 2);
    expect(atEnd.opacity).toBe(1);
    expect(atEnd.visible).toBe(true);
  });

  it("hides animated layers after all animation coverage", () => {
    const sampled = sampleLayerAtTime(layer(), 2.01);
    expect(sampled.opacity).toBe(0);
    expect(sampled.visible).toBe(false);
  });

  it("keeps layers with no enabled animations visible by base state", () => {
    const sampled = sampleLayerAtTime(layer({}, []), 8);
    expect(sampled.opacity).toBe(1);
    expect(sampled.visible).toBe(true);
  });

  it("keeps invisible layers hidden", () => {
    const sampled = sampleLayerAtTime(layer({ visible: false }, []), 0);
    expect(sampled.opacity).toBe(1);
    expect(sampled.visible).toBe(false);
  });

  it("clamps project time to stage duration", () => {
    const project: V5GProjectConfig = {
      schemaVersion: "V5G_0.0014",
      editor: { name: "victory_editor_v5_g", version: "V5G_0.0014" },
      engineTarget: { name: "cocos_creator", version: "3.8.6" },
      name: "sample",
      stage: {
        width: 1600,
        height: 1600,
        coordinate: "center",
        duration: 10,
        backgroundColor: "#101827",
      },
      assets: [],
      layers: [layer()],
      particles: [],
    };

    expect(sampleProjectAtTime(project, 11).time).toBe(10);
    expect(sampleProjectAtTime(project, -1).time).toBe(0);
  });
});
