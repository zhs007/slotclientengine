import { describe, expect, it } from "vitest";
import {
  createAssetUrlManifest,
  resolveProjectAssetUrls,
  rewriteVNIProjectAssetPaths,
} from "../../src/core/asset-manifest";
import { assertVNIProject } from "../../src/core/validation";
import bigwinData from "../fixtures/export/bigwin.json";
import roundreelData from "../fixtures/export/roundreel.json";

describe("asset-manifest", () => {
  it("normalizes vite module paths to V5G asset.path keys", () => {
    const manifest = createAssetUrlManifest({
      "../assets/assets/example.png": "/compiled/example.png",
    });

    expect(manifest["assets/example.png"]).toBe("/compiled/example.png");
  });

  it("keeps asset URLs scoped by independent manifests", () => {
    const runtime50 = assertVNIProject(bigwinData);
    const runtime100 = assertVNIProject(roundreelData);
    const sharedPath = "assets/bigwin_asset_image_mqgf7e6h_g.png";
    const roundreelPath = "assets/gx_6_asset_image_mqthi919_1e.png";
    const runtime50Manifest = createAssetUrlManifest(
      Object.fromEntries(
        runtime50.assets.map((asset) => [
          `../assets/export/${asset.path}`,
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
      resolveProjectAssetUrls(runtime50, runtime50Manifest)[sharedPath],
    ).toBe("/runtime-50/bigwin.png");
    expect(
      resolveProjectAssetUrls(runtime100, runtime100Manifest)[roundreelPath],
    ).toBe("/runtime-100/gx.png");
  });

  it("keeps the same asset.path distinct across three profile manifests", () => {
    const project = structuredClone(assertVNIProject(bigwinData));
    project.assets = [
      {
        ...project.assets[0],
        path: "assets/foo.png",
      },
    ];

    const editingManifest = createAssetUrlManifest({
      "../assets/editing/assets/foo.png": "/edit/foo.png",
    });
    const runtime50Manifest = createAssetUrlManifest({
      "../assets/runtime_50/assets/foo.png": "/runtime-50/foo.png",
    });
    const runtime100Manifest = createAssetUrlManifest({
      "../assets/runtime_100/assets/foo.png": "/runtime-100/foo.png",
    });

    expect(resolveProjectAssetUrls(project, editingManifest)).toMatchObject({
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
    const project = assertVNIProject(bigwinData);
    const modules = Object.fromEntries(
      project.assets.map((asset) => [
        `../assets/export/${asset.path}`,
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
    const project = assertVNIProject(bigwinData);
    expect(() => resolveProjectAssetUrls(project, {})).toThrow(
      "missing from manifest",
    );
  });

  it("rewrites only explicit asset refs without mutating the source", () => {
    const source = assertVNIProject(bigwinData);
    const original = source.assets[0]!.path;
    const rewritten = rewriteVNIProjectAssetPaths(
      source,
      (_path, id) => `assets/${id}.png`,
    );
    expect(rewritten.assets[0]!.path).toBe(
      `assets/${rewritten.assets[0]!.id}.png`,
    );
    expect(source.assets[0]!.path).toBe(original);
    expect(rewritten.layers).toEqual(source.layers);
  });
});
