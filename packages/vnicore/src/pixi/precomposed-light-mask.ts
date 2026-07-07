import * as PIXI from "pixi.js";
import { editorToPixi } from "../core/coordinates.js";
import type {
  V5GAssetConfig,
  V5GBlendMode,
  V5GProjectConfig,
  V5GTransformConfig,
} from "../core/types.js";

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
type Canvas2DContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

const LIGHT_MASK_BLEND_MODES = new Set<V5GBlendMode>([
  "add",
  "screen",
  "lighten",
]);

export interface PrecomposedLightMaskLayerInput {
  layerId: string;
  asset: V5GAssetConfig;
  texture: PIXI.Texture;
  transform: V5GTransformConfig;
  opacity: number;
}

export interface CreatePrecomposedLightMaskInput {
  stage: Pick<V5GProjectConfig["stage"], "width" | "height">;
  target: PrecomposedLightMaskLayerInput & {
    blendMode: V5GBlendMode;
  };
  source: PrecomposedLightMaskLayerInput;
}

export function isPrecomposedLightMaskBlendMode(
  blendMode: V5GBlendMode,
): boolean {
  return LIGHT_MASK_BLEND_MODES.has(blendMode);
}

export function createPrecomposedLightMaskKey(
  input: CreatePrecomposedLightMaskInput,
): string {
  return JSON.stringify({
    mode: "precompose_light_alpha",
    stageWidth: input.stage.width,
    stageHeight: input.stage.height,
    targetLayerId: input.target.layerId,
    sourceLayerId: input.source.layerId,
    targetAsset: getAssetKey(input.target.asset),
    sourceAsset: getAssetKey(input.source.asset),
    targetTexture: getTextureKey(input.target.texture),
    sourceTexture: getTextureKey(input.source.texture),
    targetTransform: serializeTransformForKey(input.target.transform),
    sourceTransform: serializeTransformForKey(input.source.transform),
    targetOpacity: roundForKey(input.target.opacity, 4),
    sourceOpacity: roundForKey(input.source.opacity, 4),
    blendMode: input.target.blendMode,
  });
}

export function createPrecomposedLightMaskTexture(
  input: CreatePrecomposedLightMaskInput,
): PIXI.Texture {
  const canvas = createPrecomposedLightMaskCanvas(input);
  const width = Math.max(1, Math.round(input.stage.width));
  const height = Math.max(1, Math.round(input.stage.height));
  const source = new PIXI.CanvasSource({
    resource: canvas,
    width,
    height,
    transparent: true,
    alphaMode: "premultiply-alpha-on-upload",
    label: `VNI precomposed light mask source ${input.source.layerId} -> ${input.target.layerId}`,
  });
  return new PIXI.Texture({
    source,
    label: `VNI precomposed light mask ${input.source.layerId} -> ${input.target.layerId}`,
  });
}

export function createPrecomposedLightMaskCanvas(
  input: CreatePrecomposedLightMaskInput,
): CanvasLike {
  const width = Math.max(1, Math.round(input.stage.width));
  const height = Math.max(1, Math.round(input.stage.height));
  const targetCanvas = createCanvas(width, height);
  const targetContext = getCanvasContext(
    targetCanvas,
    `VNI precompose_light_alpha target layer "${input.target.layerId}"`,
  );
  drawImageLayerToContext(targetContext, {
    resource: getTextureResource(input.target.texture, input.target.layerId),
    asset: input.target.asset,
    transform: input.target.transform,
    stageWidth: width,
    stageHeight: height,
  });

  const sourceCanvas = createCanvas(width, height);
  const sourceContext = getCanvasContext(
    sourceCanvas,
    `VNI precompose_light_alpha source layer "${input.source.layerId}"`,
  );
  drawImageLayerToContext(sourceContext, {
    resource: getTextureResource(input.source.texture, input.source.layerId),
    asset: input.source.asset,
    transform: input.source.transform,
    stageWidth: width,
    stageHeight: height,
  });

  const targetData = targetContext.getImageData(0, 0, width, height);
  const sourceData = sourceContext.getImageData(0, 0, width, height);
  applyPrecomposedLightMaskPixels(
    targetData.data,
    sourceData.data,
    input.source.opacity,
  );
  targetContext.putImageData(targetData, 0, 0);
  return targetCanvas;
}

