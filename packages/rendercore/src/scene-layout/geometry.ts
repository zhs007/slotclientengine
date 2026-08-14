import {
  calculateFocusedFrameDesignSize,
  calculateMaximizedFocusedArtViewport,
  calculateResponsiveArtViewport,
  createMaximizedFocusedArtViewportPolicy,
  mapArtRectToViewport,
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
}): SceneLayoutFrameViewport {
  const manifest = materializeSceneLayoutManifestForMode(
    options.manifest,
    options.modeId,
  );
  const pageSize = validatePageSize(options.pageSize);
  const frameDesignSize =
    manifest.adaptation.mode === "maximized-focus"
      ? calculateMaximizedFocusedArtViewport({
          artSize: manifest.adaptation.artSize,
          pageSize,
          focusRect: manifest.adaptation.focusRect,
        }).viewportSize
      : resolveOrientationFrameDesignSize(manifest, pageSize);
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
    return createMaximizedFocusedArtViewportPolicy({
      artSize: manifest.adaptation.artSize,
      focusRect: manifest.adaptation.focusRect,
    });
  }
  return Object.freeze({
    mode: "orientation-focus" as const,
    variants: Object.freeze({
      landscape: createFrameVariant(manifest.adaptation.variants.landscape),
      portrait: createFrameVariant(manifest.adaptation.variants.portrait),
    }),
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
          ...calculateMaximizedFocusedArtViewport({
            artSize: manifest.adaptation.artSize,
            pageSize: options.viewportSize,
            focusRect: manifest.adaptation.focusRect,
          }),
          variantId: "default" as const,
        }
      : calculateResponsiveArtViewport({
          viewportSize: options.viewportSize,
          variants: manifest.adaptation.variants,
          ...(options.previousVariantId === "landscape" ||
          options.previousVariantId === "portrait"
            ? { squareVariant: options.previousVariantId }
            : {}),
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

function createFrameVariant(variant: {
  readonly artSize: RenderViewportSize;
  readonly frameFocusRect: RenderViewportSize;
  readonly minFocusMargin?: {
    readonly left?: number;
    readonly right?: number;
    readonly top?: number;
    readonly bottom?: number;
  };
}) {
  return Object.freeze({
    maxDesignSize: variant.artSize,
    focusRect: variant.frameFocusRect,
    ...(variant.minFocusMargin
      ? { minFocusMargin: variant.minFocusMargin }
      : {}),
  });
}

function resolveOrientationFrameDesignSize(
  manifest: SceneLayoutManifestV1,
  pageSize: RenderViewportSize,
): RenderViewportSize {
  if (manifest.adaptation.mode !== "orientation-focus") {
    throw new SceneLayoutError("Expected orientation-focus adaptation.");
  }
  const variant =
    pageSize.height > pageSize.width
      ? manifest.adaptation.variants.portrait
      : manifest.adaptation.variants.landscape;
  return calculateFocusedFrameDesignSize({
    pageSize,
    maxDesignSize: variant.artSize,
    preferredPortraitSize: variant.artSize,
    focusSize: variant.frameFocusRect,
    minMargin: variant.minFocusMargin,
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
