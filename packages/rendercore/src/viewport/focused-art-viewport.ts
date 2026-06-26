export interface RenderViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface RenderViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RenderViewportMargin {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
}

export interface FocusedArtViewportOptions {
  readonly artSize: RenderViewportSize;
  readonly viewportSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly minMargin?: RenderViewportMargin;
}

export interface FocusedArtViewport {
  readonly artSize: RenderViewportSize;
  readonly viewportSize: RenderViewportSize;
  readonly visibleRect: RenderViewportRect;
  readonly worldOffset: { readonly x: number; readonly y: number };
  readonly focusRectInViewport: RenderViewportRect;
}

export function calculateFocusedArtViewport(
  options: FocusedArtViewportOptions,
): FocusedArtViewport {
  const artSize = validateSize(options.artSize, "artSize");
  const viewportSize = validateSize(options.viewportSize, "viewportSize");
  const focusRect = validateRect(options.focusRect, "focusRect");
  const minMargin = normalizeMargin(options.minMargin);

  if (
    viewportSize.width > artSize.width ||
    viewportSize.height > artSize.height
  ) {
    throw new Error("viewportSize must not exceed artSize.");
  }
  if (
    focusRect.x + focusRect.width > artSize.width ||
    focusRect.y + focusRect.height > artSize.height
  ) {
    throw new Error("focusRect must fit inside artSize.");
  }

  const minimumWidth = focusRect.width + minMargin.left + minMargin.right;
  const minimumHeight = focusRect.height + minMargin.top + minMargin.bottom;
  if (viewportSize.width < minimumWidth) {
    throw new Error("viewportSize.width cannot contain focusRect minMargin.");
  }
  if (viewportSize.height < minimumHeight) {
    throw new Error("viewportSize.height cannot contain focusRect minMargin.");
  }

  const focusedX = clampOrigin(
    focusRect.x + focusRect.width / 2 - viewportSize.width / 2,
    artSize.width,
    viewportSize.width,
  );
  const artCenteredX = (artSize.width - viewportSize.width) / 2;
  const visibleX =
    viewportSize.height === artSize.height &&
    satisfiesHorizontalMargin(artCenteredX, viewportSize, focusRect, minMargin)
      ? artCenteredX
      : focusedX;
  const visibleY = clampOrigin(
    focusRect.y + focusRect.height / 2 - viewportSize.height / 2,
    artSize.height,
    viewportSize.height,
  );
  const visibleRect = freezeRect({
    x: visibleX,
    y: visibleY,
    width: viewportSize.width,
    height: viewportSize.height,
  });
  const focusRectInViewport = freezeRect({
    x: focusRect.x - visibleRect.x,
    y: focusRect.y - visibleRect.y,
    width: focusRect.width,
    height: focusRect.height,
  });

  assertMarginSatisfied(focusRectInViewport, viewportSize, minMargin);

  return Object.freeze({
    artSize,
    viewportSize,
    visibleRect,
    worldOffset: Object.freeze({
      x: -visibleRect.x,
      y: -visibleRect.y,
    }),
    focusRectInViewport,
  });
}

export function mapReferenceRectToArt(options: {
  readonly artSize: RenderViewportSize;
  readonly referenceSize: RenderViewportSize;
  readonly referenceRect: RenderViewportRect;
  readonly align?: "center";
}): RenderViewportRect {
  const artSize = validateSize(options.artSize, "artSize");
  const referenceSize = validateSize(options.referenceSize, "referenceSize");
  const referenceRect = validateRect(options.referenceRect, "referenceRect");
  const align = options.align ?? "center";

  if (align !== "center") {
    throw new Error("align must be center.");
  }
  if (
    referenceSize.width > artSize.width ||
    referenceSize.height > artSize.height
  ) {
    throw new Error("referenceSize must not exceed artSize.");
  }
  if (
    referenceRect.x + referenceRect.width > referenceSize.width ||
    referenceRect.y + referenceRect.height > referenceSize.height
  ) {
    throw new Error("referenceRect must fit inside referenceSize.");
  }

  return freezeRect({
    x: referenceRect.x + (artSize.width - referenceSize.width) / 2,
    y: referenceRect.y + (artSize.height - referenceSize.height) / 2,
    width: referenceRect.width,
    height: referenceRect.height,
  });
}

function validateSize(
  size: RenderViewportSize,
  label: string,
): RenderViewportSize {
  assertPositiveFinite(size.width, `${label}.width`);
  assertPositiveFinite(size.height, `${label}.height`);
  return Object.freeze({ width: size.width, height: size.height });
}

function validateRect(
  rect: RenderViewportRect,
  label: string,
): RenderViewportRect {
  assertFinite(rect.x, `${label}.x`);
  assertFinite(rect.y, `${label}.y`);
  assertPositiveFinite(rect.width, `${label}.width`);
  assertPositiveFinite(rect.height, `${label}.height`);
  if (rect.x < 0 || rect.y < 0) {
    throw new Error(`${label} origin must be non-negative.`);
  }
  return freezeRect(rect);
}

function normalizeMargin(
  margin: RenderViewportMargin = {},
): Required<RenderViewportMargin> {
  const normalized = Object.freeze({
    left: margin.left ?? 0,
    right: margin.right ?? 0,
    top: margin.top ?? 0,
    bottom: margin.bottom ?? 0,
  });
  assertNonNegativeFinite(normalized.left, "minMargin.left");
  assertNonNegativeFinite(normalized.right, "minMargin.right");
  assertNonNegativeFinite(normalized.top, "minMargin.top");
  assertNonNegativeFinite(normalized.bottom, "minMargin.bottom");
  return normalized;
}

function assertMarginSatisfied(
  focusRectInViewport: RenderViewportRect,
  viewportSize: RenderViewportSize,
  minMargin: Required<RenderViewportMargin>,
): void {
  if (focusRectInViewport.x < minMargin.left) {
    throw new Error("focusRect minMargin.left cannot fit inside artSize.");
  }
  if (focusRectInViewport.y < minMargin.top) {
    throw new Error("focusRect minMargin.top cannot fit inside artSize.");
  }
  if (
    viewportSize.width - focusRectInViewport.x - focusRectInViewport.width <
    minMargin.right
  ) {
    throw new Error("focusRect minMargin.right cannot fit inside artSize.");
  }
  if (
    viewportSize.height - focusRectInViewport.y - focusRectInViewport.height <
    minMargin.bottom
  ) {
    throw new Error("focusRect minMargin.bottom cannot fit inside artSize.");
  }
}

function satisfiesHorizontalMargin(
  visibleX: number,
  viewportSize: RenderViewportSize,
  focusRect: RenderViewportRect,
  minMargin: Required<RenderViewportMargin>,
): boolean {
  const focusX = focusRect.x - visibleX;
  return (
    focusX >= minMargin.left &&
    viewportSize.width - focusX - focusRect.width >= minMargin.right
  );
}

function clampOrigin(
  origin: number,
  artLength: number,
  viewportLength: number,
): number {
  return Math.min(Math.max(origin, 0), artLength - viewportLength);
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
}

function freezeRect(rect: RenderViewportRect): RenderViewportRect {
  return Object.freeze({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}
