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
  resolveViewerStateForSymbol,
  SYMBOL_SET_CONFIGS,
} from "../src/symbol-set-config.js";
import {
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

const GAME002_S3_DISPLAYABLE_SYMBOLS = [
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
  "BN",
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
  it("exposes game002-s3 before the known non-release game003 sets", () => {
    expect(SYMBOL_SET_CONFIGS.map((config) => config.id)).toEqual([
      "game002-s3",
      "game003-s1",
      "game003-bg-bar",
    ]);
    expect(getSymbolSetConfig("game002-s3")).toMatchObject({
      label: "game002-s3",
      catalogKind: "paytable",
      symbolScales: Object.fromEntries(
        GAME002_S3_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
      symbolRenderPriorities: Object.fromEntries(
        GAME002_S3_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 0]),
      ),
    });
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

  it("builds the game002-s3 catalog from exactly 13 symbols and 12 skeletons", () => {
    const config = getSymbolSetConfig("game002-s3");
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

    expect(Object.keys(assets)).toEqual([...GAME002_S3_DISPLAYABLE_SYMBOLS]);
    expect(Object.keys(config.modules)).toHaveLength(39);
    expect(Object.keys(config.spineSkeletonModules ?? {})).toHaveLength(12);
    expect(catalog.getValidation()).toMatchObject({
      displayableSymbols: GAME002_S3_DISPLAYABLE_SYMBOLS,
      ignoredAssetsWithoutPaytable: [],
    });
    for (const excluded of [
      "CN_1",
      "CN_2",
      "CN_3",
      "CN_4",
      "Nearwin1",
      "Nearwin2",
      "Nearwin3",
      "WM_Fx",
    ]) {
      expect(Object.keys(config.modules)).not.toEqual(
        expect.arrayContaining([expect.stringContaining(excluded)]),
      );
      expect(Object.keys(config.spineSkeletonModules ?? {})).not.toEqual(
        expect.arrayContaining([expect.stringContaining(`${excluded}.json`)]),
      );
    }
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

  it("maps configured game002-s3 Spine states and skips unavailable viewer states", () => {
    const config = getSymbolSetConfig("game002-s3");

    for (const symbol of ["WL", "H1", "H2", "L1", "L2", "L3", "L4"]) {
      const context = createSymbolContext(symbol, "appear");
      expect(config.animationResolver(context)).toBeInstanceOf(SpineSymbolAni);
      expect(resolveViewerStateForSymbol(config, symbol, "appear")).toBe(
        "appear",
      );
      expect(resolveViewerStateForSymbol(config, symbol, "win")).toBe("win");
    }

    expect(resolveViewerStateForSymbol(config, "WM", "win")).toBe("normal");
    expect(resolveViewerStateForSymbol(config, "BN", "appear")).toBe("normal");
    expect(resolveViewerStateForSymbol(config, "CN", "win")).toBe("normal");

    const game003Config = getSymbolSetConfig("game003-s1");
    expect(() =>
      game003Config.animationResolver(createSymbolContext("WL", "normal")),
    ).toThrow(/Unsupported Spine skeleton version "4\.2\.43"/);
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
