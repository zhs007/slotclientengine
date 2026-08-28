import {
  calculateMaximizedResponsiveArtViewport,
  calculateUnboundedMaximizedFocusedViewport,
  createMaximizedResponsiveArtViewportPolicy,
  mapArtRectToViewport,
  type ResponsiveArtViewportOptions,
  type RenderViewportMargin,
  type RenderViewportRect,
  type RenderViewportSize,
} from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import { parseSceneLayoutManifest } from "./manifest.js";
import { materializeSceneLayoutManifestForMode } from "./manifest-v2.js";
import type {
  ResolvedSceneLayoutReelGrid,
  SceneLayoutFramePolicy,
  SceneLayoutFrameViewport,
  SceneLayoutManifestV1,
  SceneLayoutManifest,
  SceneLayoutSnapshot,
  SceneLayoutVariantId,
} from "./types.js";

export function resolveSceneLayoutFrameViewport(options: {
  readonly manifest: SceneLayoutManifest;
  readonly pageSize: RenderViewportSize;
  readonly modeId?: string;
  readonly previousVariantId?: SceneLayoutVariantId;
}): SceneLayoutFrameViewport {
  const manifest = materializeSceneLayoutManifestForMode(
    options.manifest,
    options.modeId,
  );
  const pageSize = validatePageSize(options.pageSize);
  const frameDesignSize =
    manifest.adaptation.mode === "maximized-focus"
      ? calculateUnboundedMaximizedFocusedViewport({
          pageSize,
          focusRect: manifest.adaptation.focusRect,
        }).viewportSize
      : calculateMaximizedResponsiveArtViewport({
          pageSize,
          variants: createOrientationViewportVariants(
            manifest.adaptation.variants,
          ),
          ...(options.previousVariantId === "landscape" ||
          options.previousVariantId === "portrait"
            ? { squareVariant: options.previousVariantId }
            : {}),
        }).viewportSize;
  const scale = Math.min(
    pageSize.width / frameDesignSize.width,
    pageSize.height / frameDesignSize.height,
  );
  const cssSize = Object.freeze({
    width: frameDesignSize.width * scale,
    height: frameDesignSize.height * scale,
  });
  return Object.freeze({
    pageSize,
    frameDesignSize,
    scale,
    cssSize,
    offsetX: (pageSize.width - cssSize.width) / 2,
    offsetY: (pageSize.height - cssSize.height) / 2,
  });
}

export function createSceneLayoutFramePolicy(
  manifestValue: SceneLayoutManifest,
): SceneLayoutFramePolicy {
  const manifest = parseSceneLayoutManifest(manifestValue);
  if (manifest.adaptation.mode === "maximized-focus") {
    const focusRect = Object.freeze({ ...manifest.adaptation.focusRect });
    return Object.freeze({
      mode: "maximized-focus" as const,
      resolveViewportSize(pageSize: RenderViewportSize): RenderViewportSize {
        return calculateUnboundedMaximizedFocusedViewport({
          pageSize,
          focusRect,
        }).viewportSize;
      },
    });
  }
  return createMaximizedResponsiveArtViewportPolicy({
    variants: createOrientationViewportVariants(manifest.adaptation.variants),
  });
}

export function resolveSceneLayoutViewport(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly viewportSize: RenderViewportSize;
  readonly previousVariantId?: SceneLayoutVariantId;
}): SceneLayoutSnapshot {
  const manifest = parseSceneLayoutManifest(options.manifest);
  const viewport =
    manifest.adaptation.mode === "maximized-focus"
      ? {
          artSize: manifest.adaptation.artSize,
          ...calculateUnboundedMaximizedFocusedViewport({
            pageSize: options.viewportSize,
            focusRect: manifest.adaptation.focusRect,
          }),
          variantId: "default" as const,
        }
      : resolveOrientationSceneViewport({
          variants: manifest.adaptation.variants,
          viewportSize: options.viewportSize,
          previousVariantId: options.previousVariantId,
        });
  const reels: Record<
    string,
    ResolvedSceneLayoutReelGrid & {
      readonly viewportRect: ReturnType<typeof mapArtRectToViewport>;
    }
  > = {};
  for (const reelId of Object.keys(manifest.reels).sort()) {
    const reel = resolveSceneLayoutReelGrid(
      manifest,
      reelId,
      viewport.variantId,
    );
    reels[reelId] = Object.freeze({
      ...reel,
      viewportRect: mapArtRectToViewport({
        artSize: viewport.artSize,
        visibleRect: viewport.visibleRect,
        rect: reel.artRect,
      }),
    });
  }
  return Object.freeze({
    artSize: viewport.artSize,
    viewportSize: viewport.viewportSize,
    visibleRect: viewport.visibleRect,
    worldOffset: viewport.worldOffset,
    focusRectInViewport: viewport.focusRectInViewport,
    variantId: viewport.variantId,
    reels: Object.freeze(reels),
  });
}

