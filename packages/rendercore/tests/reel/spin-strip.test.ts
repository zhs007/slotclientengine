import { describe, expect, it } from "vitest";
import { createReelSpinPlan } from "../../src/reel/index.js";
import { createTemporaryReelStrip } from "../../src/reel/spin-strip.js";
import { createBasicLayout, createBasicReels } from "./helpers.js";

describe("createTemporaryReelStrip", () => {
  it("expands a forward spin strip from the inferred start window to the stop window", () => {
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
      stopDelayMs: 0,
    }).axes[0];

    const strip = createTemporaryReelStrip({
      reels,
      x: 0,
      layout,
      plan: axisPlan,
    });

    expect(axisPlan.startY).toBe(1);
    expect(reels.get(0, axisPlan.startY)).toBe(0);
    expect(reels.get(0, 0)).toBe(1);
    expect(strip.codes.length).toBeGreaterThan(reels.getLength(0));
    expect(strip.get(0)).toBe(reels.get(0, axisPlan.startY));
    expect(strip.get(1)).toBe(reels.get(0, axisPlan.startY + 1));
    expect(strip.get(2)).toBe(reels.get(0, axisPlan.startY + 2));
    expect(strip.get(axisPlan.travelSymbols)).toBe(
      reels.get(0, axisPlan.finalY),
    );
    expect(strip.get(axisPlan.travelSymbols + 1)).toBe(
      reels.get(0, axisPlan.finalY + 1),
    );
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
      stopDelayMs: 0,
    }).axes[0];

    const strip = createTemporaryReelStrip({
      reels,
      x: 0,
      layout,
      plan: axisPlan,
    });

    expect(strip.minSymbolY).toBeLessThanOrEqual(-axisPlan.travelSymbols);
    expect(strip.codes.length).toBeGreaterThan(reels.getLength(0));
    expect(strip.get(0)).toBe(reels.get(0, axisPlan.startY));
    expect(strip.get(-axisPlan.travelSymbols)).toBe(
      reels.get(0, axisPlan.finalY),
    );
    expect(strip.get(-axisPlan.travelSymbols + 1)).toBe(
      reels.get(0, axisPlan.finalY + 1),
    );
  });

  it("overlays current symbols at the inferred start window and target symbols at the stop window", () => {
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
      stopDelayMs: 0,
    }).axes[0];
    const currentVisibleSymbols = [3, 2, 1];
    const targetVisibleSymbols = [2, 2, 2];

    const strip = createTemporaryReelStrip({
      reels,
      x: 0,
      layout,
      plan: axisPlan,
      currentVisibleSymbols,
      targetVisibleSymbols,
    });

    expect(axisPlan.startY).not.toBe(0);
    expect(strip.get(0)).toBe(currentVisibleSymbols[0]);
    expect(strip.get(1)).toBe(currentVisibleSymbols[1]);
    expect(strip.get(2)).toBe(currentVisibleSymbols[2]);
    expect(strip.get(axisPlan.travelSymbols)).toBe(targetVisibleSymbols[0]);
    expect(strip.get(axisPlan.travelSymbols + 1)).toBe(targetVisibleSymbols[1]);
    expect(strip.get(axisPlan.travelSymbols + 2)).toBe(targetVisibleSymbols[2]);
  });

  it("carries stable random presentation values through the temporary strip and preserves explicit endpoints", () => {
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
      stopDelayMs: 0,
    }).axes[0];
    const strip = createTemporaryReelStrip({
      reels,
      x: 0,
      layout,
      plan: axisPlan,
      currentVisibleSymbols: [3, 2, 1],
      currentVisiblePresentationValues: [5, null, 25],
      targetVisibleSymbols: [2, 2, 2],
      targetVisiblePresentationValues: [100, 250, 500],
      presentationValueResolver: ({ symbolY, code }) =>
        code === 0 ? null : (symbolY + 100) * 10 + code,
    });

    expect(strip.getPresentationValue(0)).toBe(5);
    expect(strip.getPresentationValue(1)).toBeNull();
    expect(strip.getPresentationValue(2)).toBe(25);
    expect(strip.getPresentationValue(axisPlan.travelSymbols)).toBe(100);
    expect(strip.getPresentationValue(axisPlan.travelSymbols + 1)).toBe(250);
    expect(strip.getPresentationValue(axisPlan.travelSymbols + 2)).toBe(500);
    expect(strip.getPresentationValue(3)).toBe(
      strip.presentationValues[3 - strip.minSymbolY],
    );
  });
});
