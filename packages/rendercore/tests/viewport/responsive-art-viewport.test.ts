import { describe, expect, it } from "vitest";
import {
  calculateFocusedArtViewport,
  calculateMaximizedResponsiveArtViewport,
  calculateResponsiveArtViewport,
  createMaximizedResponsiveArtViewportPolicy,
} from "../../src/viewport/index.js";

const LANDSCAPE = Object.freeze({
  artSize: Object.freeze({ width: 2000, height: 2000 }),
  focusRect: Object.freeze({ x: 288, y: 588, width: 1424, height: 824 }),
  minMargin: Object.freeze({ left: 40, right: 40, top: 40, bottom: 40 }),
});

const PORTRAIT = Object.freeze({
  artSize: Object.freeze({ width: 1174, height: 2000 }),
  focusRect: Object.freeze({ x: 22, y: 469.5, width: 1130, height: 1061 }),
  minMargin: Object.freeze({ left: 20, right: 20, top: 40, bottom: 40 }),
});

const LAYOUT25_LANDSCAPE = Object.freeze({
  artSize: Object.freeze({ width: 2000, height: 2000 }),
  focusRect: Object.freeze({ x: 22, y: 531.5, width: 1954, height: 940 }),
});

const LAYOUT25_PORTRAIT = Object.freeze({
  artSize: Object.freeze({ width: 2000, height: 2000 }),
  focusRect: Object.freeze({ x: 499, y: 253, width: 1056, height: 1435 }),
});

