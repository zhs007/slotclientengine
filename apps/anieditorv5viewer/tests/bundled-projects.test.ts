import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bundledProjects,
  getBundledProject,
} from "../src/config/bundled-projects";
import {
  export2EditFullAssetUrlManifest,
  export2Runtime50AssetUrlManifest,
  resolveProjectAssetUrls,
} from "../src/runtime/asset-manifest";

describe("bundled projects", () => {
  it("keeps the full bundled VNI project list available", () => {
    expect(bundledProjects.map((project) => project.id)).toEqual([
      "project",
      "bigwin",
      "megawin",
      "superwin",
      "2x",
      "5x",
      "10x",
      "respin",
      "scatter1",
      "scatter2",
      "multipay",
      "bigwin-edit-full",
      "bigwin-runtime-50",
    ]);
  });

  it("resolves every bundled project asset URL through the viewer glue", () => {
    for (const bundledProject of bundledProjects) {
      const resolved = resolveProjectAssetUrls(
        bundledProject.project,
        bundledProject.assetUrls,
      );

      expect(Object.keys(resolved).sort()).toEqual(
        bundledProject.project.assets.map((asset) => asset.path).sort(),
      );
    }
  });

  it("keeps export2 edit_full and runtime_50 asset URLs profile scoped", () => {
    const editFull = getBundledProject("bigwin-edit-full");
    const runtime50 = getBundledProject("bigwin-runtime-50");
    const sharedPath = "assets/bigwin_asset_image_mqgf7e6h_g.png";

    expect(editFull.assetUrls[sharedPath]).toBe(
      export2EditFullAssetUrlManifest[sharedPath],
    );
    expect(runtime50.assetUrls[sharedPath]).toBe(
      export2Runtime50AssetUrlManifest[sharedPath],
    );
    expect(editFull.assetUrls[sharedPath]).not.toBe(
      runtime50.assetUrls[sharedPath],
    );
  });

  it("keeps asset and JSON import configuration covering nested bundled assets", () => {
    expect(readFileSync(".prettierignore", "utf8")).toContain("src/assets");
    expect(readFileSync("vite.config.ts", "utf8")).toContain("src/assets/**");
    expect(readFileSync("tsconfig.json", "utf8")).toContain("src/**/*.json");
  });
});
