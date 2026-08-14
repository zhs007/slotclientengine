import { describe, expect, it } from "vitest";
import { Container, Graphics } from "pixi.js";
import {
  RenderGridCellReelSet,
  createGridCellOrder,
  createGridCellReelOffsetMatrix,
  createGridCellReelSpinPlan,
  createGridCellCascadeDropPlan as createRendererCascadeDropPlan,
  type GridCellDimmingPattern,
  type GridCellReelSpinTiming,
  type AwaitableVisibleSymbolPresentationTarget,
  type VisibleSymbolPresentationTarget,
  type VisibleOccurrenceEffectPlayer,
  type VisibleOccurrenceEffectPlayerFactory,
} from "../../src/reel/index.js";
import { createRenderObject } from "../../src/presentation/index.js";
import { compileSlotCascadeFacts } from "@slotclientengine/logiccore";
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
  resolveDimmingAlpha: (code: number) => (code === 1 ? 0 : 0.82),
  fadeInMs: 20,
  fadeOutMs: 40,
}) satisfies GridCellDimmingPattern;

describe("RenderGridCellReelSet", () => {
  it("presents owned render objects through the shared symbol-area surface", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const source = reelSet.getSymbol({ x: 0, y: 0 });
    const target = reelSet.getSymbol({ x: 1, y: 0 });
    const markerView = new Container();
    const marker = createRenderObject({
      view: markerView,
      destroy: () => markerView.destroy(),
    });
    const sourcePoint = reelSet
      .getLayer("top")
      .resolveAnchor(source.getAnchor());
    reelSet.getLayer("top").addAt(marker, {
      anchor: source.getAnchor(),
      offset: { x: 1, y: -2 },
    });
    expect(reelSet.getLayer("top").resolveAnchor(marker.getAnchor())).toEqual({
      x: sourcePoint.x + 1,
      y: sourcePoint.y - 2,
    });
    reelSet.getLayer("top").remove(marker);
    marker.destroy();
    const view = new Container();
    const flying = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });

    const presentation = reelSet.present((context) =>
      context.transfer(reelSet.getLayer("win"), flying, {
        ownership: "destroy",
        from: source.getAnchor(),
        to: target.getAnchor(),
        durationSeconds: 0.1,
      }),
    );

    expect(view.parent).not.toBeNull();
    reelSet.update(0.1);
    await presentation;
    expect(view.destroyed).toBe(true);
  });

  it("interrupts and cleans a scoped presentation before continuous spin", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const view = new Container();
    const node = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });
    let continued = false;
    const presentation = reelSet.present(async (context) => {
      await context.withNode(
        reelSet.getLayer("win"),
        node,
        { ownership: "destroy" },
        () => context.delay(1),
      );
      continued = true;
    });

    reelSet.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 10,
    });
    await presentation;

    expect(continued).toBe(false);
    expect(view.destroyed).toBe(true);
    reelSet.cancelContinuous();
  });

  it("treats -1 as the shared direct-grid hole marker", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(
      [
        [1, -1, 2],
        [2, 1, 0],
      ],
      FINAL_YS,
    );
    expect(reelSet.getVisibleScene()[0]).toEqual([1, -1, 2]);
    expect(reelSet.getSymbol({ x: 0, y: 1 })).toMatchObject({
      code: -1,
      symbol: "__empty__",
      kind: "empty",
    });
  });

  it("lands cellspin on the shared -1 empty symbol", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const plan = createGridCellReelSpinPlan({
      reels: createBasicReels(),
      finalYs: FINAL_YS,
      targetScene: [
        [-1, 0, 2],
        [2, 1, 0],
      ],
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

    reelSet.spin(plan);
    reelSet.update(1);

    expect(reelSet.getVisibleScene()[0]?.[0]).toBe(-1);
    expect(reelSet.getSnapshot().cells[0]).toMatchObject({
      visibleSymbol: -1,
      occupied: false,
      presentationValue: null,
    });
  });

  it("exposes empty snapshots and replaces between empty and real symbols", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(
      [
        [-1, 0, 2],
        [2, 1, 0],
      ],
      FINAL_YS,
    );
    expect(reelSet.getVisibleSymbolStateSnapshot(0, 0)).toMatchObject({
      code: -1,
      kind: "empty",
      requestedState: null,
      isOnce: false,
    });
    expect(reelSet.getVisibleSymbolGeometrySnapshot(0, 0)).toMatchObject({
      code: -1,
      kind: "empty",
      centerX: 7.5,
      centerY: 6,
    });
    reelSet.setVisibleSymbolPresentationValue(0, 0, null);
    expect(() => reelSet.setVisibleSymbolPresentationValue(0, 0, 2)).toThrow(
      /only accepts a null/,
    );
    expect(reelSet.replaceSymbol({ x: 0, y: 0 }, { code: 1 })).toMatchObject({
      code: 1,
      kind: "symbol",
    });
    expect(reelSet.replaceSymbol({ x: 0, y: 0 }, { code: -1 })).toMatchObject({
      code: -1,
      kind: "empty",
    });
  });

  it("runs additive direct transfer and drop promises on the runtime clock", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS, undefined, [
      [7, null, null],
      [null, null, null],
    ]);
    const transfer = reelSet.transferSymbols({
      transfers: [
        {
          source: { x: 0, y: 0 },
          target: { x: 1, y: 0 },
          sourceReplacementCode: 2,
          sourceReplacementPresentationValue: null,
        },
      ],
      durationMs: 100,
    });
    reelSet.update(0.05);
    expect(reelSet.getVisibleScene()).toEqual(INITIAL_SCENE);
    reelSet.update(0.05);
    await transfer;
    expect(reelSet.getVisibleScene()).toEqual([
      [2, 0, 2],
      [1, 1, 0],
    ]);
    expect(reelSet.getSymbol({ x: 1, y: 0 }).getValue()).toBe(7);

    reelSet.releaseVisibleSymbols([{ x: 0, y: 2 }]);
    const drop = reelSet.dropOccurrences({
      movements: [
        {
          kind: "existing",
          x: 0,
          sourceY: 0,
          targetY: 2,
          startSeconds: 0,
          fallSeconds: 0.1,
          settleSeconds: 0.1,
          overshootPixels: 1,
        },
      ],
      valueCommits: [{ x: 0, y: 2, presentationValue: null }],
    });
    reelSet.update(0.2);
    await drop;
    expect(reelSet.getVisibleScene()[0]).toEqual([-1, 0, 2]);
  });

  it("rolls back direct transfer and existing drop when aborted", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const transferAbort = new AbortController();
    const transfer = reelSet.transferSymbols({
      transfers: [
        {
          source: { x: 0, y: 0 },
          target: { x: 1, y: 0 },
          sourceReplacementCode: 2,
          sourceReplacementPresentationValue: null,
        },
      ],
      durationMs: 100,
      signal: transferAbort.signal,
    });
    reelSet.update(0.05);
    transferAbort.abort();
    await expect(transfer).rejects.toThrow(/aborted/);
    expect(reelSet.getVisibleScene()).toEqual(INITIAL_SCENE);

    reelSet.releaseVisibleSymbols([{ x: 0, y: 2 }]);
    const beforeDrop = reelSet.getVisibleScene();
    const dropAbort = new AbortController();
    const drop = reelSet.dropOccurrences({
      movements: [
        {
          kind: "existing",
          x: 0,
          sourceY: 0,
          targetY: 2,
          startSeconds: 0,
          fallSeconds: 0.2,
          settleSeconds: 0.1,
          overshootPixels: 1,
        },
      ],
      signal: dropAbort.signal,
    });
    reelSet.update(0.05);
    dropAbort.abort();
    await expect(drop).rejects.toThrow(/aborted/);
    expect(reelSet.getVisibleScene()).toEqual(beforeDrop);
  });

  it("terminal-removes the producer-selected occurrences", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS, undefined, [
      [7, null, null],
      [null, null, null],
    ]);
    const removal = reelSet.removeVisibleSymbols({
      positions: [{ x: 1, y: 0 }],
      state: "remove",
      playback: { transitionMode: "immediate", completion: "once-complete" },
      onComplete: () => {
        expect(reelSet.getVisibleScene()[1][0]).toBe(-1);
      },
    });

    reelSet.update(0.59);
    expect(reelSet.getVisibleScene()).toEqual([
      [1, 0, 2],
      [-1, 1, 0],
    ]);
    await removal;
    expect(reelSet.getVisibleScene()).toEqual([
      [1, 0, 2],
      [-1, 1, 0],
    ]);
    expect(reelSet.getVisibleSymbolStateSnapshot(0, 0)).toMatchObject({
      code: 1,
      requestedState: "normal",
    });
  });

  it("keeps waiting and selective-held occurrence animations advancing during spin", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const heldPlayback = reelSet.playVisibleSymbolStates(
      [{ x: 1, y: 1 }],
      "win",
      { transitionMode: "immediate", completion: "once-complete" },
    );
    const target = [
      [2, 0, 2],
      [2, 1, 0],
    ];
    const plan = createGridCellReelSpinPlan({
      reels: createBasicReels(),
      finalYs: FINAL_YS,
      targetScene: target,
      columns: 2,
      rows: 3,
      order: createGridCellOrder({
        columns: 2,
        rows: 3,
        mode: "top-down-left-right",
      }),
      positions: [{ x: 0, y: 0 }],
      timing: { ...TIMING, settleAfterLastStartMs: 800 },
      dimming: DIMMING,
    });

    reelSet.spinSelective(plan);
    reelSet.update(0.59);
    await heldPlayback;

    expect(reelSet.getSnapshot().spinning).toBe(true);
    expect(reelSet.getVisibleSymbolStateSnapshot(1, 1)).toMatchObject({
      code: 1,
      onceCompletionCount: 1,
      requestedState: "normal",
    });
  });

  it("selectively spins into released and visually empty cascade holes", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    reelSet.releaseVisibleSymbols([{ x: 0, y: 0 }]);
    const target = [
      [2, 0, 2],
      [2, 1, 3],
    ];
    const plan = createGridCellReelSpinPlan({
      reels: createBasicReels(),
      finalYs: FINAL_YS,
      targetScene: target,
      columns: 2,
      rows: 3,
      order: createGridCellOrder({
        columns: 2,
        rows: 3,
        mode: "top-down-left-right",
      }),
      positions: [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ],
      timing: TIMING,
      dimming: DIMMING,
    });

    reelSet.spinSelective(plan);
    reelSet.update(1);

    expect(reelSet.getSnapshot().spinning).toBe(false);
    expect(reelSet.getVisibleScene()).toEqual(target);
  });

  it("awaits a preflighted visible-symbol batch and rejects release-bound playback", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const target: AwaitableVisibleSymbolPresentationTarget = reelSet;
    const positions = Object.freeze([
      Object.freeze({ x: 1, y: 1 }),
      Object.freeze({ x: 0, y: 2 }),
      Object.freeze({ x: 1, y: 1 }),
    ]);
    let completed = false;
    const playback = target
      .playVisibleSymbolStates(positions, "win", {
        transitionMode: "immediate",
        completion: "once-complete",
      })
      .then(() => {
        completed = true;
      });
    reelSet.update(0.57);
    await Promise.resolve();
    expect(completed).toBe(false);
    reelSet.update(0.02);
    await playback;
    expect(completed).toBe(true);

    const releasedPlayback = target.playVisibleSymbolStates(
      [positions[0]],
      "win",
      {
        transitionMode: "immediate",
        completion: "once-complete",
      },
    );
    const releaseAssertion =
      expect(releasedPlayback).rejects.toThrow(/pool release|destroy/);
    reelSet.releaseVisibleSymbols([positions[0]]);
    await releaseAssertion;
  });

  it("retains cascade values for symbols without a visual value controller", () => {
    const reelSet = createGridReelSet();
    const values = [
      [1, null, null],
      [null, null, null],
    ];

    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS, undefined, values);
    expect(reelSet.getCascadeValues()).toEqual(values);

    reelSet.setVisibleSymbolPresentationValue(0, 0, 2);
    expect(reelSet.getCascadeValues()[0][0]).toBe(2);
  });

  it("implements stopped visible-symbol presentation with grid-local geometry", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const target: VisibleSymbolPresentationTarget = reelSet;
    const positions = Object.freeze([
      Object.freeze({ x: 1, y: 1 }),
      Object.freeze({ x: 0, y: 2 }),
    ]);

    target.requestVisibleSymbolStates(positions, "win");
    expect(target.getVisibleSymbolStateSnapshots(positions)).toMatchObject([
      { x: 1, y: 1, code: INITIAL_SCENE[1][1], requestedState: "win" },
      { x: 0, y: 2, code: INITIAL_SCENE[0][2], requestedState: "win" },
    ]);
    expect(target.getVisibleSymbolGeometrySnapshots(positions)).toMatchObject([
      { x: 1, y: 1, centerX: 22.5, centerY: 18, cellWidth: 15, cellHeight: 12 },
      { x: 0, y: 2, centerX: 7.5, centerY: 30, cellWidth: 15, cellHeight: 12 },
    ]);
    const idleResult = reelSet.update(0.58);
    expect(idleResult).toMatchObject({ completed: false, spinning: false });
    expect(target.getVisibleSymbolStateSnapshots(positions)).toMatchObject([
      { x: 1, y: 1, requestedState: "normal", resolvedState: "normal" },
      { x: 0, y: 2, requestedState: "normal", resolvedState: "normal" },
    ]);
    expect(reelSet.getVisibleScene()).toEqual(INITIAL_SCENE);
    reelSet.setVisibleSymbolDimming([{ x: 0, y: 0 }], 0.85);
    const dimmed = reelSet.getSnapshot().cells;
    expect(dimmed.every((cell) => cell.dimmingOverlayRenderable)).toBe(true);
    expect(
      dimmed.find((cell) => cell.x === 0 && cell.y === 0)?.dimmingAlpha,
    ).toBe(0);
    expect(
      dimmed.find((cell) => cell.x === 0 && cell.y === 0)?.symbolDimmingAlpha,
    ).toBe(1);
    expect(
      dimmed.find((cell) => cell.x === 1 && cell.y === 0)?.dimmingAlpha,
    ).toBe(0.85);
    expect(
      dimmed.find((cell) => cell.x === 1 && cell.y === 0)?.symbolDimmingAlpha,
    ).toBeCloseTo(0.15, 2);
    reelSet.clearVisibleSymbolDimming();
    expect(
      reelSet.getSnapshot().cells.every((cell) => cell.dimmingAlpha === 0),
    ).toBe(true);
    expect(
      reelSet
        .getSnapshot()
        .cells.every((cell) => !cell.dimmingOverlayRenderable),
    ).toBe(true);
    expect(
      reelSet
        .getSnapshot()
        .cells.filter((cell) => cell.visibleSymbol !== 0)
        .every((cell) => cell.symbolDimmingAlpha === 1),
    ).toBe(true);
    expect(() => reelSet.setVisibleSymbolDimming([], 1.1)).toThrow(
      /between 0 and 1/,
    );
  });

  it("rejects state requests and geometry reads while a grid spin is active", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    reelSet.spin(createPlan());

    expect(() => reelSet.requestVisibleSymbolState(0, 0, "win")).toThrow(
      /spinning/,
    );
    expect(() => reelSet.getVisibleSymbolGeometrySnapshot(0, 0)).toThrow(
      /spinning/,
    );
    expect(() => reelSet.getVisibleSymbolStateSnapshot(3, 0)).toThrow(
      /Missing grid cell/,
    );
    expect(() => reelSet.getVisibleSymbolStateSnapshot(0.5, 0)).toThrow(
      /integers/,
    );
  });
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

  it("applies nonzero column and row gaps to real grid cells and geometry", () => {
    const reelSet = new RenderGridCellReelSet({
      reels: createBasicReels(),
      registry: createBasicRegistry(),
      columns: 2,
      rows: 3,
      cellWidth: 15,
      cellHeight: 12,
      columnGap: 4,
      rowGap: 3,
      order: createGridCellOrder({
        columns: 2,
        rows: 3,
        mode: "top-down-left-right",
      }),
    });
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    expect(
      reelSet
        .getSnapshot()
        .cells.map((cell) => [cell.x, cell.y, cell.cellX, cell.cellY]),
    ).toEqual([
      [0, 0, 0, 0],
      [0, 1, 0, 15],
      [0, 2, 0, 30],
      [1, 0, 19, 0],
      [1, 1, 19, 15],
      [1, 2, 19, 30],
    ]);
    expect(reelSet.getVisibleSymbolGeometrySnapshot(1, 2)).toMatchObject({
      centerX: 26.5,
      centerY: 36,
    });
  });

  it("plays configured appear per landed cell before normal and completion", () => {
    const reelSet = createGridReelSet({
      landingAppearSymbols: ["A", "B"],
    });
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
      dimmingOverlayRenderable: false,
    });
    expect(getCellClipMask(reelSet, 0).visible).toBe(true);
    expect(snapshot.cells[1]).toMatchObject({
      phase: "waiting",
      hasClipMask: false,
      requestedState: null,
    });

    result = reelSet.update(0.02);
    expect(result.startedCells).toEqual([{ x: 0, y: 1, orderIndex: 1 }]);
    snapshot = reelSet.getSnapshot();
    expect([0, 0.82]).toContain(snapshot.cells[0].dimmingAlpha);
    expect(
      [0, 0.18, 1].some(
        (expected) =>
          Math.abs(snapshot.cells[0].symbolDimmingAlpha - expected) < 0.01,
      ),
    ).toBe(true);
    expect(snapshot.cells[1].dimmingAlpha).toBeCloseTo(0);
    expect(snapshot.cells[1].symbolDimmingAlpha).toBe(0);
    expect(snapshot.cells[0].requestedState).toBe("spinBlur");
    expect(
      snapshot.cells
        .filter((cell) => cell.phase === "spinning")
        .some((cell) => cell.dimmingOverlayRenderable),
    ).toBe(true);
    expect(snapshot.cells[0].hasClipMask).toBe(true);
    expect(snapshot.cells[1].hasClipMask).toBe(true);
    expect(snapshot.cells[2].hasClipMask).toBe(false);

    result = reelSet.update(0.26);
    expect(result.completed).toBe(false);
    expect(result.landedCells).toHaveLength(6);
    snapshot = reelSet.getSnapshot();
    expect(snapshot.cells.map((cell) => cell.phase)).toContain("landed");
    expect(
      snapshot.cells
        .filter((cell) => cell.phase === "landed")
        .some((cell) => cell.requestedState === "appear"),
    ).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual(TARGET_SCENE);
    expect(snapshot.cells.some((cell) => cell.dimmingAlpha > 0)).toBe(true);
    expect(
      snapshot.cells
        .filter((cell) => cell.phase === "landed")
        .every((cell) => !cell.hasClipMask),
    ).toBe(true);
    expect(getCellClipMask(reelSet, 0).visible).toBe(false);

    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
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
          (cell.symbolDimmingAlpha === 0 || cell.symbolDimmingAlpha === 1) &&
          cell.requestedState !== "appear",
      ),
    ).toBe(true);
  });

  it("starts a configured state at each cell landing while later cells still spin", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    reelSet.spin(createPlan(), {
      targetLandingStates: [
        ["appear", "appear", "appear"],
        ["appear", "appear", "appear"],
      ],
    });
    reelSet.update(0);

    const result = reelSet.update(0.18);

    expect(result.spinning).toBe(true);
    expect(result.landedCells).toEqual([{ x: 0, y: 0, orderIndex: 0 }]);
    expect(reelSet.getSnapshot().cells[0]!.phase).toBe("landed");
    expect(
      reelSet
        .getSnapshot()
        .cells.slice(1)
        .some((cell) => cell.phase === "spinning"),
    ).toBe(true);

    expect(reelSet.getSnapshot().cells[0]).toMatchObject({
      phase: "landed",
      requestedState: "appear",
    });
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

  it("dims rolling cells with scrolling black overlays without fading symbol alpha", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    reelSet.spin(createPlan());
    reelSet.update(0);

    const alphaSamples: number[] = [];
    const symbolAlphaSamples: number[] = [];
    const overlaySamples: boolean[] = [];
    for (let index = 0; index < 7; index += 1) {
      reelSet.update(0.02);
      for (const cell of reelSet.getSnapshot().cells) {
        alphaSamples.push(Number(cell.dimmingAlpha.toFixed(2)));
        symbolAlphaSamples.push(Number(cell.symbolDimmingAlpha.toFixed(2)));
        overlaySamples.push(cell.dimmingOverlayRenderable);
        if (cell.dimmingAlpha > 0) {
          expect(cell.dimmingOverlayRenderable).toBe(true);
        }
      }
    }

    expect(alphaSamples).toContain(0);
    expect(alphaSamples).toContain(0.82);
    expect(overlaySamples).toContain(true);
    expect(symbolAlphaSamples).toContain(1);
    expect(symbolAlphaSamples).toContain(0.18);
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

  it("releases holes and completes existing plus refill symbols in one fall", () => {
    const reelSet = createGridReelSet();
    const cascadeInitial = [
      [1, 2, 2],
      [2, 1, 1],
    ];
    reelSet.resetToScene(cascadeInitial, FINAL_YS);
    reelSet.releaseVisibleSymbols([
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]);
    expect(reelSet.getVisibleScene()).toEqual([
      [1, -1, 2],
      [-1, 1, 1],
    ]);
    expect(reelSet.getCascadeValues()).toEqual([
      [null, -1, null],
      [-1, null, null],
    ]);

    const drop = createGridCellCascadeDropPlan({
      sourceScene: reelSet.getVisibleScene(),
      sourceValues: reelSet.getCascadeValues(),
      settledScene: [
        [-1, 1, 2],
        [-1, 1, 1],
      ],
      settledValues: [
        [-1, null, null],
        [-1, null, null],
      ],
      targetScene: [
        [1, 1, 2],
        [2, 1, 1],
      ],
      targetValues: [
        [null, 50, null],
        [null, 75, 100],
      ],
      refillPositions: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      cellHeight: 12,
      motion: {
        columnStartStaggerSeconds: 0.03,
        baseFallSeconds: 0.05,
        perRowFallSeconds: 0.02,
        maxFallSeconds: 0.2,
        startStaggerSeconds: 0.01,
        settleSeconds: 0.02,
        overshootCellRatio: 0.1,
      },
    });
    reelSet.startCascadeDrop(drop);
    expect(reelSet.getSnapshot()).toMatchObject({
      spinning: true,
      completed: false,
    });
    expect(() => reelSet.releaseVisibleSymbols([{ x: 0, y: 1 }])).toThrow(
      /spinning/,
    );
    let result = reelSet.update(0.04);
    expect(result.completed).toBe(false);
    for (let index = 0; index < 10 && !result.completed; index += 1) {
      result = reelSet.update(0.03);
    }
    expect(result.completed).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual([
      [1, 1, 2],
      [2, 1, 1],
    ]);
    expect(reelSet.getCascadeValues()).toEqual([
      [null, 50, null],
      [null, 75, 100],
    ]);
  });

  it("lets a falling symbol pass behind a fixed higher-priority symbol", () => {
    const reelSet = createGridReelSet({ symbolRenderPriorities: { A: 1 } });
    reelSet.resetToScene(
      [
        [2, 1, 2],
        [2, 1, 1],
      ],
      FINAL_YS,
    );
    reelSet.releaseVisibleSymbols([{ x: 0, y: 2 }]);
    const sourceScene = reelSet.getVisibleScene();
    const sourceValues = reelSet.getCascadeValues();
    const settledScene = [
      [-1, 1, 2],
      [2, 1, 1],
    ];
    const settledValues = [
      [-1, null, null],
      [null, null, null],
    ];
    const plan = createGridCellCascadeDropPlan({
      sourceScene,
      sourceValues,
      settledScene,
      settledValues,
      targetScene: [
        [2, 1, 2],
        [2, 1, 1],
      ],
      targetValues: [
        [null, null, null],
        [null, null, null],
      ],
      refillPositions: [{ x: 0, y: 0 }],
      canDropOccurrence: ({ code }) => code !== 1,
      cellHeight: 12,
      motion: {
        columnStartStaggerSeconds: 0,
        baseFallSeconds: 0.05,
        perRowFallSeconds: 0.02,
        maxFallSeconds: 0.2,
        startStaggerSeconds: 0,
        settleSeconds: 0.02,
        overshootCellRatio: 0,
      },
    });
    const stationaryChildren = new Set(reelSet.children);
    reelSet.startCascadeDrop(plan);
    const fixedWildLayer = reelSet.children[1].zIndex;
    const movingSymbols = reelSet.children.filter(
      (child) => !stationaryChildren.has(child),
    );
    const movingLayers = movingSymbols.map((child) => child.zIndex);
    expect(movingLayers).toHaveLength(2);
    expect(movingSymbols.every((symbol) => symbol.mask == null)).toBe(true);
    const movementMask = reelSet.mask;
    expect(movementMask).toBeInstanceOf(Graphics);
    if (!(movementMask instanceof Graphics)) {
      throw new Error("Cascade movement mask must be a Graphics instance.");
    }
    expect(movementMask.visible).toBe(true);
    expect(movementMask.renderable).toBe(true);
    expect(movingLayers.every((zIndex) => zIndex < fixedWildLayer)).toBe(true);
    reelSet.update(plan.totalSeconds);
    expect(movingSymbols.every((symbol) => symbol.parent !== reelSet)).toBe(
      true,
    );
    expect(reelSet.mask == null).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual([
      [2, 1, 2],
      [2, 1, 1],
    ]);
    expect(reelSet.getCascadeValues()).toEqual([
      [null, null, null],
      [null, null, null],
    ]);
  });

  it("rejects invalid runtime coordinates and trusts cascade value commits", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    expect(() =>
      reelSet.releaseVisibleSymbols([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toThrow(/duplicate/);
    expect(() => reelSet.releaseVisibleSymbols([{ x: 9, y: 0 }])).toThrow(
      /out of range/,
    );
    reelSet.releaseVisibleSymbols([{ x: 0, y: 0 }]);
    expect(() => reelSet.releaseVisibleSymbols([{ x: 0, y: 0 }])).toThrow(
      /empty/,
    );
    expect(reelSet.getVisibleSymbolStateSnapshot(0, 0)).toMatchObject({
      code: -1,
      kind: "empty",
    });
    expect(reelSet.hasVisibleSymbolStateCapability(0, 0, "remove")).toBe(false);
    expect(() =>
      reelSet.startCascadeDrop({
        ...createGridCellCascadeDropPlan({
          sourceScene: reelSet.getVisibleScene(),
          sourceValues: reelSet.getCascadeValues(),
          settledScene: reelSet.getVisibleScene(),
          settledValues: reelSet.getCascadeValues(),
          targetScene: INITIAL_SCENE,
          targetValues: [
            [null, null, null],
            [null, null, null],
          ],
          refillPositions: [{ x: 0, y: 0 }],
          cellHeight: 12,
          motion: {
            columnStartStaggerSeconds: 0,
            baseFallSeconds: 0.05,
            perRowFallSeconds: 0.02,
            maxFallSeconds: 0.2,
            startStaggerSeconds: 0,
            settleSeconds: 0.01,
            overshootCellRatio: 0,
          },
        }),
        columns: 3,
      }),
    ).toThrow(/dimensions/);

    const valueDriftPlan = createGridCellCascadeDropPlan({
      sourceScene: reelSet.getVisibleScene(),
      sourceValues: [
        [-1, 7, null],
        [null, null, null],
      ],
      settledScene: reelSet.getVisibleScene(),
      settledValues: [
        [-1, 7, null],
        [null, null, null],
      ],
      targetScene: INITIAL_SCENE,
      targetValues: [
        [null, 7, null],
        [null, null, null],
      ],
      refillPositions: [{ x: 0, y: 0 }],
      cellHeight: 12,
      motion: {
        columnStartStaggerSeconds: 0,
        baseFallSeconds: 0.05,
        perRowFallSeconds: 0.02,
        maxFallSeconds: 0.2,
        startStaggerSeconds: 0,
        settleSeconds: 0.01,
        overshootCellRatio: 0,
      },
    });
    expect(() => reelSet.startCascadeDrop(valueDriftPlan)).not.toThrow();
    expect(reelSet.getSnapshot().spinning).toBe(true);
    reelSet.destroy();
  });

  it("prepares visible occurrence replacement without mutation and commits atomically", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const before = reelSet.getVisibleScene();
    const rolledBack = reelSet.prepareVisibleOccurrenceReplacement({
      x: 0,
      y: 0,
      outputCode: 2,
      outputPresentationValue: null,
    });
    expect(reelSet.getVisibleScene()).toEqual(before);
    rolledBack.rollback();
    expect(() => rolledBack.commit()).toThrow(/rolled-back/);
    expect(reelSet.getVisibleScene()).toEqual(before);

    const prepared = reelSet.prepareVisibleOccurrenceReplacement({
      x: 0,
      y: 0,
      outputCode: 2,
      outputPresentationValue: null,
    });
    prepared.commit();
    prepared.commit();
    expect(reelSet.getVisibleScene()[0][0]).toBe(2);
    const trusted = reelSet.prepareVisibleOccurrenceReplacement({
      x: 0,
      y: 0,
      outputCode: 2,
      outputPresentationValue: null,
    });
    trusted.rollback();
  });

  it("moves a complete visible occurrence and commits source replacement as one batch", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS, undefined, [
      [7, null, null],
      [null, null, null],
    ]);
    const before = reelSet.getVisibleScene();
    const prepared = reelSet.prepareVisibleOccurrenceTransferBatch({
      transfers: [
        {
          source: { x: 0, y: 0 },
          target: { x: 1, y: 0 },
          sourceReplacementCode: 2,
          sourceReplacementPresentationValue: null,
        },
      ],
    });
    expect(reelSet.getVisibleScene()).toEqual(before);
    prepared.start();
    prepared.setProgress(0.5);
    expect(reelSet.getVisibleScene()).toEqual(before);
    prepared.setProgress(1);
    prepared.commit();
    expect(reelSet.getVisibleScene()).toEqual([
      [2, 0, 2],
      [1, 1, 0],
    ]);
    expect(reelSet.getCascadeValues()[1][0]).toBe(7);
  });

  it("commits an exact -1/null source hole and rejects invalid hole values before mutation", () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const before = reelSet.getVisibleScene();
    expect(() =>
      reelSet.prepareVisibleOccurrenceTransferBatch({
        transfers: [
          {
            source: { x: 0, y: 0 },
            target: { x: 1, y: 0 },
            sourceReplacementCode: -1,
            sourceReplacementPresentationValue: 7,
          },
        ],
      }),
    ).toThrow(/must be null/);
    expect(reelSet.getVisibleScene()).toEqual(before);

    const prepared = reelSet.prepareVisibleOccurrenceTransferBatch({
      transfers: [
        {
          source: { x: 0, y: 0 },
          target: { x: 1, y: 0 },
          sourceReplacementCode: -1,
          sourceReplacementPresentationValue: null,
        },
      ],
    });
    prepared.start();
    prepared.setProgress(1);
    prepared.commit();
    expect(reelSet.getVisibleScene()).toEqual([
      [-1, 0, 2],
      [1, 1, 0],
    ]);
  });

  it("awaits scoped motion, keeps target identity until commit, and drives delays from update", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const originalTarget = reelSet.getVisibleOccurrenceHandle(1, 0);
    let arrived = false;
    const transfer = reelSet.runVisibleOccurrenceTransfer(
      {
        source: { x: 0, y: 0 },
        target: { x: 1, y: 0 },
        sourceReplacementCode: 2,
        sourceReplacementPresentationValue: null,
      },
      async (tx) => {
        expect(tx.target.getSnapshot().code).toBe(
          originalTarget.getSnapshot().code,
        );
        await tx.delay(50);
        await tx.move({
          durationMs: 100,
          path: { kind: "line" },
          easing: { kind: "linear" },
          stacking: { layer: "above-effects", order: 4 },
        });
        arrived = true;
        await tx.commit();
      },
    );
    reelSet.update(0.049);
    await Promise.resolve();
    expect(arrived).toBe(false);
    reelSet.update(0.001);
    await Promise.resolve();
    expect(() => reelSet.getVisibleOccurrenceHandle(0, 0)).toThrow(/leased/);
    reelSet.update(0.1);
    await transfer;
    expect(arrived).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual([
      [2, 0, 2],
      [1, 1, 0],
    ]);
    expect(() => originalTarget.getSnapshot()).toThrow(/stale/);
  });

  it("keeps occurrence effects identity-bound and cleans the overwritten target effect", async () => {
    const players: Array<
      VisibleOccurrenceEffectPlayer & { destroyed: boolean }
    > = [];
    const factory: VisibleOccurrenceEffectPlayerFactory = async ({
      parent,
    }) => {
      expect(parent.parent).not.toBeNull();
      const player = {
        destroyed: false,
        play: async () => {},
        update: () => {},
        stop: () => {},
        destroy() {
          this.destroyed = true;
        },
      } satisfies VisibleOccurrenceEffectPlayer & { destroyed: boolean };
      players.push(player);
      return player;
    };
    const reelSet = createGridReelSet({}, factory);
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const moving = reelSet.getVisibleOccurrenceHandle(0, 0);
    const target = reelSet.getVisibleOccurrenceHandle(1, 0);
    await moving.attachEffect({ key: "moving", kind: "vni" });
    await target.attachEffect({ key: "target", kind: "spine" });

    const transfer = reelSet.runVisibleOccurrenceTransfer(
      {
        source: { x: 0, y: 0 },
        target: { x: 1, y: 0 },
        sourceReplacementCode: 2,
        sourceReplacementPresentationValue: null,
      },
      async (tx) => {
        await tx.move({
          durationMs: 10,
          path: { kind: "line" },
          easing: { kind: "linear" },
          stacking: { layer: "above-symbols", order: 0 },
        });
        await tx.commit();
      },
    );
    reelSet.update(0.01);
    await transfer;
    expect(players.map((player) => player.destroyed)).toEqual([false, true]);
    expect(moving.getSnapshot()).toMatchObject({ x: 1, y: 0, code: 1 });
  });

  it("rolls back and rejects scoped motion when reset interrupts it", async () => {
    const reelSet = createGridReelSet();
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    const transfer = reelSet.runVisibleOccurrenceTransfer(
      {
        source: { x: 0, y: 0 },
        target: { x: 1, y: 0 },
        sourceReplacementCode: 2,
        sourceReplacementPresentationValue: null,
      },
      async (tx) => {
        await tx.move({
          durationMs: 100,
          path: { kind: "line" },
          easing: { kind: "linear" },
          stacking: { layer: "above-effects", order: 0 },
        });
        await tx.commit();
      },
    );
    reelSet.resetToScene(INITIAL_SCENE, FINAL_YS);
    await expect(transfer).rejects.toThrow(/reset/);
    expect(reelSet.getVisibleScene()).toEqual(INITIAL_SCENE);
  });
});

