import { describe, expect, it } from "vitest";
import {
  bundledAssetUrlManifest,
  createAssetUrlManifest,
  resolveProjectAssetUrls,
} from "../../src/runtime/asset-manifest";
import { bundledProject } from "../../src/config/bundled-project";

describe("asset-manifest", () => {
  it("normalizes vite module paths to V5G asset.path keys", () => {
    const manifest = createAssetUrlManifest({
      "../assets/assets/example.png": "/compiled/example.png",
    });

    expect(manifest["assets/example.png"]).toBe("/compiled/example.png");
  });

  it("resolves all current bundled project assets", () => {
    const resolved = resolveProjectAssetUrls(
      bundledProject,
      bundledAssetUrlManifest,
    );

    expect(Object.keys(resolved).sort()).toEqual(
      bundledProject.assets.map((asset) => asset.path).sort(),
    );
  });

  it("throws when a project asset is missing", () => {
    expect(() => resolveProjectAssetUrls(bundledProject, {})).toThrow(
      "missing from manifest",
    );
  });
});
