import * as PIXI from "pixi.js";
import { toPixiBlendMode } from "./blend-mode.js";
import { editorToPixi } from "../core/coordinates.js";
import type { SampledLayerState } from "../core/project-sampler.js";
import type {
  V5GLayerConfig,
  V5GProjectConfig,
  V5GAssetConfig,
} from "../core/types.js";

export interface V5GLayerInstance {
  layer: V5GLayerConfig;
  display: PIXI.Container;
  safeGlowDisplay: PIXI.Container;
  effectDisplay: PIXI.Container;
  particleDisplay: PIXI.Container;
  texture: PIXI.Texture | null;
  textureSize: { width: number; height: number } | null;
  displayScaleCompensation: { x: number; y: number };
}

export interface TextureSize {
  width: number;
  height: number;
}

export function createLayerInstance(
  layer: V5GLayerConfig,
  texturesByAssetId: ReadonlyMap<string, PIXI.Texture>,
  assetsById: ReadonlyMap<string, V5GAssetConfig>,
): V5GLayerInstance {
  const safeGlowDisplay = new PIXI.Container();
  safeGlowDisplay.label = `${layer.name} safe glow`;
  const effectDisplay = new PIXI.Container();
  effectDisplay.label = `${layer.name} effects`;
  const particleDisplay = new PIXI.Container();
  particleDisplay.label = `${layer.name} particles`;
  let display: PIXI.Container;
  let instanceTexture: PIXI.Texture | null = null;
  let textureSize: { width: number; height: number } | null = null;
  let displayScaleCompensation = { x: 1, y: 1 };

  if (layer.type === "image") {
    if (!layer.assetId) {
      throw new Error(`V5G image layer "${layer.id}" requires assetId.`);
    }
    const texture = texturesByAssetId.get(layer.assetId);
    if (!texture) {
      throw new Error(
        `V5G image layer "${layer.id}" is missing texture for asset "${layer.assetId}".`,
      );
    }
    const asset = getLayerAsset(layer, assetsById);
    if (!asset) {
      throw new Error(`V5G image layer "${layer.id}" is missing asset.`);
    }
    instanceTexture = texture;
    textureSize = {
      width: Math.round(texture.width),
      height: Math.round(texture.height),
    };
    const sprite = new PIXI.Sprite(texture);
    sprite.label = layer.name;
    sprite.anchor.set(layer.transform.anchorX, layer.transform.anchorY);
    displayScaleCompensation = getAssetDisplayCompensation(asset, textureSize);
    display = sprite;
  } else if (layer.type === "text") {
    const text = new PIXI.Text({
      text: layer.text ?? layer.name,
      style: {
        fill: 0xf8fafc,
        fontFamily: "Arial, sans-serif",
        fontSize: 64,
        fontWeight: "700",
        stroke: { color: 0x111827, width: 4 },
        dropShadow: {
          color: 0x000000,
          blur: 8,
          distance: 4,
          alpha: 0.5,
        },
      },
    });
    text.label = layer.name;
    text.anchor.set(layer.transform.anchorX, layer.transform.anchorY);
    display = text;
  } else {
    throw new Error(`Unsupported V5G layer type: ${layer.type}`);
  }

  return {
    layer,
    display,
    safeGlowDisplay,
    effectDisplay,
    particleDisplay,
    texture: instanceTexture,
    textureSize,
    displayScaleCompensation,
  };
}

export function applySampledLayerState(
  instance: V5GLayerInstance,
  sampled: SampledLayerState,
  stage: V5GProjectConfig["stage"],
): void {
  const position = editorToPixi(
    sampled.transform.x,
    sampled.transform.y,
    stage.width,
    stage.height,
  );
  instance.display.position.set(position.x, position.y);
  instance.display.scale.set(
    sampled.transform.scaleX * instance.displayScaleCompensation.x,
    sampled.transform.scaleY * instance.displayScaleCompensation.y,
  );
  instance.display.rotation = (sampled.transform.rotation * Math.PI) / 180;
  instance.display.alpha = sampled.opacity;
  instance.display.visible = sampled.renderImageDisplay;
  instance.display.blendMode = toPixiBlendMode(sampled.blendMode);
}

export function getLayerAsset(
  layer: V5GLayerConfig,
  assetsById: ReadonlyMap<string, V5GAssetConfig>,
): V5GAssetConfig | null {
  if (layer.type !== "image") return null;
  if (!layer.assetId) {
    throw new Error(`V5G image layer "${layer.id}" requires assetId.`);
  }
  const asset = assetsById.get(layer.assetId);
  if (!asset) {
    throw new Error(
      `V5G image layer "${layer.id}" references missing asset "${layer.assetId}".`,
    );
  }
  return asset;
}

export function getAssetTextureSize(asset: V5GAssetConfig): TextureSize {
  return {
    width: asset.fileWidth ?? asset.width,
    height: asset.fileHeight ?? asset.height,
  };
}

export function getAssetDisplayCompensation(
  asset: V5GAssetConfig,
  textureSize: TextureSize,
): { x: number; y: number } {
  const x = asset.width / textureSize.width;
  const y = asset.height / textureSize.height;
  if (!Number.isFinite(x) || x <= 0 || !Number.isFinite(y) || y <= 0) {
    throw new Error(
      `Invalid V5G asset display compensation for ${asset.id}: logical ${asset.width}x${asset.height}, texture ${textureSize.width}x${textureSize.height}.`,
    );
  }
  return { x, y };
}
