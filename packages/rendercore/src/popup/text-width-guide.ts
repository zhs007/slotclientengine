import type { PopupAnchor, PopupTextWidthRange } from "./types.js";

export const POPUP_TEXT_GUIDE_MAX_STROKE_PIXELS = 6;
export const POPUP_TEXT_GUIDE_MIN_STROKE_PIXELS = 4;
export const POPUP_TEXT_GUIDE_HATCH_STROKE_PIXELS = 2;
export const POPUP_TEXT_GUIDE_HATCH_SPACING_PIXELS = 14;

const MAX_HATCH_LINES = 512;

export interface PopupTextWidthGuideRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PopupTextWidthGuideLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface PopupTextWidthGuidePlan {
  readonly maxRect: PopupTextWidthGuideRect;
  readonly minRect: PopupTextWidthGuideRect;
  readonly hatchLines: readonly PopupTextWidthGuideLine[];
  readonly maxStrokeWidth: number;
  readonly minStrokeWidth: number;
  readonly hatchStrokeWidth: number;
}

export function createPopupTextWidthGuidePlan(options: {
  readonly range: PopupTextWidthRange;
  readonly height: number;
  readonly anchor: PopupAnchor;
  readonly canvasPixelsPerLocalUnit: number;
}): PopupTextWidthGuidePlan {
  const { range, anchor } = options;
  if (
    !Number.isFinite(range.minWidth) ||
    !Number.isFinite(range.maxWidth) ||
    range.minWidth <= 0 ||
    range.maxWidth <= 0 ||
    range.minWidth > range.maxWidth
  )
    throw new Error("popup text width guide requires a positive widthRange.");
  if (!Number.isFinite(options.height) || options.height <= 0)
    throw new Error("popup text width guide height must be positive.");
  if (
    !Number.isFinite(options.canvasPixelsPerLocalUnit) ||
    options.canvasPixelsPerLocalUnit <= 0
  )
    throw new Error(
      "popup text width guide canvas scale must be finite and positive.",
    );

  const maxRect = Object.freeze({
    x: -range.maxWidth * anchor.x,
    y: -options.height * anchor.y,
    width: range.maxWidth,
    height: options.height,
  });
  const minRect = Object.freeze({
    x: -range.minWidth * anchor.x,
    y: maxRect.y,
    width: range.minWidth,
    height: maxRect.height,
  });
  const localUnitsPerCanvasPixel = 1 / options.canvasPixelsPerLocalUnit;
  const desiredSpacing =
    POPUP_TEXT_GUIDE_HATCH_SPACING_PIXELS * localUnitsPerCanvasPixel;
  const boundedSpacing = Math.max(
    desiredSpacing,
    maxRect.width / MAX_HATCH_LINES + maxRect.height / MAX_HATCH_LINES,
  );
  const hatchLines = drawDiagonalHatch(maxRect, boundedSpacing);

  return Object.freeze({
    maxRect,
    minRect,
    hatchLines,
    maxStrokeWidth:
      POPUP_TEXT_GUIDE_MAX_STROKE_PIXELS * localUnitsPerCanvasPixel,
    minStrokeWidth:
      POPUP_TEXT_GUIDE_MIN_STROKE_PIXELS * localUnitsPerCanvasPixel,
    hatchStrokeWidth:
      POPUP_TEXT_GUIDE_HATCH_STROKE_PIXELS * localUnitsPerCanvasPixel,
  });
}

function drawDiagonalHatch(
  rect: PopupTextWidthGuideRect,
  spacing: number,
): readonly PopupTextWidthGuideLine[] {
  const lines: PopupTextWidthGuideLine[] = [];
  for (
    let offset = -rect.height;
    offset < rect.width && lines.length < MAX_HATCH_LINES;
    offset += spacing
  ) {
    const x1 = Math.max(0, offset);
    const x2 = Math.min(rect.width, offset + rect.height);
    if (x2 <= x1) continue;
    lines.push(
      Object.freeze({
        x1: rect.x + x1,
        y1: rect.y + x1 - offset,
        x2: rect.x + x2,
        y2: rect.y + x2 - offset,
      }),
    );
  }
  return Object.freeze(lines);
}
