import { describe, expect, it } from "vitest";
import bigwinData from "../fixtures/export/bigwin.json";
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

const defaultLayerGroup = {
  id: "group_default",
  name: "Default",
  visible: true,
  collapsed: false,
  order: 0,
};

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
  it("does not auto-hide source images just because particles are active", () => {
    const project = assertV5GProject(bigwinData);
    const sampled = sampleProjectAtTime(project, 0);
    const renderedImageLayers = sampled.layers.filter(
      (layer) => layer.renderImageDisplay,
    );
    const renderedParticleSourceLayer = renderedImageLayers.find(
      (layer) => layer.hasActiveParticleAnimation,
    );

    expect(renderedParticleSourceLayer).toBeDefined();
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

  it("uses idle as coverage without changing transform or opacity", () => {
    const idleLayer = layer({}, [
      {
        id: "idle",
        type: "idle",
        startTime: 1,
        duration: 2,
        enabled: true,
        seed: 1,
        params: {},
      },
    ]);

    const before = sampleLayerAtTime(idleLayer, 0.5);
    const active = sampleLayerAtTime(idleLayer, 1.5);

    expect(before.visible).toBe(false);
    expect(active.visible).toBe(true);
    expect(active.opacity).toBe(1);
    expect(active.transform).toEqual(transform);
  });

  it("keeps invisible layers hidden", () => {
    const sampled = sampleLayerAtTime(layer({ visible: false }, []), 0);
    expect(sampled.opacity).toBe(1);
    expect(sampled.visible).toBe(false);
  });

  it("keeps chaser_light active after keepOriginal hides the source image", () => {
    const sampled = sampleLayerAtTime(
      layer({}, [
        {
          id: "chaser",
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
            trajectory: 0,
            radius: 120,
            centerX: 0,
            centerY: 0,
            endX: 240,
            endY: 0,
            curve: 120,
            lightSize: 40,
            dimAlpha: 0.12,
            keepOriginal: false,
          },
        },
      ]),
      0.5,
    );

    expect(sampled.opacity).toBe(0);
    expect(sampled.renderImageDisplay).toBe(false);
    expect(sampled.hasActiveChaserLightAnimation).toBe(true);
    expect(sampled.visible).toBe(true);
  });

  it("keeps active layers visible even when a later opacity entry is pending", () => {
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

    expect(sampled.opacity).toBe(1);
    expect(sampled.visible).toBe(true);
    expect(sampled.renderImageDisplay).toBe(true);
  });

  it("keeps repeated scale and fade cycles visible before later entry cycles", () => {
    const repeatedGlowLayer = layer({ opacity: 0.3 }, [
      {
        id: "scale-1",
        type: "scale_in",
        startTime: 0.55,
        duration: 0.3,
        enabled: true,
        seed: 1,
        params: {
          fromScale: 0.5,
          toScale: 1.5,
          fadeIn: true,
          easing: "easeOutQuad",
        },
      },
      {
        id: "fade-1",
        type: "fade",
        startTime: 0.8,
        duration: 0.3,
        enabled: true,
        seed: 1,
        params: { fromOpacity: 0.3, toOpacity: 0, easing: "linear" },
      },
      {
        id: "scale-2",
        type: "scale_in",
        startTime: 1,
        duration: 0.3,
        enabled: true,
        seed: 1,
        params: {
          fromScale: 0.5,
          toScale: 1,
          fadeIn: true,
          easing: "easeOutQuad",
        },
      },
      {
        id: "fade-2",
        type: "fade",
        startTime: 1.25,
        duration: 0.3,
        enabled: true,
        seed: 1,
        params: { fromOpacity: 0.3, toOpacity: 0, easing: "linear" },
      },
    ]);

    const firstScale = sampleLayerAtTime(repeatedGlowLayer, 0.6);
    const firstFade = sampleLayerAtTime(repeatedGlowLayer, 0.9);
    const secondScale = sampleLayerAtTime(repeatedGlowLayer, 1.1);

    expect(firstScale.opacity).toBeGreaterThan(0);
    expect(firstScale.visible).toBe(true);
    expect(firstScale.renderImageDisplay).toBe(true);
    expect(firstFade.opacity).toBeGreaterThan(0);
    expect(firstFade.visible).toBe(true);
    expect(firstFade.renderImageDisplay).toBe(true);
    expect(secondScale.opacity).toBeGreaterThan(0);
    expect(secondScale.visible).toBe(true);
    expect(secondScale.renderImageDisplay).toBe(true);
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

  it("keeps active non-combo particle layers visible as normal images", () => {
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
    expect(active.renderImageDisplay).toBe(true);

    const atEnd = sampleLayerAtTime(particleLayer, 1);
    expect(atEnd.hasActiveParticleAnimation).toBe(false);
    expect(atEnd.renderImageDisplay).toBe(true);
  });

  it("hides particle_combo source image at sourceOpacity 0 while keeping particles active", () => {
    const comboLayer = layer({}, [
      {
        id: "combo",
        type: "particle_combo",
        startTime: 0,
        duration: 1.6,
        enabled: true,
        seed: 1,
        params: {
          count: 36,
          size: 42,
          sourceOpacity: 0,
          spawnMode: 1,
          spawnRadius: 90,
          spawnRatio: 0.18,
          targetX: 320,
          targetY: 0,
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
      },
    ]);

    const active = sampleLayerAtTime(comboLayer, 0.5);

    expect(active.baseOpacity).toBe(1);
    expect(active.opacity).toBe(0);
    expect(active.visible).toBe(false);
    expect(active.renderImageDisplay).toBe(false);
    expect(active.hasActiveParticleAnimation).toBe(true);
  });

  it("shows particle_combo source image by sourceOpacity while particles remain active", () => {
    const comboLayer = layer({ opacity: 0.8 }, [
      {
        id: "combo",
        type: "particle_combo",
        startTime: 0,
        duration: 1.6,
        enabled: true,
        seed: 1,
        params: {
          count: 36,
          size: 42,
          sourceOpacity: 0.25,
          spawnMode: 1,
          spawnRadius: 90,
          spawnRatio: 0.18,
          targetX: 320,
          targetY: 0,
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
      },
    ]);

    const active = sampleLayerAtTime(comboLayer, 0.5);

    expect(active.baseOpacity).toBe(0.8);
    expect(active.opacity).toBe(0.2);
    expect(active.visible).toBe(true);
    expect(active.renderImageDisplay).toBe(true);
    expect(active.hasActiveParticleAnimation).toBe(true);
  });

  it("hides glow source image while preserving active render effect", () => {
    const glowLayer = layer({}, [
      {
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
          keepOriginal: false,
        },
      },
    ]);

    const atStart = sampleLayerAtTime(glowLayer, 0);
    const active = sampleLayerAtTime(glowLayer, 0.5);

    expect(atStart.hasActiveRenderEffect).toBe(false);
    expect(atStart.renderImageDisplay).toBe(false);
    expect(active.opacity).toBe(0);
    expect(active.visible).toBe(true);
    expect(active.renderImageDisplay).toBe(false);
    expect(active.hasActiveRenderEffect).toBe(true);
  });

  it("hides safe_glow source image while preserving active safe glow", () => {
    const safeGlowLayer = layer({}, [
      {
        id: "safe-glow",
        type: "safe_glow",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          spread: 0.12,
          minOpacity: 0.12,
          maxOpacity: 0.65,
          pulses: 2,
          keepOriginal: false,
        },
      },
    ]);

    const atStart = sampleLayerAtTime(safeGlowLayer, 0);
    const inactiveEnd = sampleLayerAtTime(safeGlowLayer, 1);

    expect(atStart.opacity).toBe(0);
    expect(atStart.visible).toBe(true);
    expect(atStart.renderImageDisplay).toBe(false);
    expect(atStart.hasActiveSafeGlowAnimation).toBe(true);
    expect(atStart.hasActiveRenderEffect).toBe(false);
    expect(inactiveEnd.visible).toBe(false);
    expect(inactiveEnd.renderImageDisplay).toBe(false);
    expect(inactiveEnd.hasActiveSafeGlowAnimation).toBe(false);
  });

  it("hides shatter source image while preserving active render effect", () => {
    const shatterLayer = layer({}, [
      {
        id: "shatter",
        type: "shatter",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          count: 16,
          pieceSize: 32,
          force: 200,
          impactAngle: 90,
          spreadAngle: 120,
          gravity: 500,
          spin: 4,
          sourceOpacity: 0,
          fadeOut: true,
        },
      },
    ]);

    const atStart = sampleLayerAtTime(shatterLayer, 0);
    const active = sampleLayerAtTime(shatterLayer, 0.5);

    expect(atStart.hasActiveRenderEffect).toBe(false);
    expect(active.opacity).toBe(0);
    expect(active.visible).toBe(true);
    expect(active.renderImageDisplay).toBe(false);
    expect(active.hasActiveRenderEffect).toBe(true);
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
      layerGroups: [defaultLayerGroup],
      layers: [layer()],
      particles: [],
    };

    expect(sampleProjectAtTime(project, 11).time).toBe(10);
    expect(sampleProjectAtTime(project, -1).time).toBe(0);
  });
});
