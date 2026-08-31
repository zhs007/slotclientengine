import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  RenderGridCellReelSet,
  createGridCellOrder,
  createGridCellReelSpinPlan,
  type GridCellEffectController,
  type GridCellReelEffectPlanOptions,
} from "../../src/reel/index.js";
import { createBasicRegistry, createBasicReels } from "./helpers.js";
import { observeSpinLifecycle } from "../../src/reel/spin-lifecycle.js";

const INITIAL = Object.freeze([
  Object.freeze([1, 0, 2]),
  Object.freeze([2, 1, 0]),
]);
const TARGET = Object.freeze([
  Object.freeze([2, 3, 1]),
  Object.freeze([1, 0, 3]),
]);
const ORDER = createGridCellOrder({
  columns: 2,
  rows: 3,
  mode: "top-down-left-right",
});

describe("grid-cell immediate spin stop", () => {
  it("commits all waiting targets synchronously and still completes landing appear", () => {
    const reel = createReel();
    reel.resetToScene(INITIAL, [2, 1]);
    expect(() => reel.stopSpinImmediately()).toThrow(/target-aware spin/);
    const lifecycle: string[] = [];
    const dispose = observeSpinLifecycle(reel, (event) =>
      lifecycle.push(event.lifecycle),
    );
    reel.spin(createPlan());

    const landed = reel.stopSpinImmediately();

    expect(landed).toEqual(ORDER);
    expect(reel.getVisibleScene()).toEqual(TARGET);
    expect(
      reel
        .getSnapshot()
        .cells.every(
          (cell) =>
            !cell.hasClipMask &&
            cell.dimmingAlpha === 0 &&
            !cell.dimmingOverlayRenderable,
        ),
    ).toBe(true);
    expect(
      reel.getSnapshot().cells.some((cell) => cell.requestedState === "appear"),
    ).toBe(true);
    expect(reel.getSnapshot().spinning).toBe(true);
    expect(lifecycle).toEqual([
      "spin-started",
      "stopped",
      "stopped",
      "stopped",
      "stopped",
      "stopped",
      "stopped",
      "all-stopped",
      "spin-ended",
    ]);

    let result = reel.update(0.42);
    if (!result.completed) result = reel.update(0);
    expect(result.completed).toBe(true);
    expect(reel.getSnapshot().completed).toBe(true);
    expect(lifecycle.at(-1)).toBe("spin-ended");
    dispose();
  });

  it("preserves already-landed appearance and only returns remaining positions", () => {
    const reel = createReel();
    reel.resetToScene(INITIAL, [2, 1]);
    reel.spin(createPlan());
    const normalLanding = reel.update(0.18).landedCells;
    expect(normalLanding).toHaveLength(1);
    const first = normalLanding[0]!;
    const before = reel.getVisibleSymbolStateSnapshot(first.x, first.y);

    const forced = reel.stopSpinImmediately();

    expect(forced).toHaveLength(5);
    expect(forced).not.toContainEqual(first);
    expect(reel.getVisibleSymbolStateSnapshot(first.x, first.y)).toMatchObject({
      requestedState: before.requestedState,
      onceCompletionCount: before.onceCompletionCount,
    });
    expect(reel.stopSpinImmediately()).toEqual([]);
    expect(reel.getVisibleScene()).toEqual(TARGET);
  });

  it("cancels an active scheduled effect and never starts another one", () => {
    const controller = createEffectController();
    const reel = createReel(controller);
    reel.resetToScene(INITIAL, [2, 1]);
    reel.spin(
      createPlan({
        normal: {
          effectId: "nearwin",
          durationMs: 100,
          loopCount: 1,
          finishBeforeStopMs: 0,
        },
      }),
    );
    reel.update(0.08);
    reel.update(0);
    expect(controller.getSnapshot().activeCount).toBe(1);
    const startsBeforeStop = controller.starts;
    const cancelsBeforeStop = controller.cancels;

    reel.stopSpinImmediately();
    expect(controller.getSnapshot().activeCount).toBe(0);
    expect(controller.cancels).toBe(cancelsBeforeStop + 1);
    reel.update(1);
    expect(controller.starts).toBe(startsBeforeStop);
  });

  it("rejects targetless continuous and effect-sweep activities", () => {
    const controller = createEffectController();
    const reel = createReel(controller);
    reel.resetToScene(INITIAL, [2, 1]);
    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 10,
    });
    expect(() => reel.stopSpinImmediately()).toThrow(/target-aware spin/);
    reel.cancelContinuous();
    reel.resetToScene(
      [
        [-1, 0, 2],
        [2, 1, 0],
      ],
      [2, 1],
    );
    reel.startEffectSweep({
      effectId: "nearwin",
      positions: [{ x: 0, y: 0 }],
      loopCount: 1,
      startStepMs: 0,
    });
    expect(() => reel.stopSpinImmediately()).toThrow(/target-aware spin/);
  });
});

function createReel(
  effectController?: TestEffectController,
): RenderGridCellReelSet {
  return new RenderGridCellReelSet({
    reels: createBasicReels(),
    registry: createBasicRegistry({ landingAppearSymbols: ["A", "B"] }),
    columns: 2,
    rows: 3,
    cellWidth: 15,
    cellHeight: 12,
    order: ORDER,
    effectController,
  });
}

function createPlan(effects?: GridCellReelEffectPlanOptions) {
  return createGridCellReelSpinPlan({
    reels: createBasicReels(),
    finalYs: [0, 1],
    targetScene: TARGET,
    columns: 2,
    rows: 3,
    order: ORDER,
    timing: {
      startStepMs: 20,
      stopStepMs: 20,
      settleAfterLastStartMs: 80,
      minimumSpinCycles: 1,
      speedSymbolsPerSecond: 100,
    },
    dimming: {
      resolveDimmingAlpha: () => 0.82,
      fadeInMs: 20,
      fadeOutMs: 40,
    },
    effects,
  });
}

interface TestEffectController extends GridCellEffectController {
  readonly starts: number;
  readonly cancels: number;
}

function createEffectController(): TestEffectController {
  let active = false;
  let starts = 0;
  let cancels = 0;
  return {
    container: new Container(),
    prepare: () => {},
    startScheduledEffect: () => {
      starts += 1;
      active = true;
    },
    update: () => ({ completed: [] }),
    isActive: () => active,
    cancelAll: () => {
      cancels += 1;
      active = false;
    },
    getSnapshot: () => ({
      prepared: true,
      active: active
        ? [{ effectId: "nearwin", x: 0, y: 0, completedLoops: 0 }]
        : [],
      activeCount: active ? 1 : 0,
      idleCount: active ? 0 : 1,
      capacity: 1,
    }),
    destroy: () => {
      active = false;
    },
    get starts() {
      return starts;
    },
    get cancels() {
      return cancels;
    },
  };
}
