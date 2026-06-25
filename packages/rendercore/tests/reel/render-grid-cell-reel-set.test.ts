import { describe, expect, it } from "vitest";
import {
  RenderGridCellReelSet,
  createGridCellOrder,
  createGridCellReelSpinPlan,
  type GridCellDimmingPattern,
  type GridCellReelSpinTiming,
} from "../../src/reel/index.js";
import { createBasicRegistry, createBasicReels } from "./helpers.js";

const INITIAL_SCENE = Object.freeze([
  Object.freeze([1, 0, 2]),
  Object.freeze([2, 1, 0]),
]);
const TARGET_SCENE = Object.freeze([
  Object.freeze([2, 3, 1]),
  Object.freeze([1, 0, 3]),
]);
const FINAL_YS = Object.freeze([2, 1]);
const TIMING = Object.freeze({
  startStepMs: 20,
  stopStepMs: 20,
  settleAfterLastStartMs: 80,
  minimumSpinCycles: 1,
  speedSymbolsPerSecond: 100,
}) satisfies GridCellReelSpinTiming;
const DIMMING = Object.freeze({
  evenAlpha: 0.5,
  oddAlpha: 0.35,
  fadeInMs: 20,
  fadeOutMs: 40,
}) satisfies GridCellDimmingPattern;

describe("RenderGridCellReelSet", () => {
  it("keeps a permanent cell mask and applies x/y offsets once", () => {
    const reelSet = createGridReelSet();
    const snapshot = reelSet.getSnapshot();

    expect(snapshot.cells).toHaveLength(6);
    expect(
      snapshot.cells.every(
        (cell) => cell.hasClipMask && cell.dimmingOnReel && cell.reelX === 0,
      ),
    ).toBe(true);
    expect(
      snapshot.cells.map((cell) => [cell.x, cell.y, cell.cellX, cell.cellY]),
    ).toEqual([
      [0, 0, 0, 0],
      [0, 1, 0, 12],
      [0, 2, 0, 24],
      [1, 0, 15, 0],
      [1, 1, 15, 12],
      [1, 2, 15, 24],
    ]);
  });

  it("resets to a scene, spins by cell order, skips appear and clears dimming", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);

    expect(reelSet.getVisibleScene()).toEqual(INITIAL_SCENE);
    expect(
      reelSet.getSnapshot().cells.every((cell) => cell.dimmingAlpha === 0),
    ).toBe(true);
    expect(
      reelSet.getSnapshot().cells.every((cell) => cell.phase === "completed"),
    ).toBe(true);

    const plan = createPlan();
    reelSet.spin(plan);
    expect(() => reelSet.spin(plan)).toThrow(/active/);

    let result = reelSet.update(0);
    expect(result.completed).toBe(false);
    expect(result.startedCells).toEqual([{ x: 0, y: 0, orderIndex: 0 }]);
    let snapshot = reelSet.getSnapshot();
    expect(snapshot.cells[0]).toMatchObject({
      phase: "spinning",
      requestedState: "spinBlur",
      dimmingAlpha: 0,
    });
    expect(snapshot.cells[1]).toMatchObject({
      phase: "waiting",
      requestedState: null,
    });

    result = reelSet.update(0.02);
    expect(result.startedCells).toEqual([
      { x: 0, y: 0, orderIndex: 0 },
      { x: 0, y: 1, orderIndex: 1 },
    ]);
    snapshot = reelSet.getSnapshot();
    expect(snapshot.cells[0].dimmingAlpha).toBeCloseTo(0.5);
    expect(snapshot.cells[1].dimmingAlpha).toBeCloseTo(0);
    expect(snapshot.cells[0].requestedState).toBe("spinBlur");

    result = reelSet.update(0.26);
    expect(result.completed).toBe(false);
    expect(result.landedCells).toHaveLength(6);
    snapshot = reelSet.getSnapshot();
    expect(snapshot.cells.map((cell) => cell.phase)).toContain("landed");
    expect(
      snapshot.cells.every((cell) => cell.requestedState !== "appear"),
    ).toBe(true);
    expect(
      snapshot.cells
        .filter(
          (cell) => cell.phase === "landed" && cell.requestedState !== null,
        )
        .every((cell) => cell.requestedState === "normal"),
    ).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual(TARGET_SCENE);
    expect(snapshot.cells.some((cell) => cell.dimmingAlpha > 0)).toBe(true);

    for (let index = 0; index < 12 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
      expect(
        reelSet
          .getSnapshot()
          .cells.every((cell) => cell.requestedState !== "appear"),
      ).toBe(true);
    }

    expect(result.completed).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual(TARGET_SCENE);
    snapshot = reelSet.getSnapshot();
    expect(snapshot.completed).toBe(true);
    expect(snapshot.cells.every((cell) => cell.phase === "completed")).toBe(
      true,
    );
    expect(
      snapshot.cells.every(
        (cell) => cell.dimmingAlpha === 0 && cell.requestedState !== "appear",
      ),
    ).toBe(true);
  });

  it("keeps unstarted stopped reels out of current-spin completion", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    reelSet.spin(createPlan());

    const result = reelSet.update(0);
    const snapshot = reelSet.getSnapshot();

    expect(result.completed).toBe(false);
    expect(result.startedCells).toHaveLength(1);
    expect(result.landedCells).toHaveLength(0);
    expect(
      snapshot.cells.slice(1).every((cell) => cell.phase === "waiting"),
    ).toBe(true);
  });

  it("scrolls the dimming strip with the micro reel instead of using a fixed overlay", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    reelSet.spin(createPlan());
    reelSet.update(0);

    const alphaSamples: number[] = [];
    for (let index = 0; index < 7; index += 1) {
      reelSet.update(0.02);
      alphaSamples.push(
        Number(reelSet.getSnapshot().cells[0].dimmingAlpha.toFixed(2)),
      );
    }

    expect(alphaSamples).toContain(0.5);
    expect(alphaSamples).toContain(0.35);
  });

  it("rejects invalid delta, bad reset data and bad spin plans", () => {
    const reelSet = createGridReelSet();
    expect(() => reelSet.update(-0.01)).toThrow(/deltaSeconds/);
    expect(() => reelSet.resetToScene([[1, 2, 3]], FINAL_YS)).toThrow(/scene/);
    expect(() => reelSet.resetToScene(INITIAL_SCENE, [1])).toThrow(/finalYs/);
    expect(() =>
      reelSet.spin({
        ...createPlan(),
        columns: 3,
      }),
    ).toThrow(/columns/);
  });
});

function createGridReelSet(): RenderGridCellReelSet {
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
  const reels = createBasicReels();
  return createGridCellReelSpinPlan({
    reels,
    finalYs: [0, 1],
    targetScene: TARGET_SCENE,
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