export function applyPrecomposedLightMaskPixels(
  targetPixels: Uint8ClampedArray,
  sourcePixels: Uint8ClampedArray,
  sourceOpacity: number,
): void {
  const maskOpacity = clamp01(sourceOpacity);
  const length = Math.min(targetPixels.length, sourcePixels.length);
  for (let index = 0; index < length; index += 4) {
    const red = targetPixels[index] ?? 0;
    const green = targetPixels[index + 1] ?? 0;
    const blue = targetPixels[index + 2] ?? 0;
    const targetAlpha = (targetPixels[index + 3] ?? 0) / 255;
    const lightAlpha = (Math.max(red, green, blue) / 255) * targetAlpha;
    const maskAlpha = ((sourcePixels[index + 3] ?? 0) / 255) * maskOpacity;
    const outputAlpha = clamp01(lightAlpha * maskAlpha);
    targetPixels[index + 3] = Math.round(outputAlpha * 255);
  }
}

function drawImageLayerToContext(
  context: Canvas2DContext,
  options: {
    resource: CanvasImageSource;
    asset: V5GAssetConfig;
    transform: V5GTransformConfig;
    stageWidth: number;
    stageHeight: number;
  },
): void {
  const position = editorToPixi(
    options.transform.x,
    options.transform.y,
    options.stageWidth,
    options.stageHeight,
  );
  context.save();
  context.translate(position.x, position.y);
  context.rotate((options.transform.rotation * Math.PI) / 180);
  context.scale(options.transform.scaleX, options.transform.scaleY);
  context.drawImage(
    options.resource,
    -options.transform.anchorX * options.asset.width,
    -options.transform.anchorY * options.asset.height,
    options.asset.width,
    options.asset.height,
  );
  context.restore();
}

function getTextureResource(
  texture: PIXI.Texture,
  layerId: string,
): CanvasImageSource {
  const source = texture.source as { resource?: CanvasImageSource } | undefined;
  if (!source?.resource) {
    throw new Error(
      `VNI precompose_light_alpha layer "${layerId}" requires a drawable texture resource.`,
    );
  }
  return source.resource;
}

function getCanvasContext(canvas: CanvasLike, label: string): Canvas2DContext {
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as Canvas2DContext | null;
  if (!context) {
    throw new Error(`${label} requires 2D canvas support.`);
  }
  return context;
}

function createCanvas(width: number, height: number): CanvasLike {
  if (globalThis.document?.createElement) {
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  if (typeof globalThis.OffscreenCanvas === "function") {
    return new globalThis.OffscreenCanvas(width, height);
  }
  throw new Error("VNI precompose_light_alpha requires canvas support.");
}

function getAssetKey(asset: V5GAssetConfig): string {
  return [
    asset.id,
    asset.path,
    asset.width,
    asset.height,
    asset.fileWidth ?? "none",
    asset.fileHeight ?? "none",
    asset.fileScale ?? "none",
  ].join(":");
}

function getTextureKey(texture: PIXI.Texture): string {
  const source = texture.source as { label?: string } | undefined;
  return [
    texture.label ?? "",
    source?.label ?? "",
    texture.width,
    texture.height,
  ].join(":");
}

function serializeTransformForKey(transform: V5GTransformConfig): string {
  return [
    roundForKey(transform.x, 3),
    roundForKey(transform.y, 3),
    roundForKey(transform.scaleX, 4),
    roundForKey(transform.scaleY, 4),
    roundForKey(transform.rotation, 4),
    roundForKey(transform.anchorX, 4),
    roundForKey(transform.anchorY, 4),
  ].join(",");
}

function roundForKey(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
