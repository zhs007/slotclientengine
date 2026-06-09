import { Sprite, type Texture } from "pixi.js";

export type BasicBlendMode = "normal" | "add";

export function createCenteredSprite(texture: Texture) {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  return sprite;
}

export function toPixiBlendMode(blendMode: BasicBlendMode) {
  return blendMode === "add" ? "add" : "normal";
}
