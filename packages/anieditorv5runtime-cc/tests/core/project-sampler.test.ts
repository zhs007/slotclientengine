import { describe, expect, it } from "vitest";
import threeReelMultipay01Data from "../fixtures/3reel_multipay_01.json";
import {
  sampleLayerAtTime,
  sampleProjectAtTime,
} from "../../src/core/project-sampler";
import { assertV5GProject } from "../../src/core/validation";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GProjectConfig,
} from "../../src/core/types";

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
    groupId: "group_default",
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
  it("hides animated layers before and after animation coverage", () => {
    expect(sampleLayerAtTime(layer(), 0.5).opacity).toBe(0);
    expect(sampleLayerAtTime(layer(), 0.5).visible).toBe(false);
    const after = sampleLayerAtTime(layer(), 2.01);
    expect(after.opacity).toBe(0);
    expect(after.visible).toBe(false);
  });

  it("uses animation start and end boundaries", () => {
    expect(sampleLayerAtTime(layer(), 1).visible).toBe(false);
    const atEnd = sampleLayerAtTime(layer(), 2);
    expect(atEnd.opacity).toBe(1);
    expect(atEnd.visible).toBe(true);
  });

  it("holds opacity between a completed entry fade and a pending exit fade", () => {
    const sampled = layer({}, [
      {
        id: "fade-in",
        type: "fade",
        startTime: 1.3,
        duration: 0.3,
        enabled: true,
        seed: 1,
        params: { fromOpacity: 0, toOpacity: 1, easing: "linear" },
      },
      {
        id: "fade-out",
        type: "fade",
        startTime: 4.7,
        duration: 0.3,
        enabled: true,
        seed: 2,
        params: { fromOpacity: 1, toOpacity: 0, easing: "linear" },
      },
    ]);

    const before = sampleLayerAtTime(sampled, 1.29);
    const duringFadeIn = sampleLayerAtTime(sampled, 1.5);
    const held = sampleLayerAtTime(sampled, 2.5);
    const duringFadeOut = sampleLayerAtTime(sampled, 4.85);
    const after = sampleLayerAtTime(sampled, 5.1);

    expect(before.visible).toBe(false);
    expect(duringFadeIn.opacity).toBeCloseTo(0.6667, 4);
    expect(duringFadeIn.visible).toBe(true);
    expect(held.opacity).toBe(1);
    expect(held.visible).toBe(true);
    expect(duringFadeOut.opacity).toBeCloseTo(0.5, 4);
    expect(duringFadeOut.visible).toBe(true);
    expect(after.visible).toBe(false);
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

  it("keeps source image display controlled by image opacity during particle frames", () => {
    const sampled = sampleLayerAtTime(
      layer({}, [
        {
          id: "particles",
          type: "particles",
          startTime: 0,
          duration: 1,
          enabled: true,
          seed: 1,
          params: {
            count: 2,
            spread: 10,
            speed: 10,
            size: 8,
            gravity: 0,
          },
        },
      ]),
      0.5,
    );

    expect(sampled.visible).toBe(true);
    expect(sampled.renderImageDisplay).toBe(true);
    expect(sampled.baseOpacity).toBe(1);
    expect(sampled.hasActiveParticleAnimation).toBe(true);
  });

  it("hides particle_combo source image by sourceOpacity while particles remain active", () => {
    const sampled = sampleLayerAtTime(
      layer({}, [
        {
          id: "combo",
          type: "particle_combo",
          startTime: 0,
          duration: 1,
          enabled: true,
          seed: 2,
          params: {
            count: 4,
            size: 12,
            sourceOpacity: 0,
            spawnMode: 1,
            spawnRadius: 30,
            spawnRatio: 0.2,
            targetX: 10,
            targetY: 20,
            travelMode: 0,
            curve: 0,
            orbitRadius: 10,
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
        },
      ]),
      0.5,
    );

    expect(sampled.baseOpacity).toBe(1);
    expect(sampled.opacity).toBe(0);
    expect(sampled.visible).toBe(false);
    expect(sampled.renderImageDisplay).toBe(false);
    expect(sampled.hasActiveParticleAnimation).toBe(true);
  });

  it("keeps the 3reel multipay wheel light visible across its glow window", () => {
    const project = assertV5GProject(threeReelMultipay01Data);
    const lightLayerId = "layer_image_mqp31v5g_15";
    const before = sampleProjectAtTime(project, 1.29).layers.find(
      (sampled) => sampled.layerId === lightLayerId,
    );
    const fadeIn = sampleProjectAtTime(project, 1.5).layers.find(
      (sampled) => sampled.layerId === lightLayerId,
    );
    const sustained = sampleProjectAtTime(project, 2.5).layers.find(
      (sampled) => sampled.layerId === lightLayerId,
    );
    const fadeOut = sampleProjectAtTime(project, 4.85).layers.find(
      (sampled) => sampled.layerId === lightLayerId,
    );
    const after = sampleProjectAtTime(project, 5.1).layers.find(
      (sampled) => sampled.layerId === lightLayerId,
    );

    expect(before?.visible).toBe(false);
    expect(fadeIn?.opacity).toBeCloseTo(0.6667, 4);
    expect(fadeIn?.visible).toBe(true);
    expect(sustained?.opacity).toBe(1);
    expect(sustained?.visible).toBe(true);
    expect(fadeOut?.opacity).toBeCloseTo(0.5, 4);
    expect(fadeOut?.visible).toBe(true);
    expect(after?.visible).toBe(false);
  });

  it("keeps the 3reel multipay wheel light visible when glow is removed", () => {
    const project = assertV5GProject(
      JSON.parse(JSON.stringify(threeReelMultipay01Data)),
    );
    const lightLayerId = "layer_image_mqp31v5g_15";
    const lightLayer = project.layers.find(
      (layerConfig) => layerConfig.id === lightLayerId,
    );
    expect(lightLayer).toBeDefined();
    lightLayer!.animations = lightLayer!.animations.filter(
      (animation) => animation.type !== "glow",
    );

    const sustained = sampleProjectAtTime(project, 2.5).layers.find(
      (sampled) => sampled.layerId === lightLayerId,
    );

    expect(sustained?.opacity).toBe(1);
    expect(sustained?.visible).toBe(true);
  });

  it("suppresses near-zero scale entry on the first frame", () => {
    const sampled = sampleLayerAtTime(
      layer({}, [
        {
          id: "scale",
          type: "scale_in",
          startTime: 0,
          duration: 1,
          enabled: true,
          seed: 1,
          params: { fromScale: 0, toScale: 1, fadeIn: false },
        },
      ]),
      0,
    );

    expect(sampled.opacity).toBe(0);
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
      layerGroups: [
        {
          id: "group_default",
          name: "Default",
          visible: true,
          collapsed: false,
          order: 0,
        },
      ],
      layers: [layer()],
      particles: [],
    };

    expect(sampleProjectAtTime(project, 11).time).toBe(10);
    expect(sampleProjectAtTime(project, -1).time).toBe(0);
  });

  it("keeps idle-covered layers visible without changing source image state", () => {
    const sampled = sampleLayerAtTime(
      layer({}, [
        {
          id: "idle",
          type: "idle",
          startTime: 0,
          duration: 1,
          enabled: true,
          seed: 1,
          params: {},
        },
      ]),
      0.5,
    );

    expect(sampled.opacity).toBe(1);
    expect(sampled.visible).toBe(true);
    expect(sampled.renderImageDisplay).toBe(true);
  });
});
