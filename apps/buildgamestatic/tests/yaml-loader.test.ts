import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadGameStaticYamlConfig,
  parseGameStaticYamlValue,
} from "../src/yaml-loader.js";

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots = [];
});

describe("buildgamestatic YAML loader", () => {
  it("rejects unknown fields and unsupported reel kinds", () => {
    expect(() =>
      parseGameStaticYamlValue(
        { ...createYamlObject(), extra: true },
        { rootDir: createFixtureRoot(), inputPath: "game.yaml" },
      ),
    ).toThrow(/未知字段 "extra"/);

    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          reel: { ...createYamlObject().reel, kind: "grid-cell" },
        },
        { rootDir: createFixtureRoot(), inputPath: "game.yaml" },
      ),
    ).toThrow(/只支持 reel.kind=normal/);
  });

  it("rejects invalid scalar values before generation", () => {
    const root = createFixtureRoot();
    const cases: Array<readonly [unknown, RegExp]> = [
      [{ ...createYamlObject(), schemaVersion: 2 }, /schemaVersion/],
      [
        {
          ...createYamlObject(),
          live: { ...createYamlObject().live, serverUrl: "https://bad.test" },
        },
        /ws:\/\/ 或 wss:\/\//,
      ],
      [
        { ...createYamlObject(), supportedSkins: ["1", "1"] },
        /supportedSkins 包含重复值/,
      ],
      [
        {
          ...createYamlObject(),
          reel: { ...createYamlObject().reel, direction: "sideways" },
        },
        /reel.direction/,
      ],
      [
        {
          ...createYamlObject(),
          reel: { ...createYamlObject().reel, reelCount: 0 },
        },
        /reel.reelCount 必须是正整数/,
      ],
      [
        {
          ...createYamlObject(),
          reel: { ...createYamlObject().reel, startDelayMs: -1 },
        },
        /reel.startDelayMs 必须是有限非负数/,
      ],
      [
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              symbols: {
                ...createYamlObject().skins["1"].symbols,
                requireExplicitScale: "yes",
              },
            },
          },
        },
        /requireExplicitScale/,
      ],
      [
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              symbols: {
                ...createYamlObject().skins["1"].symbols,
                requiredStates: ["spinBlur", "spinBlur"],
              },
            },
          },
        },
        /requiredStates 包含重复值/,
      ],
      [
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              art: {
                ...createYamlObject().skins["1"].art,
                [["scenePart", "Gap"].join("")]: 10,
              },
            },
          },
        },
        new RegExp(["scenePart", "Gap"].join("")),
      ],
      [
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              art: {
                ...createYamlObject().skins["1"].art,
                reelAreaInMainReelBackground: {
                  ...createYamlObject().skins["1"].art
                    .reelAreaInMainReelBackground,
                  width: 885,
                },
              },
            },
          },
        },
        /reelAreaInMainReelBackground.*width/,
      ],
      [
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              art: {
                ...createYamlObject().skins["1"].art,
                variants: {
                  ...createYamlObject().skins["1"].art.variants,
                  landscape: {
                    ...createYamlObject().skins["1"].art.variants.landscape,
                    conveyor: {
                      ...createYamlObject().skins["1"].art.variants.landscape
                        .conveyor,
                      placement: "legacy-placement",
                    },
                  },
                },
              },
            },
          },
        },
        /placement/,
      ],
      [
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              art: {
                ...createYamlObject().skins["1"].art,
                variants: {
                  ...createYamlObject().skins["1"].art.variants,
                  landscape: {
                    ...createYamlObject().skins["1"].art.variants.landscape,
                    mainReelBackgroundPositionInFocusRect: {
                      x: 900,
                      y: 0,
                    },
                  },
                },
              },
            },
          },
        },
        /mainReelBackgroundPositionInFocusRect/,
      ],
    ];

    for (const [value, pattern] of cases) {
      expect(() =>
        parseGameStaticYamlValue(value, {
          rootDir: root,
          inputPath: "game.yaml",
        }),
      ).toThrow(pattern);
    }
  });

  it("rejects missing referenced files and invalid path shapes", () => {
    const root = createFixtureRoot();
    writeFileSync(
      join(root, "apps/game003/config/game-static.yaml"),
      createYamlText({ gameConfig: "assets/missing.json" }),
      "utf8",
    );

    expect(() =>
      loadGameStaticYamlConfig({
        rootDir: root,
        inputPath: "apps/game003/config/game-static.yaml",
      }),
    ).toThrow(/引用文件不存在/);

    expect(() =>
      parseGameStaticYamlValue(
        { ...createYamlObject(), gameConfig: "../bad.json" },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/不能包含/);
  });

  it("loads a valid YAML fixture with comments ignored", () => {
    const root = createFixtureRoot();
    writeFileSync(
      join(root, "apps/game003/config/game-static.yaml"),
      createYamlText(),
      "utf8",
    );

    const config = loadGameStaticYamlConfig({
      rootDir: root,
      inputPath: "apps/game003/config/game-static.yaml",
    });

    expect(config.gameId).toBe("game003");
    expect(config.skins["1"].art.variants.portrait.minFocusMargin).toEqual({
      left: 22,
      right: 22,
    });
  });

  it("allows skin-level appExtensions while preserving skin field validation", () => {
    const root = createFixtureRoot();
    const config = parseGameStaticYamlValue(
      {
        ...createYamlObject(),
        skins: {
          "1": {
            ...createYamlObject().skins["1"],
            appExtensions: {
              customFeature: {
                enabled: true,
                offset: { x: 12, y: 24 },
              },
            },
          },
        },
      },
      { rootDir: root, inputPath: "game.yaml" },
    );

    expect(config.skins["1"].appExtensions).toEqual({
      customFeature: {
        enabled: true,
        offset: { x: 12, y: 24 },
      },
    });
    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              appExtensions: null,
            },
          },
        },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/appExtensions 必须是对象/);
    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              appExtensions: [],
            },
          },
        },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/appExtensions 必须是对象/);
    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              appExtensions: {},
              extra: true,
            },
          },
        },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/未知字段 "extra"/);
  });

  it("validates loading resources when present", () => {
    const root = createFixtureRoot();
    const config = parseGameStaticYamlValue(
      {
        ...createYamlObject(),
        loading: {
          resources: [
            {
              id: "game003-bg-landscape",
              path: "assets/game003-s1/bg1.jpg",
              weight: 8,
            },
            {
              id: "game003-scene-parts",
              glob: "assets/game003-s1/{conveyor1,conveyor2,mainreelbg}.png",
              weight: 6,
            },
          ],
        },
      },
      { rootDir: root, inputPath: "game.yaml" },
    );

    expect(config.loading?.resources).toHaveLength(2);
    expect(config.loading?.resources[1]).toMatchObject({
      id: "game003-scene-parts",
      weight: 6,
    });

    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          loading: {
            resources: [
              { id: "dup", path: "assets/game003-s1/bg1.jpg" },
              { id: "dup", path: "assets/game003-s1/bg2.jpg" },
            ],
          },
        },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/重复值/);
    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          loading: {
            resources: [
              {
                id: "bad",
                path: "assets/game003-s1/bg1.jpg",
                glob: "assets/game003-s1/{bg1}.jpg",
              },
            ],
          },
        },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/只能提供 path 或 glob/);
    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          loading: {
            resources: [{ id: "wide", glob: "assets/game003-s1/*.png" }],
          },
        },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/宽泛 \*\.png glob/);
  });

  it("validates optional feature bars with explicit conveyor slot rects", () => {
    const root = createFixtureRoot();
    const valid = parseGameStaticYamlValue(
      withFeatureBars(createYamlObject()),
      {
        rootDir: root,
        inputPath: "game.yaml",
      },
    );

    expect(valid.skins["1"].featureBars?.featureTrack).toMatchObject({
      componentName: "feature-track",
      queueLength: 5,
      visibleCount: 4,
      terminalSlotIndex: 4,
      emptyFeature: "empty",
      symbols: {
        manifest: "assets/game003-s1/feature-bar-symbols.manifest.json",
        pngGlob: "assets/game003-s1/{bonus,boost}.png",
        requiredStates: [],
      },
      layout: {
        landscape: {
          movement: "down",
          slotRectsInConveyor: expect.arrayContaining([
            { x: 56, y: 601, width: 172, height: 158 },
          ]),
        },
        portrait: {
          movement: "right",
          slotRectsInConveyor: expect.arrayContaining([
            { x: 681, y: 35, width: 172, height: 158 },
          ]),
        },
      },
    });

    expect(() =>
      parseGameStaticYamlValue(
        withFeatureBars(createYamlObject(), {
          layout: {
            ...createFeatureBarObject().layout,
            landscape: {
              ...createFeatureBarObject().layout.landscape,
              slotRectsInConveyor: [{ x: 56, y: 72, width: 172, height: 158 }],
            },
          },
        }),
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/slotRectsInConveyor 长度/);

    expect(() =>
      parseGameStaticYamlValue(
        withFeatureBars(createYamlObject(), {
          layout: {
            ...createFeatureBarObject().layout,
            portrait: {
              ...createFeatureBarObject().layout.portrait,
              slotRectsInConveyor: [
                { x: 49, y: 35, width: 172, height: 158 },
                { x: 207, y: 35, width: 172, height: 158 },
                { x: 365, y: 35, width: 172, height: 158 },
                { x: 523, y: 35, width: 172, height: 158 },
                { x: 800, y: 35, width: 172, height: 158 },
              ],
            },
          },
        }),
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/slotRectsInConveyor\[4\]/);
  });

  it("validates optional VNI symbol animation globs", () => {
    const root = createFixtureRoot();
    const valid = parseGameStaticYamlValue(
      {
        ...createYamlObject(),
        skins: {
          "1": {
            ...createYamlObject().skins["1"],
            symbols: {
              ...createYamlObject().skins["1"].symbols,
              vniProjectGlob: "assets/game003-s1/*-wins.json",
              vniAssetGlob: "assets/game003-s1/assets/*.{png,jpg,jpeg,webp}",
            },
          },
        },
      },
      { rootDir: root, inputPath: "game.yaml" },
    );

    expect(valid.skins["1"].symbols).toMatchObject({
      vniProjectGlob: "assets/game003-s1/*-wins.json",
      vniAssetGlob: "assets/game003-s1/assets/*.{png,jpg,jpeg,webp}",
    });

    for (const [field, value, pattern] of [
      ["vniProjectGlob", "assets/**/*.json", /递归 glob/],
      ["vniProjectGlob", "assets/game003-s1/*.txt", /JSON glob/],
      ["vniProjectGlob", "assets/*-wins.json", /仓库根级目录/],
      ["vniAssetGlob", "assets/game003-s1/assets/*.{png,gif}", /图片资源/],
      [
        "vniAssetGlob",
        "assets/game003-s1/assets/**/*.{png,jpg,jpeg,webp}",
        /递归 glob/,
      ],
      ["vniAssetGlob", "assets/*.{png,jpg,jpeg,webp}", /仓库根级目录/],
    ] as const) {
      expect(() =>
        parseGameStaticYamlValue(
          {
            ...createYamlObject(),
            skins: {
              "1": {
                ...createYamlObject().skins["1"],
                symbols: {
                  ...createYamlObject().skins["1"].symbols,
                  [field]: value,
                },
              },
            },
          },
          { rootDir: root, inputPath: "game.yaml" },
        ),
      ).toThrow(pattern);
    }
  });

  it("validates optional Spine symbol animation globs as an all-or-nothing resource set", () => {
    const root = createFixtureRoot();
    const valid = parseGameStaticYamlValue(
      {
        ...createYamlObject(),
        skins: {
          "1": {
            ...createYamlObject().skins["1"],
            symbols: {
              ...createYamlObject().skins["1"].symbols,
              spineSkeletonGlob: "assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json",
              spineAtlasGlob: "assets/game003-s1/{Symbol}.atlas",
              spineTextureGlob: "assets/game003-s1/{Symbol}.png",
            },
          },
        },
      },
      { rootDir: root, inputPath: "game.yaml" },
    );

    expect(valid.skins["1"].symbols).toMatchObject({
      spineSkeletonGlob: "assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json",
      spineAtlasGlob: "assets/game003-s1/{Symbol}.atlas",
      spineTextureGlob: "assets/game003-s1/{Symbol}.png",
    });

    expect(() =>
      parseGameStaticYamlValue(
        {
          ...createYamlObject(),
          skins: {
            "1": {
              ...createYamlObject().skins["1"],
              symbols: {
                ...createYamlObject().skins["1"].symbols,
                spineSkeletonGlob: "assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json",
              },
            },
          },
        },
        { rootDir: root, inputPath: "game.yaml" },
      ),
    ).toThrow(/必须同时配置/);

    for (const [field, value, pattern] of [
      ["spineSkeletonGlob", "assets/**/*.json", /递归 glob/],
      ["spineSkeletonGlob", "assets/game003-s1/*.json", /brace JSON glob/],
      ["spineSkeletonGlob", "assets/*.{json}", /仓库根级目录/],
      ["spineAtlasGlob", "assets/game003-s1/*.atlas", /brace atlas glob/],
      ["spineAtlasGlob", "assets/game003-s1/{Symbol}.json", /brace atlas glob/],
      ["spineTextureGlob", "assets/game003-s1/*.png", /brace PNG glob/],
      ["spineTextureGlob", "assets/game003-s1/{Symbol}.jpg", /brace PNG glob/],
    ] as const) {
      expect(() =>
        parseGameStaticYamlValue(
          {
            ...createYamlObject(),
            skins: {
              "1": {
                ...createYamlObject().skins["1"],
                symbols: {
                  ...createYamlObject().skins["1"].symbols,
                  spineSkeletonGlob:
                    "assets/game003-s1/{WL,H1,H2,H3,H4,H5}.json",
                  spineAtlasGlob: "assets/game003-s1/{Symbol}.atlas",
                  spineTextureGlob: "assets/game003-s1/{Symbol}.png",
                  [field]: value,
                },
              },
            },
          },
          { rootDir: root, inputPath: "game.yaml" },
        ),
      ).toThrow(pattern);
    }
  });

  it("validates win amount animation config and project duration", () => {
    const root = createFixtureRoot();
    writeWinAmountFixtureFiles(root);
    const valid = parseGameStaticYamlValue(withWinAmount(createYamlObject()), {
      rootDir: root,
      inputPath: "game.yaml",
    });

    expect(valid.skins["1"].winAmount).toMatchObject({
      amountScale: 100,
      minorCountDurationSeconds: 1.5,
      animations: {
        projectGlob:
          "assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json",
      },
    });

    for (const [patch, pattern] of [
      [
        {
          thresholds: {
            minorMultiplier: 1,
            bigMultiplier: 15,
            superMultiplier: 10,
            megaMultiplier: 50,
          },
        },
        /严格递增/,
      ],
      [
        {
          animations: {
            ...createWinAmountObject().animations,
            tiers: [
              {
                ...createWinAmountObject().animations.tiers[0],
                durationSeconds: 4,
              },
            ],
          },
        },
        /至少为 5 秒/,
      ],
      [
        {
          animations: {
            ...createWinAmountObject().animations,
            tiers: [
              {
                ...createWinAmountObject().animations.tiers[0],
                durationSeconds: 6,
              },
            ],
          },
        },
        /project\.stage\.duration/,
      ],
      [
        {
          animations: {
            ...createWinAmountObject().animations,
            projectGlob: "assets/game003-s1/win-amount/**/*.json",
          },
        },
        /递归 glob/,
      ],
      [
        {
          animations: {
            ...createWinAmountObject().animations,
            tiers: [
              {
                ...createWinAmountObject().animations.tiers[0],
                project: "../bigwin.json",
              },
            ],
          },
        },
        /filename\.json/,
      ],
    ] as const) {
      expect(() =>
        parseGameStaticYamlValue(withWinAmount(createYamlObject(), patch), {
          rootDir: root,
          inputPath: "game.yaml",
        }),
      ).toThrow(pattern);
    }
  });
});

function createFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "buildgamestatic-yaml-"));
  roots.push(root);
  for (const dir of [
    "apps/game003/config",
    "assets/gamecfg003",
    "assets/game003-s1",
    "assets/game003-s1/assets",
    "assets/game003-s1/win-amount",
    "assets/game003-s1/win-amount/assets",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  for (const file of [
    "assets/gamecfg003/gameconfig.json",
    "assets/game003-s1/symbol-state-textures.manifest.json",
    "assets/game003-s1/feature-bar-symbols.manifest.json",
    "assets/game003-s1/bonus.png",
    "assets/game003-s1/boost.png",
    "assets/game003-s1/bg1.jpg",
    "assets/game003-s1/bg2.jpg",
    "assets/game003-s1/mainreelbg.png",
    "assets/game003-s1/conveyor1.png",
    "assets/game003-s1/conveyor2.png",
    "assets/game003-s1/minecart.png",
  ]) {
    writeFileSync(join(root, file), "{}", "utf8");
  }
  return root;
}

function withFeatureBars(
  value: ReturnType<typeof createYamlObject>,
  patch: Partial<ReturnType<typeof createFeatureBarObject>> = {},
) {
  return {
    ...value,
    skins: {
      "1": {
        ...value.skins["1"],
        featureBars: {
          featureTrack: {
            ...createFeatureBarObject(),
            ...patch,
          },
        },
      },
    },
  };
}

function createFeatureBarObject() {
  return {
    componentName: "feature-track",
    queueLength: 5,
    visibleCount: 4,
    terminalSlotIndex: 4,
    emptyFeature: "empty",
    allowedFeatures: ["empty", "bonus", "boost"],
    symbols: {
      manifest: "assets/game003-s1/feature-bar-symbols.manifest.json",
      pngGlob: "assets/game003-s1/{bonus,boost}.png",
      requireExplicitScale: true,
      requiredStates: [],
    },
    layout: {
      landscape: {
        movement: "down",
        slotRectsInConveyor: [
          { x: 56, y: 72, width: 172, height: 158 },
          { x: 56, y: 204, width: 172, height: 158 },
          { x: 56, y: 336, width: 172, height: 158 },
          { x: 56, y: 468, width: 172, height: 158 },
          { x: 56, y: 601, width: 172, height: 158 },
        ],
      },
      portrait: {
        movement: "right",
        slotRectsInConveyor: [
          { x: 49, y: 35, width: 172, height: 158 },
          { x: 207, y: 35, width: 172, height: 158 },
          { x: 365, y: 35, width: 172, height: 158 },
          { x: 523, y: 35, width: 172, height: 158 },
          { x: 681, y: 35, width: 172, height: 158 },
        ],
      },
    },
  };
}

function writeWinAmountFixtureFiles(root: string): void {
  for (const file of ["bigwin.json", "superwin.json", "megawin.json"]) {
    writeFileSync(
      join(root, `assets/game003-s1/win-amount/${file}`),
      JSON.stringify({ stage: { duration: file === "megawin.json" ? 10 : 5 } }),
      "utf8",
    );
  }
}

function createYamlObject() {
  return {
    schemaVersion: 1,
    gameId: "game003",
    brandLabel: "game003",
    live: {
      serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
      gamecode: "EfedJuHEaydXNghnmO9KI",
      rejectQueryParams: ["serverUrl"],
    },
    supportedSkins: ["1"],
    gameConfig: "assets/gamecfg003/gameconfig.json",
    reel: {
      kind: "normal",
      reelsName: "bg-reel01",
      reelCount: 5,
      visibleRows: 5,
      direction: "forward",
      minimumSpinCycles: 8,
      baseDurationMs: 1300,
      speedSymbolsPerSecond: 44,
      startDelayMs: 80,
      stopDelayMs: 120,
    },
    skins: {
      "1": {
        label: "skin 1",
        symbols: {
          manifest: "assets/game003-s1/symbol-state-textures.manifest.json",
          pngGlob: "assets/game003-s1/*.png",
          emptySymbols: [],
          requireExplicitScale: true,
          requiredStates: ["spinBlur", "disabled"],
        },
        art: {
          mode: "orientation-focus",
          variants: {
            landscape: {
              background: {
                path: "assets/game003-s1/bg1.jpg",
                width: 2000,
                height: 2000,
              },
              focusRect: { x: 288, y: 588, width: 1424, height: 824 },
              frameFocusRect: { width: 1424, height: 1061 },
              mainReelBackgroundPositionInFocusRect: { x: 294, y: -10 },
              conveyor: {
                path: "assets/game003-s1/conveyor1.png",
                width: 284,
                height: 775,
                positionInFocusRect: { x: 0, y: 14.5 },
              },
            },
            portrait: {
              background: {
                path: "assets/game003-s1/bg2.jpg",
                width: 1174,
                height: 2000,
              },
              focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 },
              frameFocusRect: { width: 1130, height: 1061 },
              minFocusMargin: { left: 22, right: 22 },
              mainReelBackgroundPositionInFocusRect: { x: 0, y: 147 },
              conveyor: {
                path: "assets/game003-s1/conveyor2.png",
                width: 934,
                height: 227,
                positionInFocusRect: { x: 98, y: -80 },
              },
            },
          },
          mainReelBackground: {
            path: "assets/game003-s1/mainreelbg.png",
            width: 1130,
            height: 824,
          },
          reelAreaInMainReelBackground: {
            x: 124,
            y: 130,
            reelCount: 5,
            reelGap: 15,
            cellWidth: 165,
            cellHeight: 130,
          },
        },
      },
    },
  };
}

