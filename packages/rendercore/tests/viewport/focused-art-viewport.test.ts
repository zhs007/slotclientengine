import { describe, expect, it } from "vitest";
import {
  calculateFocusedArtViewport,
  calculateFocusedFrameDesignSize,
  calculateMaximizedFocusedArtViewport,
  createMaximizedFocusedArtViewportPolicy,
  mapAnchorRectToArt,
  mapArtRectToViewport,
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
  it("ports focus-aware DOM frame sizing into pure render geometry", () => {
    expect(
      calculateFocusedFrameDesignSize({
        pageSize: { width: 390, height: 844 },
        maxDesignSize: { width: 1174, height: 2000 },
        preferredPortraitSize: { width: 1174, height: 2000 },
        focusSize: { width: 1130, height: 1061 },
        minMargin: { left: 22, right: 22 },
      }),
    ).toEqual({ width: 1174, height: 2000 });

    expect(
      calculateFocusedFrameDesignSize({
        pageSize: { width: 3000, height: 1000 },
        maxDesignSize: { width: 2000, height: 1125 },
        preferredPortraitSize: { width: 2000, height: 1125 },
        focusSize: { width: 1424, height: 824 },
      }),
    ).toEqual({ width: 2000, height: 824 });
  });

  it("maximizes one focus rect by page orientation", () => {
    const focusRect = Object.freeze({
      x: 577.5,
      y: 270,
      width: 840,
      height: 1200,
    });

    expect(
      calculateMaximizedFocusedArtViewport({
        artSize: ART_SIZE,
        pageSize: { width: 1200, height: 1200 },
        focusRect,
      }),
    ).toMatchObject({
      viewportSize: { width: 1200, height: 1200 },
      focusRectInViewport: { x: 180, y: 0, width: 840, height: 1200 },
    });

    expect(
      calculateMaximizedFocusedArtViewport({
        artSize: ART_SIZE,
        pageSize: { width: 1920, height: 1080 },
        focusRect,
      }),
    ).toMatchObject({
      viewportSize: { width: 2000, height: 1200 },
      focusRectInViewport: { x: 577.5, y: 0, width: 840, height: 1200 },
    });

    const portrait = calculateMaximizedFocusedArtViewport({
      artSize: ART_SIZE,
      pageSize: { width: 390, height: 844 },
      focusRect,
    });
    expect(portrait.viewportSize.width).toBe(840);
    expect(portrait.viewportSize.height).toBeCloseTo((840 * 844) / 390, 10);
    expect(portrait.focusRectInViewport.width).toBe(840);

    const nearSquarePortrait = calculateMaximizedFocusedArtViewport({
      artSize: ART_SIZE,
      pageSize: { width: 1430, height: 1464 },
      focusRect,
    });
    expect(nearSquarePortrait.viewportSize.width).toBeCloseTo(
      (1430 * 1200) / 1464,
      10,
    );
    expect(nearSquarePortrait.viewportSize.height).toBe(1200);
  });

  it("shows extra background instead of locking the viewport to the focus aspect", () => {
    expect(
      calculateMaximizedFocusedArtViewport({
        artSize: ART_SIZE,
        pageSize: { width: 1200, height: 1600 },
        focusRect: { x: 577.5, y: 270, width: 840, height: 1200 },
      }).viewportSize,
    ).toEqual({ width: 900, height: 1200 });
  });

  it("normalizes floating-point projection at compact focus boundaries", () => {
    const focusRect = Object.freeze({
      x: 580,
      y: 277,
      width: 840,
      height: 1200,
    });
    const heightLimited = calculateMaximizedFocusedArtViewport({
      artSize: ART_SIZE,
      pageSize: { width: 59, height: 84 },
      focusRect,
    });
    expect(heightLimited.viewportSize.height).toBe(1200);
    expect(heightLimited.viewportSize.width).toBeCloseTo(842.857142857, 9);
    expect(heightLimited.focusRectInViewport.height).toBe(1200);

    const widthLimited = calculateMaximizedFocusedArtViewport({
      artSize: ART_SIZE,
      pageSize: { width: 1, height: 2 },
      focusRect,
    });
    expect(widthLimited.viewportSize.width).toBe(840);
    expect(widthLimited.viewportSize.height).toBeCloseTo(1680, 10);
    expect(widthLimited.focusRectInViewport.width).toBe(840);

    expect(() =>
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 839.99, height: 1200 },
        focusRect,
      }),
    ).toThrow(/width/);
  });

  it("creates a reusable maximized-focus policy", () => {
    const policy = createMaximizedFocusedArtViewportPolicy({
      artSize: ART_SIZE,
      focusRect: { x: 577.5, y: 270, width: 840, height: 1200 },
    });
    expect(policy.mode).toBe("maximized-focus");
    expect(policy.resolveViewportSize({ width: 1200, height: 1200 })).toEqual({
      width: 1200,
      height: 1200,
    });
    expect(() =>
      policy.resolveViewportSize({ width: 0, height: 1200 }),
    ).toThrow(/pageSize.width/);
    const outOfArtPolicy = createMaximizedFocusedArtViewportPolicy({
      artSize: ART_SIZE,
      focusRect: { x: 1500, y: 0, width: 600, height: 100 },
    });
    expect(
      outOfArtPolicy.resolveViewportSize({ width: 1000, height: 1000 }),
    ).toEqual({ width: 600, height: 600 });
  });

  it("maps a centered reference rect into the larger art coordinate space", () => {
    expect(
      mapReferenceRectToArt({
        artSize: ART_SIZE,
        referenceSize: REFERENCE_SIZE,
        referenceRect: REFERENCE_BOARD,
      }),
    ).toEqual(FOCUS_RECT);
  });

  it("maps negative top-left coordinates without clamping them", () => {
    expect(
      mapReferenceRectToArt({
        artSize: { width: 100, height: 100 },
        referenceSize: { width: 200, height: 200 },
        referenceRect: { x: -30, y: -20, width: 40, height: 50 },
      }),
    ).toEqual({ x: -80, y: -70, width: 40, height: 50 });
    expect(
      mapAnchorRectToArt({
        artSize: { width: 100, height: 100 },
        anchorRect: { x: -50, y: -40, width: 20, height: 20 },
        rect: { x: -10, y: -5, width: 30, height: 40 },
      }),
    ).toEqual({ x: -60, y: -45, width: 30, height: 40 });
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

  it("maps an art rect through a visible rect even when it differs from focus", () => {
    const focusRect = Object.freeze({
      x: 760,
      y: 210,
      width: 480,
      height: 600,
    });
    const boardRect = Object.freeze({
      x: 637.5,
      y: 330,
      width: 720,
      height: 1080,
    });
    const viewport = calculateFocusedArtViewport({
      artSize: ART_SIZE,
      viewportSize: { width: 1200, height: 1200 },
      focusRect,
      minMargin: MARGIN,
    });

    expect(viewport.visibleRect).toEqual({
      x: 400,
      y: 0,
      width: 1200,
      height: 1200,
    });
    expect(viewport.focusRectInViewport).toEqual({
      x: 360,
      y: 210,
      width: 480,
      height: 600,
    });
    expect(
      mapArtRectToViewport({
        artSize: ART_SIZE,
        visibleRect: viewport.visibleRect,
        rect: boardRect,
      }),
    ).toEqual({
      x: 237.5,
      y: 330,
      width: 720,
      height: 1080,
    });
  });

  it("maps a child rect from an anchor rect into art coordinates", () => {
    expect(
      mapAnchorRectToArt({
        artSize: ART_SIZE,
        anchorRect: { x: 288, y: 588, width: 1424, height: 824 },
        rect: { x: 294, y: 0, width: 1130, height: 824 },
      }),
    ).toEqual({ x: 582, y: 588, width: 1130, height: 824 });
  });

  it("allows anchored child rects to extend beyond the anchor when they fit art", () => {
    expect(
      mapAnchorRectToArt({
        artSize: { width: 1200, height: 1200 },
        anchorRect: { x: 100, y: 100, width: 200, height: 200 },
        rect: { x: 150, y: 160, width: 400, height: 500 },
      }),
    ).toEqual({ x: 250, y: 260, width: 400, height: 500 });
  });

  it("allows anchored child rects to use negative offsets when they fit art", () => {
    expect(
      mapAnchorRectToArt({
        artSize: { width: 2000, height: 2000 },
        anchorRect: { x: 288, y: 588, width: 1424, height: 824 },
        rect: { x: 294, y: -10, width: 1130, height: 824 },
      }),
    ).toEqual({ x: 582, y: 578, width: 1130, height: 824 });
  });

  it("composes anchored art rect mapping with viewport mapping", () => {
    const viewport = calculateFocusedArtViewport({
      artSize: ART_SIZE,
      viewportSize: { width: 1600, height: 1200 },
      focusRect: { x: 288, y: 588, width: 1424, height: 824 },
    });
    const anchoredRect = mapAnchorRectToArt({
      artSize: ART_SIZE,
      anchorRect: { x: 288, y: 588, width: 1424, height: 824 },
      rect: { x: 0, y: 49, width: 284, height: 775 },
    });

    expect(anchoredRect).toEqual({ x: 288, y: 637, width: 284, height: 775 });
    expect(
      mapArtRectToViewport({
        artSize: ART_SIZE,
        visibleRect: viewport.visibleRect,
        rect: anchoredRect,
      }),
    ).toEqual({ x: 88, y: 237, width: 284, height: 775 });
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

  it("extends the visible plane when authored focus geometry is outside art", () => {
    const right = calculateFocusedArtViewport({
      artSize: ART_SIZE,
      viewportSize: { width: 1000, height: 1000 },
      focusRect: { x: 1500, y: 0, width: 600, height: 100 },
    });
    expect(right.visibleRect).toEqual({
      x: 1100,
      y: 0,
      width: 1000,
      height: 1000,
    });
    expect(right.focusRectInViewport).toEqual({
      x: 400,
      y: 0,
      width: 600,
      height: 100,
    });

    const negative = calculateFocusedArtViewport({
      artSize: ART_SIZE,
      viewportSize: { width: 1000, height: 1000 },
      focusRect: { x: -100, y: -50, width: 200, height: 100 },
    });
    expect(negative.visibleRect).toEqual({
      x: -100,
      y: -50,
      width: 1000,
      height: 1000,
    });
  });

  it("allows a viewport larger than art and exposes the uncovered area", () => {
    expect(
      calculateFocusedArtViewport({
        artSize: ART_SIZE,
        viewportSize: { width: 2200, height: 2100 },
        focusRect: FOCUS_RECT,
      }).visibleRect,
    ).toEqual({ x: -100, y: -50, width: 2200, height: 2100 });
  });

  it("fails fast for invalid sizes and impossible margins", () => {
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
        focusRect: FOCUS_RECT,
        minMargin: { left: -1 },
      }),
    ).toThrow(/minMargin.left/);
  });

  it("rejects invalid reference mappings", () => {
    expect(() =>
      mapReferenceRectToArt({
        artSize: ART_SIZE,
        referenceSize: REFERENCE_SIZE,
        referenceRect: {
          x: Number.NaN,
          y: 0,
          width: 200,
          height: 100,
        },
      }),
    ).toThrow(/referenceRect.x/);
    expect(() =>
      mapReferenceRectToArt({
        artSize: ART_SIZE,
        referenceSize: REFERENCE_SIZE,
        referenceRect: REFERENCE_BOARD,
        align: "left" as never,
      }),
    ).toThrow(/align/);
  });

  it("maps authored rects outside art without correcting them", () => {
    expect(
      mapArtRectToViewport({
        artSize: ART_SIZE,
        visibleRect: { x: 900, y: 0, width: 1200, height: 1200 },
        rect: FOCUS_RECT,
      }),
    ).toEqual({ x: -262.5, y: 330, width: 720, height: 1080 });
    expect(
      mapArtRectToViewport({
        artSize: ART_SIZE,
        visibleRect: { x: 0, y: 0, width: 1200, height: 1200 },
        rect: { x: 1500, y: 0, width: 600, height: 100 },
      }),
    ).toEqual({ x: 1500, y: 0, width: 600, height: 100 });
    expect(() =>
      mapArtRectToViewport({
        artSize: ART_SIZE,
        visibleRect: { x: 0, y: 0, width: 1200, height: 1200 },
        rect: { x: 0, y: 0, width: Number.NaN, height: 100 },
      }),
    ).toThrow(/rect.width/);
  });

  it("rejects invalid anchored rect mappings", () => {
    expect(() =>
      mapAnchorRectToArt({
        artSize: ART_SIZE,
        anchorRect: { x: 288, y: 588, width: 1424, height: 824 },
        rect: { x: 0, y: Number.NaN, width: 400, height: 100 },
      }),
    ).toThrow(/rect.y/);
    expect(() =>
      mapAnchorRectToArt({
        artSize: { width: 100, height: Number.POSITIVE_INFINITY },
        anchorRect: { x: 0, y: 0, width: 10, height: 10 },
        rect: { x: 0, y: 0, width: 10, height: 10 },
      }),
    ).toThrow(/artSize.height/);
  });
});
