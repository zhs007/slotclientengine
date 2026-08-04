import { describe, expect, it } from "vitest";
import {
  getMinecart2SymbolResourcePath,
  readMinecart2LogicalJson,
  readMinecart2LogicalText,
} from "../../../../test-utils/minecart2-fixtures.js";
import {
  inspectSymbolSpineAtlas,
  inspectSymbolSpineBundle,
  inspectSymbolSpineSkeleton,
  inspectSymbolVniProject,
} from "../../src/symbol/index.js";

describe("symbol editor resource introspection", () => {
  it("strictly reports VNI duration, stage and indirect assets", () => {
    const projectPath = (
      readMinecart2LogicalJson("symbol-state-textures.manifest.json") as any
    ).symbols.L1.animations.win.project as string;
    const project = readMinecart2LogicalJson(projectPath);
    expect(inspectSymbolVniProject(project)).toMatchObject({
      schemaVersion: "VNI_0.022",
      durationSeconds: 1,
      stage: { width: 300, height: 300 },
      assetPaths: expect.arrayContaining([expect.stringMatching(/\.webp$/)]),
    });
  });

  it("lists exact Spine animations, slots and atlas pages and validates the bundle", () => {
    const skeleton = readMinecart2LogicalJson(
      getMinecart2SymbolResourcePath("WL", "skeleton"),
    );
    const atlasText = readMinecart2LogicalText(
      getMinecart2SymbolResourcePath("WL", "atlas"),
    );
    const texture = getMinecart2SymbolResourcePath("WL", "texture");
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
    ).toContain("start");
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
