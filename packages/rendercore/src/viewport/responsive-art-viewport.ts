import {
  calculateFocusedArtViewport,
  type FocusedArtViewport,
  type RenderViewportMargin,
  type RenderViewportRect,
  type RenderViewportSize,
} from "./focused-art-viewport.js";

export type ResponsiveArtVariantId = "landscape" | "portrait";

export interface ResponsiveArtVariant {
  readonly artSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly minMargin?: RenderViewportMargin;
}

export interface ResponsiveArtViewportOptions {
  readonly viewportSize: RenderViewportSize;
  readonly variants: {
    readonly landscape?: ResponsiveArtVariant;
    readonly portrait?: ResponsiveArtVariant;
  };
}

export interface ResponsiveArtViewport extends FocusedArtViewport {
  readonly variantId: ResponsiveArtVariantId;
  readonly variant: ResponsiveArtVariant;
}

export function calculateResponsiveArtViewport(
  options: ResponsiveArtViewportOptions,
): ResponsiveArtViewport {
  const variantId: ResponsiveArtVariantId =
    options.viewportSize.height > options.viewportSize.width
      ? "portrait"
      : "landscape";
  const variant = options.variants[variantId];

  if (!options.variants.landscape) {
    throw new Error("responsive art variants must include landscape.");
  }
  if (!options.variants.portrait) {
    throw new Error("responsive art variants must include portrait.");
  }
  if (!variant) {
    throw new Error(`responsive art variant "${variantId}" is missing.`);
  }

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
