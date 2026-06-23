import { describe, expect, it } from "vitest";
import projectData from "../fixtures/export/project.json";
import twoXData from "../fixtures/export/2x.json";
import fiveXData from "../fixtures/export/5x.json";
import tenXData from "../fixtures/export/10x.json";
import bigwinData from "../fixtures/export/bigwin.json";
import megawinData from "../fixtures/export/megawin.json";
import multipayData from "../fixtures/export/multipay.json";
import respinData from "../fixtures/export/respin.json";
import scatter1Data from "../fixtures/export/scatter1.json";
import scatter2Data from "../fixtures/export/scatter2.json";
import superwinData from "../fixtures/export/superwin.json";
import export2ManifestData from "../fixtures/export2/manifest.json";
import export2EditFullData from "../fixtures/export2/edit_full/project.json";
import export2Runtime50Data from "../fixtures/export2/runtime_50/project.json";
import {
  assertV5GBundleManifest,
  assertV5GProject,
  assertVNIBundleManifest,
  assertVNIProject,
  parseColorHex,
  validateManifestProjectProfile,
  validateV5GBundleManifest,
  validateV5GProject,
  validateVNIBundleManifest,
  validateVNIProject,
} from "../../src/core/validation";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GProjectConfig,
} from "../../src/core/types";

const bundledProjectData = [
  projectData,
  bigwinData,
  megawinData,
  superwinData,
  twoXData,
  fiveXData,
  tenXData,
  respinData,
  scatter1Data,
  scatter2Data,
  multipayData,
  export2EditFullData,
  export2Runtime50Data,
] as const;

const newAnimationParams: Readonly<
  Record<V5GAnimationType, V5GAnimationConfig["params"]>
