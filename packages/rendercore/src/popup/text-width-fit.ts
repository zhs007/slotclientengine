import type { PopupTextWidthRange } from "./data/types.js";

export interface PopupTextWidthFitResult {
  readonly fontSize: number;
  readonly width: number;
}

const MAX_BRACKET_STEPS = 48;
const MAX_SEARCH_STEPS = 48;

export function resolvePopupTextFontSize(options: {
  readonly authoredFontSize: number;
  readonly widthRange?: PopupTextWidthRange;
  readonly measureWidth: (fontSize: number) => number;
  readonly empty?: boolean;
}): PopupTextWidthFitResult {
  const authoredFontSize = positive(options.authoredFontSize, "fontSize");
  const range = validateRange(options.widthRange);
  if (!range || options.empty)
    return Object.freeze({ fontSize: authoredFontSize, width: 0 });
  const authoredWidth = measure(options.measureWidth, authoredFontSize);
  if (authoredWidth === 0)
    return Object.freeze({ fontSize: authoredFontSize, width: authoredWidth });
  if (authoredWidth >= range.minWidth && authoredWidth <= range.maxWidth)
    return Object.freeze({ fontSize: authoredFontSize, width: authoredWidth });

  const expanding = authoredWidth < range.minWidth;
  const target = expanding ? range.minWidth : range.maxWidth;
  let lowerFontSize: number;
  let lowerWidth: number;
  let upperFontSize: number;
  let upperWidth: number;

  if (expanding) {
    lowerFontSize = authoredFontSize;
    lowerWidth = authoredWidth;
    upperFontSize = authoredFontSize;
    upperWidth = authoredWidth;
    for (let step = 0; step < MAX_BRACKET_STEPS; step += 1) {
      upperFontSize *= 2;
      if (!Number.isFinite(upperFontSize))
        throw new Error(
          "popup text width fitting produced non-finite fontSize.",
        );
      upperWidth = measure(options.measureWidth, upperFontSize);
      if (upperWidth >= target) break;
    }
    if (upperWidth < target)
      throw new Error("popup text width fitting could not reach minWidth.");
  } else {
    upperFontSize = authoredFontSize;
    upperWidth = authoredWidth;
    lowerFontSize = authoredFontSize;
    lowerWidth = authoredWidth;
    for (let step = 0; step < MAX_BRACKET_STEPS; step += 1) {
      lowerFontSize /= 2;
      if (!(lowerFontSize > 0) || !Number.isFinite(lowerFontSize))
        throw new Error("popup text width fitting produced invalid fontSize.");
      lowerWidth = measure(options.measureWidth, lowerFontSize);
      if (lowerWidth <= target) break;
    }
    if (lowerWidth > target)
      throw new Error("popup text width fitting could not reach maxWidth.");
  }

  for (let step = 0; step < MAX_SEARCH_STEPS; step += 1) {
    const middleFontSize = (lowerFontSize + upperFontSize) / 2;
    const middleWidth = measure(options.measureWidth, middleFontSize);
    if (middleWidth < target) {
      lowerFontSize = middleFontSize;
      lowerWidth = middleWidth;
    } else {
      upperFontSize = middleFontSize;
      upperWidth = middleWidth;
    }
  }

  const fontSize = expanding ? upperFontSize : lowerFontSize;
  const width = expanding ? upperWidth : lowerWidth;
  const tolerance = Math.max(1e-6, target * 1e-9);
  if (width < range.minWidth - tolerance || width > range.maxWidth + tolerance)
    throw new Error(
      "popup text width fitting did not resolve inside widthRange.",
    );
  return Object.freeze({ fontSize, width });
}

function validateRange(
  value: PopupTextWidthRange | undefined,
): PopupTextWidthRange | null {
  if (!value || (value.minWidth === 0 && value.maxWidth === 0)) return null;
  const minWidth = positive(value.minWidth, "minWidth");
  const maxWidth = positive(value.maxWidth, "maxWidth");
  if (minWidth > maxWidth)
    throw new Error("popup text widthRange minWidth must not exceed maxWidth.");
  return Object.freeze({ minWidth, maxWidth });
}

function measure(
  measureWidth: (fontSize: number) => number,
  fontSize: number,
): number {
  const width = measureWidth(fontSize);
  if (!Number.isFinite(width) || width < 0)
    throw new Error(
      "popup styled text metrics must be finite and non-negative.",
    );
  return width;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`popup text ${label} must be finite and positive.`);
  return value;
}
