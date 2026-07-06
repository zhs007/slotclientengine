import { createGameConfig } from "@slotclientengine/logiccore";
import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createStatefulSymbolAssetMapFromModules,
  createSymbolsViewerStandaloneCatalog,
  createSymbolsViewerCatalog,
} from "../src/symbol-assets.js";
import {
  getSymbolSetConfig,
  SYMBOL_SET_CONFIGS,
} from "../src/symbol-set-config.js";
import {
  SpineNormalFallbackAni,
  SpineSymbolAni,
  type SymbolAnimationContext,
} from "@slotclientengine/rendercore";

const GAME003_S1_DISPLAYABLE_SYMBOLS = [
  "WL",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "CO",
  "CL",
  "SC",
] as const;

const GAME003_S1_MISSING_PAYTABLE_SYMBOLS = [
  ["B", "N"].join(""),
  "MT",
  "JP1",
  "JP2",
  "JP3",
  "JP4",
  "CO1",
  "CO2",
  "CO3",
  "MT2",
  "MT3",
  "MT5",
  "BO",
] as const;

describe("symbolsviewer symbol set config", () => {
  it("exposes game003-s1 and its standalone bg-bar companion set", () => {
    expect(SYMBOL_SET_CONFIGS.map((config) => config.id)).toEqual([
      "game003-s1",
      "game003-bg-bar",
    ]);
    expect(getSymbolSetConfig("game003-s1").label).toBe("game003-s1");
    expect(getSymbolSetConfig("game003-s1").symbolScales).toEqual(
      Object.fromEntries(
        GAME003_S1_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
    expect(getSymbolSetConfig("game003-s1").symbolRenderPriorities).toEqual({
      ...Object.fromEntries(
        GAME003_S1_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 0]),
      ),
      WL: 1,
      CL: 1,
      SC: 1,
    });
    expect(getSymbolSetConfig("game003-bg-bar")).toMatchObject({
      label: "game003-bg-bar",
      catalogKind: "standalone",
      displaySymbols: ["normal", "wild", "up"],
      requiredStates: [],
      symbolScales: { normal: 1, wild: 1, up: 1 },
      symbolRenderPriorities: { normal: 0, wild: 0, up: 0 },
    });
    expect(getSymbolSetConfig("game003-bg-bar")).not.toHaveProperty(
      "rawGameConfig",
    );
    expect(() => getSymbolSetConfig("symbols")).toThrow(
      /Unknown symbolsviewer symbol set/,
    );
  });

  it("builds the game003-s1 catalog and exposes manifest-driven VNI resources", () => {
    const config = getSymbolSetConfig("game003-s1");
    const gameConfig = createGameConfig(config.rawGameConfig);
    const assets = createStatefulSymbolAssetMapFromModules({
      modules: config.modules,
      manifest: config.manifest,
      requiredStates: config.requiredStates,
    });
    const catalog = createSymbolsViewerCatalog(
      config.rawGameConfig,
      assets,
      config.requiredStates,
    );

    expect(gameConfig.getReelNames()).toContain("bg-reel01");
    expect(catalog.getValidation()).toEqual({
      displayableSymbols: GAME003_S1_DISPLAYABLE_SYMBOLS,
      ignoredPaytableSymbolsWithoutAssets: GAME003_S1_MISSING_PAYTABLE_SYMBOLS,
      ignoredAssetsWithoutPaytable: [],
    });
    expect(Object.keys(assets)).toEqual([...GAME003_S1_DISPLAYABLE_SYMBOLS]);
    expect(Object.keys(assets)).not.toEqual(
      expect.arrayContaining([
        "bg1",
        "bg2",
        "mainreelbg",
        "conveyor1",
        "conveyor2",
      ]),
    );
    expect(Object.keys(config.vniProjectModules ?? {})).toEqual(
      expect.arrayContaining(
        ["L1", "L2", "L3", "L4", "L5"].map((symbol) =>
          expect.stringContaining(`${symbol}-wins.json`),
        ),
      ),
    );
    expect(Object.keys(config.vniAssetModules ?? {})).toEqual(
      expect.arrayContaining(
        [
          "assets/j1_asset",
          "assets/k_asset",
          "assets/q_asset",
          "assets/j_asset",
          "assets/10_asset",
        ].map((asset) => expect.stringContaining(asset)),
      ),
    );
    expect(Object.keys(config.spineSkeletonModules ?? {})).toEqual(
      expect.arrayContaining(
        ["WL", "H1", "H2", "H3", "H4", "H5", "CL", "SC"].map((symbol) =>
          expect.stringContaining(`${symbol}.json`),
        ),
      ),
    );
    expect(Object.keys(config.spineAtlasModules ?? {})).toEqual([
      "../../../assets/game003-s1/Symbol.atlas",
    ]);
    expect(Object.keys(config.spineTextureModules ?? {})).toEqual([
      "../../../assets/game003-s1/Symbol.png",
    ]);
    const outOfScopeSymbols = [
      ["B", "N"],
      ["C", "N"],
      ["E", "S"],
      ["M", "P", "2"],
      ["R", "S"],
      ["Reel", "_", "Near", "Win"],
      ["U", "P"],
      ["U", "P", "C", "N"],
    ].map((parts) => parts.join(""));

    for (const outOfScope of outOfScopeSymbols) {
      expect(Object.keys(config.spineSkeletonModules ?? {})).not.toEqual(
        expect.arrayContaining([expect.stringContaining(`${outOfScope}.json`)]),
      );
    }
  });

  it("builds the standalone bg-bar catalog without gameconfig or normal PNG", () => {
    const config = getSymbolSetConfig("game003-bg-bar");
    const assets = createStatefulSymbolAssetMapFromModules({
      modules: config.modules,
      manifest: config.manifest,
      requiredStates: config.requiredStates,
      displaySymbols: config.displaySymbols,
    });
    const catalog = createSymbolsViewerStandaloneCatalog({
      symbolAssets: assets,
      displaySymbols: config.displaySymbols ?? [],
      symbolScales: config.symbolScales,
      requiredStateTextures: config.requiredStates,
      animationResolver: config.animationResolver,
    });

    expect(Object.keys(config.modules)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("wild.png"),
        expect.stringContaining("up.png"),
      ]),
    );
    expect(Object.keys(config.modules)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("normal.png")]),
    );
    expect(assets.normal).toEqual({
      normal: { kind: "transparent", width: 172, height: 158 },
      states: {},
    });
    expect(catalog.getValidation()).toEqual({
      displayableSymbols: ["normal", "wild", "up"],
      ignoredPaytableSymbolsWithoutAssets: [],
      ignoredAssetsWithoutPaytable: [],
    });
    expect(config.symbolRenderPriorities.wild).toBe(0);
  });

  it("keeps VNI-only appear static and maps configured Spine states through rendercore", () => {
    const config = getSymbolSetConfig("game003-s1");

    for (const symbol of ["L1", "L2", "L3", "L4", "L5"]) {
      const context = createSymbolContext(symbol, "appear");
      const ani = config.animationResolver(context);

      ani.reset();
      ani.update(0.01);

      expect(ani.playback).toBe("once");
      expect(context.sprite.scale).toMatchObject({ x: 1, y: 1 });
      expect(context.underlayLayer.children).toEqual([]);
      expect(context.overlayLayer.children).toEqual([]);
      expect(context.baseLayer.visible).toBe(true);
      expect(context.stateSprite.visible).toBe(false);
    }

    for (const symbol of ["H2", "H3", "H4", "H5"]) {
      const context = createSymbolContext(symbol, "appear");
      const ani = config.animationResolver(context);

      expect(ani).toBeInstanceOf(SpineNormalFallbackAni);
      expect(ani.playback).toBe("once");
    }

    for (const symbol of ["WL", "H1", "CL", "SC"]) {
      const context = createSymbolContext(symbol, "appear");
      const ani = config.animationResolver(context);

      expect(ani).toBeInstanceOf(SpineSymbolAni);
      expect(ani.playback).toBe("once");
    }

    for (const symbol of ["WL", "H1", "H2", "H3", "H4", "H5", "CL", "SC"]) {
      const context = createSymbolContext(symbol, "normal");
      const ani = config.animationResolver(context);

      expect(ani).toBeInstanceOf(SpineSymbolAni);
      expect(ani.playback).toBe("static");
    }
  });
});

function createSymbolContext(
  symbol: string,
  stateId: "normal" | "appear",
): SymbolAnimationContext {
  const root = new Container();
  const sprite = new Sprite(Texture.WHITE);
  const underlayLayer = new Container();
  const baseLayer = new Container();
  const stateSprite = new Sprite(Texture.WHITE);
  const overlayLayer = new Container();
  baseLayer.addChild(sprite);
  root.addChild(underlayLayer, baseLayer, stateSprite, overlayLayer);
  return {
    code: 1,
    symbol,
    pays: [0],
    requestedState: stateId,
    resolvedState: stateId,
    state: {
      id: stateId,
      phase: stateId === "normal" ? "stable" : "once",
      playback: stateId === "normal" ? "static" : "once",
    },
    texture: Texture.WHITE,
    stateTextures: {},
    requiredStateTextures: [],
    root,
    underlayLayer,
    baseLayer,
    sprite,
    layers: [
      {
        index: 0,
        texture: Texture.WHITE,
        keyframes: [],
        sprite,
      },
    ],
    stateSprite,
    overlayLayer,
  };
}
