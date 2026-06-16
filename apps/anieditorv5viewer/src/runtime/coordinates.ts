export interface Point2D {
  x: number;
  y: number;
}

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

export function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
