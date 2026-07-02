import { describe, expect, it } from "vitest";
import {
  assertNoRejectedQueryParams,
  assertSlotGameStaticConfig,
  createSlotGameFramePolicyFromStaticConfig,
  getSlotGameStaticSkin,
  parseSlotGameStaticSkinId,
  type SlotGameStaticConfig,
} from "../src/static-config/index.js";

describe("slot game static config", () => {
  it("validates a browser-safe static game config and creates frame policy", () => {
    const config = createValidConfig();

    expect(() => assertSlotGameStaticConfig(config)).not.toThrow();
    expect(getSlotGameStaticSkin(config, "1").label).toBe("skin 1");
    expect(parseSlotGameStaticSkinId(config, "1")).toBe("1");
    expect(() => parseSlotGameStaticSkinId(config, "2")).toThrow(/one of: 1/);
    expect(
      createSlotGameFramePolicyFromStaticConfig(config, "1"),
    ).toMatchObject({
      mode: "orientation-focus",
      variants: {
        landscape: {
          maxDesignSize: { width: 2000, height: 2000 },
          focusRect: { width: 1424, height: 1061 },
        },
        portrait: {
          maxDesignSize: { width: 1174, height: 2000 },
          focusRect: { width: 1130, height: 1061 },
          minFocusMargin: { left: 22, right: 22 },
        },
      },
    });
  });

  it("rejects query parameters declared by the static live config", () => {
    const params = new URLSearchParams("serverUrl=wss%3A%2F%2Fold.test%2F");

    expect(() => assertNoRejectedQueryParams(params, ["serverUrl"])).toThrow(
      /serverUrl query parameter is not supported/,
    );
    expect(() =>
      assertNoRejectedQueryParams(new URLSearchParams("gamecode=OK"), [
        "serverUrl",
      ]),
    ).not.toThrow();
  });

  it("fails fast for unknown fields, illegal URLs and missing variants", () => {
    expect(() =>
      assertSlotGameStaticConfig({ ...createValidConfig(), extra: true }),
    ).toThrow(/unknown field "extra"/);
    expect(() =>
      assertSlotGameStaticConfig({
        ...createValidConfig(),
        live: { ...createValidConfig().live, serverUrl: "https://bad.test" },
      }),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      assertSlotGameStaticConfig({
        ...createValidConfig(),
        skins: {
          "1": {
            ...createValidConfig().skins["1"],
            art: {
              ...createValidConfig().skins["1"].art,
              variants: {
                landscape:
                  createValidConfig().skins["1"].art.variants.landscape,
              },
            },
          },
        },
      }),
    ).toThrow(/variants.portrait is required/);
  });

  it("fails fast for invalid focus rects and reel dimensions", () => {
    expect(() =>
      assertSlotGameStaticConfig({
        ...createValidConfig(),
        skins: {
          "1": {
            ...createValidConfig().skins["1"],
            art: {
              ...createValidConfig().skins["1"].art,
              variants: {
                ...createValidConfig().skins["1"].art.variants,
                portrait: {
                  ...createValidConfig().skins["1"].art.variants.portrait,
                  focusRect: { x: 1000, y: 0, width: 500, height: 100 },
                },
              },
            },
          },
        },
      }),
    ).toThrow(/focusRect must fit/);

    expect(() =>
      assertSlotGameStaticConfig({
        ...createValidConfig(),
        skins: {
          "1": {
            ...createValidConfig().skins["1"],
            art: {
              ...createValidConfig().skins["1"].art,
              reelAreaInMainReelBackground: {
                x: 124,
                y: 130,
                width: 885,
                height: 650,
                reelCount: 6,
                reelGap: 15,
                cellWidth: 165,
                cellHeight: 130,
              },
            },
          },
        },
      }),
    ).toThrow(/reelCount must match reel.reelCount/);
  });

  it("validates focus-relative scene part positions without requiring conveyor", () => {
    const config = createValidConfig();

    expect(() =>
      assertSlotGameStaticConfig({
        ...config,
        skins: {
          "1": {
            ...config.skins["1"],
            art: {
              ...config.skins["1"].art,
              variants: {
                landscape: {
                  ...config.skins["1"].art.variants.landscape,
                  conveyor: undefined,
                },
                portrait: {
                  ...config.skins["1"].art.variants.portrait,
                  conveyor: undefined,
                },
              },
            },
          },
        },
      }),
    ).not.toThrow();

    expect(() =>
      assertSlotGameStaticConfig({
        ...config,
        skins: {
          "1": {
            ...config.skins["1"],
            art: {
              ...config.skins["1"].art,
              variants: {
                ...config.skins["1"].art.variants,
                landscape: {
                  ...config.skins["1"].art.variants.landscape,
                  mainReelBackgroundPositionInFocusRect: {
                    x: 900,
                    y: 0,
                  },
                },
              },
            },
          },
        },
      }),
    ).toThrow(/mainReelBackgroundPositionInFocusRect/);

    expect(() =>
      assertSlotGameStaticConfig({
        ...config,
        skins: {
          "1": {
            ...config.skins["1"],
            art: {
              ...config.skins["1"].art,
              variants: {
                ...config.skins["1"].art.variants,
                landscape: {
                  ...config.skins["1"].art.variants.landscape,
                  conveyor: {
                    ...config.skins["1"].art.variants.landscape.conveyor,
                    placement: "legacy-placement",
                  },
                },
              },
            },
          },
        },
      }),
    ).toThrow(/unknown field "placement"/);
  });

  it("validates optional win amount animation config", () => {
    const config = createValidConfig();
    const withWinAmount = {
      ...config,
      skins: {
        "1": {
          ...config.skins["1"],
          winAmount: createValidWinAmountConfig(),
        },
      },
    };

    expect(() => assertSlotGameStaticConfig(withWinAmount)).not.toThrow();
    expect(() =>
      assertSlotGameStaticConfig({
        ...withWinAmount,
        skins: {
          "1": {
            ...withWinAmount.skins["1"],
            winAmount: {
              ...createValidWinAmountConfig(),
              thresholds: {
                minorMultiplier: 1,
                bigMultiplier: 15,
                superMultiplier: 10,
                megaMultiplier: 50,
              },
            },
          },
        },
      }),
    ).toThrow(/strictly increasing/);
    expect(() =>
      assertSlotGameStaticConfig({
        ...withWinAmount,
        skins: {
          "1": {
            ...withWinAmount.skins["1"],
            winAmount: {
              ...createValidWinAmountConfig(),
              animations: {
                ...createValidWinAmountConfig().animations,
                projectModules: {},
              },
            },
          },
        },
      }),
    ).toThrow(/projectModules must not be empty/);
    expect(() =>
      assertSlotGameStaticConfig({
        ...withWinAmount,
        skins: {
          "1": {
            ...withWinAmount.skins["1"],
            winAmount: {
              ...createValidWinAmountConfig(),
              animations: {
                ...createValidWinAmountConfig().animations,
                tiers: [
                  {
                    ...createValidWinAmountConfig().animations.tiers[0],
                    durationSeconds: 4,
                  },
                ],
              },
            },
          },
        },
      }),
    ).toThrow(/at least 5 seconds/);
  });

  it("validates optional feature bar config with explicit conveyor rects", () => {
    const config = createValidConfig();
    const withFeatureBars = {
      ...config,
      skins: {
        "1": {
          ...config.skins["1"],
          featureBars: createValidFeatureBarsConfig(),
        },
      },
    };

    expect(() => assertSlotGameStaticConfig(withFeatureBars)).not.toThrow();
    expect(
      withFeatureBars.skins["1"].featureBars.featureTrack.symbols
        .requiredStates,
    ).toEqual([]);

    expect(() =>
      assertSlotGameStaticConfig({
        ...withFeatureBars,
        skins: {
          "1": {
            ...withFeatureBars.skins["1"],
            featureBars: {
              featureTrack: {
                ...createValidFeatureBarsConfig().featureTrack,
                layout: {
                  ...createValidFeatureBarsConfig().featureTrack.layout,
                  landscape: {
                    ...createValidFeatureBarsConfig().featureTrack.layout
                      .landscape,
                    slotRectsInConveyor: [
                      { x: 56, y: 72, width: 172, height: 158 },
                    ],
                  },
                },
              },
            },
          },
        },
      }),
    ).toThrow(/slotRectsInConveyor length/);

    expect(() =>
      assertSlotGameStaticConfig({
        ...withFeatureBars,
        skins: {
          "1": {
            ...withFeatureBars.skins["1"],
            featureBars: {
              featureTrack: {
                ...createValidFeatureBarsConfig().featureTrack,
                layout: {
                  ...createValidFeatureBarsConfig().featureTrack.layout,
                  portrait: {
                    ...createValidFeatureBarsConfig().featureTrack.layout
                      .portrait,
                    slotRectsInConveyor: [
                      { x: 49, y: 35, width: 172, height: 158 },
                      { x: 207, y: 35, width: 172, height: 158 },
                      { x: 365, y: 35, width: 172, height: 158 },
                      { x: 523, y: 35, width: 172, height: 158 },
                      { x: 800, y: 35, width: 172, height: 158 },
                    ],
                  },
                },
              },
            },
          },
        },
      }),
    ).toThrow(/slotRectsInConveyor\[4\]/);
  });
});

