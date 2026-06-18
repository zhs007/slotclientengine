import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  bundledAssetUrlManifest,
  createAssetUrlManifest,
  export2EditFullAssetUrlManifest,
  export2Runtime50AssetUrlManifest,
  resolveProjectAssetUrls,
} from "../../src/runtime/asset-manifest";
import { bundledProjects } from "../../src/config/bundled-projects";

describe("asset-manifest", () => {
  it("normalizes vite module paths to V5G asset.path keys", () => {
    const manifest = createAssetUrlManifest({
      "../assets/assets/example.png": "/compiled/example.png",
    });

    expect(manifest["assets/example.png"]).toBe("/compiled/example.png");
  });

  it("resolves all bundled project assets", () => {
    expect(bundledProjects.map((project) => project.id)).toEqual([
      "project",
      "bigwin",
      "megawin",
      "superwin",
      "bigwin-edit-full",
      "bigwin-runtime-50",
    ]);

    for (const bundledProject of bundledProjects) {
      const resolved = resolveProjectAssetUrls(
        bundledProject.project,
        bundledAssetUrlManifest,
      );

      expect(Object.keys(resolved).sort()).toEqual(
        bundledProject.project.assets.map((asset) => asset.path).sort(),
      );
    }
  });

  it("keeps export2 profile asset URLs scoped by profile", () => {
    const editFull = bundledProjects.find(
      (project) => project.id === "bigwin-edit-full",
    );
    const runtime50 = bundledProjects.find(
      (project) => project.id === "bigwin-runtime-50",
    );
    expect(editFull).toBeDefined();
    expect(runtime50).toBeDefined();

    const sharedPath = "assets/bigwin_asset_image_mqgf7e6h_g.png";
    expect(editFull?.assetUrls[sharedPath]).toBe(
      export2EditFullAssetUrlManifest[sharedPath],
    );
    expect(runtime50?.assetUrls[sharedPath]).toBe(
      export2Runtime50AssetUrlManifest[sharedPath],
    );
    expect(editFull?.assetUrls[sharedPath]).not.toBe(
      runtime50?.assetUrls[sharedPath],
    );
  });

  it("keeps asset and JSON import configuration covering nested bundled assets", () => {
    expect(readFileSync(".prettierignore", "utf8")).toContain("src/assets");
    expect(readFileSync("vite.config.ts", "utf8")).toContain("src/assets/**");
    expect(readFileSync("tsconfig.json", "utf8")).toContain("src/**/*.json");
  });

  it("throws when a project asset is missing", () => {
    expect(() =>
      resolveProjectAssetUrls(bundledProjects[0].project, {}),
    ).toThrow("missing from manifest");
  });
});
