import { describe, expect, it } from "vitest";
import bigwinProject from "../../../../assets/game003-s1/win-amount/bigwin.json";
import megawinProject from "../../../../assets/game003-s1/win-amount/megawin.json";
import superwinProject from "../../../../assets/game003-s1/win-amount/superwin.json";
import { createWinAmountAnimationTiersFromModules } from "../../src/win-amount/index.js";

describe("win amount VNI tier resources", () => {
  it("resolves tier projects and clones stage duration without mutating imports", () => {
    const bigwinProjectInput = structuredClone(bigwinProject);
    const superwinProjectInput = structuredClone(superwinProject);
    const megawinProjectInput = structuredClone(megawinProject);
    megawinProjectInput.stage.duration = 10;

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
    expect(tiers[0].vniProject.stage.duration).toBe(5);
    expect(tiers[2].vniProject.stage.duration).toBe(5);
    expect(megawinProjectInput.stage.duration).toBe(10);
    expect(Object.keys(tiers[2].assetUrls)).toHaveLength(
      megawinProjectInput.assets.length,
    );
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
            durationSeconds: 4,
          },
        ],
        projectModules: {
          "/assets/game003-s1/win-amount/bigwin.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/at least 5 seconds/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          {
            ...createTierConfig("bigwin", 15, "./bigwin.json"),
            durationSeconds: 6,
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
    durationSeconds: 5,
    loopStartTime: 1,
    loopEndTime: 4,
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
