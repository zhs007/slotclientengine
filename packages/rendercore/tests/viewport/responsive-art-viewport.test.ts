import { describe, expect, it } from "vitest";
import {
  calculateFocusedArtViewport,
  calculateResponsiveArtViewport,
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
  });

  it("keeps focused viewport validation for invalid focus rects and margins", () => {
    expect(() =>
      calculateResponsiveArtViewport({
        viewportSize: { width: 1200, height: 900 },
        variants: {
          landscape: {
            artSize: LANDSCAPE.artSize,
            focusRect: { x: 1900, y: 0, width: 200, height: 200 },
          },
          portrait: PORTRAIT,
        },
      }),
    ).toThrow(/focusRect/);

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