> = {
  move: { fromX: 0, fromY: 0, toX: 1, toY: 1 },
  fade: { fromOpacity: 0, toOpacity: 1 },
  scale_up: { fromScaleX: 1, fromScaleY: 1, toScaleX: 2, toScaleY: 2 },
  scale_down: { fromScaleX: 2, fromScaleY: 2, toScaleX: 1, toScaleY: 1 },
  scale_in: { fromScale: 0, toScale: 1, fadeIn: true },
  scale_out: { fromScale: 1, toScale: 0, fadeOut: true },
  pop: { peakScale: 1.25, settleScale: 1, peakAt: 0.4 },
  shake: { amplitudeX: 12, amplitudeY: 4, cycles: 3, decay: true },
  blink: { minOpacity: 0.1, maxOpacity: 1, blinks: 2, endOpacity: 1 },
  rotate: { fromRotation: 0, toRotation: 90 },
  slide_in: { fromX: -10, fromY: 0, toX: 0, toY: 0, fadeIn: true },
  slide_out: { fromX: 0, fromY: 0, toX: 10, toY: 0, fadeOut: true },
  bounce_in: { fromScale: 0.2, toScale: 1, overshoot: 1.7, fadeIn: true },
  pulse: { scale: 1.1, cycles: 1 },
  float: { amplitude: 10, cycles: 1 },
  swing: { angle: 10, cycles: 1 },
  particles: {
    count: 4,
    spread: 20,
    speed: 30,
    size: 16,
    gravity: 10,
    fadeOut: true,
  },
  particle_twinkle: {
    radius: 20,
    count: 4,
    spawnInterval: 0.1,
    twinkleDuration: 0.4,
    batchMin: 1,
    batchMax: 2,
    size: 16,
  },
  particle_wall: {
    emitterWidth: 300,
    direction: 270,
    spreadAngle: 15,
    speed: 200,
    lifetimeMin: 0.8,
    lifetimeMax: 2,
    spawnRate: 30,
    size: 48,
    gravity: 0,
    startScaleMin: 0.6,
    startScaleMax: 1,
    endScaleMin: 0.3,
    endScaleMax: 0.8,
    fadeOut: true,
  },
  particle_combo: {
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
  squash_stretch: {
    squashAngle: 270,
    squashAmount: 0.4,
    decayOscillateCount: 0,
    fromX: 0,
    fromY: -300,
    toX: 0,
    toY: 0,
  },
};

function validProject(): V5GProjectConfig {
  return structuredClone(assertV5GProject(projectData));
}

function expectInvalid(
  mutate: (project: V5GProjectConfig) => void,
  message: string,
): void {
  const project = validProject();
  mutate(project);
  expect(() => validateV5GProject(project)).toThrow(message);
}

describe("validation", () => {
  it("accepts all bundled exports", () => {
    for (const data of bundledProjectData) {
      const project = assertV5GProject(data);
      expect(() => validateV5GProject(project)).not.toThrow();
    }
  });

  it("keeps VNI public validation aliases semantically identical", () => {
    const project = assertVNIProject(projectData);
    const legacyProject = assertV5GProject(projectData);
    const manifest = assertVNIBundleManifest(export2ManifestData);

    expect(project).toEqual(legacyProject);
    expect(() => validateVNIProject(project)).not.toThrow();
    expect(() => validateVNIBundleManifest(manifest)).not.toThrow();
  });

  it("accepts new particle and squash bundled projects", () => {
    const multipay = assertV5GProject(multipayData);
    const scatter1 = assertV5GProject(scatter1Data);
    const scatter2 = assertV5GProject(scatter2Data);

    expect(
      multipay.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ).toEqual(expect.arrayContaining(["particle_wall", "particle_combo"]));
    expect(
      scatter1.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ).toContain("squash_stretch");
    expect(
      scatter2.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    ).toContain("squash_stretch");
    expect(() => validateV5GProject(multipay)).not.toThrow();
    expect(() => validateV5GProject(scatter1)).not.toThrow();
    expect(() => validateV5GProject(scatter2)).not.toThrow();
  });

  it("accepts VNI projects and legacy assets without file scale metadata", () => {
    const project = validProject();
    project.schemaVersion = "VNI_0.003";
    project.editor = { name: "VNI", version: "VNI_0.003" };

    expect(project.assets[0].fileWidth).toBeUndefined();
    expect(() => validateV5GProject(project)).not.toThrow();
  });

  it("accepts VNI single-project 100% exports without exportProfile", () => {
    const project = structuredClone(assertV5GProject(export2EditFullData));
    delete project.exportProfile;

    expect(() => validateV5GProject(project)).not.toThrow();
  });

  it("accepts runtime_50 file metadata and rejects partial metadata", () => {
    const project = structuredClone(assertV5GProject(export2Runtime50Data));
    const asset = project.assets.find(
      (item) => item.path === "assets/bigwin_asset_image_mqgf7e6h_g.png",
    );

    expect(asset).toMatchObject({
      width: 730,
      height: 735,
      fileWidth: 365,
      fileHeight: 368,
      fileScale: 0.5,
    });
    expect(() => validateV5GProject(project)).not.toThrow();

    expectInvalid((legacyProject) => {
      legacyProject.assets[0].fileWidth = legacyProject.assets[0].width;
    }, "fileWidth/fileHeight/fileScale must be provided together");
  });

  it("rejects invalid file metadata values and mismatched rounded sizes", () => {
    expectInvalid((project) => {
      project.assets[0].fileWidth = 0;
      project.assets[0].fileHeight = project.assets[0].height;
      project.assets[0].fileScale = 1;
    }, "fileWidth must be a positive finite number");

    expectInvalid((project) => {
      project.assets[0].fileWidth = project.assets[0].width;
      project.assets[0].fileHeight = project.assets[0].height;
      project.assets[0].fileScale = 0;
    }, "fileScale");

    expectInvalid((project) => {
      project.assets[0].fileWidth = project.assets[0].width;
      project.assets[0].fileHeight = project.assets[0].height;
      project.assets[0].fileScale = 1.2;
    }, "fileScale");

    expectInvalid((project) => {
      project.assets[0].fileWidth = project.assets[0].width - 1;
      project.assets[0].fileHeight = project.assets[0].height;
      project.assets[0].fileScale = 1;
    }, "file size metadata mismatch");
  });

  it("validates VNI bundle manifests and project profile consistency", () => {
    const manifest = assertV5GBundleManifest(export2ManifestData);
    expect(() => validateV5GBundleManifest(manifest)).not.toThrow();
    expect(manifest.exports.map((entry) => entry.id)).toEqual([
      "edit_full",
      "runtime_50",
    ]);

    const editFull = assertV5GProject(export2EditFullData);
    expect(() =>
      validateManifestProjectProfile(manifest.exports[0], editFull),
    ).not.toThrow();

    const mismatched = structuredClone(editFull);
    mismatched.exportProfile = {
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
    };
    expect(() =>
      validateManifestProjectProfile(manifest.exports[0], mismatched),
    ).toThrow("profile mismatch");
  });

  it("parses valid hex colors and rejects invalid ones", () => {
    expect(parseColorHex("#101827")).toBe(0x101827);
    expect(() => parseColorHex("101827")).toThrow(
      "Invalid V5G background color",
    );
  });

  it("rejects non-center coordinate mode", () => {
    expectInvalid((project) => {
      (project.stage as { coordinate: string }).coordinate = "top-left";
    }, "Unsupported V5G coordinate mode");
  });

  it("rejects unsupported schema major", () => {
    expectInvalid((project) => {
      project.schemaVersion = "V6G_0.0001";
    }, "Expected V5G_0.x or VNI_0.x");
  });

  it("rejects unsupported editor names", () => {
    expectInvalid((project) => {
      project.editor.name = "some_editor";
    }, "Unsupported V5G editor");
  });

  it("rejects top-level particles", () => {
    expectInvalid((project) => {
      (project.particles as unknown[]).push({ id: "p" });
    }, "Unsupported V5G top-level particles");
  });

  it("rejects non-empty layer keyframes", () => {
    expectInvalid((project) => {
      project.layers[0].keyframes = [
        {
          id: "key",
          time: 0,
          transform: project.layers[0].transform,
          opacity: 1,
          easing: "linear",
        },
      ];
    }, "Unsupported V5G keyframes");
  });

  it("rejects unknown animation type", () => {
    expectInvalid((project) => {
      (project.layers[0].animations[0] as { type: string }).type = "zoom";
    }, "Unsupported V5G animation type");
  });

  it("rejects unknown blend modes", () => {
    expectInvalid((project) => {
      (project.layers[0] as { blendMode: string }).blendMode = "overlay";
    }, "Unsupported V5G blendMode");
  });

  it("rejects unknown easing", () => {
    expectInvalid((project) => {
      project.layers[0].animations[0].params.easing = "soft";
    }, "Unsupported V5G easing");
  });

  it("accepts supported layer animation types", () => {
    for (const [type, params] of Object.entries(newAnimationParams)) {
      const project = validProject();
      project.layers[0].animations = [
        animation(type as V5GAnimationType, params),
      ];
      expect(() => validateV5GProject(project)).not.toThrow();
    }
  });

  it("rejects animations that exceed stage duration", () => {
    expectInvalid((project) => {
      project.layers[0].animations[0].startTime = 9.95;
      project.layers[0].animations[0].duration = 0.1;
    }, "exceeds stage.duration");
  });

  it("rejects missing required animation params", () => {
    expectInvalid((project) => {
      delete project.layers[0].animations[0].params.toScaleX;
    }, 'requires numeric param "toScaleX"');
  });

  it("rejects missing new animation numeric params", () => {
    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("scale_in", { fromScale: 0, fadeIn: true }),
      ];
    }, 'requires numeric param "toScale"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.particle_wall };
      delete params.spawnRate;
      project.layers[0].animations = [animation("particle_wall", params)];
    }, 'requires numeric param "spawnRate"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.particle_combo };
      delete params.targetY;
      project.layers[0].animations = [animation("particle_combo", params)];
    }, 'requires numeric param "targetY"');

    expectInvalid((project) => {
      const params = { ...newAnimationParams.squash_stretch };
      delete params.squashAmount;
      project.layers[0].animations = [animation("squash_stretch", params)];
    }, 'requires numeric param "squashAmount"');
  });

  it("rejects string numeric params", () => {
    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("scale_in", {
          fromScale: 0,
          toScale: "1",
          fadeIn: true,
        }),
      ];
    }, 'requires numeric param "toScale"');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("particle_combo", {
          ...newAnimationParams.particle_combo,
          sourceOpacity: "0",
        }),
      ];
    }, 'requires numeric param "sourceOpacity"');
  });

  it("rejects non-boolean optional flags", () => {
    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("particles", {
          count: 4,
          spread: 20,
          speed: 30,
          size: 16,
          gravity: 10,
          fadeOut: "true",
        }),
      ];
    }, 'param "fadeOut" must be a boolean');

    expectInvalid((project) => {
      project.layers[0].animations = [
        animation("shake", {
          amplitudeX: 12,
          amplitudeY: 4,
          cycles: 3,
          decay: 1,
        }),
      ];
    }, 'param "decay" must be a boolean');
  });

  it("rejects group layers and nested layers", () => {
    expectInvalid((project) => {
      project.layers[0].type = "group";
    }, "Unsupported V5G layer type: group");
    expectInvalid((project) => {
      project.layers[0].parentId = "parent";
    }, "Unsupported V5G parentId");
  });
});

function animation(
  type: V5GAnimationType,
  params: V5GAnimationConfig["params"],
): V5GAnimationConfig {
  return {
    id: `anim-${type}`,
    type,
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 1,
    params,
  };
}