function createGridCellCascadeDropPlan(options: {
  readonly sourceScene: readonly (readonly number[])[];
  readonly sourceValues: readonly (readonly (number | null | -1)[])[];
  readonly settledScene: readonly (readonly number[])[];
  readonly settledValues: readonly (readonly (number | null | -1)[])[];
  readonly targetScene: readonly (readonly number[])[];
  readonly targetValues: readonly (readonly (number | null | -1)[])[];
  readonly refillPositions: readonly {
    readonly x: number;
    readonly y: number;
  }[];
  readonly canDropOccurrence?: (context: {
    readonly x: number;
    readonly sourceY: number;
    readonly code: number;
    readonly presentationValue: number | null;
  }) => boolean;
  readonly cellHeight: number;
  readonly rowGap?: number;
  readonly motion: Parameters<
    typeof createRendererCascadeDropPlan
  >[0]["motion"];
}) {
  const facts = compileSlotCascadeFacts({
    sourceScene: options.sourceScene,
    sourceValues: options.sourceValues,
    dropdownScene: options.settledScene,
    dropdownValues: options.settledValues,
    targetScene: options.targetScene,
    targetValues: options.targetValues,
    refillPositions: options.refillPositions,
    ...(options.canDropOccurrence
      ? {
          canDropOccurrence: ({ x, y, code, value }) =>
            options.canDropOccurrence!({
              x,
              sourceY: y,
              code,
              presentationValue: value,
            }),
        }
      : {}),
  });
  return createRendererCascadeDropPlan({
    columns: facts.columns,
    rows: facts.rows,
    movements: [...facts.dropdownMovements, ...facts.refillMovements],
    valueCommits: facts.targetValueCommits,
    cellHeight: options.cellHeight,
    ...(options.rowGap === undefined ? {} : { rowGap: options.rowGap }),
    motion: options.motion,
  });
}

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
  occurrenceEffectPlayerFactory?: VisibleOccurrenceEffectPlayerFactory,
): RenderGridCellReelSet {
  return new RenderGridCellReelSet({
    reels: createBasicReels(),
    registry: createBasicRegistry({
      ...registryOptions,
      symbolAnimationCapabilities:
        registryOptions.symbolAnimationCapabilities ?? {
          A: ["dropdown"],
          B: ["dropdown"],
          C: ["dropdown"],
        },
    }),
    columns: 2,
    rows: 3,
    cellWidth: 15,
    cellHeight: 12,
    order: createGridCellOrder({
      columns: 2,
      rows: 3,
      mode: "top-down-left-right",
    }),
    occurrenceEffectPlayerFactory,
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
