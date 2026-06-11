import { describe, expect, it } from "vitest";
import { createReelSpinPlan } from "../../src/reel/index.js";
import { createTemporaryReelStrip } from "../../src/reel/spin-strip.js";
import { createBasicLayout, createBasicReels } from "./helpers.js";

describe("createTemporaryReelStrip", () => {
  it("expands a forward spin strip and overlays the startup window with the current symbols", () => {
    const reels = createBasicReels();
    const layout = createBasicLayout();
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: layout.visibleRows,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0
    }).axes[0];

    const strip = createTemporaryReelStrip({
      reels,
      x: 0,
      layout,
      plan: axisPlan,
      currentY: 0
    });

    expect(axisPlan.startY).toBe(1);
    expect(reels.get(0, axisPlan.startY)).toBe(0);
    expect(reels.get(0, 0)).toBe(1);
    expect(strip.codes.length).toBeGreaterThan(reels.getLength(0));
    expect(strip.get(0)).toBe(reels.get(0, 0));
    expect(strip.get(1)).toBe(reels.get(0, 1));
    expect(strip.get(2)).toBe(reels.get(0, 2));
    expect(strip.get(axisPlan.travelSymbols)).toBe(reels.get(0, axisPlan.finalY));
    expect(strip.get(axisPlan.travelSymbols + 1)).toBe(reels.get(0, axisPlan.finalY + 1));
  });

  it("expands a backward spin strip using negative local coordinates", () => {
    const reels = createBasicReels();
    const layout = createBasicLayout();
    const axisPlan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: layout.visibleRows,
      direction: "backward",
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0
    }).axes[0];

    const strip = createTemporaryReelStrip({
      reels,
      x: 0,
      layout,
      plan: axisPlan,
      currentY: 0
    });

    expect(strip.minSymbolY).toBeLessThanOrEqual(-axisPlan.travelSymbols);
    expect(strip.codes.length).toBeGreaterThan(reels.getLength(0));
    expect(strip.get(0)).toBe(reels.get(0, 0));
    expect(strip.get(-axisPlan.travelSymbols)).toBe(reels.get(0, axisPlan.finalY));
    expect(strip.get(-axisPlan.travelSymbols + 1)).toBe(reels.get(0, axisPlan.finalY + 1));
  });
});
