import { describe, expect, it } from "vitest";
import {
  bundledAssetUrlManifest,
  createAssetUrlManifest,
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

  it("throws when a project asset is missing", () => {
    expect(() =>
      resolveProjectAssetUrls(bundledProjects[0].project, {}),
    ).toThrow("missing from manifest");
  });
});
