import { Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  clampPreviewZoom,
  PREVIEW_SIZE_PRESETS,
  validatePreviewSize,
} from "../src/preview/preview-size.js";
import { drawPreviewGuides } from "../src/preview/preview-guides.js";

describe("preview helpers", () => {
  it("provides required page presets and keeps zoom display-only", () => {
    expect(PREVIEW_SIZE_PRESETS.map((preset) => preset.label)).toEqual([
      "1920×1080",
      "390×844",
      "1200×1200",
      "1430×1464",
    ]);
    expect(validatePreviewSize({ width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    });
    expect(clampPreviewZoom(0)).toBe(0.25);
    expect(clampPreviewZoom(3)).toBe(2);
    expect(() => validatePreviewSize({ width: 0, height: 1 })).toThrow(/width/);
    expect(() => validatePreviewSize({ width: 1, height: Infinity })).toThrow(
      /height/,
    );
  });

  it("draws focus, outer reel and every cell from the runtime snapshot", () => {
    const graphics = new Graphics();
    expect(() =>
      drawPreviewGuides({
        graphics,
        showFocus: true,
        showReels: true,
        snapshot: {
          variantId: "default",
          artSize: { width: 100, height: 100 },
          viewportSize: { width: 100, height: 100 },
          visibleRect: { x: 0, y: 0, width: 100, height: 100 },
          worldOffset: { x: 0, y: 0 },
          focusRectInViewport: { x: 10, y: 10, width: 80, height: 80 },
          reels: {
            main: {
              id: "main",
              variantId: "default",
              columns: 2,
              rows: 2,
              cellSize: { width: 20, height: 20 },
              gap: { x: 5, y: 3 },
              stride: { width: 25, height: 23 },
              artRect: { x: 20, y: 20, width: 45, height: 43 },
              viewportRect: { x: 20, y: 20, width: 45, height: 43 },
            },
          },
        },
      }),
    ).not.toThrow();
    expect(graphics.context.instructions.length).toBeGreaterThan(0);
    graphics.destroy();
  });
});
