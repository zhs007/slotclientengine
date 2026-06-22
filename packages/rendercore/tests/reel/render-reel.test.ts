import { describe, expect, it } from "vitest";
import { RenderReel, createReelSpinPlan } from "../../src/reel/index.js";
import {
  createBasicLayout,
  createBasicReels,
  createBasicRegistry,
} from "./helpers.js";

describe("RenderReel", () => {
  it("requests spinBlur while spinning, appear on landing, and normal after appear completes", () => {
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
    expect(reel.mask ?? null).toBeNull();
    reel.start(axisPlan);
    expect(reel.getVisibleScene()).toEqual(visibleBeforeSpin);
    expect(reel.mask).not.toBeNull();
    const activeMask = reel.mask as {
      includeInBuild?: boolean;
      renderable?: boolean;
    } | null;
    expect(activeMask?.renderable).not.toBe(false);
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
        .every((slot) => slot.requestedState === "appear"),
    ).toBe(true);

    reel.update(0.5);
    expect(
      reel
        .getSlotSnapshots()
        .filter((slot) => slot.symbol)
        .every((slot) => slot.requestedState === "normal"),
    ).toBe(true);
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
});