function withWinAmount(
  value: ReturnType<typeof createYamlObject>,
  patch: Partial<ReturnType<typeof createWinAmountObject>> = {},
) {
  return {
    ...value,
    skins: {
      "1": {
        ...value.skins["1"],
        winAmount: {
          ...createWinAmountObject(),
          ...patch,
        },
      },
    },
  };
}

function createWinAmountObject() {
  return {
    amountScale: 100,
    currency: "USD",
    locale: "en-US",
    minorCountDurationSeconds: 1.5,
    majorCountDurationSeconds: 3,
    thresholds: {
      minorMultiplier: 1,
      bigMultiplier: 15,
      superMultiplier: 30,
      megaMultiplier: 50,
    },
    text: {
      minorFontSize: 54,
      majorFontSize: 118,
      fill: "#fff7d6",
      stroke: "#5a2500",
      strokeWidth: 8,
    },
    layout: {
      minorAnchor: "reel-area-bottom-center",
      majorAnchor: "reel-area-center",
      minorOffset: { x: 0, y: -28 },
      majorOffset: { x: 0, y: 0 },
    },
    animations: {
      projectGlob:
        "assets/game003-s1/win-amount/{bigwin,superwin,megawin}.json",
      assetGlob: "assets/game003-s1/win-amount/assets/*.{png,jpg,jpeg,webp}",
      tiers: [
        {
          id: "bigwin",
          thresholdMultiplier: 15,
          project: "./bigwin.json",
          durationSeconds: 5,
          loopStartTime: 1,
          loopEndTime: 4,
          keepParticlesAlive: true,
        },
        {
          id: "superwin",
          thresholdMultiplier: 30,
          project: "./superwin.json",
          durationSeconds: 5,
          loopStartTime: 1,
          loopEndTime: 4,
          keepParticlesAlive: true,
        },
        {
          id: "megawin",
          thresholdMultiplier: 50,
          project: "./megawin.json",
          durationSeconds: 5,
          loopStartTime: 1,
          loopEndTime: 4,
          keepParticlesAlive: true,
        },
      ],
    },
  };
}

