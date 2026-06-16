import * as PIXI from "pixi.js";
import { toPixiBlendMode } from "./blend-mode";
import { editorToPixi } from "./coordinates";
import type { SampledLayerState } from "./project-sampler";
import type {
  V5GLayerConfig,
  V5GProjectConfig,
  V5GAssetConfig,
} from "../v5g/types";

export interface V5GLayerInstance {
  layer: V5GLayerConfig;
  display: PIXI.Container;
}

export function createLayerInstance(
  layer: V5GLayerConfig,
  texturesByAssetId: ReadonlyMap<string, PIXI.Texture>,
): V5GLayerInstance {
  const display = new PIXI.Container();
  display.label = layer.name;

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
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(layer.transform.anchorX, layer.transform.anchorY);
    display.addChild(sprite);
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
    text.anchor.set(layer.transform.anchorX, layer.transform.anchorY);
    display.addChild(text);
  } else {
    throw new Error(`Unsupported V5G layer type: ${layer.type}`);
  }

  return { layer, display };
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
    sampled.transform.scaleX,
    sampled.transform.scaleY,
  );
  instance.display.rotation = (sampled.transform.rotation * Math.PI) / 180;
  instance.display.alpha = sampled.opacity;
  instance.display.visible = sampled.visible;
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
