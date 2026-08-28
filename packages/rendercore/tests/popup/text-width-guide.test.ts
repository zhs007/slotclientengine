import { describe, expect, it } from "vitest";
import {
  createPopupTextWidthGuidePlan,
  POPUP_TEXT_GUIDE_MAX_STROKE_PIXELS,
  POPUP_TEXT_GUIDE_MIN_STROKE_PIXELS,
} from "../../src/popup/text-width-guide.js";

describe("popup text width guide", () => {
  it("builds complete nested ranges with canvas-stable thick strokes", () => {
    const canvasPixelsPerLocalUnit = 0.5;
    const plan = createPopupTextWidthGuidePlan({
      range: { minWidth: 120, maxWidth: 200 },
      height: 50,
      anchor: { x: 0.5, y: 0.5 },
      canvasPixelsPerLocalUnit,
    });

    expect(plan.maxRect).toEqual({
      x: -100,
      y: -25,
      width: 200,
      height: 50,
    });
    expect(plan.minRect).toEqual({
      x: -60,
      y: -25,
      width: 120,
      height: 50,
    });
    expect(plan.maxStrokeWidth * canvasPixelsPerLocalUnit).toBe(
      POPUP_TEXT_GUIDE_MAX_STROKE_PIXELS,
    );
    expect(plan.minStrokeWidth * canvasPixelsPerLocalUnit).toBe(
      POPUP_TEXT_GUIDE_MIN_STROKE_PIXELS,
    );
    expect(plan.maxStrokeWidth * canvasPixelsPerLocalUnit).toBeGreaterThan(2);
    expect(plan.minStrokeWidth * canvasPixelsPerLocalUnit).toBeGreaterThan(2);
    expect(plan.hatchLines.length).toBeGreaterThan(0);
    for (const line of plan.hatchLines) {
      expect(line.x1).toBeGreaterThanOrEqual(plan.maxRect.x);
      expect(line.x2).toBeLessThanOrEqual(plan.maxRect.x + plan.maxRect.width);
      expect(line.y1).toBeGreaterThanOrEqual(plan.maxRect.y);
      expect(line.y2).toBeLessThanOrEqual(plan.maxRect.y + plan.maxRect.height);
    }
  });

  it("bounds hatch work and rejects invalid geometry", () => {
    const plan = createPopupTextWidthGuidePlan({
      range: { minWidth: 1, maxWidth: 1_000_000 },
      height: 1_000_000,
      anchor: { x: 0, y: 1 },
      canvasPixelsPerLocalUnit: 100,
    });
    expect(plan.hatchLines.length).toBeLessThanOrEqual(512);
    expect(() =>
      createPopupTextWidthGuidePlan({
        range: { minWidth: 0, maxWidth: 100 },
        height: 10,
        anchor: { x: 0.5, y: 0.5 },
        canvasPixelsPerLocalUnit: 1,
      }),
    ).toThrow(/positive widthRange/);
    expect(() =>
      createPopupTextWidthGuidePlan({
        range: { minWidth: 10, maxWidth: 100 },
        height: 10,
        anchor: { x: 0.5, y: 0.5 },
        canvasPixelsPerLocalUnit: 0,
      }),
    ).toThrow(/canvas scale/);
  });
});
