import { describe, expect, it, vi } from "vitest";
import {
  RenderGridCellReelSet,
  RenderReel,
  createGridCellOrder,
  createGridCellReelSpinPlan,
  createReelSpinPlan,
  type GridCellDimmingPattern,
  type GridCellReelSpinTiming,
} from "../../src/reel/index.js";
import {
  createBasicLayout,
  createBasicRegistry,
  createBasicReels,
} from "./helpers.js";

const INITIAL = Object.freeze([
  Object.freeze([1, 0, 2]),
  Object.freeze([2, 1, 0]),
]);
const TARGET = Object.freeze([
  Object.freeze([2, 3, 1]),
  Object.freeze([1, 0, 3]),
]);
const TIMING = Object.freeze({
  startStepMs: 10,
  stopStepMs: 10,
  settleAfterLastStartMs: 80,
  minimumSpinCycles: 2,
  speedSymbolsPerSecond: 20,
}) satisfies GridCellReelSpinTiming;
const DIMMING = Object.freeze({
  resolveDimmingAlpha: (code: number) => (code === 1 ? 0 : 0.5),
  fadeInMs: 20,
  fadeOutMs: 20,
}) satisfies GridCellDimmingPattern;

describe("grid-cell continuous spin", () => {
  it("does not materialize slot snapshots in the per-cell update path", () => {
    const reel = createSet();
    reel.resetToScene(INITIAL, [0, 1]);
    const getSlotRenderViews = vi.spyOn(
      RenderReel.prototype,
      "getSlotRenderViews",
    );
    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
      dimming: DIMMING,
    });

    reel.update(0.05);
    const firstSteadyUpdate = reel.update(0.01);
    const secondSteadyUpdate = reel.update(0.01);

    expect(getSlotRenderViews).not.toHaveBeenCalled();
    expect(secondSteadyUpdate).toBe(firstSteadyUpdate);
    getSlotRenderViews.mockRestore();
  });

  it("rolls without a target and settles the same transaction to an exact target", () => {
    const reel = createSet();
    reel.resetToScene(INITIAL, [0, 1]);

    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: TIMING.speedSymbolsPerSecond,
      dimming: DIMMING,
    });
    const first = reel.update(0.05);
    expect(first.startedCells).toHaveLength(6);
    expect(reel.isContinuousSpinning()).toBe(true);

    reel.settleContinuous(createPlan());
    expect(reel.isContinuousSpinning()).toBe(false);
    for (let index = 0; index < 30 && reel.getSnapshot().spinning; index += 1)
      reel.update(0.05);

    expect(reel.getSnapshot()).toMatchObject({
      spinning: false,
      completed: true,
      visibleScene: TARGET,
    });
  });

  it("materializes a public-strip symbol when targetless rolling starts from a hole", () => {
    const reel = createSet();
    reel.resetToScene(
      [
        [1, 0, -1],
        [2, 1, 0],
      ],
      [0, 1],
    );

    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    const update = reel.update(0.05);

    expect(update.startedCells).toContainEqual({
      x: 0,
      y: 2,
      orderIndex: 2,
    });
    expect(
      reel.getSnapshot().cells.find(({ x, y }) => x === 0 && y === 2),
    ).toMatchObject({ occupied: true, phase: "spinning" });

    reel.settleContinuous(createPlan());
    for (let index = 0; index < 30 && reel.getSnapshot().spinning; index += 1)
      reel.update(0.05);
    expect(reel.getSnapshot().visibleScene).toEqual(TARGET);
  });

  it("settles an initial hole when the response arrives before its staggered start", () => {
    const reel = createSet();
    reel.resetToScene(
      [
        [1, 0, -1],
        [2, 1, 0],
      ],
      [0, 1],
    );

    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
      startStepMs: 10,
    });
    reel.settleContinuous(createPlan());

    for (let index = 0; index < 30 && reel.getSnapshot().spinning; index += 1)
      reel.update(0.05);
    expect(reel.getSnapshot()).toMatchObject({
      spinning: false,
      completed: true,
      visibleScene: TARGET,
    });
  });

  it("keeps unselected occurrences held and cancels targetless rolling", () => {
    const reel = createSet();
    reel.resetToScene(INITIAL, [0, 1]);
    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
      positions: [{ x: 0, y: 0 }],
    });
    reel.update(0.1);

    expect(
      reel.getSnapshot().cells.find(({ x, y }) => x === 1 && y === 1),
    ).toMatchObject({ visibleSymbol: 1, occupied: true, phase: "completed" });
    reel.cancelContinuous();
    expect(reel.getSnapshot()).toMatchObject({
      spinning: false,
      completed: true,
    });
    expect(() => reel.settleContinuous(createPlan())).toThrow(
      /without an active continuous spin/,
    );
  });

  it("starts targetless cells in stable order and preserves pending cadence after an early response", () => {
    const reel = createSet();
    reel.resetToScene(INITIAL, [0, 1]);
    const atomicStart = vi.spyOn(RenderReel.prototype, "startContinuous");
    const targetAwareStart = vi.spyOn(RenderReel.prototype, "start");
    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
      startStepMs: 10,
      cellLocalPhaseYs: [
        [7, 5, 3],
        [6, 4, 2],
      ],
    });

    expect(reel.update(0.001).startedCells).toEqual([
      { x: 0, y: 0, orderIndex: 0 },
    ]);
    expect(atomicStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ localPhaseY: 7 }),
    );
    reel.settleContinuous(createPlan());
    expect(reel.update(0.009).startedCells).toEqual([
      { x: 0, y: 1, orderIndex: 1 },
    ]);
    expect(targetAwareStart.mock.calls[0]?.[0]).toMatchObject({
      x: 0,
      startY: 5,
    });
    expect(reel.update(0.01).startedCells).toEqual([
      { x: 0, y: 2, orderIndex: 2 },
    ]);

    for (let index = 0; index < 30 && reel.getSnapshot().spinning; index += 1)
      reel.update(0.05);
    expect(reel.getSnapshot()).toMatchObject({
      spinning: false,
      visibleScene: TARGET,
    });
    atomicStart.mockRestore();
    targetAwareStart.mockRestore();
  });

  it("rejects malformed local phase matrices before starting", () => {
    const reel = createSet();
    reel.resetToScene(INITIAL, [0, 1]);

    expect(() =>
      reel.startContinuous({
        direction: "forward",
        speedSymbolsPerSecond: 20,
        cellLocalPhaseYs: [[0, 1, 2]],
      }),
    ).toThrow(/cellLocalPhaseYs length/);
    expect(reel.isContinuousSpinning()).toBe(false);
  });

  it("requires settle positions to equal the response-free start positions", () => {
    const reel = createSet();
    reel.resetToScene(INITIAL, [0, 1]);
    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
      positions: [{ x: 0, y: 0 }],
    });
    expect(() => reel.settleContinuous(createPlan())).toThrow(
      /positions must match/,
    );
  });

  it("keeps incoming velocity at the response settle boundary", () => {
    const reels = createBasicReels();
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    const basePlan = createReelSpinPlan({
      reels,
      finalYs: [0, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 200,
      speedSymbolsPerSecond: 20,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];
    const settlePlan = Object.freeze({
      ...basePlan,
      travelSymbols: 5,
      durationMs: 200,
      stopAtMs: 200,
    });
    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    reel.update(0.063);
    reel.settleContinuous(settlePlan, {
      targetVisibleSymbols: [2, 3, 1],
    });
    const settleStartY = reel.getSnapshot().currentY;

    reel.update(0.01);

    expect(reel.getSnapshot().currentY - settleStartY).toBeCloseTo(0.2, 6);
  });

  it("uses the same forward direction for the initial and following continuous spin", () => {
    const reels = createBasicReels();
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    reel.resetToVisibleSymbols([1, 0, 2], 3);
    const initialY = reel.getSnapshot().currentY;
    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    reel.update(0.01);
    expect(reel.getSnapshot().currentY - initialY).toBeCloseTo(0.2, 6);
    reel.cancelContinuous();

    const followingY = reel.getSnapshot().currentY;
    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    reel.update(0.01);
    expect(reel.getSnapshot().currentY - followingY).toBeCloseTo(0.2, 6);
  });
});

function createSet() {
  return new RenderGridCellReelSet({
    reels: createBasicReels(),
    registry: createBasicRegistry(),
    columns: 2,
    rows: 3,
    cellWidth: 15,
    cellHeight: 12,
    order: createGridCellOrder({
      columns: 2,
      rows: 3,
      mode: "top-down-left-right",
    }),
  });
}

function createPlan() {
  return createGridCellReelSpinPlan({
    reels: createBasicReels(),
    finalYs: [0, 1],
    targetScene: TARGET,
    columns: 2,
    rows: 3,
    order: createGridCellOrder({
      columns: 2,
      rows: 3,
      mode: "top-down-left-right",
    }),
    timing: TIMING,
    dimming: DIMMING,
  });
}
