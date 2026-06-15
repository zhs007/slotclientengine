import {
  calculateFrameScale,
  createDefaultSlotLayout,
  validateDesignSize,
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
    expect(() =>
      validateDesignSize({ width: 1, height: Number.POSITIVE_INFINITY }),
    ).toThrow(/height/);
    expect(() => calculateFrameScale(0, 100)).toThrow(/viewportWidth/);
    expect(() => calculateFrameScale(100, -1)).toThrow(/viewportHeight/);
  });

  it("creates a responsive default layout from design size", () => {
    const layout = createDefaultSlotLayout({ width: 1200, height: 800 });
    expect(layout.designSize).toEqual({ width: 1200, height: 800 });
    expect(layout.bottomHudHeight).toBeGreaterThanOrEqual(188);
    expect(layout.leftRailButtonSize).toBeGreaterThan(0);
    expect(layout.leftRailGap).toBeGreaterThan(0);
    expect(layout.buyBonusWidth).toBeGreaterThan(layout.buyBonusHeight);
    expect(layout.spinButtonDiameter).toBeGreaterThan(
      layout.autoButtonDiameter,
    );
    expect(layout.autoButtonDiameter).toBeGreaterThan(
      layout.betStepButtonDiameter,
    );
  });

  it("clamps flat HUD control sizes for compact and large designs", () => {
    const compact = createDefaultSlotLayout({ width: 360, height: 640 });
    expect(compact.leftRailButtonSize).toBeGreaterThanOrEqual(46);
    expect(compact.betStepButtonDiameter).toBeGreaterThanOrEqual(42);

    const large = createDefaultSlotLayout({ width: 1800, height: 3200 });
    expect(large.spinButtonDiameter).toBeLessThanOrEqual(154);
    expect(large.autoButtonDiameter).toBeLessThanOrEqual(82);
  });
});
