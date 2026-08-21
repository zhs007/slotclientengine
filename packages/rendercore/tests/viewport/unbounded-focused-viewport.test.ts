import { describe, expect, it } from "vitest";
import { calculateUnboundedMaximizedFocusedViewport } from "../../src/viewport/index.js";

describe("unbounded maximized focused viewport", () => {
  it("contains a portrait focus and extends the unbounded authored plane", () => {
    const result = calculateUnboundedMaximizedFocusedViewport({
      pageSize: { width: 1920, height: 1080 },
      focusRect: { x: -540, y: -960, width: 1080, height: 1920 },
    });
    expect(result.viewportSize).toEqual({
      width: 3413.3333333333335,
      height: 1920,
    });
    expect(result.visibleRect).toEqual({
      x: -1706.6666666666667,
      y: -960,
      width: 3413.3333333333335,
      height: 1920,
    });
    expect(result.focusRectInViewport).toEqual({
      x: 1166.6666666666667,
      y: 0,
      width: 1080,
      height: 1920,
    });
  });

  it("centers an asymmetric focus without finite art clamping", () => {
    const result = calculateUnboundedMaximizedFocusedViewport({
      pageSize: { width: 1000, height: 1000 },
      focusRect: { x: -100, y: -300, width: 500, height: 400 },
    });
    expect(result.visibleRect).toEqual({
      x: -100,
      y: -350,
      width: 500,
      height: 500,
    });
    expect(result.worldOffset).toEqual({ x: 100, y: 350 });
    expect(result.focusRectInViewport).toEqual({
      x: 0,
      y: 50,
      width: 500,
      height: 400,
    });
  });

  it("does not underflow the constrained focus axis through floating-point projection", () => {
    const result = calculateUnboundedMaximizedFocusedViewport({
      pageSize: { width: 100, height: 104 },
      focusRect: { x: 499, y: 253, width: 1056, height: 1435 },
    });

    expect(result.viewportSize.height).toBe(1435);
    expect(result.viewportSize.width).toBeGreaterThan(1056);
    expect(result.focusRectInViewport.height).toBe(1435);
  });

  it("rejects non-finite and non-positive geometry", () => {
    expect(() =>
      calculateUnboundedMaximizedFocusedViewport({
        pageSize: { width: 0, height: 100 },
        focusRect: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).toThrow(/pageSize/);
    expect(() =>
      calculateUnboundedMaximizedFocusedViewport({
        pageSize: { width: 100, height: 100 },
        focusRect: { x: Number.POSITIVE_INFINITY, y: 0, width: 1, height: 1 },
      }),
    ).toThrow(/focusRect/);
  });
});
