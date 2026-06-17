import { describe, expect, it } from "vitest";
import projectData from "../../src/assets/project.json";
import bigwinData from "../../src/assets/projects/bigwin.json";
import megawinData from "../../src/assets/projects/megawin.json";
import superwinData from "../../src/assets/projects/superwin.json";
import {
  assertV5GProject,
  parseColorHex,
  validateV5GProject,
} from "../../src/runtime/validation";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GProjectConfig,
} from "../../src/v5g/types";

const bundledProjectData = [
  projectData,
  bigwinData,
  megawinData,
  superwinData,
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
