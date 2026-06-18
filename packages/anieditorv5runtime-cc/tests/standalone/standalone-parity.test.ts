import { describe, expect, it } from "vitest";
import bigwinData from "../fixtures/bigwin.json";
import megawinData from "../fixtures/megawin.json";
import projectData from "../fixtures/project.json";
import superwinData from "../fixtures/superwin.json";
import {
  opacityToCocosOpacity,
  v5gTransformToCocosPosition,
} from "../../src/cocos/coordinates";
import { validateCocosV5GProject } from "../../src/core/validation";
import {
  assertV5GProject,
  parseColorHex,
  validateV5GProject,
} from "../../src/core/validation";
import { sampleProjectAtTime } from "../../src/core/project-sampler";
import * as standalone from "../../standalone/anieditorv5runtime-cc";
import type { SampledProjectState } from "../../src/core/project-sampler";

const fixtures = [
  ["project", projectData],
  ["bigwin", bigwinData],
  ["megawin", megawinData],
  ["superwin", superwinData],
] as const;

const sampleTimes = [0, 0.1, 0.6, 0.8, 1, 2, 4, 4.4];

describe("standalone runtime parity", () => {
  it("matches modular runtime validation and project sampling", () => {
    for (const [name, fixture] of fixtures) {
      const modularProject = assertV5GProject(fixture);
      const standaloneProject = standalone.assertV5GProject(fixture);
      expect(standaloneProject).toEqual(modularProject);
      expect(() => validateV5GProject(modularProject)).not.toThrow();
      expect(() =>
        standalone.validateV5GProject(standaloneProject),
      ).not.toThrow();

      const times = [
        ...sampleTimes,
        modularProject.stage.duration,
        modularProject.stage.duration + 1,
      ];
      for (const time of times) {
        expect(
          comparableSample(
            standalone.sampleProjectAtTime(standaloneProject, time),
          ),
          `${name} at ${time}`,
        ).toEqual(comparableSample(sampleProjectAtTime(modularProject, time)));
      }
    }
  });

  it("matches modular runtime utility behavior", () => {
    expect(standalone.parseColorHex("#101827")).toBe(parseColorHex("#101827"));
    expect(standalone.opacityToCocosOpacity(0.333)).toBe(
      opacityToCocosOpacity(0.333),
    );
    expect(
      standalone.v5gTransformToCocosPosition({
        x: -12,
        y: 34,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    ).toEqual(
      v5gTransformToCocosPosition({
        x: -12,
        y: 34,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
    );
  });

  it("matches modular runtime Cocos blend-mode acceptance", () => {
    const project = assertV5GProject(bigwinData);
    expect(() => validateCocosV5GProject(project)).not.toThrow();
    expect(() => standalone.validateCocosV5GProject(project)).not.toThrow();
  });
});

function comparableSample(sample: SampledProjectState): SampledProjectState {
  return {
    time: sample.time,
    layers: sample.layers.map((layer) => ({
      layerId: layer.layerId,
      transform: layer.transform,
      opacity: layer.opacity,
      visible: layer.visible,
      renderImageDisplay: layer.renderImageDisplay,
      hasActiveParticleAnimation: layer.hasActiveParticleAnimation,
      blendMode: layer.blendMode,
    })),
  };
}