function createValidConfig(): SlotGameStaticConfig {
  return Object.freeze({
    schemaVersion: 1,
    gameId: "game003",
    brandLabel: "game003",
    live: Object.freeze({
      serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
      gamecode: "EfedJuHEaydXNghnmO9KI",
      rejectQueryParams: Object.freeze(["serverUrl"]),
    }),
    supportedSkins: Object.freeze(["1"]),
    gameConfig: Object.freeze({ reels: {} }),
    reel: Object.freeze({
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
    }),
    skins: Object.freeze({
      "1": Object.freeze({
        label: "skin 1",
        symbols: Object.freeze({
          manifest: Object.freeze({ version: 1 }),
          pngModules: Object.freeze({ H1: "/assets/H1.png" }),
          emptySymbols: Object.freeze([]),
          requireExplicitScale: true,
          requiredStates: Object.freeze(["spinBlur", "disabled"]),
        }),
        art: Object.freeze({
          mode: "orientation-focus",
          variants: Object.freeze({
            landscape: Object.freeze({
              background: Object.freeze({
                url: "/assets/bg1.jpg",
                width: 2000,
                height: 2000,
              }),
              focusRect: Object.freeze({
                x: 288,
                y: 588,
                width: 1424,
                height: 824,
              }),
              frameFocusRect: Object.freeze({ width: 1424, height: 1061 }),
              mainReelBackgroundPositionInFocusRect: Object.freeze({
                x: 294,
                y: -10,
              }),
              conveyor: Object.freeze({
                url: "/assets/track-landscape.png",
                width: 284,
                height: 775,
                positionInFocusRect: Object.freeze({ x: 0, y: 14.5 }),
              }),
            }),
            portrait: Object.freeze({
              background: Object.freeze({
                url: "/assets/bg2.jpg",
                width: 1174,
                height: 2000,
              }),
              focusRect: Object.freeze({
                x: 22,
                y: 469.5,
                width: 1130,
                height: 1061,
              }),
              frameFocusRect: Object.freeze({ width: 1130, height: 1061 }),
              minFocusMargin: Object.freeze({ left: 22, right: 22 }),
              mainReelBackgroundPositionInFocusRect: Object.freeze({
                x: 0,
                y: 147,
              }),
              conveyor: Object.freeze({
                url: "/assets/track-portrait.png",
                width: 934,
                height: 227,
                positionInFocusRect: Object.freeze({ x: 98, y: -80 }),
              }),
            }),
          }),
          mainReelBackground: Object.freeze({
            url: "/assets/reel-frame.png",
            width: 1130,
            height: 824,
          }),
          reelAreaInMainReelBackground: Object.freeze({
            x: 124,
            y: 130,
            width: 885,
            height: 650,
            reelCount: 5,
            reelGap: 15,
            cellWidth: 165,
            cellHeight: 130,
          }),
        }),
      }),
    }),
  });
}

