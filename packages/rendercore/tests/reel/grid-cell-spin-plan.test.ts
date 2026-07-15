import { describe, expect, it } from "vitest";
import {
  createGridCellOrder,
  createGridCellReelOffsetMatrix,
  createGridCellReelSpinPlan,
  type GridCellDimmingPattern,
  type GridCellReelSpinTiming,
} from "../../src/reel/index.js";
import { createBasicReels } from "./helpers.js";

const TARGET_SCENE = Object.freeze([
  Object.freeze([1, 0, 2]),
  Object.freeze([2, 1, 0]),
]);
const TIMING = Object.freeze({
  startStepMs: 10,
  stopStepMs: 20,
  settleAfterLastStartMs: 100,
  minimumSpinCycles: 3,
  speedSymbolsPerSecond: 10,
}) satisfies GridCellReelSpinTiming;
const DIMMING = Object.freeze({
  resolveDimmingAlpha: (code: number) => (code === 1 ? 0 : 0.82),
  fadeInMs: 80,
  fadeOutMs: 160,
}) satisfies GridCellDimmingPattern;

describe("createGridCellReelSpinPlan", () => {
  it("creates deterministic per-cell timing, target symbols and dimming", () => {
    const reels = createBasicReels();
    const order = createGridCellOrder({
      columns: 2,
      rows: 3,
      mode: "top-down-left-right",
    });
    const plan = createGridCellReelSpinPlan({
      reels,
      finalYs: [2, 1],
      targetScene: TARGET_SCENE,
      columns: 2,
      rows: 3,
      order,
      timing: TIMING,
      dimming: DIMMING,
    });

    expect(plan.cells).toHaveLength(6);
    expect(plan.lastStopAtMs).toBe(250);
    expect(plan.dimming).toEqual(DIMMING);
    expect(plan.cells.map((cell) => cell.startAtMs)).toEqual([
      0, 10, 20, 30, 40, 50,
    ]);
    expect(plan.cells.map((cell) => cell.stopAtMs)).toEqual([
      150, 170, 190, 210, 230, 250,
    ]);
    expect(plan.cells.every((cell) => cell.stopAtMs > cell.startAtMs)).toBe(
      true,
    );
    expect(plan.cells.map((cell) => cell.axisPlan.finalY)).toEqual([
      reels.normalizeY(0, 2),
      reels.normalizeY(0, 3),
      reels.normalizeY(0, 4),
      reels.normalizeY(1, 1),
      reels.normalizeY(1, 2),
      reels.normalizeY(1, 3),
    ]);
    expect(plan.cells.map((cell) => cell.targetVisibleSymbols)).toEqual([
      [1],
      [0],
      [2],
      [2],
      [1],
      [0],
    ]);
    expect(plan.cells.map((cell) => cell.dimmingAlpha)).toEqual([
      0, 0.82, 0.82, 0.82, 0, 0.82,
    ]);
    expect(plan.cells[0].axisPlan).toMatchObject({
      x: 0,
      startDelayMs: 0,
      durationMs: 150,
      stopAtMs: 150,
      travelSymbols: 3,
    });
  });

  it("can add per-cell reel offsets while preserving target symbols", () => {
    const reels = createBasicReels();
    const order = createGridCellOrder({
      columns: 2,
      rows: 3,
      mode: "top-down-left-right",
    });
    const cellReelOffsets = createGridCellReelOffsetMatrix({
      columns: 2,
      rows: 3,
      rowOffsetStep: 2,
      columnOffsetStep: 5,
    });
    const plan = createGridCellReelSpinPlan({
      reels,
      finalYs: [2, 1],
      targetScene: TARGET_SCENE,
      columns: 2,
      rows: 3,
      order,
      cellReelOffsets,
      timing: TIMING,
      dimming: DIMMING,
    });

    expect(cellReelOffsets).toEqual([
      [0, 2, 4],
      [5, 7, 9],
    ]);
    expect(plan.cells.map((cell) => cell.reelOffsetY)).toEqual([
      0, 2, 4, 5, 7, 9,
    ]);
    expect(plan.cells.map((cell) => cell.axisPlan.finalY)).toEqual([
      reels.normalizeY(0, 2),
      reels.normalizeY(0, 2 + 1 + 2),
      reels.normalizeY(0, 2 + 2 + 4),
      reels.normalizeY(1, 1 + 5),
      reels.normalizeY(1, 1 + 1 + 7),
      reels.normalizeY(1, 1 + 2 + 9),
    ]);
    expect(plan.cells.map((cell) => cell.targetVisibleSymbols)).toEqual([
      [1],
      [0],
      [2],
      [2],
      [1],
      [0],
    ]);
  });

  it("rejects malformed scenes, final y values, order, timing and dimming", () => {
    const reels = createBasicReels();
    const order = createGridCellOrder({
      columns: 2,
      rows: 3,
      mode: "top-down-left-right",
    });
    const baseOptions = {
      reels,
      finalYs: [2, 1],
      targetScene: TARGET_SCENE,
      columns: 2,
      rows: 3,
      order,
      timing: TIMING,
      dimming: DIMMING,
    };

    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        targetScene: [[1, 2, 3]],
      }),
    ).toThrow(/targetScene length/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        targetScene: [
          [1, 2],
          [3, 4],
        ] as any,
      }),
    ).toThrow(/targetScene\[0\]/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        finalYs: [1],
      }),
    ).toThrow(/finalYs/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        cellReelOffsets: [[0, 1, 2]] as any,
      }),
    ).toThrow(/cellReelOffsets length/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        cellReelOffsets: [
          [0, 1],
          [0, 1, 2],
        ] as any,
      }),
    ).toThrow(/cellReelOffsets\[0\]/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        cellReelOffsets: [
          [0, 1.5, 2],
          [0, 1, 2],
        ] as any,
      }),
    ).toThrow(/cellReelOffsets\[0\]\[1\]/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        order: [order[0], order[0], order[2], order[3], order[4], order[5]],
      }),
    ).toThrow(/orderIndex|duplicate/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        order: order.slice(0, 5),
      }),
    ).toThrow(/order length/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        order: [...order.slice(0, 5), { x: 2, y: 0, orderIndex: 5 }],
      }),
    ).toThrow(/out of range/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        timing: {
          ...TIMING,
          speedSymbolsPerSecond: 0,
        },
      }),
    ).toThrow(/speedSymbolsPerSecond/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        timing: {
          ...TIMING,
          settleAfterLastStartMs: 0,
          startStepMs: 0,
          stopStepMs: 0,
        },
      }),
    ).toThrow(/stopAtMs/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        dimming: {
          ...DIMMING,
          resolveDimmingAlpha: () => 1.1,
        },
      }),
    ).toThrow(/dimming alpha/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        dimming: {
          ...DIMMING,
          resolveDimmingAlpha: null as never,
        },
      }),
    ).toThrow(/resolveDimmingAlpha/);
    expect(() =>
      createGridCellReelSpinPlan({
        ...baseOptions,
        dimming: {
          ...DIMMING,
          fadeOutMs: -1,
        },
      }),
    ).toThrow(/fadeOutMs/);
  });
});
