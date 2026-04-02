import { describe, expect, it } from "vitest";
import { createViewportState, panViewport, zoomViewportAtPoint } from "../../src/runtime/viewport-controller.js";

describe("viewport-controller", () => {
  it("updates pan without mutating zoom constraints", () => {
    const state = createViewportState({ zoom: 1, minZoom: 0.5, maxZoom: 2.5 });
    const next = panViewport(state, 120, -40);

    expect(next).toMatchObject({
      zoom: 1,
      minZoom: 0.5,
      maxZoom: 2.5,
      panX: 120,
      panY: -40
    });
  });

  it("zooms around an anchor point and clamps zoom range", () => {
    const state = createViewportState({ zoom: 1, minZoom: 0.75, maxZoom: 1.5, panX: 20, panY: 10 });
    const anchor = { x: 400, y: 300 };
    const next = zoomViewportAtPoint(state, 1.4, anchor);

    expect(next.zoom).toBeCloseTo(1.4);
    expect((anchor.x - next.panX) / next.zoom).toBeCloseTo((anchor.x - state.panX) / state.zoom);
    expect((anchor.y - next.panY) / next.zoom).toBeCloseTo((anchor.y - state.panY) / state.zoom);

    const clamped = zoomViewportAtPoint(next, 2, anchor);
    expect(clamped.zoom).toBe(1.5);
  });
});