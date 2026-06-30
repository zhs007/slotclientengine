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
                url: "/assets/conveyor1.png",
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
                url: "/assets/conveyor2.png",
                width: 934,
                height: 227,
                positionInFocusRect: Object.freeze({ x: 98, y: -80 }),
              }),
            }),
          }),
          mainReelBackground: Object.freeze({
            url: "/assets/mainreelbg.png",
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
