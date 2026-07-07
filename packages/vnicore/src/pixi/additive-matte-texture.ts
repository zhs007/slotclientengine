import * as PIXI from "pixi.js";
import type {
  V5GAssetConfig,
  V5GBlendMode,
  V5GProjectConfig,
} from "../core/types.js";

const ADDITIVE_MATTE_BLEND_MODES = new Set<V5GBlendMode>([
  "add",
  "screen",
  "lighten",
]);
const ADDITIVE_MATTE_IMAGE_PATH_PATTERN = /\.(?:jpe?g|png)(?:[?#].*)?$/i;
const MATTE_ALPHA_FLOOR = 4;
const OPAQUE_ALPHA = 255;

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

export function getAdditiveMatteAssetIds(
  project: V5GProjectConfig,
): ReadonlySet<string> {
  const assetUsages = new Map<
    string,
    { hasMatteBlendUsage: boolean; hasOpaqueBlendUsage: boolean }
  >();
  for (const layer of project.layers) {
    if (layer.type !== "image" || !layer.assetId) continue;
    const usage = assetUsages.get(layer.assetId) ?? {
      hasMatteBlendUsage: false,
      hasOpaqueBlendUsage: false,
    };
    if (ADDITIVE_MATTE_BLEND_MODES.has(layer.blendMode)) {
      usage.hasMatteBlendUsage = true;
    } else {
      usage.hasOpaqueBlendUsage = true;
    }
    assetUsages.set(layer.assetId, usage);
  }
  const assetIds = new Set<string>();
  for (const [assetId, usage] of assetUsages.entries()) {
    if (usage.hasMatteBlendUsage && !usage.hasOpaqueBlendUsage) {
      assetIds.add(assetId);
    }
  }
  return assetIds;
}

export function shouldDeriveAdditiveMatteTexture(
  asset: V5GAssetConfig,
  additiveMatteAssetIds: ReadonlySet<string>,
): boolean {
  return (
    additiveMatteAssetIds.has(asset.id) &&
    ADDITIVE_MATTE_IMAGE_PATH_PATTERN.test(asset.path)
  );
}

export function deriveAdditiveMatteTexture(
  texture: PIXI.Texture,
  asset: V5GAssetConfig,
): PIXI.Texture | null {
  const width = Math.round(texture.width);
  const height = Math.round(texture.height);
  const resource = texture.source?.resource as CanvasImageSource | undefined;
  if (!resource) {
    throw new Error(
      `VNI additive matte texture requires drawable source resource for ${asset.id} (${asset.path}).`,
    );
  }

  const canvas = createMatteCanvas(width, height);
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) {
    throw new Error(
      `VNI additive matte texture requires 2D canvas context for ${asset.id} (${asset.path}).`,
    );
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(resource, 0, 0, width, height);

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < OPAQUE_ALPHA) {
      return null;
    }
  }

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = Math.max(red, green, blue);
    if (alpha <= MATTE_ALPHA_FLOOR) {
      pixels[index] = 0;
      pixels[index + 1] = 0;
      pixels[index + 2] = 0;
      pixels[index + 3] = 0;
      continue;
    }
    const unmatteScale = 255 / alpha;
    pixels[index] = Math.min(255, Math.round(red * unmatteScale));
    pixels[index + 1] = Math.min(255, Math.round(green * unmatteScale));
    pixels[index + 2] = Math.min(255, Math.round(blue * unmatteScale));
    pixels[index + 3] = alpha;
  }
  context.putImageData(imageData, 0, 0);

  const source = new PIXI.CanvasSource({
    resource: canvas,
    width,
    height,
    transparent: true,
    alphaMode: "premultiply-alpha-on-upload",
    label: `VNI additive matte source ${asset.id}`,
  });
  return new PIXI.Texture({
    source,
    label: `VNI additive matte texture ${asset.id}`,
  });
}

function createMatteCanvas(width: number, height: number): CanvasLike {
  if (globalThis.document?.createElement) {
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof globalThis.OffscreenCanvas === "function") {
    return new globalThis.OffscreenCanvas(width, height);
  }
  throw new Error("VNI additive matte texture requires canvas support.");
}
