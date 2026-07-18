import { describe, expect, it } from "vitest";
import {
  calculateGalleryLayout,
  clampZoom,
} from "../src/preview/symbol-preview.js";

describe("fixed all-symbol gallery layout", () => {
  it("keeps numeric-grid geometry responsive to viewport aspect ratio", () => {
    expect(calculateGalleryLayout(14, 1200, 700, 160, 160)).toEqual({
      columns: 5,
      rows: 3,
    });
    expect(calculateGalleryLayout(14, 500, 1000, 160, 160)).toEqual({
      columns: 3,
      rows: 5,
    });
    expect(calculateGalleryLayout(0, 500, 500, 160, 160)).toEqual({
      columns: 1,
      rows: 1,
    });
  });

  it("clamps manual zoom without mutating manifest scale", () => {
    expect(clampZoom(0)).toBe(0.25);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(99)).toBe(4);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});
