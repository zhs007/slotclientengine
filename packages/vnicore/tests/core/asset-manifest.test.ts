import { describe, expect, it } from "vitest";
import {
  createAssetUrlManifest,
  resolveProjectAssetUrls,
} from "../../src/core/asset-manifest";
import { assertVNIProject } from "../../src/core/validation";
import roundreelData from "../fixtures/export/roundreel.json";
import export2EditFullData from "../fixtures/export2/edit_full/project.json";
import export2Runtime50Data from "../fixtures/export2/runtime_50/project.json";

describe("asset-manifest", () => {
  it("normalizes vite module paths to V5G asset.path keys", () => {
    const manifest = createAssetUrlManifest({
      "../assets/assets/example.png": "/compiled/example.png",
    });

    expect(manifest["assets/example.png"]).toBe("/compiled/example.png");
  });

  it("keeps asset URLs scoped by independent manifests", () => {
    const editFull = assertVNIProject(export2EditFullData);
    const runtime50 = assertVNIProject(export2Runtime50Data);
    const runtime100 = assertVNIProject(roundreelData);
    const sharedPath = "assets/bigwin_asset_image_mqgf7e6h_g.png";
    const roundreelPath = "assets/gx_6_asset_image_mqthi919_1e.png";
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
    const runtime100Manifest = createAssetUrlManifest(
      Object.fromEntries(
        runtime100.assets.map((asset) => [
          `../assets/export/${asset.path}`,
          asset.path === roundreelPath
            ? "/runtime-100/gx.png"
            : `/runtime100/${asset.path}`,
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
    expect(
      resolveProjectAssetUrls(runtime100, runtime100Manifest)[roundreelPath],
    ).toBe("/runtime-100/gx.png");
  });

  it("keeps the same asset.path distinct across three profile manifests", () => {
    const project = structuredClone(assertVNIProject(export2EditFullData));
    project.assets = [
      {
        ...project.assets[0],
        path: "assets/foo.png",
      },
    ];

    const editFullManifest = createAssetUrlManifest({
      "../assets/export2/bigwin/edit_full/assets/foo.png": "/edit/foo.png",
    });
    const runtime50Manifest = createAssetUrlManifest({
      "../assets/export2/bigwin/runtime_50/assets/foo.png":
        "/runtime-50/foo.png",
    });
    const runtime100Manifest = createAssetUrlManifest({
      "../assets/export/runtime_100/assets/foo.png": "/runtime-100/foo.png",
    });

    expect(resolveProjectAssetUrls(project, editFullManifest)).toMatchObject({
      "assets/foo.png": "/edit/foo.png",
    });
    expect(resolveProjectAssetUrls(project, runtime50Manifest)).toMatchObject({
      "assets/foo.png": "/runtime-50/foo.png",
    });
    expect(resolveProjectAssetUrls(project, runtime100Manifest)).toMatchObject({
      "assets/foo.png": "/runtime-100/foo.png",
    });
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
