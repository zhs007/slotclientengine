import { createGameConfig } from "@slotclientengine/logiccore";
import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createStatefulSymbolAssetMapFromModules,
  createSymbolsViewerCatalog,
} from "../src/symbol-assets.js";
import {
  getSymbolSetConfig,
  SYMBOL_SET_CONFIGS,
} from "../src/symbol-set-config.js";
import type { SymbolAnimationContext } from "@slotclientengine/rendercore";

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
  "BN",
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
  it("only exposes the game003-s1 symbol set", () => {
    expect(SYMBOL_SET_CONFIGS.map((config) => config.id)).toEqual([
      "game003-s1",
    ]);
    expect(getSymbolSetConfig("game003-s1").label).toBe("game003-s1");
    expect(getSymbolSetConfig("game003-s1").symbolScales).toEqual(
      Object.fromEntries(
        GAME003_S1_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
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
  });

  it("keeps L1-L5 appear static while other game003 symbols use manifest builtin appear", () => {
    const config = getSymbolSetConfig("game003-s1");

    for (const symbol of ["L1", "L2", "L3", "L4", "L5"]) {
      const context = createAppearContext(symbol);
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

    const builtinContext = createAppearContext("H1");
    const builtinAni = config.animationResolver(builtinContext);
    builtinAni.reset();
    builtinAni.update(0.2);

    expect(builtinContext.sprite.scale.x).toBeGreaterThan(1);
  });
});

function createAppearContext(symbol: string): SymbolAnimationContext {
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
    requestedState: "appear",
    resolvedState: "appear",
    state: {
      id: "appear",
      phase: "once",
      playback: "once",
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
