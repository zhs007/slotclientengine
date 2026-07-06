import { describe, expect, it } from "vitest";
import { Container, Graphics } from "pixi.js";
import {
  RenderGridCellReelSet,
  createGridCellOrder,
  createGridCellReelOffsetMatrix,
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
  it("keeps clipping content separate from the cell root and applies offsets once", () => {
    const reelSet = createGridReelSet();
    const snapshot = reelSet.getSnapshot();

    expect(snapshot.cells).toHaveLength(6);
    expect(
      snapshot.cells.every(
        (cell) => !cell.hasClipMask && cell.dimmingOnReel && cell.reelX === 0,
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
    const firstRoot = reelSet.children[0];
    expect(firstRoot).toBeInstanceOf(Container);
    expect(firstRoot.mask).toBeUndefined();
    const clipMask = firstRoot.children.find(
      (child): child is Graphics => child instanceof Graphics,
    );
    const clipContent = firstRoot.children.find(
      (child): child is Container =>
        child instanceof Container && !(child instanceof Graphics),
    );
    expect(clipMask).toBeInstanceOf(Graphics);
    expect(clipMask?.visible).toBe(false);
    expect(clipContent).toBeInstanceOf(Container);
    expect(clipContent?.mask).toBeUndefined();
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
      hasClipMask: true,
      requestedState: "spinBlur",
      dimmingAlpha: 0,
    });
    expect(getCellClipMask(reelSet, 0).visible).toBe(true);
    expect(snapshot.cells[1]).toMatchObject({
      phase: "waiting",
      hasClipMask: false,
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
    expect(snapshot.cells[0].hasClipMask).toBe(true);
    expect(snapshot.cells[1].hasClipMask).toBe(true);
    expect(snapshot.cells[2].hasClipMask).toBe(false);

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
    expect(
      snapshot.cells
        .filter((cell) => cell.phase === "landed")
        .every((cell) => !cell.hasClipMask),
    ).toBe(true);
    expect(getCellClipMask(reelSet, 0).visible).toBe(false);

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
        (cell) =>
          !cell.hasClipMask &&
          cell.dimmingAlpha === 0 &&
          cell.requestedState !== "appear",
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

  it("sorts cell roots by visible symbol render priority", () => {
    const reelSet = createGridReelSet({
      symbolRenderPriorities: {
        A: 2,
      },
    });
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);

    expect(reelSet.sortableChildren).toBe(true);
    expect(getCellRoot(reelSet, 0).zIndex).toBeGreaterThan(
      getCellRoot(reelSet, 5).zIndex,
    );

    const defaultReelSet = createGridReelSet();
    defaultReelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    expect(getCellRoot(defaultReelSet, 5).zIndex).toBeGreaterThan(
      getCellRoot(defaultReelSet, 0).zIndex,
    );

    reelSet.spin(createPlan());
    let result = reelSet.update(0.05);
    for (let index = 0; index < 12 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(getCellRoot(reelSet, 2).zIndex).toBeGreaterThan(
      getCellRoot(reelSet, 0).zIndex,
    );
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

  it("accepts per-cell reel offsets for reset and spin without changing the target scene", () => {
    const reelSet = createGridReelSet();
    const cellReelOffsets = createGridCellReelOffsetMatrix({
      columns: 2,
      rows: 3,
      rowOffsetStep: 2,
      columnOffsetStep: 5,
    });

    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS, cellReelOffsets);
    expect(reelSet.getVisibleScene()).toEqual(INITIAL_SCENE);

    const plan = createPlan(cellReelOffsets);
    expect(plan.cells.map((cell) => cell.reelOffsetY)).toEqual([
      0, 2, 4, 5, 7, 9,
    ]);
    reelSet.spin(plan);
    let result = reelSet.update(0.01);
    for (let index = 0; index < 12 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual(TARGET_SCENE);
  });

  it("rejects malformed per-cell reel offsets on reset", () => {
    const reelSet = createGridReelSet();

    expect(() =>
      reelSet.resetToScene(INITIAL_SCENE, FINAL_YS, [[0, 1, 2]]),
    ).toThrow(/cellReelOffsets length/);
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

function getCellClipMask(
  reelSet: RenderGridCellReelSet,
  orderIndex: number,
): Graphics {
  const root = getCellRoot(reelSet, orderIndex);
  const clipMask = root.children.find(
    (child): child is Graphics => child instanceof Graphics,
  );
  if (!clipMask) {
    throw new Error(`Missing grid cell clip mask ${orderIndex}.`);
  }
  return clipMask;
}

function getCellRoot(
  reelSet: RenderGridCellReelSet,
  orderIndex: number,
): Container {
  const root = reelSet.children[orderIndex];
  if (!(root instanceof Container)) {
    throw new Error(`Missing grid cell root ${orderIndex}.`);
  }
  return root;
}

function createGridReelSet(
  registryOptions: Parameters<typeof createBasicRegistry>[0] = {},
): RenderGridCellReelSet {
  return new RenderGridCellReelSet({
    reels: createBasicReels(),
    registry: createBasicRegistry(registryOptions),
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

function createPlan(
  cellReelOffsets?: ReturnType<typeof createGridCellReelOffsetMatrix>,
) {
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
    cellReelOffsets,
    timing: TIMING,
    dimming: DIMMING,
  });
}
