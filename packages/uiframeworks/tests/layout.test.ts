import {
  calculateFrameScale,
  createDefaultSlotLayout,
  validateDesignSize
} from "../src/index.js";

describe("layout", () => {
  it("calculates frame scale for portrait and exact design viewports", () => {
    expect(calculateFrameScale(941, 1672)).toBe(1);
    expect(calculateFrameScale(470.5, 836)).toBe(0.5);
  });

  it("uses the limiting side for landscape and tall viewports", () => {
    expect(calculateFrameScale(1366, 768)).toBeCloseTo(768 / 1672);
    expect(calculateFrameScale(941, 2200)).toBe(1);
  });

  it("rejects invalid design and viewport sizes", () => {
    expect(() => validateDesignSize({ width: 0, height: 1 })).toThrow(/width/);
    expect(() => validateDesignSize({ width: 1, height: Number.POSITIVE_INFINITY })).toThrow(/height/);
    expect(() => calculateFrameScale(0, 100)).toThrow(/viewportWidth/);
    expect(() => calculateFrameScale(100, -1)).toThrow(/viewportHeight/);
  });

  it("creates a responsive default layout from design size", () => {
    const layout = createDefaultSlotLayout({ width: 1200, height: 800 });
    expect(layout.designSize).toEqual({ width: 1200, height: 800 });
    expect(layout.bottomBannerHeight).toBeGreaterThanOrEqual(220);
    expect(layout.spinButtonDiameter).toBeGreaterThan(layout.autoButtonDiameter);
  });
});
