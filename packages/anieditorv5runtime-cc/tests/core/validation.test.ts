import { describe, expect, it } from "vitest";
import projectData from "../fixtures/project.json";
import {
  assertV5GProject,
  parseColorHex,
  validateCocosV5GProject,
  validateV5GProject,
} from "../../src/core/validation";
import type { V5GProjectConfig } from "../../src/core/types";

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
    }, "Unsupported V5G particles");
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
});
