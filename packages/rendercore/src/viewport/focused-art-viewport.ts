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

export interface MaximizedFocusedArtViewportOptions {
  readonly artSize: RenderViewportSize;
  readonly pageSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
}

export interface FocusedFrameDesignSizeOptions {
  readonly pageSize: RenderViewportSize;
  readonly maxDesignSize: RenderViewportSize;
  readonly preferredPortraitSize: RenderViewportSize;
  readonly focusSize: RenderViewportSize;
  readonly minMargin?: RenderViewportMargin;
}

export interface MaximizedFocusedArtViewportPolicy {
  readonly mode: "maximized-focus";
  resolveViewportSize(pageSize: RenderViewportSize): RenderViewportSize;
}

export interface FocusedArtViewport {
  readonly artSize: RenderViewportSize;
  readonly viewportSize: RenderViewportSize;
  readonly visibleRect: RenderViewportRect;
  readonly worldOffset: { readonly x: number; readonly y: number };
  readonly focusRectInViewport: RenderViewportRect;
}

/**
 * Resolves the logical canvas size used by a focus-aware DOM frame.
 * The returned size preserves the page aspect while keeping the required
 * focus and margins visible. When that requires a design size beyond the
 * selected art, the caller sees the uncovered area instead of a validation
 * failure.
 */
export function calculateFocusedFrameDesignSize(
  options: FocusedFrameDesignSizeOptions,
): RenderViewportSize {
  const pageSize = validateSize(options.pageSize, "pageSize");
  const maxDesignSize = validateSize(options.maxDesignSize, "maxDesignSize");
  const preferredPortraitSize = validateSize(
    options.preferredPortraitSize,
    "preferredPortraitSize",
  );
  const focusSize = validateSize(options.focusSize, "focusSize");
  const margin = normalizeMargin(options.minMargin);
  const minimumWidth = focusSize.width + margin.left + margin.right;
  const minimumHeight = focusSize.height + margin.top + margin.bottom;

  if (
    preferredPortraitSize.width > maxDesignSize.width ||
    preferredPortraitSize.height > maxDesignSize.height
  ) {
    throw new Error("preferredPortraitSize must not exceed maxDesignSize.");
  }
  const effectiveMaxDesignSize = freezeSize({
    width: Math.max(maxDesignSize.width, minimumWidth),
    height: Math.max(maxDesignSize.height, minimumHeight),
  });
  const effectivePreferredPortraitSize = freezeSize({
    width: Math.max(preferredPortraitSize.width, minimumWidth),
    height: Math.max(preferredPortraitSize.height, minimumHeight),
  });

  const pageAspect = pageSize.width / pageSize.height;
  const portraitAspect =
    preferredPortraitSize.width / preferredPortraitSize.height;
  const maximumWideAspect = effectiveMaxDesignSize.width / minimumHeight;
  let width: number;
  let height: number;

  if (pageAspect <= portraitAspect) {
    height = effectiveMaxDesignSize.height;
    width = clamp(
      height * pageAspect,
      minimumWidth,
      effectivePreferredPortraitSize.width,
    );
  } else if (pageAspect >= maximumWideAspect) {
    width = effectiveMaxDesignSize.width;
    height = minimumHeight;
  } else {
    height = Math.max(minimumHeight, minimumWidth / pageAspect);
    width = height * pageAspect;
  }

  return freezeSize({
    width: clamp(width, minimumWidth, effectiveMaxDesignSize.width),
    height: clamp(height, minimumHeight, effectiveMaxDesignSize.height),
  });
}

export interface MapArtRectToViewportOptions {
  readonly artSize: RenderViewportSize;
  readonly visibleRect: RenderViewportRect;
  readonly rect: RenderViewportRect;
}

export interface MapAnchorRectToArtOptions {
  readonly artSize: RenderViewportSize;
  readonly anchorRect: RenderViewportRect;
  readonly rect: RenderViewportRect;
}

