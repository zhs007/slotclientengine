import { describe, expect, it } from "vitest";
import bigwinProject from "../../../assets/game003-s1/win-amount/bigwin.json";
import megawinProject from "../../../assets/game003-s1/win-amount/megawin.json";
import superwinProject from "../../../assets/game003-s1/win-amount/superwin.json";
import winAmountManifest from "../../../assets/game003-s1/win-amount/win-amount.manifest.json";
import { GAME003_LOADING_RESOURCE_URLS } from "../src/generated/game-loading.generated.js";
import { GAME003_STATIC_CONFIG } from "../src/generated/game-static.generated.js";
import { GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS } from "../src/bg-bar-runtime.js";
import { DEFAULT_GAME003_REEL_CONFIG } from "../src/game-demo.js";
import { getGame003MinecartTotalDurationSeconds } from "../src/minecart-interaction-config.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 generated static config", () => {
  it("locks fixed live config, skin list and gameconfig reference", () => {
    expect(GAME003_STATIC_CONFIG).toMatchObject({
      schemaVersion: 1,
      gameId: "game003",
      brandLabel: "minecart2",
      live: {
        serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
        gamecode: "EfedJuHEaydXNghnmO9KI",
        rejectQueryParams: ["serverUrl"],
      },
      supportedSkins: ["1"],
      reel: {
        kind: "normal",
        reelsName: "bg-reel01",
        reelCount: 5,
        visibleRows: 5,
      },
    });
    expect(GAME003_STATIC_CONFIG.gameConfig).toBeTypeOf("object");
  });

  it("keeps art layout values equivalent to the pre-YAML game003 contract", () => {
    const art = GAME003_STATIC_CONFIG.skins["1"].art;

    expect(art.variants.landscape.focusRect).toEqual({
      x: 288,
      y: 588,
      width: 1424,
      height: 824,
    });
    expect(art.variants.portrait.focusRect).toEqual({
      x: 22,
      y: 469.5,
      width: 1130,
      height: 1061,
    });
    expect(art.variants.landscape.frameFocusRect).toEqual({
      width: 1424,
      height: 1061,
    });
    expect(art.reelAreaInMainReelBackground).toEqual({
      x: 124,
      y: 130,
      width: 885,
      height: 650,
      reelCount: 5,
      reelGap: 15,
      cellWidth: 165,
      cellHeight: 130,
    });
    expect(
      art.variants.landscape.mainReelBackgroundPositionInFocusRect,
    ).toEqual({
      x: 294,
      y: -10,
    });
    expect(art.variants.landscape.conveyor?.positionInFocusRect).toEqual({
      x: 0,
      y: 14.5,
    });
    expect(art.variants.portrait.mainReelBackgroundPositionInFocusRect).toEqual(
      {
        x: 0,
        y: 147,
      },
    );
    expect(art.variants.portrait.conveyor?.positionInFocusRect).toEqual({
      x: 98,
      y: -80,
    });
    expect(art).not.toHaveProperty(["scenePart", "Gap"].join(""));
    expect(art.variants.landscape.conveyor).not.toHaveProperty("placement");
  });

  it("uses manifest symbols and does not carry a second scale table in YAML output", () => {
    const skin = getGame003SkinConfig("1");
    const staticSymbols = GAME003_STATIC_CONFIG.skins["1"].symbols;
    const expectedVniWinSymbols = ["L1", "L2", "L3", "L4", "L5"] as const;
    const expectedVniAssetPrefixes = [
      "assets/j1_asset",
      "assets/k_asset",
      "assets/q_asset",
      "assets/j_asset",
      "assets/10_asset",
    ] as const;

    expect(skin.displaySymbols).toContain("H1");
    expect(skin.displaySymbols).toContain("SC");
    expect(skin.emptySymbols).toEqual([]);
    expect(staticSymbols).not.toHaveProperty("scale");
    expect(Object.keys(staticSymbols.vniProjectModules ?? {})).toEqual(
      expect.arrayContaining(
        expectedVniWinSymbols.map((symbol) =>
          expect.stringContaining(`${symbol}-wins.json`),
        ),
      ),
    );
    expect(Object.keys(staticSymbols.vniAssetModules ?? {})).toEqual(
      expect.arrayContaining(
        expectedVniAssetPrefixes.map((prefix) =>
          expect.stringContaining(prefix),
        ),
      ),
    );
    expect(Object.keys(staticSymbols.spineSkeletonModules ?? {})).toEqual(
      expect.arrayContaining(
        ["WL", "H1", "H2", "H3", "H4", "H5", "CL", "SC"].map((symbol) =>
          expect.stringContaining(`${symbol}.json`),
        ),
      ),
    );
    expect(Object.keys(staticSymbols.spineAtlasModules ?? {})).toEqual([
      "../../../../assets/game003-s1/Symbol.atlas",
    ]);
    expect(Object.keys(staticSymbols.spineTextureModules ?? {})).toEqual([
      "../../../../assets/game003-s1/Symbol.png",
    ]);
    const manifestSymbols = (
      staticSymbols.manifest as { symbols: Record<string, unknown> }
    ).symbols;
    for (const symbol of expectedVniWinSymbols) {
      expect(manifestSymbols[symbol]).toMatchObject({
        animations: {
          win: {
            kind: "vni",
            project: `./${symbol}-wins.json`,
            playback: { mode: "range", startTime: 0, endTime: 1, loop: false },
          },
          appear: { kind: "static", durationSeconds: 1 / 60 },
        },
      });
      expect(
        (
          manifestSymbols[symbol] as {
            animations?: { win?: Record<string, unknown> };
          }
        ).animations?.win,
      ).not.toHaveProperty("stageRect");
    }
    expect(manifestSymbols.H1).toMatchObject({
      animations: {
        normal: {
          kind: "spine",
          skeleton: "./H1.json",
          atlas: "./Symbol.atlas",
          texture: "./Symbol.png",
          playback: {
            mode: "animation",
            animationName: "Idle",
            loop: true,
          },
        },
        appear: {
          kind: "spine",
          skeleton: "./H1.json",
          atlas: "./Symbol.atlas",
          texture: "./Symbol.png",
          playback: {
            mode: "animation",
            animationName: "Start",
            loop: false,
          },
        },
        win: {
          kind: "spine",
          skeleton: "./H1.json",
          atlas: "./Symbol.atlas",
          texture: "./Symbol.png",
          playback: {
            mode: "animation",
            animationName: "Win",
            loop: false,
          },
        },
      },
    });
    expect(manifestSymbols.WL).toMatchObject({
      animations: {
        appear: {
          kind: "spine",
          playback: { animationName: "start", loop: false },
        },
        win: {
          kind: "spine",
          playback: { animationName: "Win", loop: false },
        },
      },
    });
    expect(manifestSymbols.H2).toMatchObject({
      animations: {
        normal: {
          kind: "spine",
          playback: { animationName: "Idle", loop: true },
        },
        win: {
          kind: "spine",
          playback: { animationName: "Win", loop: false },
        },
      },
    });
    expect(
      (
        manifestSymbols.H2 as {
          animations?: Record<string, unknown>;
        }
      ).animations,
    ).not.toHaveProperty("appear");
    for (const symbol of ["CL", "SC"]) {
      expect(manifestSymbols[symbol]).toMatchObject({
        animations: {
          normal: {
            kind: "spine",
            skeleton: `./${symbol}.json`,
            playback: { animationName: "Idle", loop: true },
          },
          appear: {
            kind: "spine",
            skeleton: `./${symbol}.json`,
            playback: { animationName: "Start", loop: false },
          },
          win: {
            kind: "spine",
            skeleton: `./${symbol}.json`,
            playback: { animationName: "Win", loop: false },
          },
        },
      });
    }
    expect(skin.symbolScales.H1).toBe(1);
    expect(skin.symbolScales.SC).toBe(1);
    expect(skin.symbolRenderPriorities.WL).toBe(1);
    expect(skin.symbolRenderPriorities.CL).toBe(1);
    expect(skin.symbolRenderPriorities.SC).toBe(1);
    expect(skin.symbolRenderPriorities.H1).toBe(0);
    expect(skin.symbolRenderPriorities.L1).toBe(0);
    expect(
      JSON.stringify(GAME003_STATIC_CONFIG.skins["1"].symbols),
    ).not.toMatch(/symbolRenderPriorities/);
  });

  it("generates the app-owned bg-bar static config from its standalone manifest", () => {
    const featureBar = GAME003_STATIC_CONFIG.skins["1"].featureBars?.bgBar;
    const skin = getGame003SkinConfig("1");

    expect(featureBar).toMatchObject({
      componentName: "bg-bar",
      queueLength: 5,
      visibleCount: 4,
      terminalSlotIndex: 4,
      emptyFeature: "normal",
      allowedFeatures: ["normal", "wild", "up"],
      symbols: {
        requiredStates: [],
        requireExplicitScale: true,
      },
      layout: {
        landscape: { movement: "down" },
        portrait: { movement: "right" },
      },
    });
    expect(Object.keys(featureBar?.symbols.pngModules ?? {})).not.toEqual(
      expect.arrayContaining([expect.stringContaining("normal.png")]),
    );
    expect(skin.bgBar.symbolScales).toEqual({ normal: 1, wild: 1, up: 1 });
    expect(skin.bgBar.symbolRenderPriorities).toEqual({
      normal: 0,
      wild: 0,
      up: 0,
    });
    expect(skin.bgBar.layout.landscape.slotRectsInConveyor).toHaveLength(5);
    expect(skin.bgBar.layout.portrait.slotRectsInConveyor).toHaveLength(5);
    const bgBarManifest = featureBar?.symbols.manifest as {
      symbols: Record<
        string,
        { animations: { win: { durationSeconds: number } } }
      >;
    };
    expect(bgBarManifest.symbols.normal.animations.win.durationSeconds).toBe(
      GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS,
    );
    expect(bgBarManifest.symbols.wild.animations.win.durationSeconds).toBe(
      GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS,
    );
    expect(bgBarManifest.symbols.up.animations.win.durationSeconds).toBe(
      GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS,
    );
  });

  it("generates app-owned minecart config from appExtensions", () => {
    const skin = getGame003SkinConfig("1");
    const totalDuration = getGame003MinecartTotalDurationSeconds(
      skin.minecartInteraction,
    );

    expect(GAME003_STATIC_CONFIG.skins["1"].appExtensions).toHaveProperty(
      "game003MinecartInteraction",
    );
    expect(
      GAME003_STATIC_CONFIG.skins["1"].appExtensions
        ?.game003MinecartInteraction,
    ).toMatchObject({
      payload: {
        symbolScale: 1,
      },
    });
    expect(skin.minecartInteraction).toMatchObject({
      loadingResourceId: "game003-minecart",
      imageSize: { width: 369, height: 252 },
      payload: {
        symbolScale: 1,
      },
      layout: {
        landscape: {
          exitSide: "right",
          stopOffsetFromReelAreaBottomCenter: { x: 0, y: 85 },
          payloadAnchorInImage: { x: 184.5, y: 126 },
        },
        portrait: {
          exitSide: "right",
          stopOffsetFromReelAreaBottomCenter: { x: 0, y: 145 },
          payloadAnchorInImage: { x: 184.5, y: 126 },
        },
      },
      timing: {
        cartExitDurationSeconds: 0.18,
        cartRushDurationSeconds: 0.26,
        symbolFlyDurationSeconds: 0.43,
        symbolHoldDurationSeconds: 0.12,
        maxTotalBeforeReelStopSeconds: 1.3,
      },
    });
    expect(totalDuration).toBeCloseTo(1.29);
    expect(totalDuration).toBeLessThanOrEqual(
      skin.minecartInteraction.timing.maxTotalBeforeReelStopSeconds,
    );
    expect(totalDuration).toBeLessThan(
      DEFAULT_GAME003_REEL_CONFIG.baseDurationMs / 1000,
    );
  });

  it("generates app-owned win symbol loop config from appExtensions", () => {
    const skin = getGame003SkinConfig("1");

    expect(GAME003_STATIC_CONFIG.skins["1"].appExtensions).toHaveProperty(
      "game003WinSymbolLoop",
    );
    expect(skin.winSymbolLoop).toEqual({
      cyclePauseSeconds: 1,
      resultAmount: {
        yOffsetRatioFromCellCenter: 0.22,
        fontSize: 38,
        fill: "#fff7d6",
        stroke: "#5a2500",
        strokeWidth: 5,
      },
    });
  });

  it("generates app-owned CO coin overlay config from appExtensions only", () => {
    const skin = getGame003SkinConfig("1");
    const staticSkin = GAME003_STATIC_CONFIG.skins["1"];

    expect(staticSkin.appExtensions).toHaveProperty("game003CoinOverlay");
    expect(staticSkin.appExtensions?.game003CoinOverlay).toEqual({
      componentName: "bg-gencoins",
      coinSymbol: "CO",
      text: {
        yOffsetRatioFromCellCenter: 0.08,
        fontSize: 32,
        fill: "#fff7d6",
        stroke: "#5a2500",
        strokeWidth: 4,
      },
    });
    expect(skin.coinOverlay).toEqual(
      staticSkin.appExtensions?.game003CoinOverlay,
    );
    expect(staticSkin).not.toHaveProperty("game003CoinOverlay");
    expect(staticSkin.featureBars?.bgBar).not.toHaveProperty(
      "game003CoinOverlay",
    );
    expect(staticSkin.winAmount).not.toHaveProperty("game003CoinOverlay");
    expect(staticSkin.symbols.manifest).not.toHaveProperty(
      "game003CoinOverlay",
    );
  });

  it("fails fast for skin ids outside the generated supported list", () => {
    expect(() => getGame003SkinConfig("2" as never)).toThrow(
      /Unknown game003 skin/,
    );
  });

  it("generates a separate lightweight loading resource config", () => {
    expect(GAME003_LOADING_RESOURCE_URLS.length).toBeGreaterThan(40);
    const ids = GAME003_LOADING_RESOURCE_URLS.map((resource) => resource.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "game003-bg-landscape",
        "game003-bg-portrait",
        "game003-scene-parts:mainreelbg.png",
        "game003-symbol-normal-pngs:H1.png",
        "game003-symbol-spin-blur-pngs:H1.spinBlur.png",
        "game003-symbol-disabled-pngs:H1.disabled.png",
        "game003-symbol-vni-projects:L1-wins.json",
        "game003-symbol-vni-projects:L2-wins.json",
        "game003-symbol-vni-projects:L3-wins.json",
        "game003-symbol-vni-projects:L4-wins.json",
        "game003-symbol-vni-projects:L5-wins.json",
        "game003-symbol-spine-skeletons:H1.json",
        "game003-symbol-spine-skeletons:H5.json",
        "game003-symbol-spine-skeletons:CL.json",
        "game003-symbol-spine-skeletons:SC.json",
        "game003-symbol-spine-atlas",
        "game003-symbol-spine-texture",
        "game003-bg-bar-symbol-pngs:up.png",
        "game003-bg-bar-symbol-pngs:wild.png",
        "game003-bg-bar-symbol-manifest",
        "game003-minecart",
        "game003-win-amount-manifest",
        "game003-win-amount-vni-projects:bigwin.json",
        "game003-win-amount-vni-projects:superwin.json",
        "game003-win-amount-vni-projects:megawin.json",
      ]),
    );
    for (const assetPrefix of [
      "j1_asset",
      "k_asset",
      "q_asset",
      "j_asset",
      "10_asset",
    ]) {
      expect(
        GAME003_LOADING_RESOURCE_URLS.some((resource) =>
          resource.id.startsWith(`game003-symbol-vni-assets:${assetPrefix}`),
        ),
      ).toBe(true);
    }
    expect(
      GAME003_LOADING_RESOURCE_URLS.some((resource) =>
        resource.id.startsWith("game003-symbol-normal-pngs:mainreelbg"),
      ),
    ).toBe(false);
    expect(GAME003_STATIC_CONFIG.skins["1"].winAmount?.animations.manifest).toBe(
      winAmountManifest,
    );
    for (const id of getReferencedWinAmountLoadingAssetIds()) {
      expect(ids).toContain(id);
    }
  });
});

function getReferencedWinAmountLoadingAssetIds(): readonly string[] {
  return [bigwinProject, superwinProject, megawinProject].flatMap((project) =>
    project.assets.map((asset) => {
      const filename = asset.path.split("/").at(-1);
      if (!filename) {
        throw new Error(`bad win amount asset path ${asset.path}`);
      }
      return `game003-win-amount-vni-assets:${filename}`;
    }),
  );
}
