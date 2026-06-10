import { createGameConfig } from "@slotclientengine/logiccore";
import {
  SymbolStateSequenceController,
  createDefaultSymbolStatePreset,
  createSymbolCatalog
} from "@slotclientengine/rendercore";
import game2Config from "../../../assets/gamecfg/game2.json";
import { describe, expect, it } from "vitest";
import {
  createSymbolAssetMapFromModules,
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

  it("keeps only the paytable and image intersection for display", () => {
    const catalog = createSymbolsViewerCatalog(
      game2Config,
      createSymbolAssetMapFromModules({
        "../../../assets/symbols/S00.png": "/assets/S00.png",
        "../../../assets/symbols/S0.png": "/assets/S0.png",
        "../../../assets/symbols/S1.png": "/assets/S1.png",
        "../../../assets/symbols/S5.png": "/assets/S5.png",
        "../../../assets/symbols/S10.png": "/assets/S10.png",
        "../../../assets/symbols/SX.png": "/assets/SX.png"
      })
    );

    expect(catalog.getValidation()).toMatchObject({
      displayableSymbols: ["S00", "S0", "S1", "S5", "S10"],
      ignoredPaytableSymbolsWithoutAssets: ["BN", "SC", "RS", "X2", "X5", "X10"],
      ignoredAssetsWithoutPaytable: ["SX"]
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
        SX: "/assets/SX.png"
      }
    });

    expect(catalog.getDisplayableSymbols()).toEqual(["S00", "S0", "S1", "S5", "S10"]);
  });
});

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
