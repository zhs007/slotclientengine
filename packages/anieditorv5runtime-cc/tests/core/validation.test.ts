import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import bigwinData from "../fixtures/bigwin.json";
import megawinData from "../fixtures/megawin.json";
import projectData from "../fixtures/project.json";
import superwinData from "../fixtures/superwin.json";
import {
  assertSupportedAnimation,
  assertV5GProject,
  parseColorHex,
  validateCocosV5GProject,
  validateV5GProject,
} from "../../src/core/validation";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GProjectConfig,
} from "../../src/core/types";

const fixtures = [projectData, bigwinData, megawinData, superwinData] as const;
const exportRootDir = fileURLToPath(
  new URL("../../../../docs/anieditor5/export/", import.meta.url),
);

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

  it("supports the viewer animation type surface", () => {
    const paramsByType: Record<V5GAnimationType, V5GAnimationConfig["params"]> =
      {
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

  it("rejects unsupported schema, editor, and engine target", () => {
    expectInvalid((project) => {
      project.schemaVersion = "V6G_0.0001";
    }, "Unsupported V5G schemaVersion");
    expectInvalid((project) => {
      project.editor.name = "other_editor";
    }, "Unsupported V5G editor");
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

  it("rejects text layers and unconfirmed blend modes for Cocos", () => {
    expectInvalidCocos((project) => {
      project.layers[0] = {
        ...project.layers[0],
        type: "text",
        assetId: null,
        text: "hello",
      };
    }, "Unsupported Cocos V5G layer type: text");
    expectInvalidCocos((project) => {
      project.layers[0].blendMode = "screen";
    }, "Unsupported Cocos V5G blendMode: screen");
  });

  it("rejects exported screen blend mode at the Cocos runtime layer until verified", () => {
    const project = assertV5GProject(bigwinData);
    expect(() => validateV5GProject(project)).not.toThrow();
    expect(() => validateCocosV5GProject(project)).toThrow(
      "Unsupported Cocos V5G blendMode: screen",
    );
  });
});
