import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bundledProjects,
  getBundledProject,
} from "../src/config/bundled-projects";
import {
  export2EditFullAssetUrlManifest,
  export2Runtime50AssetUrlManifest,
  game003S1AssetUrlManifest,
  legacyAssetUrlManifest,
  resolveProjectAssetUrls,
} from "../src/runtime/asset-manifest";

const GAME003_S1_WIN_PROJECTS = [
  {
    id: "game003-l1-wins",
    symbol: "L1",
    sourcePath: "assets/game003-s1/L1-wins.json",
    assetPath: "assets/j1_asset_image_mr1qgfc2_r.png",
  },
  {
    id: "game003-l2-wins",
    symbol: "L2",
    sourcePath: "assets/game003-s1/L2-wins.json",
    assetPath: "assets/k_asset_image_mr1qedmv_m.png",
  },
  {
    id: "game003-l3-wins",
    symbol: "L3",
    sourcePath: "assets/game003-s1/L3-wins.json",
    assetPath: "assets/q_asset_image_mr1qdnbi_h.png",
  },
  {
    id: "game003-l4-wins",
    symbol: "L4",
    sourcePath: "assets/game003-s1/L4-wins.json",
    assetPath: "assets/j_asset_image_mr1qc29b_c.png",
  },
  {
    id: "game003-l5-wins",
    symbol: "L5",
    sourcePath: "assets/game003-s1/L5-wins.json",
    assetPath: "assets/10_asset_image_mr1pfdqf_7.png",
  },
] as const;

describe("bundled projects", () => {
  it("keeps the full bundled VNI project list available", () => {
    expect(bundledProjects.map((project) => project.id)).toEqual([
      "project",
      "lock-01",
      "roundreel",
      "number2",
      "number3",
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
      "game003-l1-wins",
      "game003-l2-wins",
      "game003-l3-wins",
      "game003-l4-wins",
      "game003-l5-wins",
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

  it("registers roundreel as a VNI_0.022 runtime_100 export-style project", () => {
    const roundreel = getBundledProject("roundreel");
    const animationTypes = [
      ...new Set(
        roundreel.project.layers.flatMap((layer) =>
          layer.animations.map((animation) => animation.type),
        ),
      ),
    ];

    expect(roundreel.sourcePath).toBe("docs/anieditor5/export/roundreel.json");
    expect(roundreel.project.schemaVersion).toBe("VNI_0.022");
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
      expect.arrayContaining([
        "chaser_light",
        "safe_glow",
        "blink",
        "scale_out",
      ]),
    );
    expect(Object.keys(roundreel.assetUrls).sort()).toEqual(
      roundreel.project.assets.map((asset) => asset.path).sort(),
    );
  });

  it("registers number2 text and number3 mask exports", () => {
    const number2 = getBundledProject("number2");
    const number3 = getBundledProject("number3");

    expect(number2.sourcePath).toBe("docs/anieditor5/export/number2.json");
    expect(number2.project.schemaVersion).toBe("VNI_0.022");
    expect(number2.project.layers.some((layer) => layer.type === "text")).toBe(
      true,
    );
    expect(number2.profileId).toBe("runtime_100");
    expect(Object.keys(number2.assetUrls).sort()).toEqual(
      number2.project.assets.map((asset) => asset.path).sort(),
    );

    expect(number3.sourcePath).toBe("docs/anieditor5/export/number3.json");
    expect(number3.project.schemaVersion).toBe("VNI_0.036");
    expect(
      number3.project.layers.some(
        (layer) => layer.mask?.compositeMode === "precompose_light_alpha",
      ),
    ).toBe(true);
    expect(number3.profileId).toBe("runtime_100");
    expect(Object.keys(number3.assetUrls).sort()).toEqual(
      number3.project.assets.map((asset) => asset.path).sort(),
    );
  });

  it("registers game003 L1-L5 wins against the original game003-s1 asset pool", () => {
    for (const expected of GAME003_S1_WIN_PROJECTS) {
      const project = getBundledProject(expected.id);
      const resolved = resolveProjectAssetUrls(
        project.project,
        game003S1AssetUrlManifest,
      );

      expect(project.sourcePath).toBe(expected.sourcePath);
      expect(project.bundleId).toBe("game003-s1");
      expect(project.profileId).toBe("game003-s1");
      expect(project.purpose).toBe("runtime");
      expect(project.project.schemaVersion).toBe("VNI_0.022");
      expect(project.project.name).toBe(expected.symbol);
      expect(project.label).toContain(
        expected.sourcePath.replace("assets/", ""),
      );
      expect(Object.keys(project.assetUrls).sort()).toEqual(
        project.project.assets.map((asset) => asset.path).sort(),
      );
      expect(project.assetUrls).toEqual(resolved);
      expect(Object.keys(project.assetUrls).sort()).toEqual([
        expected.assetPath,
      ]);
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
