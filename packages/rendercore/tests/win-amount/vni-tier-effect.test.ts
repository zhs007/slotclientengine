import { describe, expect, it } from "vitest";
import bigwinProject from "../../../../assets/game003-s1/win-amount/bigwin.json";
import megawinProject from "../../../../assets/game003-s1/win-amount/megawin.json";
import superwinProject from "../../../../assets/game003-s1/win-amount/superwin.json";
import winAmountManifest from "../../../../assets/game003-s1/win-amount/win-amount.manifest.json";
import {
  createWinAmountAnimationTiersFromManifestModules,
  createWinAmountAnimationTiersFromModules,
  parseWinAmountAnimationManifest,
} from "../../src/win-amount/index.js";

describe("win amount VNI tier resources", () => {
  it("resolves tier projects and clones stage duration without mutating imports", () => {
    const bigwinProjectInput = structuredClone(bigwinProject);
    const superwinProjectInput = structuredClone(superwinProject);
    const megawinProjectInput = structuredClone(megawinProject);
    megawinProjectInput.stage.duration = 3.5;

    const tiers = createWinAmountAnimationTiersFromModules({
      tierConfigs: [
        createTierConfig("bigwin", 15, "./bigwin.json"),
        createTierConfig("superwin", 30, "./superwin.json"),
        createTierConfig("megawin", 50, "./megawin.json"),
      ],
      projectModules: {
        "/assets/game003-s1/win-amount/bigwin.json": bigwinProjectInput,
        "/assets/game003-s1/win-amount/superwin.json": superwinProjectInput,
        "/assets/game003-s1/win-amount/megawin.json": megawinProjectInput,
      },
      assetModules: createAssetModules([
        bigwinProjectInput,
        superwinProjectInput,
        megawinProjectInput,
      ]),
    });

    expect(tiers.map((tier) => tier.id)).toEqual([
      "bigwin",
      "superwin",
      "megawin",
    ]);
    expect(tiers[0].vniProject.stage.duration).toBe(2.9);
    expect(tiers[2].vniProject.stage.duration).toBe(2.9);
    expect(megawinProjectInput.stage.duration).toBe(3.5);
    expect(Object.keys(tiers[2].assetUrls)).toHaveLength(
      megawinProjectInput.assets.length,
    );
  });

  it("parses win amount manifests and resolves tiers through manifest modules", () => {
    const parsed = parseWinAmountAnimationManifest(winAmountManifest);

    expect(parsed).toMatchObject({
      version: 1,
      kind: "vni-win-amount-tiers",
      projectGlob: "./{bigwin,superwin,megawin}.json",
      assetGlob: "./assets/*.{png,jpg,jpeg,webp}",
    });
    expect(parsed.tiers.map((tier) => tier.playback.durationSeconds)).toEqual([
      2.9, 2.9, 2.9,
    ]);

    const tiers = createWinAmountAnimationTiersFromManifestModules({
      manifest: winAmountManifest,
      projectModules: {
        "/assets/game003-s1/win-amount/bigwin.json": bigwinProject,
        "/assets/game003-s1/win-amount/superwin.json": superwinProject,
        "/assets/game003-s1/win-amount/megawin.json": megawinProject,
      },
      assetModules: createAssetModules([
        bigwinProject,
        superwinProject,
        megawinProject,
      ]),
    });

    expect(tiers.map((tier) => tier.id)).toEqual([
      "bigwin",
      "superwin",
      "megawin",
    ]);
    expect(tiers.map((tier) => tier.loopEndTime)).toEqual([2.5, 2.5, 2.5]);
  });

  it("fails fast for malformed win amount manifests", () => {
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        extra: true,
      }),
    ).toThrow(/unknown field/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        projectGlob: "./*.json",
      }),
    ).toThrow(/brace JSON glob/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            playback: {
              ...winAmountManifest.tiers[0].playback,
              loopEndTime: 3,
            },
          },
        ],
      }),
    ).toThrow(/loopStartTime <= loopEndTime <= durationSeconds/);
  });

  it("fails fast for missing projects, duplicate basenames, and illegal timing", () => {
    const assetModules = createAssetModules([bigwinProject]);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [createTierConfig("bigwin", 15, "./missing.json")],
        projectModules: {
          "/assets/game003-s1/win-amount/bigwin.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/missing/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [createTierConfig("bigwin", 15, "./bigwin.json")],
        projectModules: {
          "/one/bigwin.json": bigwinProject,
          "/two/bigwin.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/Duplicate win amount VNI project filename/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          {
            ...createTierConfig("bigwin", 15, "./bigwin.json"),
            loopStartTime: -1,
          },
        ],
        projectModules: {
          "/assets/game003-s1/win-amount/bigwin.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/finite non-negative/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          {
            ...createTierConfig("bigwin", 15, "./bigwin.json"),
            loopStartTime: 4,
            loopEndTime: 3,
          },
        ],
        projectModules: {
          "/assets/game003-s1/win-amount/bigwin.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/loopStartTime <= loopEndTime/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          {
            ...createTierConfig("bigwin", 15, "./bigwin.json"),
            durationSeconds: 0,
          },
        ],
        projectModules: {
          "/assets/game003-s1/win-amount/bigwin.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/durationSeconds/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          {
            ...createTierConfig("bigwin", 15, "./bigwin.json"),
            durationSeconds: 3,
          },
        ],
        projectModules: {
          "/assets/game003-s1/win-amount/bigwin.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/project\.stage\.duration/);
  });
});

function createTierConfig(
  id: string,
  thresholdMultiplier: number,
  project: string,
) {
  return {
    id,
    thresholdMultiplier,
    project,
    durationSeconds: 2.9,
    loopStartTime: 1,
    loopEndTime: 2.5,
    keepParticlesAlive: true,
  };
}

function createAssetModules(
  projects: ReadonlyArray<{
    readonly assets: readonly { readonly path: string }[];
  }>,
): Record<string, string> {
  const modules: Record<string, string> = {};
  for (const project of projects) {
    for (const asset of project.assets) {
      const filename = asset.path.split("/").at(-1);
      if (!filename) {
        throw new Error(`bad fixture asset path ${asset.path}`);
      }
      modules[`/assets/game003-s1/win-amount/assets/${filename}`] =
        `/generated/${filename}`;
    }
  }
  return modules;
}
