import { describe, expect, it } from "vitest";
import export2Runtime50Data from "../../src/assets/export2/runtime_50/project.json";
import {
  sampleLayerAtTime,
  sampleProjectAtTime,
} from "../../src/runtime/project-sampler";
import { assertV5GProject } from "../../src/runtime/validation";
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
  it("keeps export2 runtime_50 blank at the exact start frame", () => {
    const project = assertV5GProject(export2Runtime50Data);
    const sampled = sampleProjectAtTime(project, 0);

    expect(
      sampled.layers.filter((layer) => layer.renderImageDisplay),
    ).toHaveLength(0);
  });

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

  it("hides layers before a delayed opacity entry even when other animations are active", () => {
    const sampled = sampleLayerAtTime(
      layer({}, [
        {
          id: "pulse",
          type: "pulse",
          startTime: 0,
          duration: 4,
          enabled: true,
          seed: 1,
          params: { scale: 1.1, cycles: 2, easing: "linear" },
        },
        {
          id: "fade-in",
          type: "fade",
          startTime: 0.1,
          duration: 0.1,
          enabled: true,
          seed: 1,
          params: { fromOpacity: 0, toOpacity: 1, easing: "linear" },
        },
      ]),
      0.05,
    );

    expect(sampled.opacity).toBe(0);
    expect(sampled.visible).toBe(false);
    expect(sampled.renderImageDisplay).toBe(false);
  });

  it("starts delayed opacity entry at its own start frame", () => {
    const sampled = sampleLayerAtTime(
      layer({}, [
        {
          id: "pulse",
          type: "pulse",
          startTime: 0,
          duration: 4,
          enabled: true,
          seed: 1,
          params: { scale: 1.1, cycles: 2, easing: "linear" },
        },
        {
          id: "slide-in",
          type: "slide_in",
          startTime: 0.1,
          duration: 0.3,
          enabled: true,
          seed: 1,
          params: {
            fromX: 0,
            fromY: 0,
            toX: 0,
            toY: -500,
            fadeIn: true,
            easing: "backOut",
          },
        },
      ]),
      0.1,
    );

    expect(sampled.opacity).toBe(0);
    expect(sampled.visible).toBe(false);
  });

  it("hides near-zero scale entry layers on the start frame", () => {
    const sampled = sampleLayerAtTime(
      layer({}, [
        {
          id: "scale-entry",
          type: "scale_up",
          startTime: 0,
          duration: 0.3,
          enabled: true,
          seed: 1,
          params: {
            fromScaleX: 0.01,
            fromScaleY: 0.01,
            toScaleX: 1.2,
            toScaleY: 1.2,
            easing: "easeOutQuad",
          },
        },
        {
          id: "rotate",
          type: "rotate",
          startTime: 0,
          duration: 4,
          enabled: true,
          seed: 1,
          params: { fromRotation: 0, toRotation: 360, easing: "linear" },
        },
      ]),
      0,
    );
    const afterStart = sampleLayerAtTime(
      layer({}, [
        {
          id: "scale-entry",
          type: "scale_up",
          startTime: 0,
          duration: 0.3,
          enabled: true,
          seed: 1,
          params: {
            fromScaleX: 0.01,
            fromScaleY: 0.01,
            toScaleX: 1.2,
            toScaleY: 1.2,
            easing: "easeOutQuad",
          },
        },
      ]),
      0.01,
    );

    expect(sampled.opacity).toBe(0);
    expect(sampled.visible).toBe(false);
    expect(sampled.renderImageDisplay).toBe(false);
    expect(afterStart.opacity).toBe(1);
    expect(afterStart.visible).toBe(true);
  });

  it("marks active particle layers to hide the image display only", () => {
    const particleLayer = layer({}, [
      {
        id: "particles",
        type: "particles",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          count: 4,
          spread: 20,
          speed: 30,
          size: 16,
          gravity: 10,
        },
      },
    ]);

    const active = sampleLayerAtTime(particleLayer, 0.5);
    expect(active.opacity).toBe(1);
    expect(active.visible).toBe(true);
    expect(active.hasActiveParticleAnimation).toBe(true);
    expect(active.renderImageDisplay).toBe(false);

    const atEnd = sampleLayerAtTime(particleLayer, 1);
    expect(atEnd.hasActiveParticleAnimation).toBe(false);
    expect(atEnd.renderImageDisplay).toBe(true);
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