function createYamlText(overrides: Record<string, string> = {}): string {
  return `# 人工注释不会参与程序语义
schemaVersion: 1
gameId: game003
brandLabel: game003
live:
  serverUrl: wss://gameserv.rgstest.slammerstudios.com/
  gamecode: EfedJuHEaydXNghnmO9KI
  rejectQueryParams:
    - serverUrl
supportedSkins:
  - "1"
gameConfig: ${overrides.gameConfig ?? "assets/gamecfg003/gameconfig.json"}
reel:
  kind: normal
  reelsName: bg-reel01
  reelCount: 5
  visibleRows: 5
  direction: forward
  minimumSpinCycles: 8
  baseDurationMs: 1300
  speedSymbolsPerSecond: 44
  startDelayMs: 80
  stopDelayMs: 120
skins:
  "1":
    label: skin 1
    symbols:
      manifest: assets/game003-s1/symbol-state-textures.manifest.json
      pngGlob: assets/game003-s1/*.png
      emptySymbols: []
      requireExplicitScale: true
      requiredStates:
        - spinBlur
        - disabled
    art:
      mode: orientation-focus
      variants:
        landscape:
          background:
            path: assets/game003-s1/bg1.jpg
            width: 2000
            height: 2000
          focusRect: { x: 288, y: 588, width: 1424, height: 824 }
          frameFocusRect: { width: 1424, height: 1061 }
          mainReelBackgroundPositionInFocusRect: { x: 294, y: -10 }
          conveyor:
            path: assets/game003-s1/conveyor1.png
            width: 284
            height: 775
            positionInFocusRect: { x: 0, y: 14.5 }
        portrait:
          background:
            path: assets/game003-s1/bg2.jpg
            width: 1174
            height: 2000
          focusRect: { x: 22, y: 469.5, width: 1130, height: 1061 }
          frameFocusRect: { width: 1130, height: 1061 }
          minFocusMargin: { left: 22, right: 22 }
          mainReelBackgroundPositionInFocusRect: { x: 0, y: 147 }
          conveyor:
            path: assets/game003-s1/conveyor2.png
            width: 934
            height: 227
            positionInFocusRect: { x: 98, y: -80 }
      mainReelBackground:
        path: assets/game003-s1/mainreelbg.png
        width: 1130
        height: 824
      reelAreaInMainReelBackground:
        x: 124
        y: 130
        reelCount: 5
        reelGap: 15
        cellWidth: 165
        cellHeight: 130
`;
}
