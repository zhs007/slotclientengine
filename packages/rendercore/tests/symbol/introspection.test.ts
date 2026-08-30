import { describe, expect, it } from "vitest";
import {
  createTestSpineAtlas,
  createTestSpineSkeleton,
  createTestVniProject,
} from "../fixtures/artifact-fixtures.js";
import {
  inspectSymbolSpineAtlas,
  inspectSymbolSpineBundle,
  inspectSymbolSpineSkeleton,
  inspectSymbolVniProject,
} from "../../src/symbol/index.js";

describe("symbol editor resource introspection", () => {
  it("strictly reports VNI duration, stage and indirect assets", () => {
    const project = createTestVniProject("symbol-win", 1);
    expect(inspectSymbolVniProject(project)).toMatchObject({
      schemaVersion: "VNI_0.087",
      durationSeconds: 1,
      stage: { width: 300, height: 300 },
      assetPaths: expect.arrayContaining([expect.stringMatching(/\.webp$/)]),
    });
  });

  it("lists exact Spine animations, slots and atlas pages and validates the bundle", () => {
    const skeleton = createTestSpineSkeleton();
    const texture = "Symbol.png";
    const atlasText = createTestSpineAtlas(texture);
    const metadata = inspectSymbolSpineSkeleton(skeleton);
    expect(metadata.version).toBe("4.3.23");
    expect(metadata.animationNames).toContain("Idle");
    expect(metadata.animationNames).toContain("Win");
    expect(metadata.slotNames).toContain("Number");
    expect(inspectSymbolSpineAtlas(atlasText).pageNames).toEqual([texture]);
    expect(
      inspectSymbolSpineBundle({
        skeleton,
        atlasText,
        texturePath: `nested/${texture}`,
      }).skeleton.animationNames,
    ).toContain("Win");
    expect(
      inspectSymbolSpineBundle({
        skeleton,
        atlasText,
        texturePath: "nested/content-addressed-texture.webp",
      }).atlas.pageNames,
    ).toEqual([texture]);
    expect(() =>
      inspectSymbolSpineBundle({
        skeleton,
        atlasText,
        texturePath: "",
      }),
    ).toThrow(/Invalid texture path/);
  });
});
