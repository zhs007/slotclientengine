import { createGameConfig, createGameLogic } from "@slotclientengine/logiccore";
import { describe, expect, it } from "vitest";
import game2Config from "../../../../assets/gamecfg/game2.json";
import basicMessage from "../../../logiccore/tests/fixtures/gamemoduleinfo-basic.json";
import { ReelError, createReelSpinPlan } from "../../src/reel/index.js";

describe("createReelSpinPlan", () => {
  it("uses real GMI final ys and derives ordered start, stop and travel values", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const scene = createGameLogic(basicMessage).getStep(0).getScene(0);
    const finalYs = gameConfig.getStopYCoordinates({
      reelsName: "reels01",
      sceneName: "step0.scene0",
      scene,
    });

    const plan = createReelSpinPlan({
      reels,
      finalYs,
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 1600,
      speedSymbolsPerSecond: 42,
      startDelayMs: 90,
      stopDelayMs: 180,
    });

    expect(finalYs).toEqual([1, 1, 4, 0, 27]);
    expect(plan.axes.map((axis) => axis.finalY)).toEqual([1, 1, 4, 0, 27]);
    expect(plan.axes.map((axis) => axis.startDelayMs)).toEqual([
      0, 90, 180, 270, 360,
    ]);
    for (const axis of plan.axes) {
      expect(axis.travelSymbols).toBeGreaterThanOrEqual(50);
      expect(axis.startY).toBe(
        reels.normalizeY(axis.x, axis.finalY - axis.travelSymbols),
      );
    }
    expect(plan.axes.map((axis) => axis.stopAtMs)).toEqual(
      [...plan.axes.map((axis) => axis.stopAtMs)].sort(
        (left, right) => left - right,
      ),
    );
  });

  it("changes travel and start y when duration or speed is not clamped by the minimum travel", () => {
    const reels = createGameConfig(game2Config).getReels("reels01");
    const fast = createReelSpinPlan({
      reels,
      finalYs: [1, 1, 4, 0, 27],
      visibleRows: 5,
      minimumSpinCycles: 1,
      baseDurationMs: 1000,
      speedSymbolsPerSecond: 10,
      startDelayMs: 0,
      stopDelayMs: 0,
    });
    const slower = createReelSpinPlan({
      reels,
      finalYs: [1, 1, 4, 0, 27],
      visibleRows: 5,
      minimumSpinCycles: 1,
      baseDurationMs: 1600,
      speedSymbolsPerSecond: 20,
      startDelayMs: 0,
      stopDelayMs: 0,
    });

    expect(slower.axes[0].travelSymbols).toBeGreaterThan(
      fast.axes[0].travelSymbols,
    );
    expect(slower.axes[0].startY).not.toBe(fast.axes[0].startY);
  });

  it("supports defaults, backward direction and per-reel extra travel", () => {
    const reels = createGameConfig(game2Config).getReels("reels01");
    const plan = createReelSpinPlan({
      reels,
      finalYs: [1, 1, 4, 0, 27],
      visibleRows: 5,
      direction: "backward",
      baseDurationMs: 100,
      speedSymbolsPerSecond: 1,
      startDelayMs: 0,
      stopDelayMs: 0,
      extraTravelSymbolsPerReel: [1, 2, 3, 4, 5],
    });

    expect(plan.direction).toBe("backward");
    expect(plan.axes[0]).toMatchObject({
      direction: "backward",
      travelSymbols: 51,
      startY: reels.normalizeY(0, 1 + 51),
    });
    expect(plan.axes[4].travelSymbols).toBe(75);
  });

  it("fails fast for invalid options", () => {
    const reels = createGameConfig(game2Config).getReels("reels01");
    const valid = {
      reels,
      finalYs: [1, 1, 4, 0, 27],
      visibleRows: 5,
      baseDurationMs: 1600,
      speedSymbolsPerSecond: 42,
      startDelayMs: 90,
      stopDelayMs: 180,
    };

    expect(() => createReelSpinPlan({ ...valid, finalYs: [1] })).toThrow(
      ReelError,
    );
    expect(() => createReelSpinPlan({ ...valid, visibleRows: 0 })).toThrow(
      /visibleRows/,
    );
    expect(() => createReelSpinPlan({ ...valid, baseDurationMs: 0 })).toThrow(
      /baseDurationMs/,
    );
    expect(() =>
      createReelSpinPlan({ ...valid, speedSymbolsPerSecond: 0 }),
    ).toThrow(/speedSymbolsPerSecond/);
    expect(() => createReelSpinPlan({ ...valid, startDelayMs: -1 })).toThrow(
      /startDelayMs/,
    );
    expect(() => createReelSpinPlan({ ...valid, stopDelayMs: -1 })).toThrow(
      /stopDelayMs/,
    );
    expect(() =>
      createReelSpinPlan({ ...valid, minimumSpinCycles: 0 }),
    ).toThrow(/minimumSpinCycles/);
    expect(() =>
      createReelSpinPlan({ ...valid, extraTravelSymbolsPerReel: [0] }),
    ).toThrow(/extraTravelSymbolsPerReel/);
    expect(() =>
      createReelSpinPlan({ ...valid, finalYs: [1, 1, 4, 0, 27.5] }),
    ).toThrow(/finalYs/);
    expect(() =>
      createReelSpinPlan({ ...valid, direction: "sideways" as never }),
    ).toThrow(/direction/);
    expect(() =>
      createReelSpinPlan({
        ...valid,
        extraTravelSymbolsPerReel: [0, 0, 0, 0, -1],
      }),
    ).toThrow(/extraTravelSymbolsPerReel/);
  });
});
