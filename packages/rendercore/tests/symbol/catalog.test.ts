import { createGameConfig } from "@slotclientengine/logiccore";
import game2Config from "../../../../assets/gamecfg/game2.json";
import { describe, expect, it } from "vitest";
import {
  SymbolAssetError,
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createSymbolCatalog
} from "../../src/symbol/index.js";

const createCatalog = () =>
  createSymbolCatalog({
    gameConfig: createGameConfig(game2Config),
    assets: {
      S00: "S00.png",
      S0: "S0.png",
      S1: "S1.png",
      S5: "S5.png",
      S10: "S10.png",
      SX: "SX.png"
    },
    statePreset: createDefaultSymbolStatePreset(),
    animationResolver: createDefaultSymbolAnimationResolver()
  });

describe("createSymbolCatalog", () => {
  it("builds displayable symbols from the current game2 paytable and symbol assets", () => {
    const catalog = createCatalog();

    expect(catalog.getValidation()).toEqual({
      displayableSymbols: ["S00", "S0", "S1", "S5", "S10"],
      ignoredPaytableSymbolsWithoutAssets: ["BN", "SC", "RS", "X2", "X5", "X10"],
      ignoredAssetsWithoutPaytable: ["SX"]
    });
    expect(catalog.getDisplayableSymbols()).toEqual(["S00", "S0", "S1", "S5", "S10"]);
  });

  it("keeps paytable data on definitions and rejects non-displayable symbols", () => {
    const catalog = createCatalog();
    const definition = catalog.getDefinition("S10");

    expect(definition).toMatchObject({
      code: 5,
      symbol: "S10",
      defaultState: "normal"
    });
    expect(definition.pays).toEqual([0, 0, 0, 0, 0]);
    expect(catalog.getPaytableEntry("S10").code).toBe(5);
    expect(() => catalog.getDefinition("BN")).toThrow(SymbolAssetError);
    expect(() => catalog.getDefinition("SX")).toThrow(SymbolAssetError);
    expect(() => catalog.getPaytableEntry("SX")).toThrow(SymbolAssetError);
  });

  it("does not create render symbols from unloaded URL assets", () => {
    const catalog = createCatalog();

    expect(() => catalog.createRenderSymbol("S00")).toThrow(SymbolAssetError);
  });

  it("rejects malformed LogicGameConfig-like objects at the catalog boundary", () => {
    expect(() =>
      createSymbolCatalog({
        gameConfig: {
          getRawConfig: () => null,
          getPaytableEntry: () => undefined,
          getSymbolCode: () => undefined,
          getReelNames: () => [],
          getReels: () => {
            throw new Error("unused");
          },
          getStopYCoordinates: () => [],
          getSpinStartYCoordinates: () => []
        },
        assets: {}
      })
    ).toThrow(SymbolAssetError);
  });
});
