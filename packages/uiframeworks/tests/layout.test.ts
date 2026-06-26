import {
  calculateFrameScale,
  calculateSlotUiFrameViewport,
  createDefaultSlotLayout,
  validateDesignSize,
} from "../src/index.js";

const FOCUS_POLICY = Object.freeze({
  mode: "focus" as const,
  maxDesignSize: Object.freeze({ width: 2000, height: 2000 }),
  preferredPortraitSize: Object.freeze({ width: 1125, height: 2000 }),
  focusRect: Object.freeze({ width: 720, height: 1080 }),
  minFocusMargin: Object.freeze({
    left: 60,
    right: 60,
    top: 60,
    bottom: 60,
  }),
});

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

  it("calculates a fixed frame viewport compatible with frame scaling", () => {
    const viewport = calculateSlotUiFrameViewport({
      viewportWidth: 470.5,
      viewportHeight: 836,
      designSize: { width: 941, height: 1672 },
    });

    expect(viewport).toEqual({
      pageSize: { width: 470.5, height: 836 },
      frameDesignSize: { width: 941, height: 1672 },
      scale: 0.5,
      cssSize: { width: 470.5, height: 836 },
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("calculates focus frame viewports with canvas caps and black margins", () => {
    expect(
      calculateSlotUiFrameViewport({
        viewportWidth: 1125,
        viewportHeight: 2000,
        designSize: { width: 1125, height: 2000 },
        policy: FOCUS_POLICY,
      }).frameDesignSize,
    ).toEqual({ width: 1125, height: 2000 });

    expect(
      calculateSlotUiFrameViewport({
        viewportWidth: 1200,
        viewportHeight: 1200,
        designSize: { width: 1125, height: 2000 },
        policy: FOCUS_POLICY,
      }).frameDesignSize,
    ).toEqual({ width: 1200, height: 1200 });

    const ultraWide = calculateSlotUiFrameViewport({
      viewportWidth: 3000,
      viewportHeight: 1200,
      designSize: { width: 1125, height: 2000 },
      policy: FOCUS_POLICY,
    });
    expect(ultraWide.frameDesignSize).toEqual({ width: 2000, height: 1200 });
    expect(ultraWide.cssSize).toEqual({ width: 2000, height: 1200 });
    expect(ultraWide.offsetX).toBe(500);
    expect(ultraWide.offsetY).toBe(0);

    const phone = calculateSlotUiFrameViewport({
      viewportWidth: 375,
      viewportHeight: 812,
      designSize: { width: 1125, height: 2000 },
      policy: FOCUS_POLICY,
    });
    expect(phone.frameDesignSize.width).toBeCloseTo(923.645, 3);
    expect(phone.frameDesignSize.height).toBe(2000);
    expect(phone.frameDesignSize.width).toBeGreaterThanOrEqual(840);
  });

  it("rejects invalid focus frame policies", () => {
    expect(() =>
      calculateSlotUiFrameViewport({
        viewportWidth: 1000,
        viewportHeight: 1000,
        policy: {
          ...FOCUS_POLICY,
          focusRect: { width: 1900, height: 1080 },
          minFocusMargin: { left: 60, right: 60 },
        },
      }),
    ).toThrow(/fit inside maxDesignSize/);
    expect(() =>
      calculateSlotUiFrameViewport({
        viewportWidth: 1000,
        viewportHeight: 1000,
        policy: {
          ...FOCUS_POLICY,
          preferredPortraitSize: { width: 3000, height: 2000 },
        },
      }),
    ).toThrow(/preferredPortraitSize/);
    expect(() =>
      calculateSlotUiFrameViewport({
        viewportWidth: 1000,
        viewportHeight: 1000,
        policy: { mode: "fluid" } as never,
      }),
    ).toThrow(/framePolicy.mode/);
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
