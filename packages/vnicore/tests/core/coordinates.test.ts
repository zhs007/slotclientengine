import { describe, expect, it } from "vitest";
import {
  clampNumber,
  editorToPixi,
  pixiToEditor,
  roundTo,
} from "../../src/core/coordinates";

describe("coordinates", () => {
  it("converts center editor coordinates to pixi coordinates", () => {
    expect(editorToPixi(0, 0, 1600, 1600)).toEqual({ x: 800, y: 800 });
    expect(editorToPixi(100, 120, 1600, 1600)).toEqual({ x: 900, y: 680 });
  });

  it("converts pixi coordinates back to editor coordinates", () => {
    expect(pixiToEditor(900, 680, 1600, 1600)).toEqual({ x: 100, y: 120 });
  });

  it("clamps and rounds numbers", () => {
    expect(clampNumber(Number.NaN, 0, 1)).toBe(0);
    expect(clampNumber(2, 0, 1)).toBe(1);
    expect(roundTo(1.23456, 4)).toBe(1.2346);
  });
});