describe("responsive art viewport", () => {
  it("selects portrait only when viewport height is greater than width", () => {
    expect(
      calculateResponsiveArtViewport({
        viewportSize: { width: 1170, height: 1400 },
        variants: { landscape: LANDSCAPE, portrait: PORTRAIT },
      }).variantId,
    ).toBe("portrait");

    expect(
      calculateResponsiveArtViewport({
        viewportSize: { width: 1600, height: 1000 },
        variants: { landscape: LANDSCAPE, portrait: PORTRAIT },
      }).variantId,
    ).toBe("landscape");

    expect(
      calculateResponsiveArtViewport({
        viewportSize: { width: 1600, height: 1600 },
        variants: { landscape: LANDSCAPE, portrait: PORTRAIT },
      }).variantId,
    ).toBe("landscape");
  });

  it("uses each selected variant art size and focus rect", () => {
    const landscape = calculateResponsiveArtViewport({
      viewportSize: { width: 1600, height: 1000 },
      variants: { landscape: LANDSCAPE, portrait: PORTRAIT },
    });
    const expectedLandscape = calculateFocusedArtViewport({
      artSize: LANDSCAPE.artSize,
      viewportSize: { width: 1600, height: 1000 },
      focusRect: LANDSCAPE.focusRect,
      minMargin: LANDSCAPE.minMargin,
    });
    expect(landscape.visibleRect).toEqual(expectedLandscape.visibleRect);
    expect(landscape.focusRectInViewport).toEqual(
      expectedLandscape.focusRectInViewport,
    );

    const portrait = calculateResponsiveArtViewport({
      viewportSize: { width: 1170, height: 1400 },
      variants: { landscape: LANDSCAPE, portrait: PORTRAIT },
    });
    const expectedPortrait = calculateFocusedArtViewport({
      artSize: PORTRAIT.artSize,
      viewportSize: { width: 1170, height: 1400 },
      focusRect: PORTRAIT.focusRect,
      minMargin: PORTRAIT.minMargin,
    });
    expect(portrait.visibleRect).toEqual(expectedPortrait.visibleRect);
    expect(portrait.worldOffset).toEqual(expectedPortrait.worldOffset);
    expect(portrait.focusRectInViewport).toEqual(
      expectedPortrait.focusRectInViewport,
    );
  });

  it("maximizes the selected layout25 focus from the raw page orientation", () => {
    const viewport = calculateMaximizedResponsiveArtViewport({
      pageSize: { width: 299, height: 466 },
      variants: {
        landscape: LAYOUT25_LANDSCAPE,
        portrait: LAYOUT25_PORTRAIT,
      },
    });

    expect(viewport.variantId).toBe("portrait");
    expect(viewport.viewportSize.width).toBe(1056);
    expect(viewport.viewportSize.height).toBeCloseTo((1056 * 466) / 299, 10);
    expect(viewport.focusRectInViewport).toMatchObject({
      x: 0,
      width: 1056,
      height: 1435,
    });

    const cssScale = 299 / viewport.viewportSize.width;
    expect(viewport.focusRectInViewport.width * cssScale).toBe(299);
    expect(viewport.focusRectInViewport.height * cssScale).toBeCloseTo(
      406.311553030303,
      10,
    );
  });

  it("retains the prior square variant in an instance-local policy", () => {
    const variants = {
      landscape: LAYOUT25_LANDSCAPE,
      portrait: LAYOUT25_PORTRAIT,
    };
    const policy = createMaximizedResponsiveArtViewportPolicy({ variants });

    expect(policy.resolveViewportSize({ width: 299, height: 466 })).toEqual({
      width: 1056,
      height: (1056 * 466) / 299,
    });
    expect(policy.resolveViewportSize({ width: 500, height: 500 })).toEqual({
      width: 1435,
      height: 1435,
    });

    const fresh = createMaximizedResponsiveArtViewportPolicy({ variants });
    expect(fresh.resolveViewportSize({ width: 500, height: 500 })).toEqual({
      width: 1954,
      height: 1954,
    });
  });

  it("maximizes explicit focus margins as one required rectangle", () => {
    const viewport = calculateMaximizedResponsiveArtViewport({
      pageSize: { width: 100, height: 200 },
      variants: {
        landscape: LANDSCAPE,
        portrait: {
          artSize: { width: 300, height: 300 },
          focusRect: { x: 100, y: 75, width: 80, height: 100 },
          minMargin: { left: 10, right: 10 },
        },
      },
    });

    expect(viewport.variantId).toBe("portrait");
    expect(viewport.viewportSize).toEqual({ width: 100, height: 200 });
    expect(viewport.focusRectInViewport).toEqual({
      x: 10,
      y: 50,
      width: 80,
      height: 100,
    });
  });

  it("fails fast when required variants are missing", () => {
    expect(() =>
      calculateResponsiveArtViewport({
        viewportSize: { width: 1600, height: 1000 },
        variants: { portrait: PORTRAIT },
      }),
    ).toThrow(/landscape/);

    expect(() =>
      calculateResponsiveArtViewport({
        viewportSize: { width: 900, height: 1200 },
        variants: { landscape: LANDSCAPE },
      }),
    ).toThrow(/portrait/);

    expect(() =>
      calculateMaximizedResponsiveArtViewport({
        pageSize: { width: 900, height: 1200 },
        variants: { landscape: LANDSCAPE },
      }),
    ).toThrow(/portrait/);

    expect(() =>
      calculateMaximizedResponsiveArtViewport({
        pageSize: { width: 100, height: 100 },
        squareVariant: "invalid" as never,
        variants: { landscape: LANDSCAPE, portrait: PORTRAIT },
      }),
    ).toThrow(/squareVariant/);
  });

  it("preserves out-of-art focus geometry and validates impossible margins", () => {
    expect(
      calculateResponsiveArtViewport({
        viewportSize: { width: 1200, height: 900 },
        variants: {
          landscape: {
            artSize: LANDSCAPE.artSize,
            focusRect: { x: 1900, y: 0, width: 200, height: 200 },
          },
          portrait: PORTRAIT,
        },
      }).visibleRect,
    ).toEqual({ x: 900, y: 0, width: 1200, height: 900 });

    expect(() =>
      calculateResponsiveArtViewport({
        viewportSize: { width: 900, height: 1200 },
        variants: {
          landscape: LANDSCAPE,
          portrait: {
            ...PORTRAIT,
            minMargin: { left: 600, right: 600 },
          },
        },
      }),
    ).toThrow(/width/);
  });
});
