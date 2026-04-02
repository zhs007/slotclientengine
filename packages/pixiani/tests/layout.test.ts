import { describe, expect, it } from "vitest";
import { computeCanvasLayout } from "../src/layout.js";

describe("computeCanvasLayout", () => {
  it("centers canvas when viewport larger than design", () => {
    const layout = computeCanvasLayout({
      designWidth: 800,
      designHeight: 800,
      viewportWidth: 1200,
      viewportHeight: 900
    });

    expect(layout.scale).toBe(1);
    expect(layout.width).toBe(800);
    expect(layout.height).toBe(800);
    expect(layout.offsetX).toBe(200);
    expect(layout.offsetY).toBe(50);
  });

  it("scales down to fit smaller viewport", () => {
    const layout = computeCanvasLayout({
      designWidth: 800,
      designHeight: 800,
      viewportWidth: 600,
      viewportHeight: 1000
    });

    expect(layout.scale).toBeCloseTo(0.75);
    expect(layout.width).toBe(600);
    expect(layout.height).toBe(600);
    expect(layout.offsetX).toBe(0);
    expect(layout.offsetY).toBe(200);
  });
});