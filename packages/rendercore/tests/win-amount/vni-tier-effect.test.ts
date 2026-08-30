import { describe, expect, it } from "vitest";
import { createTestVniProject } from "../fixtures/artifact-fixtures.js";
import {
  createWinAmountAnimationTiersFromManifestModules,
  createWinAmountAnimationTiersFromModules,
  parseWinAmountAnimationManifest,
} from "../../src/win-amount/index.js";

const bigwinProject = createTestVniProject("big win0721");
const superwinProject = createTestVniProject("super win0721");
const megawinProject = createTestVniProject("mega win0721");
const winAmountManifest = {
  version: 1,
  kind: "vni-win-amount-tiers",
  projectGlob: "./{big_win0721,super_win0721,mega_win0721}.json",
  assetGlob: "./assets/*.{png,jpg,jpeg,webp}",
  tiers: [
    createTierManifest("bigwin", 15, "./big_win0721.json"),
    createTierManifest("superwin", 30, "./super_win0721.json"),
    createTierManifest("megawin", 50, "./mega_win0721.json"),
  ],
} as const;

describe("win amount VNI tier resources", () => {
  it("resolves tier projects and clones stage duration without mutating imports", () => {
    const bigwinProjectInput = structuredClone(bigwinProject);
    const superwinProjectInput = structuredClone(superwinProject);
    const megawinProjectInput = structuredClone(megawinProject);
    megawinProjectInput.stage.duration = 3.5;

    const tiers = createWinAmountAnimationTiersFromModules({
      tierConfigs: [
        createTierConfig("bigwin", 15, "./big_win0721.json"),
        createTierConfig("superwin", 30, "./super_win0721.json"),
        createTierConfig("megawin", 50, "./mega_win0721.json"),
      ],
      projectModules: {
        "/fixtures/big_win0721.json": bigwinProjectInput,
        "/fixtures/super_win0721.json": superwinProjectInput,
        "/fixtures/mega_win0721.json": megawinProjectInput,
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
      projectGlob: "./{big_win0721,super_win0721,mega_win0721}.json",
      assetGlob: "./assets/*.{png,jpg,jpeg,webp}",
    });
    expect(parsed.tiers.map((tier) => tier.playback.durationSeconds)).toEqual([
      2.9, 2.9, 2.9,
    ]);

    const tiers = createWinAmountAnimationTiersFromManifestModules({
      manifest: winAmountManifest,
      projectModules: {
        "/fixtures/big_win0721.json": bigwinProject,
        "/fixtures/super_win0721.json": superwinProject,
        "/fixtures/mega_win0721.json": megawinProject,
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
    expect(() =>
      parseWinAmountAnimationManifest({ ...winAmountManifest, version: 2 }),
    ).toThrow(/version must be 1/);
    expect(() =>
      parseWinAmountAnimationManifest({ ...winAmountManifest, kind: "other" }),
    ).toThrow(/kind must be/);
    expect(() =>
      parseWinAmountAnimationManifest({ ...winAmountManifest, tiers: [] }),
    ).toThrow(/non-empty array/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        assetGlob: "./*.webp",
      }),
    ).toThrow(/manifest-local win amount image assets/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          winAmountManifest.tiers[0],
          {
            ...winAmountManifest.tiers[1],
            id: winAmountManifest.tiers[0].id,
          },
        ],
        projectGlob: "./{big_win0721,super_win0721}.json",
      }),
    ).toThrow(/duplicate value/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          winAmountManifest.tiers[0],
          {
            ...winAmountManifest.tiers[1],
            thresholdMultiplier: 15,
          },
        ],
        projectGlob: "./{big_win0721,super_win0721}.json",
      }),
    ).toThrow(/strictly increasing/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [winAmountManifest.tiers[0]],
      }),
    ).toThrow(/must match exactly/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            playback: {
              ...winAmountManifest.tiers[0].playback,
              mode: "once",
            },
          },
        ],
        projectGlob: "./{big_win0721}.json",
      }),
    ).toThrow(/mode must be/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            playback: {
              ...winAmountManifest.tiers[0].playback,
              keepParticlesAlive: "yes",
            },
          },
        ],
        projectGlob: "./{big_win0721}.json",
      }),
    ).toThrow(/must be a boolean/);
    expect(() => parseWinAmountAnimationManifest(null)).toThrow(
      /must be an object/,
    );
    const { kind: _kind, ...missingKind } = winAmountManifest;
    expect(() => parseWinAmountAnimationManifest(missingKind)).toThrow(
      /missing field "kind"/,
    );
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            id: "",
          },
        ],
        projectGlob: "./{big_win0721}.json",
      }),
    ).toThrow(/non-empty string/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            thresholdMultiplier: 0,
          },
        ],
        projectGlob: "./{big_win0721}.json",
      }),
    ).toThrow(/finite positive number/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            project: "./super_win0721.json",
          },
        ],
        projectGlob: "./{big_win0721}.json",
      }),
    ).toThrow(/does not cover/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            project: "big_win0721.json",
          },
        ],
        projectGlob: "./{big_win0721}.json",
      }),
    ).toThrow(/must start with/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            project: "./../big_win0721.json",
          },
        ],
        projectGlob: "./{big_win0721}.json",
      }),
    ).toThrow(/must not contain/);
    expect(() =>
      parseWinAmountAnimationManifest({
        ...winAmountManifest,
        tiers: [
          {
            ...winAmountManifest.tiers[0],
            playback: {
              ...winAmountManifest.tiers[0].playback,
              loopStartTime: -1,
            },
          },
        ],
        projectGlob: "./{big_win0721}.json",
      }),
    ).toThrow(/finite non-negative number/);
  });

  it("fails fast for missing projects, duplicate basenames, and illegal timing", () => {
    const assetModules = createAssetModules([bigwinProject]);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [],
        projectModules: {},
        assetModules: {},
      }),
    ).toThrow(/must not be empty/);
    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [createTierConfig("bigwin", 15, "./big_win0721.json")],
        projectModules: { "/fixtures/big_win0721.json": bigwinProject },
        assetModules: {
          "/one/shared.webp": "/one.webp",
          "/two/shared.webp": "/two.webp",
        },
      }),
    ).toThrow(/Duplicate win amount VNI asset filename/);
    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          createTierConfig("bigwin", 15, "./big_win0721.json"),
          createTierConfig("superwin", 15, "./super_win0721.json"),
        ],
        projectModules: {
          "/fixtures/big_win0721.json": bigwinProject,
          "/fixtures/super_win0721.json": superwinProject,
        },
        assetModules: createAssetModules([bigwinProject, superwinProject]),
      }),
    ).toThrow(/strictly increasing/);

    const defaultKeepAlive = createTierConfig(
      "bigwin",
      15,
      "./big_win0721.json",
    );
    const { keepParticlesAlive: _keepParticlesAlive, ...withoutKeepAlive } =
      defaultKeepAlive;
    expect(
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [withoutKeepAlive],
        projectModules: { "/fixtures/big_win0721.json": bigwinProject },
        assetModules,
      })[0].keepParticlesAlive,
    ).toBe(true);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [createTierConfig("bigwin", 15, "./missing.json")],
        projectModules: {
          "/fixtures/big_win0721.json": bigwinProject,
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
            ...createTierConfig("bigwin", 15, "./big_win0721.json"),
            loopStartTime: -1,
          },
        ],
        projectModules: {
          "/fixtures/big_win0721.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/finite non-negative/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          {
            ...createTierConfig("bigwin", 15, "./big_win0721.json"),
            loopStartTime: 4,
            loopEndTime: 3,
          },
        ],
        projectModules: {
          "/fixtures/big_win0721.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/loopStartTime <= loopEndTime/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          {
            ...createTierConfig("bigwin", 15, "./big_win0721.json"),
            durationSeconds: 0,
          },
        ],
        projectModules: {
          "/fixtures/big_win0721.json": bigwinProject,
        },
        assetModules,
      }),
    ).toThrow(/durationSeconds/);

    expect(() =>
      createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          {
            ...createTierConfig("bigwin", 15, "./big_win0721.json"),
            durationSeconds: bigwinProject.stage.duration + 0.1,
          },
        ],
        projectModules: {
          "/fixtures/big_win0721.json": bigwinProject,
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

function createTierManifest(
  id: string,
  thresholdMultiplier: number,
  project: string,
) {
  return {
    id,
    thresholdMultiplier,
    project,
    playback: {
      mode: "segmented",
      durationSeconds: 2.9,
      loopStartTime: 1,
      loopEndTime: 2.5,
      keepParticlesAlive: true,
    },
  } as const;
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
      modules[`/fixtures/${filename}`] = `/generated/${filename}`;
    }
  }
  return modules;
}
