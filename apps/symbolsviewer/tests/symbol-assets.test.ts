import { createGameConfig } from "@slotclientengine/logiccore";
import {
  SymbolStateSequenceController,
  createDefaultSymbolStatePreset,
  createSymbolCatalog
} from "@slotclientengine/rendercore";
import game2Config from "../../../assets/gamecfg/game2.json";
import { describe, expect, it } from "vitest";
import {
  SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
  createSymbolAssetMapFromModules,
  createStatefulSymbolAssetMapFromModules,
  createSymbolsViewerCatalog,
  getSymbolNameFromPath
} from "../src/symbol-assets.js";
import {
  DEFAULT_VIEWER_SEQUENCE,
  moveSequenceStep,
  removeSequenceStep,
  replaceSequenceStep
} from "../src/viewer-sequence.js";

describe("symbolsviewer assets", () => {
  it("parses game2 config and converts asset glob modules into a symbol asset map", () => {
    const assets = createSymbolAssetMapFromModules({
      "../../../assets/symbols/S00.png": "/assets/S00.png",
      "../../../assets/symbols/SX.png": "/assets/SX.png"
    });

    expect(getSymbolNameFromPath("../../../assets/symbols/S10.png")).toBe("S10");
    expect(assets).toEqual({
      S00: "/assets/S00.png",
      SX: "/assets/SX.png"
    });
    expect(createGameConfig(game2Config).getSymbolCode("S00")).toBe(1);
  });

  it("splits normal and generated state PNGs into a stateful asset map", () => {
    const assets = createStatefulSymbolAssetMapFromModules({
      modules: {
        "../../../assets/symbols/S00.png": "/assets/S00.png",
        "../../../assets/symbols/S00.spinBlur.png": "/assets/S00.spinBlur.png",
        "../../../assets/symbols/S00.disabled.png": "/assets/S00.disabled.png",
        "../../../assets/symbols/SX.png": "/assets/SX.png"
      },
      manifest: createManifest(["S00"]),
      requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
    });

    expect(Object.keys(assets)).toEqual(["S00", "SX"]);
    expect(Object.keys(assets)).not.toContain("S00.spinBlur");
    expect(assets).toEqual({
      S00: {
        normal: "/assets/S00.png",
        states: {
          spinBlur: "/assets/S00.spinBlur.png",
          disabled: "/assets/S00.disabled.png"
        }
      },
      SX: {
        normal: "/assets/SX.png",
        states: {}
      }
    });
  });

  it("rejects missing state texture files and unknown state declarations", () => {
    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.disabled.png": "/assets/S00.disabled.png"
        },
        manifest: createManifest(["S00"]),
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
      })
    ).toThrow(/spinBlur/);

    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.spinBlur.png": "/assets/S00.spinBlur.png",
          "../../../assets/symbols/S00.disabled.png": "/assets/S00.disabled.png",
          "../../../assets/symbols/S00.blurred.png": "/assets/S00.blurred.png"
        },
        manifest: createManifest(["S00"]),
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
      })
    ).toThrow(/unknown state "blurred"/);

    expect(() =>
      createStatefulSymbolAssetMapFromModules({
        modules: {
          "../../../assets/symbols/S00.png": "/assets/S00.png",
          "../../../assets/symbols/S00.spinBlur.png": "/assets/S00.spinBlur.png",
          "../../../assets/symbols/S00.disabled.png": "/assets/S00.disabled.png"
        },
        manifest: {
          ...createManifest(["S00"]),
          states: ["spinBlur", "disabled", "blurred"]
        },
        requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
      })
    ).toThrow(/unknown state "blurred"/);
  });

  it("keeps only the paytable and image intersection for display with required state textures", () => {
    const catalog = createSymbolsViewerCatalog(game2Config, createViewerStatefulAssets());

    expect(catalog.getValidation()).toMatchObject({
      displayableSymbols: ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"],
      ignoredPaytableSymbolsWithoutAssets: ["BN"],
      ignoredAssetsWithoutPaytable: ["CO", "SX"]
    });
  });

  it("matches rendercore catalog behavior for the default viewer fixture", () => {
    const catalog = createSymbolCatalog({
      gameConfig: createGameConfig(game2Config),
      assets: {
        S00: "/assets/S00.png",
        S0: "/assets/S0.png",
        S1: "/assets/S1.png",
        S5: "/assets/S5.png",
        S10: "/assets/S10.png",
        SC: "/assets/SC.png",
        RS: "/assets/RS.png",
        X2: "/assets/X2.png",
        X5: "/assets/X5.png",
        X10: "/assets/X10.png",
        CO: "/assets/CO.png",
        SX: "/assets/SX.png"
      }
    });

    expect(catalog.getDisplayableSymbols()).toEqual([
      "S00",
      "S0",
      "S1",
      "S5",
      "S10",
      "SC",
      "RS",
      "X2",
      "X5",
      "X10"
    ]);
  });
});

function createViewerStatefulAssets() {
  const displayableSymbols = ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"];
  return createStatefulSymbolAssetMapFromModules({
    modules: createViewerModules(displayableSymbols, ["CO", "SX"]),
    manifest: createManifest(displayableSymbols),
    requiredStates: SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
  });
}

function createViewerModules(symbols: readonly string[], orphanSymbols: readonly string[]) {
  return Object.fromEntries(
    [...symbols, ...orphanSymbols].flatMap((symbol) => {
      const normal = [`../../../assets/symbols/${symbol}.png`, `/assets/${symbol}.png`] as const;
      if (orphanSymbols.includes(symbol)) {
        return [normal];
      }
      return [
        normal,
        [
          `../../../assets/symbols/${symbol}.spinBlur.png`,
          `/assets/${symbol}.spinBlur.png`
        ] as const,
        [
          `../../../assets/symbols/${symbol}.disabled.png`,
          `/assets/${symbol}.disabled.png`
        ] as const
      ];
    })
  );
}

function createManifest(symbols: readonly string[]) {
  return {
    version: 1,
    states: ["spinBlur", "disabled"],
    symbols: Object.fromEntries(
      symbols.map((symbol) => [
        symbol,
        {
          normal: `./${symbol}.png`,
          spinBlur: `./${symbol}.spinBlur.png`,
          disabled: `./${symbol}.disabled.png`
        }
      ])
    )
  };
}

describe("symbolsviewer sequence helpers", () => {
  it("provides the default global sequence and supports edit operations", () => {
    expect(DEFAULT_VIEWER_SEQUENCE.map((step) => step.state)).toEqual([
      "normal",
      "appear",
      "win",
      "spinBlur",
      "disabled"
    ]);

    const removed = removeSequenceStep(DEFAULT_VIEWER_SEQUENCE, 1);
    expect(removed.map((step) => step.state)).not.toContain("appear");

    const moved = moveSequenceStep(removed, 0, removed.length - 1);
    expect(moved.at(-1)?.state).toBe("normal");

    const replaced = replaceSequenceStep(moved, 0, { state: "appear" });
    expect(replaced[0]).toEqual({ state: "appear" });
  });

  it("feeds rendercore sequence controller after add, remove and reorder changes", () => {
    const controller = new SymbolStateSequenceController({
      statePreset: createDefaultSymbolStatePreset(),
      steps: DEFAULT_VIEWER_SEQUENCE
    });

    controller.removeStep(1);
    controller.moveStep(0, 1);
    controller.addStep({ state: "appear" }, 1);

    expect(controller.getSteps().map((step) => step.state)).toEqual([
      "win",
      "appear",
      "normal",
      "spinBlur",
      "disabled"
    ]);
  });
});
