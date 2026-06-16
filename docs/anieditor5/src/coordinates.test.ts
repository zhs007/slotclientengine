import { describe, expect, it } from "vitest";
import { editorToPixi, pixiToEditor } from "./coordinates";

describe("V5-G center coordinate conversion", () => {
  it("maps editor center to Pixi stage center", () => {
    expect(editorToPixi(0, 0, 800, 600)).toEqual({ x: 400, y: 300 });
  });

  it("maps editor top-right to Pixi top-right", () => {
    expect(editorToPixi(400, 300, 800, 600)).toEqual({ x: 800, y: 0 });
  });

  it("round trips between editor and Pixi coordinates", () => {
    const pixi = editorToPixi(-120, 88, 800, 600);
    expect(pixiToEditor(pixi.x, pixi.y, 800, 600)).toEqual({ x: -120, y: 88 });
  });
});
