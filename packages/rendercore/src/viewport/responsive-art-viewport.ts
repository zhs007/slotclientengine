import {
  calculateFocusedArtViewport,
  type FocusedArtViewport,
  type RenderViewportMargin,
  type RenderViewportRect,
  type RenderViewportSize,
} from "./focused-art-viewport.js";
import { calculateUnboundedMaximizedFocusedViewport } from "./unbounded-focused-viewport.js";

export type ResponsiveArtVariantId = "landscape" | "portrait";

export interface ResponsiveArtVariant {
  readonly artSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly minMargin?: RenderViewportMargin;
}

export interface ResponsiveArtViewportOptions {
  readonly viewportSize: RenderViewportSize;
  /** Retained only when the raw viewport is exactly square. */
  readonly squareVariant?: ResponsiveArtVariantId;
  readonly variants: {
    readonly landscape?: ResponsiveArtVariant;
    readonly portrait?: ResponsiveArtVariant;
  };
}

export interface ResponsiveArtViewport extends FocusedArtViewport {
  readonly variantId: ResponsiveArtVariantId;
  readonly variant: ResponsiveArtVariant;
}

export interface MaximizedResponsiveArtViewportOptions {
  readonly pageSize: RenderViewportSize;
  /** Retained only when the raw page is exactly square. */
  readonly squareVariant?: ResponsiveArtVariantId;
  readonly variants: ResponsiveArtViewportOptions["variants"];
}

export type MaximizedResponsiveArtViewport = ResponsiveArtViewport;

export interface MaximizedResponsiveArtViewportPolicy {
  readonly mode: "maximized-focus";
  resolveViewportSize(pageSize: RenderViewportSize): RenderViewportSize;
}

export function calculateResponsiveArtViewport(
  options: ResponsiveArtViewportOptions,
): ResponsiveArtViewport {
  const { variantId, variant } = resolveResponsiveArtVariant({
    size: options.viewportSize,
    squareVariant: options.squareVariant,
    variants: options.variants,
  });

  const viewport = calculateFocusedArtViewport({
    artSize: variant.artSize,
    viewportSize: options.viewportSize,
    focusRect: variant.focusRect,
    minMargin: variant.minMargin,
  });

  return Object.freeze({
    ...viewport,
    variantId,
    variant: Object.freeze({
      artSize: variant.artSize,
      focusRect: variant.focusRect,
      minMargin: variant.minMargin,
    }),
  });
}

/**
 * Selects an art variant from the raw page orientation, then maximizes that
 * variant's focus inside the page. The projected logical viewport preserves
 * the raw page aspect even when it extends beyond the finite art bounds.
 */
export function calculateMaximizedResponsiveArtViewport(
  options: MaximizedResponsiveArtViewportOptions,
): MaximizedResponsiveArtViewport {
  const { variantId, variant } = resolveResponsiveArtVariant({
    size: options.pageSize,
    squareVariant: options.squareVariant,
    variants: options.variants,
  });
  const margin = normalizeResponsiveMargin(variant.minMargin);
  const requiredFocusRect = Object.freeze({
    x: variant.focusRect.x - margin.left,
    y: variant.focusRect.y - margin.top,
    width: variant.focusRect.width + margin.left + margin.right,
    height: variant.focusRect.height + margin.top + margin.bottom,
  });
  const projected = calculateUnboundedMaximizedFocusedViewport({
    pageSize: options.pageSize,
    focusRect: requiredFocusRect,
  });
  const viewport = calculateFocusedArtViewport({
    artSize: variant.artSize,
    viewportSize: projected.viewportSize,
    focusRect: variant.focusRect,
    ...(variant.minMargin ? { minMargin: variant.minMargin } : {}),
  });

  return Object.freeze({
    ...viewport,
    variantId,
    variant: freezeResponsiveArtVariant(variant),
  });
}

