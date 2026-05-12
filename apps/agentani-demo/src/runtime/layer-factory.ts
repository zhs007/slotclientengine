import { Container, Sprite, Texture } from "pixi.js";
import type { CodeAnimationLayer } from "../animations/types.js";
import { mapBlendMode } from "./blend-mode.js";

export interface BuiltLayer {
  config: CodeAnimationLayer;
  container: Container;
  sprite: Sprite;
  initial: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    alpha: number;
    visible: boolean;
  };
}

export function createLayer(
  config: CodeAnimationLayer,
  texture: Texture,
): BuiltLayer {
  const container = new Container();
  const sprite = new Sprite(texture);

  container.label = config.id;
  container.position.set(config.x, config.y);
  container.scale.set(config.scaleX, config.scaleY);
  container.rotation = config.rotation;
  container.alpha = config.alpha;
  container.visible = config.visible;
  container.blendMode = mapBlendMode(config.blendMode);

  sprite.anchor.set(0.5);
  container.addChild(sprite);

  return {
    config,
    container,
    sprite,
    initial: {
      x: config.x,
      y: config.y,
      scaleX: config.scaleX,
      scaleY: config.scaleY,
      rotation: config.rotation,
      alpha: config.alpha,
      visible: config.visible,
    },
  };
}

export function resetLayer(layer: BuiltLayer) {
  layer.container.position.set(layer.initial.x, layer.initial.y);
  layer.container.scale.set(layer.initial.scaleX, layer.initial.scaleY);
  layer.container.rotation = layer.initial.rotation;
  layer.container.alpha = layer.initial.alpha;
  layer.container.visible = layer.initial.visible;
}