export function resolveSceneLayoutArtSpace(
  manifestValue: SceneLayoutManifestV1,
): SceneLayoutSnapshot {
  const manifest = parseSceneLayoutManifest(manifestValue);
  if (manifest.adaptation.mode !== "maximized-focus") {
    throw new SceneLayoutError(
      "Scene layout art-space projection requires maximized-focus adaptation.",
    );
  }
  const artSize = manifest.adaptation.artSize;
  const reels: Record<
    string,
    ResolvedSceneLayoutReelGrid & {
      readonly viewportRect: ReturnType<typeof mapArtRectToViewport>;
    }
  > = {};
  for (const reelId of Object.keys(manifest.reels).sort()) {
    const reel = resolveSceneLayoutReelGrid(manifest, reelId, "default");
    reels[reelId] = Object.freeze({
      ...reel,
      viewportRect: reel.artRect,
    });
  }
  return Object.freeze({
    artSize,
    viewportSize: artSize,
    visibleRect: Object.freeze({
      x: 0,
      y: 0,
      width: artSize.width,
      height: artSize.height,
    }),
    worldOffset: Object.freeze({ x: 0, y: 0 }),
    focusRectInViewport: manifest.adaptation.focusRect,
    variantId: "default",
    reels: Object.freeze(reels),
  });
}

export function resolveSceneLayoutReelGrid(
  manifestValue: SceneLayoutManifestV1,
  reelId: string,
  variantId?: SceneLayoutVariantId,
): ResolvedSceneLayoutReelGrid {
  const manifest = parseSceneLayoutManifest(manifestValue);
  const reel = manifest.reels[reelId];
  if (!reel)
    throw new SceneLayoutError(`Unknown scene layout reel "${reelId}".`);
  const resolvedVariant =
    variantId ??
    (manifest.adaptation.mode === "maximized-focus" ? "default" : undefined);
  if (!resolvedVariant) {
    throw new SceneLayoutError(
      "variantId is required for an orientation-focus reel grid.",
    );
  }
  if (
    manifest.adaptation.mode === "maximized-focus" &&
    resolvedVariant !== "default"
  ) {
    throw new SceneLayoutError(
      "maximized-focus only supports default variant.",
    );
  }
  if (
    manifest.adaptation.mode === "orientation-focus" &&
    resolvedVariant === "default"
  ) {
    throw new SceneLayoutError(
      "orientation-focus does not support default variant.",
    );
  }
  const placement = reel.placements[resolvedVariant];
  if (!placement) {
    throw new SceneLayoutError(
      `Scene layout reel "${reelId}" has no ${resolvedVariant} placement.`,
    );
  }
  const stride = Object.freeze({
    width: reel.cellSize.width + reel.gap.x,
    height: reel.cellSize.height + reel.gap.y,
  });
  const width =
    reel.columns * reel.cellSize.width + (reel.columns - 1) * reel.gap.x;
  const height =
    reel.rows * reel.cellSize.height + (reel.rows - 1) * reel.gap.y;
  const artSize =
    manifest.adaptation.mode === "maximized-focus"
      ? manifest.adaptation.artSize
      : manifest.adaptation.variants[
          resolvedVariant as "landscape" | "portrait"
        ].artSize;
  return Object.freeze({
    id: reelId,
    variantId: resolvedVariant,
    columns: reel.columns,
    rows: reel.rows,
    cellSize: reel.cellSize,
    gap: reel.gap,
    stride,
    artRect: Object.freeze({
      x:
        (manifest.coordinateOrigin ?? "top-left") === "center"
          ? artSize.width / 2 + placement.x - width / 2
          : placement.x,
      y:
        (manifest.coordinateOrigin ?? "top-left") === "center"
          ? artSize.height / 2 + placement.y - height / 2
          : placement.y,
      width,
      height,
    }),
  });
}

function validatePageSize(size: RenderViewportSize): RenderViewportSize {
  if (!Number.isFinite(size.width) || size.width <= 0) {
    throw new SceneLayoutError(
      "pageSize.width must be a positive finite number.",
    );
  }
  if (!Number.isFinite(size.height) || size.height <= 0) {
    throw new SceneLayoutError(
      "pageSize.height must be a positive finite number.",
    );
  }
  return Object.freeze({ width: size.width, height: size.height });
}

