import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bundledProjects,
  getBundledProject,
} from "../src/config/bundled-projects";
import {
  export2EditFullAssetUrlManifest,
  export2Runtime50AssetUrlManifest,
  legacyAssetUrlManifest,
  resolveProjectAssetUrls,
} from "../src/runtime/asset-manifest";

describe("bundled projects", () => {
  it("keeps the full bundled VNI project list available", () => {
    expect(bundledProjects.map((project) => project.id)).toEqual([
      "project",
      "lock-01",
      "roundreel",
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
      "3reel-multipay-01",
      "3reel-multipay-02",
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

  it("offers every asset from the current asset manifest for group insertion", () => {
    const threeReel = getBundledProject("3reel-multipay-01");
    const projectAssetPaths = new Set(
      threeReel.project.assets.map((asset) => asset.path),
    );

    expect(threeReel.insertionAssets.map((asset) => asset.path).sort()).toEqual(
      Object.keys(legacyAssetUrlManifest).sort(),
    );
    expect(threeReel.insertionAssets.length).toBeGreaterThan(
      threeReel.project.assets.length,
    );
    expect(
      threeReel.insertionAssets.find(
        (asset) => asset.path === "assets/image_asset_image_mqp31v5g_14.jpg",
      )?.projectAssetId,
    ).toBe("asset_image_mqp31v5g_14");

    const externalAsset = threeReel.insertionAssets.find(
      (asset) => !projectAssetPaths.has(asset.path),
    );
    expect(externalAsset).toBeDefined();
    expect(externalAsset).not.toHaveProperty("projectAssetId");

    const editFull = getBundledProject("bigwin-edit-full");
    expect(editFull.insertionAssets.map((asset) => asset.path).sort()).toEqual(
      Object.keys(export2EditFullAssetUrlManifest).sort(),
    );
  });

  it("registers lock_01 with safe_glow and all bundled insertion assets", () => {
    const lock01 = getBundledProject("lock-01");
    const animationTypes = [
      ...new Set(
        lock01.project.layers.flatMap((layer) =>
          layer.animations.map((animation) => animation.type),
        ),
      ),
    ];

    expect(lock01.project.schemaVersion).toBe("VNI_0.017");
    expect(animationTypes).toEqual(
      expect.arrayContaining(["safe_glow", "idle", "particle_twinkle"]),
    );
    expect(lock01.assetScale).toBe(1);
    expect(lock01.insertionAssets.map((asset) => asset.path)).toEqual(
      expect.arrayContaining([
        "assets/2_asset_image_mqqlcjh9_h.png",
        "assets/image_asset_image_mqp7sep7_i.png",
        "assets/image_asset_image_mqp7sgo9_k.png",
        "assets/image_asset_image_mqp7sii7_m.png",
        "assets/image_asset_image_mqp7sjxy_o.png",
        "assets/image_asset_image_mqs1j1mw_g.png",
        "assets/image_asset_image_mqs1pl10_h.png",
      ]),
    );
  });

  it("registers roundreel as a VNI_0.020 runtime_100 export-style project", () => {
    const roundreel = getBundledProject("roundreel");
    const animationTypes = [
      ...new Set(
        roundreel.project.layers.flatMap((layer) =>
          layer.animations.map((animation) => animation.type),
        ),
      ),
    ];

    expect(roundreel.sourcePath).toBe("docs/anieditor5/export/roundreel.json");
    expect(roundreel.project.schemaVersion).toBe("VNI_0.020");
    expect(roundreel.project.exportProfile).toMatchObject({
      id: "runtime_100",
      purpose: "runtime",
      assetScale: 1,
    });
    expect(roundreel.profileId).toBe("runtime_100");
    expect(roundreel.profileId).toBe(roundreel.project.exportProfile?.id);
    expect(roundreel.purpose).toBe("runtime");
    expect(roundreel.purpose).toBe(roundreel.project.exportProfile?.purpose);
    expect(roundreel.assetScale).toBe(1);
    expect(roundreel.assetScale).toBe(
      roundreel.project.exportProfile?.assetScale,
    );
    expect(roundreel.project.layers.map((layer) => layer.blendMode)).toContain(
      "add",
    );
    expect(animationTypes).toEqual(
      expect.arrayContaining(["rotate", "safe_glow", "blink", "scale_out"]),
    );
    expect(Object.keys(roundreel.assetUrls).sort()).toEqual(
      roundreel.project.assets.map((asset) => asset.path).sort(),
    );
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