export function createMaximizedResponsiveArtViewportPolicy(options: {
  readonly squareVariant?: ResponsiveArtVariantId;
  readonly variants: ResponsiveArtViewportOptions["variants"];
}): MaximizedResponsiveArtViewportPolicy {
  const variants = snapshotResponsiveArtVariants(options.variants);
  let squareVariant = options.squareVariant ?? "landscape";

  return Object.freeze({
    mode: "maximized-focus" as const,
    resolveViewportSize(pageSize: RenderViewportSize): RenderViewportSize {
      const viewport = calculateMaximizedResponsiveArtViewport({
        pageSize,
        squareVariant,
        variants,
      });
      squareVariant = viewport.variantId;
      return viewport.viewportSize;
    },
  });
}

function resolveResponsiveArtVariant(options: {
  readonly size: RenderViewportSize;
  readonly squareVariant?: ResponsiveArtVariantId;
  readonly variants: ResponsiveArtViewportOptions["variants"];
}): {
  readonly variantId: ResponsiveArtVariantId;
  readonly variant: ResponsiveArtVariant;
} {
  const variants = requireResponsiveArtVariants(options.variants);
  if (
    options.squareVariant !== undefined &&
    options.squareVariant !== "landscape" &&
    options.squareVariant !== "portrait"
  ) {
    throw new Error(
      'responsive art squareVariant must be "landscape" or "portrait".',
    );
  }
  const variantId: ResponsiveArtVariantId =
    options.size.height > options.size.width
      ? "portrait"
      : options.size.width > options.size.height
        ? "landscape"
        : (options.squareVariant ?? "landscape");
  return Object.freeze({ variantId, variant: variants[variantId] });
}

function requireResponsiveArtVariants(
  variants: ResponsiveArtViewportOptions["variants"],
): {
  readonly landscape: ResponsiveArtVariant;
  readonly portrait: ResponsiveArtVariant;
} {
  if (!variants.landscape) {
    throw new Error("responsive art variants must include landscape.");
  }
  if (!variants.portrait) {
    throw new Error("responsive art variants must include portrait.");
  }
  return Object.freeze({
    landscape: variants.landscape,
    portrait: variants.portrait,
  });
}

function snapshotResponsiveArtVariants(
  variants: ResponsiveArtViewportOptions["variants"],
): {
  readonly landscape: ResponsiveArtVariant;
  readonly portrait: ResponsiveArtVariant;
} {
  const required = requireResponsiveArtVariants(variants);
  return Object.freeze({
    landscape: freezeResponsiveArtVariant(required.landscape),
    portrait: freezeResponsiveArtVariant(required.portrait),
  });
}

function freezeResponsiveArtVariant(
  variant: ResponsiveArtVariant,
): ResponsiveArtVariant {
  const artSize = Object.freeze({
    width: variant.artSize.width,
    height: variant.artSize.height,
  });
  const focusRect = Object.freeze({
    x: variant.focusRect.x,
    y: variant.focusRect.y,
    width: variant.focusRect.width,
    height: variant.focusRect.height,
  });
  const margin = normalizeResponsiveMargin(variant.minMargin);
  calculateFocusedArtViewport({
    artSize,
    viewportSize: {
      width: focusRect.width + margin.left + margin.right,
      height: focusRect.height + margin.top + margin.bottom,
    },
    focusRect,
    ...(variant.minMargin ? { minMargin: margin } : {}),
  });
  return Object.freeze({
    artSize,
    focusRect,
    ...(variant.minMargin
      ? {
          minMargin: margin,
        }
      : {}),
  });
}

function normalizeResponsiveMargin(
  margin: RenderViewportMargin | undefined,
): Required<RenderViewportMargin> {
  const result = Object.freeze({
    left: margin?.left ?? 0,
    right: margin?.right ?? 0,
    top: margin?.top ?? 0,
    bottom: margin?.bottom ?? 0,
  });
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `minMargin.${name} must be a non-negative finite number.`,
      );
    }
  }
  return result;
}