export function calculateFocusedArtViewport(
  options: FocusedArtViewportOptions,
): FocusedArtViewport {
  const artSize = validateSize(options.artSize, "artSize");
  const viewportSize = validateSize(options.viewportSize, "viewportSize");
  const focusRect = validateUnboundedRect(options.focusRect, "focusRect");
  const minMargin = normalizeMargin(options.minMargin);

  const minimumWidth = focusRect.width + minMargin.left + minMargin.right;
  const minimumHeight = focusRect.height + minMargin.top + minMargin.bottom;
  if (viewportSize.width < minimumWidth) {
    throw new Error("viewportSize.width cannot contain focusRect minMargin.");
  }
  if (viewportSize.height < minimumHeight) {
    throw new Error("viewportSize.height cannot contain focusRect minMargin.");
  }

  const focusedX = focusRect.x + focusRect.width / 2 - viewportSize.width / 2;
  const artCenteredX = (artSize.width - viewportSize.width) / 2;
  const preferredX =
    viewportSize.height === artSize.height &&
    satisfiesHorizontalMargin(artCenteredX, viewportSize, focusRect, minMargin)
      ? artCenteredX
      : preferArtBoundedOrigin(focusedX, artSize.width, viewportSize.width);
  const visibleX = containFocusOrigin(
    preferredX,
    viewportSize.width,
    focusRect.x,
    focusRect.width,
    minMargin.left,
    minMargin.right,
  );
  const focusedY = focusRect.y + focusRect.height / 2 - viewportSize.height / 2;
  const visibleY = containFocusOrigin(
    preferArtBoundedOrigin(focusedY, artSize.height, viewportSize.height),
    viewportSize.height,
    focusRect.y,
    focusRect.height,
    minMargin.top,
    minMargin.bottom,
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

/**
 * Maximizes one art-space focus rect inside the current page.
 * The focus rect is scaled with contain semantics, then the page aspect ratio
 * is projected back into art space. Art bounds remain a preferred visible
 * range, but focus geometry may extend the viewport beyond them so the caller
 * can render uncovered regions as-authored.
 */
export function calculateMaximizedFocusedArtViewport(
  options: MaximizedFocusedArtViewportOptions,
): FocusedArtViewport {
  const artSize = validateSize(options.artSize, "artSize");
  const pageSize = validateSize(options.pageSize, "pageSize");
  const focusRect = validateUnboundedRect(options.focusRect, "focusRect");

  const focusScale = Math.min(
    pageSize.width / focusRect.width,
    pageSize.height / focusRect.height,
  );
  const viewportSize = freezeSize({
    width: normalizeProjectedLength(
      pageSize.width / focusScale,
      focusRect.width,
      artSize.width,
    ),
    height: normalizeProjectedLength(
      pageSize.height / focusScale,
      focusRect.height,
      artSize.height,
    ),
  });

  return calculateFocusedArtViewport({
    artSize,
    viewportSize,
    focusRect,
  });
}

function normalizeProjectedLength(
  projected: number,
  lowerBound: number,
  upperBound: number,
): number {
  const tolerance =
    Math.max(1, Math.abs(projected), lowerBound, upperBound) *
    Number.EPSILON *
    32;
  if (Math.abs(projected - lowerBound) <= tolerance) return lowerBound;
  if (Math.abs(projected - upperBound) <= tolerance) return upperBound;
  return Math.min(Math.max(upperBound, lowerBound), projected);
}

export function createMaximizedFocusedArtViewportPolicy(options: {
  readonly artSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
}): MaximizedFocusedArtViewportPolicy {
  const artSize = validateSize(options.artSize, "artSize");
  const focusRect = validateUnboundedRect(options.focusRect, "focusRect");

  return Object.freeze({
    mode: "maximized-focus" as const,
    resolveViewportSize(pageSize: RenderViewportSize): RenderViewportSize {
      return calculateMaximizedFocusedArtViewport({
        artSize,
        pageSize,
        focusRect,
      }).viewportSize;
    },
  });
}

export function mapArtRectToViewport(
  options: MapArtRectToViewportOptions,
): RenderViewportRect {
  const artSize = validateSize(options.artSize, "artSize");
  const visibleRect = validateUnboundedRect(options.visibleRect, "visibleRect");
  const rect = validateUnboundedRect(options.rect, "rect");
  void artSize;

  return freezeRect({
    x: rect.x - visibleRect.x,
    y: rect.y - visibleRect.y,
    width: rect.width,
    height: rect.height,
  });
}

export function mapAnchorRectToArt(
  options: MapAnchorRectToArtOptions,
): RenderViewportRect {
  const artSize = validateSize(options.artSize, "artSize");
  const anchorRect = validateRect(options.anchorRect, "anchorRect");
  const rect = validateAnchorChildRect(options.rect, "rect");

  if (
    anchorRect.x + anchorRect.width > artSize.width ||
    anchorRect.y + anchorRect.height > artSize.height
  ) {
    throw new Error("anchorRect must fit inside artSize.");
  }

  const mappedRect = freezeRect({
    x: anchorRect.x + rect.x,
    y: anchorRect.y + rect.y,
    width: rect.width,
    height: rect.height,
  });

  if (
    mappedRect.x < 0 ||
    mappedRect.y < 0 ||
    mappedRect.x + mappedRect.width > artSize.width ||
    mappedRect.y + mappedRect.height > artSize.height
  ) {
    throw new Error("rect mapped from anchorRect must fit inside artSize.");
  }

  return mappedRect;
}

function validateAnchorChildRect(
  rect: RenderViewportRect,
  label: string,
): RenderViewportRect {
  assertFinite(rect.x, `${label}.x`);
  assertFinite(rect.y, `${label}.y`);
  assertPositiveFinite(rect.width, `${label}.width`);
  assertPositiveFinite(rect.height, `${label}.height`);
  return freezeRect(rect);
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

function freezeSize(size: RenderViewportSize): RenderViewportSize {
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

function validateUnboundedRect(
  rect: RenderViewportRect,
  label: string,
): RenderViewportRect {
  assertFinite(rect.x, `${label}.x`);
  assertFinite(rect.y, `${label}.y`);
  assertPositiveFinite(rect.width, `${label}.width`);
  assertPositiveFinite(rect.height, `${label}.height`);
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

function preferArtBoundedOrigin(
  focusedOrigin: number,
  artLength: number,
  viewportLength: number,
): number {
  if (viewportLength > artLength) return (artLength - viewportLength) / 2;
  return clamp(focusedOrigin, 0, artLength - viewportLength);
}

function containFocusOrigin(
  preferredOrigin: number,
  viewportLength: number,
  focusOrigin: number,
  focusLength: number,
  beforeMargin: number,
  afterMargin: number,
): number {
  const minimumOrigin =
    focusOrigin + focusLength + afterMargin - viewportLength;
  const maximumOrigin = focusOrigin - beforeMargin;
  return clamp(preferredOrigin, minimumOrigin, maximumOrigin);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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
