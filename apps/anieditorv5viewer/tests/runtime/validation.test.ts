import { describe, expect, it } from "vitest";
import projectData from "../../src/assets/project.json";
import {
  assertV5GProject,
  parseColorHex,
  validateV5GProject,
} from "../../src/runtime/validation";
import type { V5GProjectConfig } from "../../src/v5g/types";

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
  it("accepts the current exported sample", () => {
    const project = validProject();
    expect(() => validateV5GProject(project)).not.toThrow();
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
    }, "Unsupported V5G schemaVersion");
  });

  it("rejects particles", () => {
    expectInvalid((project) => {
      (project.particles as unknown[]).push({ id: "p" });
    }, "Unsupported V5G particles");
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

  it("rejects group layers and nested layers", () => {
    expectInvalid((project) => {
      project.layers[0].type = "group";
    }, "Unsupported V5G layer type: group");
    expectInvalid((project) => {
      project.layers[0].parentId = "parent";
    }, "Unsupported V5G parentId");
  });
});
