export interface Point2D {
  x: number;
  y: number;
}

export { clampNumber, roundTo } from "../data/numeric.js";

export function editorToPixi(
  x: number,
  y: number,
  stageWidth: number,
  stageHeight: number,
): Point2D {
  return {
    x: stageWidth / 2 + x,
    y: stageHeight / 2 - y,
  };
}

export function pixiToEditor(
  x: number,
  y: number,
  stageWidth: number,
  stageHeight: number,
): Point2D {
  return {
    x: x - stageWidth / 2,
    y: stageHeight / 2 - y,
  };
}
