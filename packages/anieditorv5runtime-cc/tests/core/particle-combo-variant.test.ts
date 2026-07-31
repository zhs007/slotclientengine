import { describe, expect, it } from "vitest";
import {
  createVNIParticleComboTargetVariant,
  listVNIParticleComboTargetAnimations,
} from "../../src/core/particle-combo-variant";
import type { V5GProjectConfig } from "../../src/core/types";

describe("particle_combo target variants", () => {
  it("preserves authored nominal speed and leaves the input untouched", () => {
    const project = createProject();
    const result = createVNIParticleComboTargetVariant({
      project,
      animation: { layerId: "layer-a", animationId: "combo" },
      target: { x: 1200, y: 0 },
    });

    expect(result.timing).toMatchObject({
      mode: "preserve-authored-speed",
      authoredTarget: { x: 600, y: 0 },
      effectiveTarget: { x: 1200, y: 0 },
      authoredDistance: 600,
      effectiveDistance: 1200,
      authoredDurationSeconds: 1.5,
      effectiveDurationSeconds: 3,
      authoredSpeed: 400,
      effectiveSpeed: 400,
      startTime: 0.25,
      endTime: 3.25,
      range: { unit: "time", start: 0.25, end: 3.25 },
    });
    expect(result.project.stage.duration).toBe(3.25);
    expect(getCombo(result.project).params).toMatchObject({
      targetX: 1200,
      targetY: 0,
    });
    expect(getCombo(project).params).toMatchObject({
      targetX: 600,
      targetY: 0,
    });
    expect(getCombo(project).duration).toBe(1.5);
  });

  it("uses fixed duration, allows a zero target, and reports speed", () => {
    const result = createVNIParticleComboTargetVariant({
      project: createProject(),
      animation: { layerId: "layer-a", animationId: "combo" },
      target: { x: 300, y: 400 },
      timing: { mode: "fixed-duration", durationSeconds: 2 },
    });
    expect(result.timing.effectiveDistance).toBe(500);
    expect(result.timing.effectiveDurationSeconds).toBe(2);
    expect(result.timing.effectiveSpeed).toBe(250);

    const zero = createVNIParticleComboTargetVariant({
      project: createProject(),
      animation: { layerId: "layer-a", animationId: "combo" },
      target: { x: 0, y: 0 },
      timing: { mode: "fixed-duration", durationSeconds: 1 },
    });
    expect(zero.timing.effectiveSpeed).toBe(0);
  });

  it("lists only enabled particle_combo animations", () => {
    const project = createProject();
    project.layers[0].animations.push({
      ...getCombo(project),
      id: "disabled",
      enabled: false,
    });
    expect(listVNIParticleComboTargetAnimations(project)).toEqual([
      expect.objectContaining({
        layerId: "layer-a",
        animationId: "combo",
        layerName: "Particle",
        animationName: "Combo",
        target: { x: 600, y: 0 },
        durationSeconds: 1.5,
        speed: 400,
      }),
    ]);
  });

  it("fails explicitly for unsupported refs and automatic zero distances", () => {
    const project = createProject();
    expect(() =>
      createVNIParticleComboTargetVariant({
        project,
        animation: { layerId: "missing", animationId: "combo" },
        target: { x: 1, y: 1 },
      }),
    ).toThrow('Unknown VNI layer "missing"');
    expect(() =>
      createVNIParticleComboTargetVariant({
        project,
        animation: { layerId: "layer-a", animationId: "combo" },
        target: { x: 0, y: 0 },
      }),
    ).toThrow("effective target distance must be a positive finite number");
    expect(() =>
      createVNIParticleComboTargetVariant({
        project,
        animation: { layerId: "layer-a", animationId: "combo" },
        target: { x: 0, y: 0 },
        timing: { mode: "fixed-duration", durationSeconds: 0 },
      }),
    ).toThrow("timing.durationSeconds must be a positive finite number");
  });
});

function getCombo(project: V5GProjectConfig) {
  return project.layers[0].animations[0];
}

function createProject(): V5GProjectConfig {
  return {
    schemaVersion: "VNI_0.042",
    editor: { name: "VNI", version: "VNI_0.042" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "particle-combo-variant",
    stage: {
      width: 2000,
      height: 2000,
      coordinate: "center",
      duration: 2,
      backgroundColor: "#000000",
    },
    assets: [
      {
        id: "asset-a",
        type: "image",
        path: "assets/a.png",
        originalName: "a.png",
        width: 100,
        height: 100,
      },
    ],
    layerGroups: [
      {
        id: "group_default",
        name: "Default",
        visible: true,
        collapsed: false,
        order: 0,
      },
    ],
    layers: [
      {
        id: "layer-a",
        name: "Particle",
        type: "image",
        assetId: "asset-a",
        parentId: null,
        groupId: "group_default",
        visible: true,
        locked: false,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        opacity: 1,
        blendMode: "normal",
        animations: [
          {
            id: "combo",
            name: "Combo",
            type: "particle_combo",
            startTime: 0.25,
            duration: 1.5,
            enabled: true,
            seed: 1,
            params: {
              count: 8,
              size: 16,
              sourceOpacity: 1,
              spawnMode: 0,
              spawnRadius: 0,
              spawnRatio: 0,
              targetX: 600,
              targetY: 0,
              travelMode: 0,
              curve: 0,
              orbitRadius: 0,
              orbitTurns: 0,
              orbitSpeed: 0,
              orbitRatio: 0,
              staggerRatio: 0,
              trailCount: 0,
              trailSpacing: 0,
              trailFade: 0,
              vanishMode: 0,
              vanishRatio: 0,
              flashScale: 1,
              flashIntensity: 0,
            },
          },
        ],
        keyframes: [],
      },
    ],
    particles: [],
  };
}
