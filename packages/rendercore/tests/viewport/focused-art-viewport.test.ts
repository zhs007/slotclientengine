import { describe, expect, it } from "vitest";
import {
  calculateFocusedArtViewport,
  mapReferenceRectToArt,
} from "../../src/viewport/index.js";

const ART_SIZE = Object.freeze({ width: 2000, height: 2000 });
const REFERENCE_SIZE = Object.freeze({ width: 1125, height: 2000 });
const REFERENCE_BOARD = Object.freeze({
  x: 200,
  y: 330,
  width: 720,
  height: 1080,
});
const FOCUS_RECT = Object.freeze({
  x: 637.5,
  y: 330,
  width: 720,
  height: 1080,
});
const MARGIN = Object.freeze({ left: 60, right: 60, top: 60, bottom: 60 });

describe("focused art viewport", () => {
  it("maps a centered reference rect into the larger art coordinate space", () => {
    expect(
      mapReferenceRectToArt({
        artSize: ART_SIZE,
        referenceSize: REFERENCE_SIZE,
        referenceRect: REFERENCE_BOARD,
      }),
    ).toEqual(FOCUS_RECT);
  });

  it("preserves the portrait reference crop inside the 2000 x 2000 art", () => {
    const viewport = calculateFocusedArtViewport({
      artSize: ART_SIZE,
      viewportSize: REFERENCE_SIZE,
      focusRect: FOCUS_RECT,
      minMargin: MARGIN,
    });

    expect(viewport.visibleRect).toEqual({
      x: 437.5,
      y: 0,
      width: 1125,
      height: 2000,
    });
    expect(viewport.worldOffset).toEqual({ x: -437.5, y: -0 });
    expect(viewport.focusRectInViewport).toEqual(REFERENCE_BOARD);
  });

  it("centers the focus rect inside square and landscape viewports", () => {
    expect(
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 1200, height: 1200 },
        focusRect: FOCUS_RECT,
        minMargin: MARGIN,
      }),
    ).toMatchObject({
      visibleRect: { x: 397.5, y: 270, width: 1200, height: 1200 },
      focusRectInViewport: { x: 240, y: 60, width: 720, height: 1080 },
    });

    expect(
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 2000, height: 1200 },
        focusRect: FOCUS_RECT,
        minMargin: MARGIN,
      }),
    ).toMatchObject({
      visibleRect: { x: 0, y: 270, width: 2000, height: 1200 },
      focusRectInViewport: { x: 637.5, y: 60, width: 720, height: 1080 },
    });
  });

  it("clamps visible rects to the art boundary while keeping margins", () => {
    const viewport = calculateFocusedArtViewport({
      artSize: { width: 1000, height: 1000 },
      viewportSize: { width: 600, height: 600 },
      focusRect: { x: 650, y: 640, width: 240, height: 240 },
      minMargin: { right: 50, bottom: 50 },
    });

    expect(viewport.visibleRect).toEqual({
      x: 400,
      y: 400,
      width: 600,
      height: 600,
    });
    expect(viewport.focusRectInViewport).toEqual({
      x: 250,
      y: 240,
      width: 240,
      height: 240,
    });
  });

  it("fails fast for invalid sizes, focus rects and impossible margins", () => {
    expect(() =>
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 2001, height: 1000 },
        focusRect: FOCUS_RECT,
      }),
    ).toThrow(/must not exceed/);
    expect(() =>
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 1000, height: 1000 },
        focusRect: { x: 1500, y: 0, width: 600, height: 100 },
      }),
    ).toThrow(/focusRect/);
    expect(() =>
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 839, height: 1200 },
        focusRect: FOCUS_RECT,
        minMargin: MARGIN,
      }),
    ).toThrow(/width/);
    expect(() =>
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 1200, height: 1199 },
        focusRect: FOCUS_RECT,
        minMargin: MARGIN,
      }),
    ).toThrow(/height/);
    expect(() =>
      calculateFocusedArtViewport({
        artSize: { width: Number.NaN, height: 100 },
        viewportSize: { width: 100, height: 100 },
        focusRect: { x: 0, y: 0, width: 10, height: 10 },
      }),
    ).toThrow(/artSize.width/);
    expect(() =>
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: Number.POSITIVE_INFINITY, height: 100 },
        focusRect: FOCUS_RECT,
      }),
    ).toThrow(/viewportSize.width/);
    expect(() =>
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 1000, height: 1000 },
        focusRect: { x: -1, y: 0, width: 10, height: 10 },
      }),
    ).toThrow(/origin/);
    expect(() =>
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 1000, height: 1000 },
        focusRect: FOCUS_RECT,
        minMargin: { left: -1 },
      }),
    ).toThrow(/minMargin.left/);
  });

  it("rejects invalid reference mappings", () => {
    expect(() =>
      mapReferenceRectToArt({
        artSize: { width: 100, height: 100 },
        referenceSize: { width: 200, height: 100 },
        referenceRect: { x: 0, y: 0, width: 10, height: 10 },
      }),
    ).toThrow(/referenceSize/);
    expect(() =>
      mapReferenceRectToArt({
        artSize: ART_SIZE,
        referenceSize: REFERENCE_SIZE,
        referenceRect: { x: 1000, y: 0, width: 200, height: 100 },
      }),
    ).toThrow(/referenceRect/);
    expect(() =>
      mapReferenceRectToArt({
        artSize: ART_SIZE,
        referenceSize: REFERENCE_SIZE,
        referenceRect: REFERENCE_BOARD,
        align: "left" as never,
      }),
    ).toThrow(/align/);
  });
});
