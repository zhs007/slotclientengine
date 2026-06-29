import { createGameConfig } from "@slotclientengine/logiccore";
import { describe, expect, it } from "vitest";
import {
  createStatefulSymbolAssetMapFromModules,
  createSymbolsViewerCatalog,
} from "../src/symbol-assets.js";
import {
  getSymbolSetConfig,
  SYMBOL_SET_CONFIGS,
} from "../src/symbol-set-config.js";

const SYMBOLS002_PAYTABLE_SYMBOLS = [
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

const SYMBOLS002_DISPLAYABLE_SYMBOLS = SYMBOLS002_PAYTABLE_SYMBOLS.filter(
  (symbol) => symbol !== "BN",
);
const SYMBOLS_DISPLAYABLE_SYMBOLS = [
  "S00",
  "S0",
  "S1",
  "S5",
  "S10",
  "SC",
  "RS",
  "X2",
  "X5",
  "X10",
] as const;
const SYMBOLS001_DISPLAYABLE_SYMBOLS = [
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "CN",
  "BN",
] as const;
const SYMBOLS003_DISPLAYABLE_SYMBOLS = [
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "CN",
  "CO",
] as const;
const SYMBOLS003_MISSING_PAYTABLE_SYMBOLS = ["WM", "CM", "AF", "BN"] as const;
const GAME002_S2_DISPLAYABLE_SYMBOLS = [
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "CN",
  "CO",
] as const;
const GAME002_S2_MISSING_PAYTABLE_SYMBOLS = ["WM", "CM", "AF", "BN"] as const;
const GAME002_S3_DISPLAYABLE_SYMBOLS = SYMBOLS002_DISPLAYABLE_SYMBOLS;

describe("symbolsviewer symbol set config", () => {
  it("declares explicit selectable symbol sets and rejects unknown ids", () => {
    expect(SYMBOL_SET_CONFIGS.map((config) => config.id)).toEqual([
      "symbols",
      "symbols001",
      "symbols002",
      "symbols003",
      "game002-s2",
      "game002-s3",
    ]);
    expect(getSymbolSetConfig("symbols").label).toBe("symbols");
    expect(getSymbolSetConfig("symbols").symbolScales).toEqual(
      Object.fromEntries(
        SYMBOLS_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
    expect(getSymbolSetConfig("symbols001").label).toBe("symbols001");
    expect(getSymbolSetConfig("symbols001").symbolScales).toEqual(
      Object.fromEntries(
        SYMBOLS001_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 0.8]),
      ),
    );
    expect(getSymbolSetConfig("symbols002").label).toBe("symbols002");
    expect(getSymbolSetConfig("symbols002").symbolScales).toEqual(
      Object.fromEntries(
        SYMBOLS002_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
    expect(getSymbolSetConfig("symbols003").label).toBe("symbols003");
    expect(getSymbolSetConfig("symbols003").symbolScales).toEqual(
      Object.fromEntries(
        SYMBOLS003_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
    expect(getSymbolSetConfig("game002-s2").label).toBe("game002-s2");
    expect(getSymbolSetConfig("game002-s2").symbolScales).toEqual(
      Object.fromEntries(
        GAME002_S2_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
    expect(getSymbolSetConfig("game002-s3").label).toBe("game002-s3");
    expect(getSymbolSetConfig("game002-s3").symbolScales).toEqual(
      Object.fromEntries(
        GAME002_S3_DISPLAYABLE_SYMBOLS.map((symbol) => [symbol, 1]),
      ),
    );
    expect(() => getSymbolSetConfig("missing")).toThrow(
      /Unknown symbolsviewer symbol set/,
    );
  });

  it.each([
    "symbols001",
    "symbols002",
    "symbols003",
    "game002-s2",
    "game002-s3",
  ] as const)(
    "parses %s generated gameconfig through logiccore",
    (symbolSetId) => {
      const config = getSymbolSetConfig(symbolSetId);
      const gameConfig = createGameConfig(config.rawGameConfig);
      const reels = gameConfig.getReels("reels-001");

      expect(
        SYMBOLS002_PAYTABLE_SYMBOLS.map((symbol) =>
          gameConfig.getSymbolCode(symbol),
        ),
      ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(gameConfig.getSymbolCode("BN")).toBe(12);
      expect(gameConfig.getReelNames()).toEqual(["reels-001"]);
      expect(reels.getReelCount()).toBeGreaterThan(0);
      for (
        let reelIndex = 0;
        reelIndex < reels.getReelCount();
        reelIndex += 1
      ) {
        expect(reels.getLength(reelIndex)).toBeGreaterThan(0);
      }
    },
  );

  it("builds symbols001 catalog from its own PNG glob, manifest and explicit transparent BN", () => {
    const config = getSymbolSetConfig("symbols001");
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

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: SYMBOLS001_DISPLAYABLE_SYMBOLS,
      ignoredPaytableSymbolsWithoutAssets: ["WM", "CM", "CO", "AF"],
      ignoredAssetsWithoutPaytable: [],
    });
    expect(catalog.getTextureSet("BN")).toMatchObject({
      normal: {
        kind: "single",
        texture: expect.stringContaining("BN.png"),
      },
      states: {
        spinBlur: expect.stringContaining("BN.spinBlur.png"),
        disabled: expect.stringContaining("BN.disabled.png"),
      },
    });
    expect(catalog.getTextureSet("BN").states?.spinBlur).not.toContain(
      "symbols002",
    );
  });

  it("builds symbols002 catalog from its own PNG glob and state manifest", () => {
    const config = getSymbolSetConfig("symbols002");
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

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: SYMBOLS002_DISPLAYABLE_SYMBOLS,
      ignoredPaytableSymbolsWithoutAssets: ["BN"],
      ignoredAssetsWithoutPaytable: [],
    });
    expect(catalog.getTextureSet("WL")).toMatchObject({
      normal: {
        kind: "single",
        texture: expect.stringContaining("WL.png"),
      },
      states: {
        spinBlur: expect.stringContaining("WL.spinBlur.png"),
        disabled: expect.stringContaining("WL.disabled.png"),
      },
    });
    expect(Object.keys(assets)).not.toContain("BN");
  });

  it("builds symbols003 catalog from its own PNG glob and state manifest", () => {
    const config = getSymbolSetConfig("symbols003");
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

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: SYMBOLS003_DISPLAYABLE_SYMBOLS,
      ignoredPaytableSymbolsWithoutAssets: SYMBOLS003_MISSING_PAYTABLE_SYMBOLS,
      ignoredAssetsWithoutPaytable: [],
    });
    expect(catalog.getTextureSet("WL")).toMatchObject({
      normal: {
        kind: "single",
        texture: expect.stringContaining("WL.png"),
      },
      states: {
        spinBlur: expect.stringContaining("WL.spinBlur.png"),
        disabled: expect.stringContaining("WL.disabled.png"),
      },
    });
    expect(catalog.getTextureSet("WL").states?.spinBlur).not.toContain(
      "symbols002",
    );
    expect(Object.keys(assets)).not.toEqual(
      expect.arrayContaining([...SYMBOLS003_MISSING_PAYTABLE_SYMBOLS]),
    );
  });

  it("builds game002-s2 catalog without treating bg.png as a symbol", () => {
    const config = getSymbolSetConfig("game002-s2");
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

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: GAME002_S2_DISPLAYABLE_SYMBOLS,
      ignoredPaytableSymbolsWithoutAssets: GAME002_S2_MISSING_PAYTABLE_SYMBOLS,
      ignoredAssetsWithoutPaytable: [],
    });
    expect(Object.keys(assets)).not.toContain("bg");
    expect(catalog.getTextureSet("WL")).toMatchObject({
      normal: {
        kind: "single",
        texture: expect.stringContaining("WL.png"),
      },
      states: {
        spinBlur: expect.stringContaining("WL.spinBlur.png"),
        disabled: expect.stringContaining("WL.disabled.png"),
      },
    });
    expect(Object.keys(assets)).not.toEqual(
      expect.arrayContaining([...GAME002_S2_MISSING_PAYTABLE_SYMBOLS, "bg"]),
    );
  });

  it("builds game002-s3 catalog from its own PNG glob and state manifest", () => {
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

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: GAME002_S3_DISPLAYABLE_SYMBOLS,
      ignoredPaytableSymbolsWithoutAssets: ["BN"],
      ignoredAssetsWithoutPaytable: [],
    });
    expect(catalog.getTextureSet("WL")).toMatchObject({
      normal: {
        kind: "single",
        texture: expect.stringContaining("WL.png"),
      },
      states: {
        spinBlur: expect.stringContaining("WL.spinBlur.png"),
        disabled: expect.stringContaining("WL.disabled.png"),
      },
    });
    expect(catalog.getTextureSet("WL").states?.spinBlur).not.toContain(
      "symbols003",
    );
    expect(Object.keys(assets)).not.toContain("BN");
  });
});
