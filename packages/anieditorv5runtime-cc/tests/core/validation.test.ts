import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tenXData from "../fixtures/10x.json";
import threeReelMultipay01Data from "../fixtures/3reel_multipay_01.json";
import threeReelMultipay02Data from "../fixtures/3reel_multipay_02.json";
import twoXData from "../fixtures/2x.json";
import fiveXData from "../fixtures/5x.json";
import bigwinData from "../fixtures/bigwin.json";
import export2Runtime50Data from "../fixtures/export2-runtime-50.json";
import lock01Data from "../fixtures/lock_01.json";
import megawinData from "../fixtures/megawin.json";
import multipayData from "../fixtures/multipay.json";
import projectData from "../fixtures/project.json";
import respinData from "../fixtures/respin.json";
import roundreelData from "../fixtures/roundreel.json";
import scatter1Data from "../fixtures/scatter1.json";
import scatter2Data from "../fixtures/scatter2.json";
import superwinData from "../fixtures/superwin.json";
import {
  assertSupportedAnimation,
  assertV5GProject,
  parseColorHex,
  validateCocosV5GProject,
  validateV5GProject,
} from "../../src/core/validation";
import { getVNIProjectLayerGroupSlots } from "../../src/core/layer-groups";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GProjectConfig,
} from "../../src/core/types";

const fixtures = [projectData, bigwinData, megawinData, superwinData] as const;
const newExportFixtures = [
  twoXData,
  fiveXData,
  tenXData,
  respinData,
  scatter1Data,
  scatter2Data,
  multipayData,
  threeReelMultipay02Data,
  roundreelData,
] as const;
const exportRootDir = fileURLToPath(
  new URL("../../../../docs/anieditor5/export/", import.meta.url),
);
const runtime50ExportRootDir = fileURLToPath(
  new URL("../../../../docs/anieditor5/export2/runtime_50/", import.meta.url),
);

function validProject(): V5GProjectConfig {
  return structuredClone(assertV5GProject(projectData));
}

function validRuntime50Project(): V5GProjectConfig {
  return structuredClone(assertV5GProject(export2Runtime50Data));
}

function validRoundreelProject(): V5GProjectConfig {
  return structuredClone(assertV5GProject(roundreelData));
}

function expectInvalid(
  mutate: (project: V5GProjectConfig) => void,
  message: string,
): void {
  const project = validProject();
  mutate(project);
  expect(() => validateV5GProject(project)).toThrow(message);
}

function expectInvalidCocos(
  mutate: (project: V5GProjectConfig) => void,
  message: string,
): void {
  const project = validProject();
  mutate(project);
  expect(() => validateCocosV5GProject(project)).toThrow(message);
}

