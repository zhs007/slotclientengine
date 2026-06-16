import { describe, expect, it } from "vitest";
import {
  clampNumber,
  editorToPixi,
  pixiToEditor,
  roundTo,
} from "../../src/core/coordinates";

describe("coordinates", () => {
  it("keeps the Pixi reference conversion available for comparisons", () => {
    expect(editorToPixi(100, 50, 1600, 1600)).toEqual({ x: 900, y: 750 });
    expect(pixiToEditor(900, 750, 1600, 1600)).toEqual({ x: 100, y: 50 });
  });

  it("clamps and rounds numbers", () => {
    expect(clampNumber(Number.NaN, 0, 1)).toBe(0);
    expect(clampNumber(2, 0, 1)).toBe(1);
    expect(roundTo(1.23456, 3)).toBe(1.235);
  });
});
