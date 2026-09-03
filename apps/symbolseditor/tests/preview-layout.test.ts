import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import {
  attachPreviewRoots,
  calculateGalleryCellPosition,
  calculateGalleryLayout,
  clampZoom,
} from "../src/preview/symbol-preview.js";

describe("fixed all-symbol gallery layout", () => {
  it("keeps numeric-grid geometry responsive to viewport aspect ratio", () => {
    expect(calculateGalleryLayout(14, 1200, 700, 160, 160)).toMatchObject({
      columns: 5,
      rows: 3,
      strideX: 160,
      strideY: 160,
      contentWidth: 800,
      contentHeight: 480,
    });
    expect(calculateGalleryLayout(14, 500, 1000, 160, 160)).toMatchObject({
      columns: 3,
      rows: 5,
    });
    expect(calculateGalleryLayout(0, 500, 500, 160, 160)).toMatchObject({
      columns: 1,
      rows: 1,
      contentWidth: 160,
      contentHeight: 160,
    });
  });

  it("adds one local-pixel offset between adjacent cells on both axes", () => {
    const layout = calculateGalleryLayout(6, 1000, 500, 300, 100, 200);
    expect(layout).toEqual({
      columns: 3,
      rows: 2,
      strideX: 500,
      strideY: 300,
      contentWidth: 1300,
      contentHeight: 400,
    });
    expect(calculateGalleryCellPosition(0, layout)).toEqual({
      x: -500,
      y: -150,
    });
    expect(calculateGalleryCellPosition(1, layout)).toEqual({ x: 0, y: -150 });
    expect(calculateGalleryCellPosition(3, layout)).toEqual({
      x: -500,
      y: 150,
    });
    expect((layout.strideX - 300) * 0.5).toBe(100);
  });

  it("does not add outer spacing around empty or single-cell galleries", () => {
    expect(calculateGalleryLayout(0, 500, 500, 120, 80, 200)).toMatchObject({
      columns: 1,
      rows: 1,
      contentWidth: 120,
      contentHeight: 80,
    });
    const single = calculateGalleryLayout(1, 500, 500, 120, 80, 200);
    expect(single).toMatchObject({
      columns: 1,
      rows: 1,
      contentWidth: 120,
      contentHeight: 80,
    });
    expect(calculateGalleryCellPosition(0, single)).toEqual({ x: 0, y: 0 });
  });

  it("rejects invalid offsets instead of producing invalid positions", () => {
    for (const offset of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        calculateGalleryLayout(2, 500, 500, 160, 160, offset),
      ).toThrow("预览偏移必须是非负安全整数");
    }
  });

  it("clamps manual zoom without mutating manifest scale", () => {
    expect(clampZoom(0)).toBe(0.25);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(99)).toBe(4);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("keeps the initial empty gallery mount and resize as a no-op", () => {
    const gallery = new Container();
    expect(() => attachPreviewRoots(gallery, [])).not.toThrow();
    expect(gallery.children).toHaveLength(0);

    const roots = [new Container(), new Container()];
    attachPreviewRoots(gallery, roots);
    expect(gallery.children).toEqual(roots);
    gallery.destroy({ children: true });
  });
});
