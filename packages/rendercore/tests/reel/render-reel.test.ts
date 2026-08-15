import { describe, expect, it } from "vitest";
import { Container, Graphics } from "pixi.js";
import { RenderReel, createReelSpinPlan } from "../../src/reel/index.js";
import type { ReelSymbolRegistry } from "../../src/reel/index.js";
import {
  createBasicLayout,
  createBasicReels,
  createBasicRegistry,
} from "./helpers.js";

describe("RenderReel", () => {
  it("starts continuous rolling from an exact local public-strip phase", () => {
    const reel = new RenderReel({
      reels: createBasicReels(),
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    reel.resetToVisibleSymbols([1, 0, 2], 0);
    const visibleBeforeSpin = reel.getVisibleScene();

    reel.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 10,
      localPhaseY: 10,
    });

    expect(reel.getSnapshot().currentY).toBe(2);
    expect(reel.getVisibleScene()).toEqual(visibleBeforeSpin);
    reel.update(0.1);
    expect(reel.getSnapshot().currentY).toBe(3);
    expect(() => {
      reel.cancelContinuous();
      reel.startContinuous({
        direction: "forward",
        speedSymbolsPerSecond: 10,
        localPhaseY: 1.5,
      });
    }).toThrow(/localPhaseY.*safe integer/);
  });

  it("scales spin bounce strength and disables bounce at zero", () => {
    const reels = createBasicReels();
    const createReel = (bounceStrength?: number) =>
      new RenderReel({
        reels,
        x: 0,
        layout: createBasicLayout(),
        registry: createBasicRegistry(),
        ...(bounceStrength === undefined ? {} : { bounceStrength }),
      });
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];
    const defaultBounce = createReel();
    const noBounce = createReel(0);
    const doubleBounce = createReel(2);

    for (const reel of [defaultBounce, noBounce, doubleBounce]) {
      reel.start(axisPlan);
      reel.update(0.015);
    }

    expect(defaultBounce.y).toBeCloseTo(-0.96);
    expect(noBounce.y).toBe(0);
    expect(doubleBounce.y).toBeCloseTo(defaultBounce.y * 2);
    expect(() => createReel(-1)).toThrow(/bounceStrength/);
  });

  it("uses stable lightweight spinBlur visuals while spinning and complete symbols only after landing", () => {
    const reels = createBasicReels();
    const baseRegistry = createBasicRegistry();
    let completeSymbolCreations = 0;
    const registry: ReelSymbolRegistry = {
      getValidation: () => baseRegistry.getValidation(),
      getEntryByCode: (code) => baseRegistry.getEntryByCode(code),
      getEntryBySymbol: (symbol) => baseRegistry.getEntryBySymbol(symbol),
      getCellSize: () => baseRegistry.getCellSize(),
      getRollingVisualByCode: (code, state) =>
        baseRegistry.getRollingVisualByCode(code, state),
      requiresPresentationValueByCode: (code) =>
        baseRegistry.requiresPresentationValueByCode(code),
      resolveRollingValueTierByCode: (code, value) =>
        baseRegistry.resolveRollingValueTierByCode(code, value),
      createRollingValueVisualByCode: (code, value) =>
        baseRegistry.createRollingValueVisualByCode(code, value),
      createRenderSymbolByCode: (code) => {
        completeSymbolCreations += 1;
        return baseRegistry.createRenderSymbolByCode(code);
      },
    };
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry,
    });
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];

    const visibleBeforeSpin = reel.getVisibleScene();
    const creationsBeforeSpin = completeSymbolCreations;
    const clipMask = findReelClipMask(reel);
    expect(reel.mask ?? null).toBeNull();
    expect(clipMask.visible).toBe(false);
    expect(clipMask.renderable).toBe(false);
    reel.start(axisPlan);
    expect(reel.getVisibleScene()).toEqual(visibleBeforeSpin);
    expect(reel.mask).not.toBeNull();
    const activeMask = reel.mask as {
      includeInBuild?: boolean;
      renderable?: boolean;
      visible?: boolean;
    } | null;
    expect(activeMask?.visible).toBe(true);
    expect(activeMask?.renderable).toBe(true);
    expect(activeMask?.includeInBuild).toBe(false);
    expect(
      reel.getSlotSnapshots().every((slot) => slot.container.visible),
    ).toBe(true);
    const rollingVisuals = reel
      .getSlotSnapshots()
      .map((slot) => slot.rollingVisual);
    const creationsAfterPrepare = completeSymbolCreations;
    expect(reel.getSlotSnapshots().every((slot) => slot.symbol === null)).toBe(
      true,
    );
    expect(creationsAfterPrepare - creationsBeforeSpin).toBe(2);

    reel.update(0.05);
    const rollingSlots = reel
      .getSlotSnapshots()
      .filter((slot) => slot.kind === "textured");
    expect(rollingSlots.every((slot) => slot.mode === "rolling")).toBe(true);
    expect(
      rollingSlots.every((slot) => slot.requestedState === "spinBlur"),
    ).toBe(true);
    expect(
      reel
        .getSlotSnapshots()
        .every((slot, index) => slot.rollingVisual === rollingVisuals[index]),
    ).toBe(true);
    expect(completeSymbolCreations).toBe(creationsAfterPrepare);

    const landed = reel.update(0.3);
    expect(landed.landed).toBe(true);
    expect(reel.mask ?? null).toBeNull();
    expect(clipMask.visible).toBe(false);
    expect(clipMask.renderable).toBe(false);
    expect(activeMask?.includeInBuild).toBe(false);
    expect(reel.getSnapshot()).toMatchObject({
      phase: "stopped",
      currentY: 2,
    });
    expect(reel.getVisibleScene()).toEqual([2, 3, 1]);
    expect(
      reel.getSlotSnapshots().filter((slot) => slot.container.visible),
    ).toHaveLength(3);
    expect(reel.getSlotSnapshots().filter((slot) => slot.symbol)).toHaveLength(
      2,
    );
    expect(
      reel
        .getSlotSnapshots()
        .filter((slot) => !slot.container.visible)
        .every((slot) => slot.symbol === null),
    ).toBe(true);
    expect(completeSymbolCreations).toBe(creationsAfterPrepare);
    expect(
      reel
        .getSlotSnapshots()
        .filter((slot) => slot.symbol)
        .every((slot) => slot.requestedState === "normal"),
    ).toBe(true);
  });

  it("prepares adjacent equal-code landing occurrences independently", () => {
    const reels = createBasicReels();
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];

    reel.start(axisPlan, {
      targetVisibleSymbols: [1, 1, 1],
      targetVisiblePresentationValues: [10, 20, 30],
    });
    expect(reel.getSlotSnapshots().every((slot) => slot.symbol === null)).toBe(
      true,
    );
    reel.update(0.3);

    const landed = reel
      .getSlotSnapshots()
      .filter((slot) => slot.windowY >= 0 && slot.windowY < 3);
    expect(landed.map((slot) => slot.presentationValue)).toEqual([10, 20, 30]);
    expect(new Set(landed.map((slot) => slot.symbol)).size).toBe(3);
    expect(landed.every((slot) => slot.mode === "settled")).toBe(true);
  });

  it("rolls back detached landing preparation before changing the stopped reel", () => {
    const reels = createBasicReels();
    const baseRegistry = createBasicRegistry();
    let failPreparation = false;
    const preparedSymbols: NonNullable<
      ReturnType<ReelSymbolRegistry["createRenderSymbolByCode"]>
    >[] = [];
    const registry: ReelSymbolRegistry = {
      getValidation: () => baseRegistry.getValidation(),
      getEntryByCode: (code) => baseRegistry.getEntryByCode(code),
      getEntryBySymbol: (symbol) => baseRegistry.getEntryBySymbol(symbol),
      getCellSize: () => baseRegistry.getCellSize(),
      getRollingVisualByCode: (code, state) =>
        baseRegistry.getRollingVisualByCode(code, state),
      requiresPresentationValueByCode: (code) =>
        baseRegistry.requiresPresentationValueByCode(code),
      resolveRollingValueTierByCode: (code, value) =>
        baseRegistry.resolveRollingValueTierByCode(code, value),
      createRollingValueVisualByCode: (code, value) =>
        baseRegistry.createRollingValueVisualByCode(code, value),
      createRenderSymbolByCode: (code) => {
        if (failPreparation && code === 1) {
          throw new Error("prepared landing failed");
        }
        const symbol = baseRegistry.createRenderSymbolByCode(code);
        if (failPreparation && symbol) preparedSymbols.push(symbol);
        return symbol;
      },
    };
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry,
    });
    const before = reel.getSlotSnapshots().map((slot) => slot.symbol);
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];

    failPreparation = true;
    expect(() =>
      reel.start(axisPlan, { targetVisibleSymbols: [2, 1, 2] }),
    ).toThrow("prepared landing failed");
    expect(reel.getSnapshot().phase).toBe("stopped");
    expect(reel.getSlotSnapshots().map((slot) => slot.symbol)).toEqual(before);
    expect(preparedSymbols).toHaveLength(1);
    expect(preparedSymbols[0]?.destroyed).toBe(true);
  });

  it("keeps the final rolling frame until every prepared value is ready", () => {
    const reels = createBasicReels();
    const baseRegistry = createBasicRegistry();
    let prepareAsPending = false;
    let ready = false;
    const registry: ReelSymbolRegistry = {
      getValidation: () => baseRegistry.getValidation(),
      getEntryByCode: (code) => baseRegistry.getEntryByCode(code),
      getEntryBySymbol: (symbol) => baseRegistry.getEntryBySymbol(symbol),
      getCellSize: () => baseRegistry.getCellSize(),
      getRollingVisualByCode: (code, state) =>
        baseRegistry.getRollingVisualByCode(code, state),
      requiresPresentationValueByCode: (code) =>
        baseRegistry.requiresPresentationValueByCode(code),
      resolveRollingValueTierByCode: (code, value) =>
        baseRegistry.resolveRollingValueTierByCode(code, value),
      createRollingValueVisualByCode: (code, value) =>
        baseRegistry.createRollingValueVisualByCode(code, value),
      createRenderSymbolByCode: (code) => {
        const symbol = baseRegistry.createRenderSymbolByCode(code);
        if (prepareAsPending && symbol) {
          Object.defineProperty(symbol, "getPresentationReadiness", {
            configurable: true,
            value: () =>
              Object.freeze({
                status: ready ? ("ready" as const) : ("pending" as const),
                error: null,
              }),
          });
        }
        return symbol;
      },
    };
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry,
    });
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];

    prepareAsPending = true;
    reel.start(axisPlan, { targetVisibleSymbols: [1, 1, 1] });
    expect(reel.update(0.3)).toMatchObject({
      phase: "settling",
      landed: false,
      completed: false,
    });
    expect(reel.getSlotSnapshots().every((slot) => slot.symbol === null)).toBe(
      true,
    );

    ready = true;
    expect(reel.update(0)).toMatchObject({
      phase: "stopped",
      landed: true,
      completed: true,
    });
    expect(
      reel
        .getSlotSnapshots()
        .filter((slot) => slot.container.visible)
        .every((slot) => slot.mode === "settled"),
    ).toBe(true);
  });

  it("uses configured rolling values by tier and never substitutes them for explicit final values", () => {
    const reels = createBasicReels();
    const baseRegistry = createBasicRegistry();
    let prepareAsPending = false;
    let ready = false;
    const createdTiers: number[] = [];
    const preparedFullSymbols: NonNullable<
      ReturnType<ReelSymbolRegistry["createRenderSymbolByCode"]>
    >[] = [];
    const registry: ReelSymbolRegistry = {
      getValidation: () => baseRegistry.getValidation(),
      getEntryByCode: (code) => baseRegistry.getEntryByCode(code),
      getEntryBySymbol: (symbol) => baseRegistry.getEntryBySymbol(symbol),
      getCellSize: () => baseRegistry.getCellSize(),
      getRollingVisualByCode: (code, state) =>
        baseRegistry.getRollingVisualByCode(code, state),
      requiresPresentationValueByCode: (code) => code === 1,
      resolveRollingValueTierByCode: (code, value) =>
        code === 1 ? (value < 10 ? 0 : value < 100 ? 1 : 2) : null,
      createRollingValueVisualByCode: (code, value) => {
        if (code !== 1) return null;
        const tierIndex = value < 10 ? 0 : value < 100 ? 1 : 2;
        createdTiers.push(tierIndex);
        return {
          container: new Container(),
          tierIndex,
          setValue: () => undefined,
          destroy: () => undefined,
        };
      },
      createRenderSymbolByCode: (code) => {
        const symbol = baseRegistry.createRenderSymbolByCode(code);
        if (prepareAsPending && symbol) {
          preparedFullSymbols.push(symbol);
          Object.defineProperty(symbol, "getPresentationReadiness", {
            configurable: true,
            value: () =>
              Object.freeze({
                status: ready ? ("ready" as const) : ("pending" as const),
                error: null,
              }),
          });
        }
        return symbol;
      },
    };
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry,
      presentationValueResolver: ({ code }) => (code === 1 ? 5 : null),
    });
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];

    expect(() =>
      reel.start(axisPlan, { targetVisibleSymbols: [1, 1, 1] }),
    ).toThrow(/explicit final presentation value/);

    prepareAsPending = true;
    reel.start(axisPlan, {
      targetVisibleSymbols: [1, 1, 1],
      targetVisiblePresentationValues: [5, 50, 500],
    });
    expect(reel.getSlotSnapshots().every((slot) => slot.symbol === null)).toBe(
      true,
    );
    expect(
      preparedFullSymbols.map((symbol) => symbol.getPresentationValue()),
    ).toEqual([5, 50, 500]);
    reel.update(0.3);
    const finalRolling = reel
      .getSlotSnapshots()
      .filter((slot) => slot.windowY >= 0 && slot.windowY < 3);
    expect(finalRolling.map((slot) => slot.presentationValue)).toEqual([
      5, 50, 500,
    ]);
    expect(finalRolling.map((slot) => slot.rollingValueTierIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(createdTiers).toEqual(expect.arrayContaining([0, 1, 2]));

    ready = true;
    reel.update(0);
    expect(reel.getVisiblePresentationValues()).toEqual([5, 50, 500]);
  });

  it("centers each symbol container in its cell", () => {
    const reel = new RenderReel({
      reels: createBasicReels(),
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });

    const visibleSlots = reel
      .getSlotSnapshots()
      .filter((slot) => slot.container.visible);

    expect(visibleSlots).toHaveLength(3);
    expect(visibleSlots.map((slot) => slot.container.x)).toEqual([
      7.5, 7.5, 7.5,
    ]);
    expect(visibleSlots.map((slot) => slot.container.y)).toEqual([6, 18, 30]);
    expect(
      visibleSlots
        .filter((slot) => slot.symbol)
        .every((slot) => slot.symbol?.getMainSprite().anchor.x === 0.5),
    ).toBe(true);
    expect(
      visibleSlots
        .filter((slot) => slot.symbol)
        .every((slot) => slot.symbol?.getMainSprite().anchor.y === 0.5),
    ).toBe(true);
    expect(reel.getVisibleSymbolGeometrySnapshot(2)).toEqual({
      x: 0,
      y: 2,
      code: 2,
      kind: "textured",
      centerX: 7.5,
      centerY: 30,
      cellWidth: 15,
      cellHeight: 12,
    });
  });

  it("orders slot containers by render priority while preserving default row order", () => {
    const reel = new RenderReel({
      reels: createBasicReels(),
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry({
        symbolRenderPriorities: {
          A: 2,
        },
      }),
    });

    reel.resetToVisibleSymbols([1, 2, 2]);
    const highPriorityTop = reel
      .getSlotSnapshots()
      .find((slot) => slot.windowY === 0);
    const lowPriorityBottom = reel
      .getSlotSnapshots()
      .find((slot) => slot.windowY === 2);
    expect(highPriorityTop?.symbol?.renderPriority).toBe(2);
    expect(lowPriorityBottom?.symbol?.renderPriority).toBe(0);
    expect(highPriorityTop?.container.zIndex).toBeGreaterThan(
      lowPriorityBottom?.container.zIndex ?? Number.POSITIVE_INFINITY,
    );

    reel.resetToVisibleSymbols([2, 2, 2]);
    const samePriorityTop = reel
      .getSlotSnapshots()
      .find((slot) => slot.windowY === 0);
    const samePriorityBottom = reel
      .getSlotSnapshots()
      .find((slot) => slot.windowY === 2);
    expect(samePriorityBottom?.container.zIndex).toBeGreaterThan(
      samePriorityTop?.container.zIndex ?? Number.POSITIVE_INFINITY,
    );
  });

  it("reports visible symbol geometry relative to the reel parent", () => {
    const reel = new RenderReel({
      reels: createBasicReels(),
      x: 1,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });

    expect(reel.getVisibleSymbolGeometrySnapshot(0)).toEqual({
      x: 1,
      y: 0,
      code: 2,
      kind: "textured",
      centerX: 24.5,
      centerY: 6,
      cellWidth: 15,
      cellHeight: 12,
    });
  });

  it("rejects mismatched axis plans and reentry while spinning", () => {
    const reels = createBasicReels();
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    });

    expect(() => reel.start(plan.axes[1])).toThrow(/axis plan 1/);
    reel.start(plan.axes[0]);
    expect(() => reel.start(plan.axes[0])).toThrow(/starting/);
  });

  it("can inject current and target visible symbols for a redacted client reel", () => {
    const reels = createBasicReels();
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    const currentVisibleSymbols = [3, 2, 1];
    const targetVisibleSymbols = [2, 2, 2];
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [0, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];

    reel.resetToVisibleSymbols(currentVisibleSymbols);
    expect(reel.getVisibleScene()).toEqual(currentVisibleSymbols);

    reel.start(axisPlan, { targetVisibleSymbols });
    expect(reel.getVisibleScene()).toEqual(currentVisibleSymbols);

    const landed = reel.update(0.3);
    expect(landed.landed).toBe(true);
    expect(reel.getVisibleScene()).toEqual(targetVisibleSymbols);
    expect(reel.getSnapshot()).toMatchObject({
      phase: "stopped",
      currentY: 0,
    });
  });

  it("requests visible symbol states after stopping and advances once animations", () => {
    const reels = createBasicReels();
    const reel = new RenderReel({
      reels,
      x: 0,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    }).axes[0];

    expect(reel.getVisibleSymbolStateSnapshot(0)).toMatchObject({
      x: 0,
      y: 0,
      requestedState: "normal",
      resolvedState: "normal",
      isOnce: false,
    });

    reel.requestVisibleSymbolState(0, "win");
    expect(reel.getVisibleSymbolStateSnapshot(0)).toMatchObject({
      requestedState: "win",
      resolvedState: "win",
      isOnce: true,
    });

    reel.update(0);
    expect(reel.getVisibleSymbolStateSnapshot(0).requestedState).toBe("win");

    reel.update(0.58);
    expect(reel.getVisibleSymbolStateSnapshot(0)).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
      isOnce: false,
      onceCompletionCount: 1,
    });

    expect(() => reel.requestVisibleSymbolState(1, "win")).toThrow(/empty/);
    expect(() => reel.requestVisibleSymbolState(3, "win")).toThrow(
      /out of range/,
    );

    reel.start(axisPlan);
    expect(() => reel.requestVisibleSymbolState(0, "win")).toThrow(/phase/);
    expect(() => reel.getVisibleSymbolGeometrySnapshot(0)).toThrow(/phase/);
  });
});

function findReelClipMask(reel: RenderReel): Graphics {
  const clipMask = reel.children.find(
    (child): child is Graphics => child instanceof Graphics,
  );
  if (!clipMask) {
    throw new Error("Missing reel clip mask.");
  }
  return clipMask;
}