function createOrientationViewportVariants(
  variants: Extract<
    SceneLayoutManifestV1["adaptation"],
    { readonly mode: "orientation-focus" }
  >["variants"],
): ResponsiveArtViewportOptions["variants"] {
  const createVariant = (variant: (typeof variants)["landscape"]) =>
    Object.freeze({
      artSize: variant.artSize,
      focusRect: variant.focusRect,
      ...(variant.minFocusMargin ? { minMargin: variant.minFocusMargin } : {}),
    });
  return Object.freeze({
    landscape: createVariant(variants.landscape),
    portrait: createVariant(variants.portrait),
  });
}

function resolveOrientationSceneViewport(options: {
  readonly variants: Extract<
    SceneLayoutManifestV1["adaptation"],
    { readonly mode: "orientation-focus" }
  >["variants"];
  readonly viewportSize: RenderViewportSize;
  readonly previousVariantId?: SceneLayoutVariantId;
}) {
  const viewportSize = validateViewportSize(options.viewportSize);
  const variantId =
    viewportSize.height > viewportSize.width
      ? ("portrait" as const)
      : viewportSize.width > viewportSize.height
        ? ("landscape" as const)
        : options.previousVariantId === "portrait"
          ? ("portrait" as const)
          : ("landscape" as const);
  const variant = options.variants[variantId];
  return resolveUnboundedSceneViewport({
    artSize: variant.artSize,
    viewportSize,
    focusRect: variant.focusRect,
    ...(variant.minFocusMargin ? { minMargin: variant.minFocusMargin } : {}),
    variantId,
  });
}

function resolveUnboundedSceneViewport<
  VariantId extends SceneLayoutVariantId,
>(options: {
  readonly artSize: RenderViewportSize;
  readonly viewportSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly minMargin?: RenderViewportMargin;
  readonly variantId: VariantId;
}) {
  const viewportSize = validateViewportSize(options.viewportSize);
  const margin = Object.freeze({
    left: options.minMargin?.left ?? 0,
    right: options.minMargin?.right ?? 0,
    top: options.minMargin?.top ?? 0,
    bottom: options.minMargin?.bottom ?? 0,
  });
  const requiredFocusRect = Object.freeze({
    x: options.focusRect.x - margin.left,
    y: options.focusRect.y - margin.top,
    width: options.focusRect.width + margin.left + margin.right,
    height: options.focusRect.height + margin.top + margin.bottom,
  });
  const tolerance =
    Math.max(
      1,
      viewportSize.width,
      viewportSize.height,
      requiredFocusRect.width,
      requiredFocusRect.height,
    ) *
    Number.EPSILON *
    32;
  if (requiredFocusRect.width - viewportSize.width > tolerance) {
    throw new SceneLayoutError(
      `viewportSize.width (${viewportSize.width}) cannot contain focusRect and margin width (${requiredFocusRect.width}).`,
    );
  }
  if (requiredFocusRect.height - viewportSize.height > tolerance) {
    throw new SceneLayoutError(
      `viewportSize.height (${viewportSize.height}) cannot contain focusRect and margin height (${requiredFocusRect.height}).`,
    );
  }
  const visibleRect = Object.freeze({
    x:
      requiredFocusRect.x +
      requiredFocusRect.width / 2 -
      viewportSize.width / 2,
    y:
      requiredFocusRect.y +
      requiredFocusRect.height / 2 -
      viewportSize.height / 2,
    width: viewportSize.width,
    height: viewportSize.height,
  });
  return Object.freeze({
    artSize: options.artSize,
    viewportSize,
    visibleRect,
    worldOffset: Object.freeze({ x: -visibleRect.x, y: -visibleRect.y }),
    focusRectInViewport: Object.freeze({
      x: options.focusRect.x - visibleRect.x,
      y: options.focusRect.y - visibleRect.y,
      width: options.focusRect.width,
      height: options.focusRect.height,
    }),
    variantId: options.variantId,
  });
}

function validateViewportSize(size: RenderViewportSize): RenderViewportSize {
  if (!Number.isFinite(size.width) || size.width <= 0) {
    throw new SceneLayoutError(
      "viewportSize.width must be a positive finite number.",
    );
  }
  if (!Number.isFinite(size.height) || size.height <= 0) {
    throw new SceneLayoutError(
      "viewportSize.height must be a positive finite number.",
    );
  }
  return Object.freeze({ width: size.width, height: size.height });
}
