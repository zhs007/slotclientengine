import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  inspectSymbolSpineAtlas,
  inspectSymbolSpineBundle,
  inspectSymbolSpineSkeleton,
  inspectSymbolVniProject,
} from "../../src/symbol/index.js";

describe("symbol editor resource introspection", () => {
  it("strictly reports VNI duration, stage and indirect assets", () => {
    const project = JSON.parse(
      readFileSync(
        new URL("../../../../assets/game003-s1/L1-wins.json", import.meta.url),
        "utf8",
      ),
    );
    expect(inspectSymbolVniProject(project)).toMatchObject({
      schemaVersion: "VNI_0.022",
      durationSeconds: 1,
      stage: { width: 300, height: 300 },
      assetPaths: ["assets/j1_asset_image_mr1qgfc2_r.png"],
    });
  });

  it("lists exact Spine animations, slots and atlas pages and validates the bundle", () => {
    const skeleton = JSON.parse(
      readFileSync(
        new URL("../../../../assets/game003-s1/WL.json", import.meta.url),
        "utf8",
      ),
    );
    const atlasText = readFileSync(
      new URL("../../../../assets/game003-s1/Symbol.atlas", import.meta.url),
      "utf8",
    );
    const metadata = inspectSymbolSpineSkeleton(skeleton);
    expect(metadata.version).toBe("4.3.23");
    expect(metadata.animationNames).toContain("Idle");
    expect(metadata.animationNames).toContain("Win");
    expect(metadata.slotNames).toContain("Number");
    expect(inspectSymbolSpineAtlas(atlasText).pageNames).toEqual([
      "Symbol.png",
    ]);
    expect(
      inspectSymbolSpineBundle({
        skeleton,
        atlasText,
        texturePath: "nested/Symbol.png",
      }).skeleton.animationNames,
    ).toContain("start");
    expect(() =>
      inspectSymbolSpineBundle({
        skeleton,
        atlasText,
        texturePath: "wrong.png",
      }),
    ).toThrow(/must match texture/);
  });
});
