import { Sprite, Texture } from "pixi.js";
import { parseSpineColor } from "./color.js";
import type { SlotPose } from "./spine-types.js";

export function createSlotSprite(initialTexture: Texture) {
  const sprite = new Sprite(initialTexture);
  sprite.anchor.set(0.5);
  sprite.visible = false;
  return sprite;
}

export function applySlotVisual(
  sprite: Sprite,
  slotPose: SlotPose,
  textures: Record<string, Texture>
) {
  if (!slotPose.attachmentName || !slotPose.attachment) {
    sprite.visible = false;
    sprite.texture = Texture.EMPTY;
    return;
  }

  sprite.visible = true;
  sprite.texture = textures[slotPose.attachment.textureName] ?? Texture.EMPTY;
  const color = parseSpineColor(slotPose.color);
  sprite.tint = color.tint;
  sprite.alpha = color.alpha;
  sprite.blendMode = slotPose.blendMode === "additive" ? "add" : "normal";
}