describe("validation", () => {
  it("accepts the current exported sample", () => {
    const project = validProject();
    expect(() => validateV5GProject(project)).not.toThrow();
    expect(() => validateCocosV5GProject(project)).not.toThrow();
  });

  it("accepts all current exported fixtures at the generic V5G layer", () => {
    for (const fixture of fixtures) {
      const project = assertV5GProject(fixture);
      expect(project.schemaVersion).toMatch(/^V5G_0\.\d+$/u);
      expect(project.editor.name).toBe("victory_editor_v5_g");
      expect(project.engineTarget).toEqual({
        name: "cocos_creator",
        version: "3.8.6",
      });
      expect(project.stage.coordinate).toBe("center");
      expect(() => validateV5GProject(project)).not.toThrow();
    }
  });

  it("accepts current VNI particle and segmented-era export fixtures", () => {
    for (const fixture of newExportFixtures) {
      const project = assertV5GProject(fixture);
      expect(project.schemaVersion).toMatch(/^(?:V5G|VNI)_0\.\d+$/u);
      expect(project.engineTarget).toEqual({
        name: "cocos_creator",
        version: "3.8.6",
      });
      expect(() => validateV5GProject(project)).not.toThrow();
      expect(() => validateCocosV5GProject(project)).not.toThrow();
    }
  });

  it("accepts the VNI_0.017 lock_01 safe_glow fixture for Cocos runtime", () => {
    const project = assertV5GProject(structuredClone(lock01Data));
    const animationTypes = new Set(
      project.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    );

    expect(project.schemaVersion).toBe("VNI_0.017");
    expect(project.name).toBe("lock_01");
    expect(project.engineTarget).toEqual({
      name: "cocos_creator",
      version: "3.8.6",
    });
    expect(animationTypes.has("safe_glow")).toBe(true);
    expect(animationTypes.has("idle")).toBe(true);
    expect(animationTypes.has("particle_twinkle")).toBe(true);
    expect(project.layerGroups).toHaveLength(1);
    expect(getVNIProjectLayerGroupSlots(project)).toEqual([]);
    expect(() => validateV5GProject(project)).not.toThrow();
    expect(() => validateCocosV5GProject(project)).not.toThrow();
  });

  it("accepts the VNI_0.020 roundreel runtime_100 safe_glow fixture", () => {
    const docsRoundreel = JSON.parse(
      readFileSync(join(exportRootDir, "roundreel.json"), "utf8"),
    ) as unknown;
    expect(roundreelData).toEqual(docsRoundreel);

    const project = validRoundreelProject();
    const animationTypes = new Set(
      project.layers.flatMap((layer) =>
        layer.animations.map((animation) => animation.type),
      ),
    );
    const blendModes = new Set(project.layers.map((layer) => layer.blendMode));

    expect(project.schemaVersion).toBe("VNI_0.020");
    expect(project.editor.name).toBe("VNI");
    expect(project.engineTarget).toEqual({
      name: "cocos_creator",
      version: "3.8.6",
    });
    expect(project.name).toBe("roundreel");
    expect(project.exportProfile).toEqual({
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
      label: undefined,
    });
    expect(animationTypes.has("safe_glow")).toBe(true);
    expect(blendModes.has("add")).toBe(true);
    for (const asset of project.assets) {
      expect(asset.fileWidth).toBe(asset.width);
      expect(asset.fileHeight).toBe(asset.height);
      expect(asset.fileScale).toBe(1);
      expect(existsSync(join(exportRootDir, asset.path))).toBe(true);
    }
    expect(() => validateV5GProject(project)).not.toThrow();
    expect(() => validateCocosV5GProject(project)).not.toThrow();
  });

  it("accepts render-effect exports generically but fails fast for Cocos runtime", () => {
    const project = assertV5GProject(threeReelMultipay01Data);
    expect(project.schemaVersion).toBe("VNI_0.016");
    expect(() => validateV5GProject(project)).not.toThrow();
    expect(() => validateCocosV5GProject(project)).toThrow(
      'Cocos runtime does not support VNI render effect animations yet: project "3reel_MultiPay_01", layer "layer_image_mqp31v5g_15", animation "anim_module_mqp32bt3_16", type "glow".',
    );
  });

  it("accepts the runtime_50 VNI export profile", () => {
    const project = validRuntime50Project();
    expect(project.schemaVersion).toMatch(/^VNI_0\.\d+$/u);
    expect(project.editor.name).toBe("victory_editor_v5_g");
    expect(project.exportProfile).toEqual({
      id: "runtime_50",
      purpose: "runtime",
      assetScale: 0.5,
      label: undefined,
    });
    expect(project.assets[0]).toMatchObject({
      width: 730,
      height: 735,
      fileWidth: 365,
      fileHeight: 368,
      fileScale: 0.5,
    });
    expect(() => validateV5GProject(project)).not.toThrow();
    expect(() => validateCocosV5GProject(project)).not.toThrow();
  });

  it("keeps copied fixture asset paths aligned with docs export assets", () => {
    const uniqueAssetPaths = new Set<string>();
    for (const fixture of fixtures) {
      const project = assertV5GProject(fixture);
      for (const asset of project.assets) {
        uniqueAssetPaths.add(asset.path);
        expect(existsSync(join(exportRootDir, asset.path))).toBe(true);
      }
    }
    expect(uniqueAssetPaths.size).toBe(28);
  });

  it("keeps runtime_50 fixture asset paths aligned with docs export2 runtime assets", () => {
    const project = validRuntime50Project();
    for (const asset of project.assets) {
      expect(existsSync(join(runtime50ExportRootDir, asset.path))).toBe(true);
    }
  });

  it("supports the viewer animation type surface", () => {
    const paramsByType: Record<V5GAnimationType, V5GAnimationConfig["params"]> =
      {
        idle: {},
        move: { fromX: 0, fromY: 0, toX: 1, toY: 1 },
        fade: { fromOpacity: 0, toOpacity: 1 },
        scale_up: { fromScaleX: 1, fromScaleY: 1, toScaleX: 2, toScaleY: 2 },
        scale_down: { fromScaleX: 2, fromScaleY: 2, toScaleX: 1, toScaleY: 1 },
        scale_in: { fromScale: 0, toScale: 1 },
        scale_out: { fromScale: 1, toScale: 0 },
        pop: { peakScale: 1.4, settleScale: 1, peakAt: 0.45 },
        shake: { amplitudeX: 10, amplitudeY: 5, cycles: 2 },
        blink: { minOpacity: 0, maxOpacity: 1, blinks: 2, endOpacity: 1 },
        rotate: { fromRotation: 0, toRotation: 90 },
        slide_in: { fromX: -10, fromY: 0, toX: 0, toY: 0 },
        slide_out: { fromX: 0, fromY: 0, toX: 10, toY: 0 },
        bounce_in: { fromScale: 0, toScale: 1, overshoot: 1.5 },
        pulse: { scale: 1.2, cycles: 2 },
        float: { amplitude: 10, cycles: 2 },
        swing: { angle: 10, cycles: 2 },
        particles: { count: 8, spread: 20, speed: 30, size: 12, gravity: 0 },
        particle_twinkle: {
          radius: 50,
          count: 10,
          spawnInterval: 0.1,
          twinkleDuration: 0.4,
          batchMin: 1,
          batchMax: 2,
          size: 12,
        },
        particle_wall: {
          emitterWidth: 100,
          direction: 270,
          spreadAngle: 15,
          speed: 80,
          lifetimeMin: 0.5,
          lifetimeMax: 1,
          spawnRate: 20,
          size: 24,
          gravity: 0,
          startScaleMin: 0.6,
          startScaleMax: 1,
          endScaleMin: 0.3,
          endScaleMax: 0.8,
          fadeOut: true,
        },
        particle_combo: {
          count: 12,
          size: 18,
          sourceOpacity: 0,
          spawnMode: 1,
          spawnRadius: 60,
          spawnRatio: 0.2,
          targetX: 30,
          targetY: 40,
          travelMode: 2,
          curve: 20,
          orbitRadius: 80,
          orbitTurns: 1,
          orbitSpeed: 1.5,
          orbitRatio: 0.4,
          staggerRatio: 0.2,
          trailCount: 2,
          trailSpacing: 0.03,
          trailFade: 0.6,
          vanishMode: 1,
          vanishRatio: 0.2,
          flashScale: 1.8,
          flashIntensity: 1.2,
        },
        shatter: {
          count: 8,
          pieceSize: 24,
          force: 120,
          impactAngle: 90,
          spreadAngle: 45,
          gravity: 80,
          spin: 1,
          sourceOpacity: 0.25,
          fadeOut: true,
        },
        glow: {
          intensity: 1.4,
          spread: 12,
          minAlpha: 0.2,
          maxAlpha: 0.8,
          pulses: 2,
          blendMode: 0,
          keepOriginal: true,
        },
        safe_glow: {
          spread: 0.12,
          minOpacity: 0.1,
          maxOpacity: 0.8,
          pulses: 2,
          keepOriginal: true,
        },
        squash_stretch: {
          squashAngle: 90,
          squashAmount: 0.35,
          decayOscillateCount: 2,
          fromX: 0,
          fromY: 0,
          toX: 12,
          toY: -8,
        },
      };

    for (const [type, params] of Object.entries(paramsByType)) {
      const animation: V5GAnimationConfig = {
        id: `anim-${type}`,
        type: type as V5GAnimationType,
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params,
      };
      expect(() =>
        assertSupportedAnimation(animation, "layer", 1),
      ).not.toThrow();
    }
  });

  it("parses valid hex colors and rejects invalid ones", () => {
    expect(parseColorHex("#101827")).toBe(0x101827);
    expect(() => parseColorHex("101827")).toThrow(
      "Invalid V5G background color",
    );
  });

  it("accepts supported schema/editor families and rejects unknown ones", () => {
    const vniProject = validProject();
    vniProject.schemaVersion = "VNI_0.003";
    vniProject.editor = { name: "VNI", version: "VNI_0.003" };
    expect(() => validateV5GProject(vniProject)).not.toThrow();

    expectInvalid((project) => {
      project.schemaVersion = "V6G_0.0001";
    }, "Unsupported V5G schemaVersion");
    expectInvalid((project) => {
      project.editor.name = "other_editor";
    }, "Unsupported V5G editor");
  });

  it("rejects unsupported engine target", () => {
    expectInvalid((project) => {
      (project.engineTarget as { name: string }).name = "pixi";
    }, "Unsupported V5G engine target");
    expect(() =>
      assertV5GProject({
        ...projectData,
        engineTarget: { name: "pixi", version: "1.0.0" },
      }),
    ).toThrow("engineTarget.name must be cocos_creator");
  });

  it("validates compressed asset metadata strictly", () => {
    const legacyProject = validProject();
    legacyProject.assets[0].fileWidth = legacyProject.assets[0].width;
    expect(() => validateV5GProject(legacyProject)).toThrow(
      "fileWidth/fileHeight/fileScale must be provided together",
    );

    const nonNumeric = structuredClone(export2Runtime50Data);
    nonNumeric.assets[0].fileWidth = "365" as unknown as number;
    expect(() => assertV5GProject(nonNumeric)).toThrow(
      "project.assets[0].fileWidth must be a finite number",
    );

    const zeroWidth = validRuntime50Project();
    zeroWidth.assets[0].fileWidth = 0;
    expect(() => validateV5GProject(zeroWidth)).toThrow(
      "fileWidth must be a positive finite number",
    );

    const zeroScale = validRuntime50Project();
    zeroScale.assets[0].fileScale = 0;
    expect(() => validateV5GProject(zeroScale)).toThrow("fileScale");

    const oversizedScale = validRuntime50Project();
    oversizedScale.assets[0].fileScale = 1.2;
    expect(() => validateV5GProject(oversizedScale)).toThrow("fileScale");

    const mismatchedSize = validRuntime50Project();
    mismatchedSize.assets[0].fileWidth = 366;
    expect(() => validateV5GProject(mismatchedSize)).toThrow(
      "file size metadata mismatch",
    );
  });

  it("enforces exportProfile asset scale requirements", () => {
    const mismatchedAssetScale = validRuntime50Project();
    mismatchedAssetScale.assets[0].fileScale = 0.25;
    mismatchedAssetScale.assets[0].fileWidth = 183;
    mismatchedAssetScale.assets[0].fileHeight = 184;
    expect(() => validateV5GProject(mismatchedAssetScale)).toThrow(
      "does not match exportProfile.assetScale",
    );

    const runtimeMissingMetadata = validRuntime50Project();
    delete runtimeMissingMetadata.assets[0].fileWidth;
    delete runtimeMissingMetadata.assets[0].fileHeight;
    delete runtimeMissingMetadata.assets[0].fileScale;
    expect(() => validateV5GProject(runtimeMissingMetadata)).toThrow(
      'must provide fileWidth/fileHeight/fileScale for exportProfile "runtime_50"',
    );

    const runtime100MissingMetadata = validRoundreelProject();
    delete runtime100MissingMetadata.assets[0].fileWidth;
    delete runtime100MissingMetadata.assets[0].fileHeight;
    delete runtime100MissingMetadata.assets[0].fileScale;
    expect(() => validateV5GProject(runtime100MissingMetadata)).toThrow(
      'must provide fileWidth/fileHeight/fileScale for exportProfile "runtime_100"',
    );

    const editingScaledMissingMetadata = validProject();
    editingScaledMissingMetadata.exportProfile = {
      id: "edit_half",
      purpose: "editing",
      assetScale: 0.5,
    };
    expect(() => validateV5GProject(editingScaledMissingMetadata)).toThrow(
      'must provide fileWidth/fileHeight/fileScale for exportProfile "edit_half"',
    );

    const fullEditingMissingMetadata = validProject();
    fullEditingMissingMetadata.exportProfile = {
      id: "edit_full",
      purpose: "editing",
      assetScale: 1,
    };
    expect(() => validateV5GProject(fullEditingMissingMetadata)).not.toThrow();
  });

  it("rejects unsupported Cocos Creator versions", () => {
    expectInvalidCocos((project) => {
      project.engineTarget.version = "3.8.5";
    }, "Unsupported Cocos Creator version");
  });

  it("rejects non-center coordinate mode", () => {
    expectInvalid((project) => {
      (project.stage as { coordinate: string }).coordinate = "top-left";
    }, "Unsupported V5G coordinate mode");
  });

  it("rejects particles and non-empty layer keyframes", () => {
    expectInvalid((project) => {
      (project.particles as unknown[]).push({ id: "p" });
    }, "Unsupported V5G top-level particles");
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

  it("rejects group layers and nested layers", () => {
    expectInvalid((project) => {
      project.layers[0].type = "group";
    }, "Unsupported V5G layer type: group");
    expectInvalid((project) => {
      project.layers[0].parentId = "parent";
    }, "Unsupported V5G parentId");
  });

  it("rejects unknown animation, easing, blend mode, and invalid color", () => {
    expectInvalid((project) => {
      (project.layers[0].animations[0] as { type: string }).type = "zoom";
    }, "Unsupported V5G animation type");
    expectInvalid((project) => {
      project.layers[0].animations[0].params.easing = "soft";
    }, "Unsupported V5G easing");
    expectInvalid((project) => {
      (project.layers[0] as { blendMode: string }).blendMode = "overlay";
    }, "Unsupported V5G blendMode");
    expectInvalid((project) => {
      project.stage.backgroundColor = "#12345";
    }, "Invalid V5G background color");
  });

  it("rejects animations that exceed stage duration or miss required params", () => {
    expectInvalid((project) => {
      project.layers[0].animations[0].startTime = 9.95;
      project.layers[0].animations[0].duration = 0.1;
    }, "exceeds stage.duration");
    expectInvalid((project) => {
      delete project.layers[0].animations[0].params.toScaleX;
    }, 'requires numeric param "toScaleX"');
  });

  it("rejects new particle numeric strings and missing params", () => {
    const missingWallParam = assertV5GProject(structuredClone(multipayData));
    const wall = missingWallParam.layers
      .flatMap((layer) => layer.animations)
      .find((animation) => animation.type === "particle_wall");
    expect(wall).toBeDefined();
    if (!wall) throw new Error("missing particle_wall fixture");
    delete wall.params.emitterWidth;
    expect(() => validateV5GProject(missingWallParam)).toThrow(
      'requires numeric param "emitterWidth"',
    );

    const stringComboParam = assertV5GProject(structuredClone(multipayData));
    const combo = stringComboParam.layers
      .flatMap((layer) => layer.animations)
      .find((animation) => animation.type === "particle_combo");
    expect(combo).toBeDefined();
    if (!combo) throw new Error("missing particle_combo fixture");
    combo.params.sourceOpacity = "0";
    expect(() => validateV5GProject(stringComboParam)).toThrow(
      'requires numeric param "sourceOpacity"',
    );

    const unknownSquashEasing = assertV5GProject(structuredClone(scatter1Data));
    const squash = unknownSquashEasing.layers
      .flatMap((layer) => layer.animations)
      .find((animation) => animation.type === "squash_stretch");
    expect(squash).toBeDefined();
    if (!squash) throw new Error("missing squash_stretch fixture");
    squash.params.easing = "spring";
    expect(() => validateV5GProject(unknownSquashEasing)).toThrow(
      "Unsupported V5G easing",
    );
  });

  it("rejects malformed render effect params generically", () => {
    const missingGlowParam = assertV5GProject(
      structuredClone(threeReelMultipay01Data),
    );
    const glow = missingGlowParam.layers
      .flatMap((layer) => layer.animations)
      .find((animation) => animation.type === "glow");
    expect(glow).toBeDefined();
    if (!glow) throw new Error("missing glow fixture");
    delete glow.params.intensity;
    expect(() => validateV5GProject(missingGlowParam)).toThrow(
      'requires numeric param "intensity"',
    );

    const shatterProject = validProject();
    shatterProject.layers[0].animations = [
      {
        id: "shatter",
        type: "shatter",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          count: 8,
          pieceSize: 24,
          force: 120,
          impactAngle: 90,
          spreadAngle: 45,
          gravity: 80,
          spin: 1,
          sourceOpacity: 0.5,
          fadeOut: true,
        },
      },
    ];
    expect(() => validateV5GProject(shatterProject)).not.toThrow();
    expect(() => validateCocosV5GProject(shatterProject)).toThrow(
      "Cocos runtime does not support VNI render effect animations yet",
    );
    shatterProject.layers[0].animations[0].params.fadeOut = "true";
    expect(() => validateV5GProject(shatterProject)).toThrow(
      'param "fadeOut" must be a boolean',
    );
  });

  it("rejects malformed safe_glow params generically", () => {
    const project = assertV5GProject(structuredClone(lock01Data));
    const safeGlow = project.layers
      .flatMap((layer) => layer.animations)
      .find((animation) => animation.type === "safe_glow");
    expect(safeGlow).toBeDefined();
    if (!safeGlow) throw new Error("missing safe_glow fixture");

    delete safeGlow.params.spread;
    expect(() => validateV5GProject(project)).toThrow(
      'requires numeric param "spread"',
    );

    const stringBoolean = assertV5GProject(structuredClone(lock01Data));
    const stringKeepOriginal = stringBoolean.layers
      .flatMap((layer) => layer.animations)
      .find((animation) => animation.type === "safe_glow");
    expect(stringKeepOriginal).toBeDefined();
    if (!stringKeepOriginal) throw new Error("missing safe_glow fixture");
    stringKeepOriginal.params.keepOriginal = "false";
    expect(() => validateV5GProject(stringBoolean)).toThrow(
      'param "keepOriginal" must be a boolean',
    );
  });

  it("rejects text layers for Cocos", () => {
    expectInvalidCocos((project) => {
      project.layers[0] = {
        ...project.layers[0],
        type: "text",
        assetId: null,
        text: "hello",
      };
    }, "Unsupported Cocos V5G layer type: text");
  });

  it("accepts exported special blend modes at the Cocos runtime layer", () => {
    const project = assertV5GProject(bigwinData);
    expect(() => validateV5GProject(project)).not.toThrow();
    expect(() => validateCocosV5GProject(project)).not.toThrow();
  });
});
