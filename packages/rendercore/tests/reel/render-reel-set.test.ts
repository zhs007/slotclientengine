import { createGameConfig, createGameLogic } from "@slotclientengine/logiccore";
import { describe, expect, it } from "vitest";
import game2Config from "../../../../assets/gamecfg/game2.json";
import basicMessage from "../../../logiccore/tests/fixtures/gamemoduleinfo-basic.json";
import {
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
} from "../../src/reel/index.js";
import {
  createTestSymbolAnimationResolver,
  createTextureSet,
} from "./helpers.js";

describe("RenderReelSet", () => {
  it("starts and stops axes in order, rejects reentry, and lands on the GMI scene", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const scene = createGameLogic(basicMessage).getStep(0).getScene(0);
    const finalYs = gameConfig.getStopYCoordinates({
      reelsName: "reels01",
      sceneName: "step0.scene0",
      scene,
    });
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      texturePolicy: {
        requiredStateTextures: ["spinBlur"],
      },
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs,
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30,
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
      "stopped",
    ]);
  });

  it("validates reset and spin plan width", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      animationResolver: createTestSymbolAnimationResolver(),
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });

    expect(() => reelSet.resetToFinalYs([1])).toThrow(/finalYs/);
    reelSet.resetToFinalYs([1, 1, 4, 0, 27]);
    expect(reelSet.getVisibleScene()[0]).toEqual([2, 0, 3, 0, 4]);
    expect(() =>
      reelSet.spin({
        direction: "forward",
        totalDurationMs: 0,
        axes: [],
      }),
    ).toThrow(/axes length/);
  });

  it("resets directly to a target visible scene", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      animationResolver: createTestSymbolAnimationResolver(),
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });
    const scene = createGameLogic(basicMessage).getStep(0).getScene(0);
    const targetVisibleScene = scene.map((column) =>
      Object.freeze([...column].reverse()),
    );

    reelSet.resetToVisibleScene(targetVisibleScene, [0, 0, 0, 0, 0]);

    expect(reelSet.getVisibleScene()).toEqual(targetVisibleScene);
    expect(reelSet.getSnapshot().spinning).toBe(false);
  });

  it("injects target visible symbols without requiring the target window to exist on the public reel strip", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const scene = createGameLogic(basicMessage).getStep(0).getScene(0);
    const finalYs = gameConfig.getStopYCoordinates({
      reelsName: "reels01",
      sceneName: "step0.scene0",
      scene,
    });
    const targetVisibleScene = scene.map((column) =>
      Object.freeze([...column].reverse()),
    );
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      texturePolicy: {
        requiredStateTextures: ["spinBlur"],
      },
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs,
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30,
    });

    reelSet.spin(plan, { targetVisibleScene });
    let result = reelSet.update(0);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual(targetVisibleScene);
  });

  it("validates target visible scene width and height", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      animationResolver: createTestSymbolAnimationResolver(),
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs: [1, 1, 4, 0, 27],
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30,
    });

    expect(() =>
      reelSet.spin(plan, { targetVisibleScene: [[1, 2, 3, 4, 5]] }),
    ).toThrow(/column count/);
    expect(() =>
      reelSet.spin(plan, {
        targetVisibleScene: [
          [1, 2, 3, 4],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
        ],
      }),
    ).toThrow(/length/);
  });

  it("requests visible symbol states by window coordinate after reels stop", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      animationResolver: createTestSymbolAnimationResolver(),
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
        columnGap: 3,
      }),
      registry,
    });
    const targetVisibleScene = [
      [2, 0, 3, 0, 4],
      [1, 2, 3, 0, 4],
      [3, 5, 10, 1, 2],
      [6, 6, 8, 9, 10],
      [1, 2, 3, 4, 5],
    ];

    reelSet.resetToVisibleScene(targetVisibleScene, [1, 1, 4, 0, 27]);
    reelSet.requestVisibleSymbolStates(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      "win",
    );

    expect(
      reelSet
        .getVisibleSymbolStateSnapshots([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ])
        .map((snapshot) => snapshot.requestedState),
    ).toEqual(["win", "win"]);
    expect(
      reelSet.getVisibleSymbolGeometrySnapshots([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([
      {
        x: 0,
        y: 0,
        code: 2,
        kind: "textured",
        centerX: 10,
        centerY: 10,
        cellWidth: 20,
        cellHeight: 20,
      },
      {
        x: 1,
        y: 1,
        code: 2,
        kind: "textured",
        centerX: 33,
        centerY: 30,
        cellWidth: 20,
        cellHeight: 20,
      },
    ]);

    reelSet.update(0);
    expect(reelSet.getVisibleSymbolStateSnapshot(0, 0).requestedState).toBe(
      "win",
    );

    reelSet.update(0.58);
    expect(
      reelSet
        .getVisibleSymbolStateSnapshots([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ])
        .every((snapshot) => snapshot.requestedState === "normal"),
    ).toBe(true);

    expect(() => reelSet.requestVisibleSymbolState(0, 1, "win")).toThrow(
      /empty/,
    );
    expect(() => reelSet.requestVisibleSymbolState(5, 0, "win")).toThrow(
      /out of range/,
    );
    expect(() => reelSet.getVisibleSymbolGeometrySnapshot(5, 0)).toThrow(
      /out of range/,
    );
    expect(() => reelSet.getVisibleSymbolGeometrySnapshot(0, 5)).toThrow(
      /out of range/,
    );

    const plan = createReelSpinPlan({
      reels,
      finalYs: [1, 1, 4, 0, 27],
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30,
    });
    reelSet.spin(plan);
    expect(() => reelSet.requestVisibleSymbolState(0, 0, "win")).toThrow(
      /spinning/,
    );
    expect(() => reelSet.getVisibleSymbolGeometrySnapshot(0, 0)).toThrow(
      /spinning/,
    );
  });
});
