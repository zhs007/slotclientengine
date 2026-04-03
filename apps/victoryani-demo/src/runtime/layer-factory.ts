import { Container, Sprite, Text, Texture, type TextStyleOptions } from "pixi.js";
import type { VictoryLayerConfig } from "../config/victory-types.js";
import { resolveBlendMode, layerUsesContainerBlendMode } from "./blend-mode.js";
import { createLayerBaseState, type LayerInstance } from "./layer-instance.js";

const TEXT_STYLE: TextStyleOptions = {
  fill: "#fff6e4",
  fontFamily: '"Times New Roman", serif',
  fontSize: 96,
  fontWeight: "700",
  stroke: {
    color: "#2d1a4a",
    width: 6
  }
};

export function createLayerInstances(
  layers: VictoryLayerConfig[],
  textures: Map<string, Texture>
): Map<string, LayerInstance> {
  const instances = new Map<string, LayerInstance>();

  for (const layer of layers) {
    const container = new Container();
    container.label = layer.id;

    const target = createLayerDisplayObject(layer, textures);
    target.position.set(layer.x, layer.y);
    target.scale.set(layer.scaleX, layer.scaleY);
    target.rotation = layer.rotation;
    target.alpha = layer.alpha;
    target.visible = layer.visible;

    const blendMode = resolveBlendMode(layer.blendMode);
    if (layerUsesContainerBlendMode(layer.animations.map((animation) => animation.type))) {
      (container as any).blendMode = blendMode;
      (target as any).blendMode = resolveBlendMode("normal");
    } else {
      (target as any).blendMode = blendMode;
      (container as any).blendMode = resolveBlendMode("normal");
    }

    container.addChild(target);
    instances.set(layer.id, {
      layer,
      container,
      target,
      baseState: createLayerBaseState(layer),
      cleanupTasks: new Set()
    });
  }

  return instances;
}

function createLayerDisplayObject(layer: VictoryLayerConfig, textures: Map<string, Texture>) {
  if (layer.type === "font") {
    const textNode = new Text({
      text: layer.text || layer.id,
      style: TEXT_STYLE
    });

    if ("anchor" in textNode && typeof textNode.anchor?.set === "function") {
      textNode.anchor.set(0.5);
    }

    return textNode as Container;
  }

  const texture = textures.get(layer.asset) ?? Texture.WHITE;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  return sprite;
}