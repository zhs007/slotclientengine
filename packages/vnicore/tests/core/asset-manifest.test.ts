import { describe, expect, it } from "vitest";
import {
  createAssetUrlManifest,
  resolveProjectAssetUrls,
} from "../../src/core/asset-manifest";
import { assertVNIProject } from "../../src/core/validation";
import export2EditFullData from "../fixtures/export2/edit_full/project.json";
import export2Runtime50Data from "../fixtures/export2/runtime_50/project.json";

describe("asset-manifest", () => {
  it("normalizes vite module paths to V5G asset.path keys", () => {
    const manifest = createAssetUrlManifest({
      "../assets/assets/example.png": "/compiled/example.png",
    });

    expect(manifest["assets/example.png"]).toBe("/compiled/example.png");
  });

  it("keeps export2 profile asset URLs scoped by profile", () => {
    const editFull = assertVNIProject(export2EditFullData);
    const runtime50 = assertVNIProject(export2Runtime50Data);
    const sharedPath = "assets/bigwin_asset_image_mqgf7e6h_g.png";
    const editFullManifest = createAssetUrlManifest(
      Object.fromEntries(
        editFull.assets.map((asset) => [
          `../assets/export2/edit_full/${asset.path}`,
          asset.path === sharedPath
            ? "/edit-full/bigwin.png"
            : `/edit/${asset.path}`,
        ]),
      ),
    );
    const runtime50Manifest = createAssetUrlManifest(
      Object.fromEntries(
        runtime50.assets.map((asset) => [
          `../assets/export2/runtime_50/${asset.path}`,
          asset.path === sharedPath
            ? "/runtime-50/bigwin.png"
            : `/runtime/${asset.path}`,
        ]),
      ),
    );

    expect(
      resolveProjectAssetUrls(editFull, editFullManifest)[sharedPath],
    ).toBe("/edit-full/bigwin.png");
    expect(
      resolveProjectAssetUrls(runtime50, runtime50Manifest)[sharedPath],
    ).toBe("/runtime-50/bigwin.png");
    expect(
      resolveProjectAssetUrls(editFull, editFullManifest)[sharedPath],
    ).not.toBe(
      resolveProjectAssetUrls(runtime50, runtime50Manifest)[sharedPath],
    );
  });

  it("resolves all project asset paths from a matching manifest", () => {
    const project = assertVNIProject(export2EditFullData);
    const modules = Object.fromEntries(
      project.assets.map((asset) => [
        `../assets/export2/edit_full/${asset.path}`,
        `/compiled/${asset.path}`,
      ]),
    );
    const resolved = resolveProjectAssetUrls(
      project,
      createAssetUrlManifest(modules),
    );

    expect(Object.keys(resolved).sort()).toEqual(
      project.assets.map((asset) => asset.path).sort(),
    );
  });

  it("throws when a project asset is missing", () => {
    const project = assertVNIProject(export2EditFullData);
    expect(() => resolveProjectAssetUrls(project, {})).toThrow(
      "missing from manifest",
    );
  });
});
