import { createGameConfig, createGameLogic } from "@slotclientengine/logiccore";
import { describe, expect, it } from "vitest";
import game2Config from "../../../../assets/gamecfg/game2.json";
import basicMessage from "../../../logiccore/tests/fixtures/gamemoduleinfo-basic.json";
import {
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry
} from "../../src/reel/index.js";
import { createTextureSet } from "./helpers.js";

describe("RenderReelSet", () => {
  it("starts and stops axes in order, rejects reentry, and lands on the GMI scene", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const scene = createGameLogic(basicMessage).getStep(0).getScene(0);
    const finalYs = gameConfig.getStopYCoordinates({
      reelsName: "reels01",
      sceneName: "step0.scene0",
      scene
    });
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map((symbol) => [
          symbol,
          createTextureSet(20, 20)
        ])
      ),
      emptySymbols: ["BN"],
      texturePolicy: {
        requiredStateTextures: ["spinBlur"]
      }
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20
      }),
      registry
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs,
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30
    });

    reelSet.spin(plan);
    expect(() => reelSet.spin(plan)).toThrow(/active/);
    expect(reelSet.update(0).startedAxes).toEqual([0]);
    expect(reelSet.update(0.04).startedAxes).toEqual([0, 1]);

    let result = reelSet.update(0.05);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual(scene);
    expect(reelSet.getSnapshot().reels.map((reel) => reel.phase)).toEqual([
      "stopped",
      "stopped",
      "stopped",
      "stopped",
      "stopped"
    ]);
  });

  it("validates reset and spin plan width", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map((symbol) => [
          symbol,
          createTextureSet(20, 20)
        ])
      ),
      emptySymbols: ["BN"]
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20
      }),
      registry
    });

    expect(() => reelSet.resetToFinalYs([1])).toThrow(/finalYs/);
    reelSet.resetToFinalYs([1, 1, 4, 0, 27]);
    expect(reelSet.getVisibleScene()[0]).toEqual([2, 0, 3, 0, 4]);
    expect(() =>
      reelSet.spin({
        direction: "forward",
        totalDurationMs: 0,
        axes: []
      })
    ).toThrow(/axes length/);
  });
});
