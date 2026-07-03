import { describe, expect, it } from "vitest";
import { Graphics } from "pixi.js";
import { RenderReel, createReelSpinPlan } from "../../src/reel/index.js";
import {
  createBasicLayout,
  createBasicReels,
  createBasicRegistry,
} from "./helpers.js";

describe("RenderReel", () => {
  it("requests spinBlur while spinning and normal after landing", () => {
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

    const visibleBeforeSpin = reel.getVisibleScene();
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

    reel.update(0.05);
    expect(
      reel
        .getSlotSnapshots()
        .filter((slot) => slot.symbol)
        .every((slot) => slot.requestedState === "spinBlur"),
    ).toBe(true);

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
    expect(
      reel
        .getSlotSnapshots()
        .filter((slot) => slot.symbol)
        .every((slot) => slot.requestedState === "normal"),
    ).toBe(true);
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