function createValidWinAmountConfig() {
  return Object.freeze({
    amountScale: 100,
    currency: "USD",
    locale: "en-US",
    minorCountDurationSeconds: 1.5,
    majorCountDurationSeconds: 3,
    thresholds: Object.freeze({
      minorMultiplier: 1,
      bigMultiplier: 15,
      superMultiplier: 30,
      megaMultiplier: 50,
    }),
    text: Object.freeze({
      minorFontSize: 54,
      majorFontSize: 118,
      fill: "#fff7d6",
      stroke: "#5a2500",
      strokeWidth: 8,
    }),
    layout: Object.freeze({
      minorAnchor: "reel-area-bottom-center",
      majorAnchor: "reel-area-center",
      minorOffset: Object.freeze({ x: 0, y: -28 }),
      majorOffset: Object.freeze({ x: 0, y: 0 }),
    }),
    animations: Object.freeze({
      projectModules: Object.freeze({ "/bigwin.json": Object.freeze({}) }),
      assetModules: Object.freeze({ "/asset.png": "/asset.png" }),
      tiers: Object.freeze([
        Object.freeze({
          id: "bigwin",
          thresholdMultiplier: 15,
          project: "./bigwin.json",
          durationSeconds: 5,
          loopStartTime: 1,
          loopEndTime: 4,
          keepParticlesAlive: true,
        }),
      ]),
    }),
  });
}

function createValidFeatureBarsConfig() {
  return Object.freeze({
    featureTrack: Object.freeze({
      componentName: "feature-track",
      queueLength: 5,
      visibleCount: 4,
      terminalSlotIndex: 4,
      emptyFeature: "empty",
      allowedFeatures: Object.freeze(["empty", "bonus", "boost"]),
      symbols: Object.freeze({
        manifest: Object.freeze({ version: 1 }),
        pngModules: Object.freeze({ "/bonus.png": "/bonus.png" }),
        requireExplicitScale: true,
        requiredStates: Object.freeze([]),
      }),
      layout: Object.freeze({
        landscape: Object.freeze({
          movement: "down",
          slotRectsInConveyor: Object.freeze([
            Object.freeze({ x: 56, y: 72, width: 172, height: 158 }),
            Object.freeze({ x: 56, y: 204, width: 172, height: 158 }),
            Object.freeze({ x: 56, y: 336, width: 172, height: 158 }),
            Object.freeze({ x: 56, y: 468, width: 172, height: 158 }),
            Object.freeze({ x: 56, y: 601, width: 172, height: 158 }),
          ]),
        }),
        portrait: Object.freeze({
          movement: "right",
          slotRectsInConveyor: Object.freeze([
            Object.freeze({ x: 49, y: 35, width: 172, height: 158 }),
            Object.freeze({ x: 207, y: 35, width: 172, height: 158 }),
            Object.freeze({ x: 365, y: 35, width: 172, height: 158 }),
            Object.freeze({ x: 523, y: 35, width: 172, height: 158 }),
            Object.freeze({ x: 681, y: 35, width: 172, height: 158 }),
          ]),
        }),
      }),
    }),
  });
}
