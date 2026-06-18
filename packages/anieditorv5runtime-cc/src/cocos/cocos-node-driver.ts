import {
  Color,
  Graphics,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  UIOpacity,
} from "cc";
import type { CocosBlendModeConfig } from "./blend-mode.js";
import type { V5GCocosNodeDriver, V5GSize } from "./node-driver.js";

interface ReadableSpriteFrameSize {
  width: number;
  height: number;
}

interface ReadableSpriteFrame {
  originalSize?: ReadableSpriteFrameSize;
  rect?: ReadableSpriteFrameSize;
  width?: number;
  height?: number;
  getOriginalSize?: () => ReadableSpriteFrameSize;
  getRect?: () => ReadableSpriteFrameSize;
}

export function createCocosNodeDriver(): V5GCocosNodeDriver<Node, SpriteFrame> {
  return {
    createNode(name) {
      return new Node(name);
    },
    appendChild(parent, child) {
      parent.addChild(child);
    },
    destroyNode(node) {
      node.removeFromParent();
      node.destroy();
    },
    setContentSize(node, width, height) {
      requireUITransform(node).setContentSize(width, height);
    },
    setAnchorPoint(node, x, y) {
      requireUITransform(node).setAnchorPoint(x, y);
    },
    setPosition(node, x, y) {
      node.setPosition(x, y, 0);
    },
    setScale(node, x, y) {
      node.setScale(x, y, 1);
    },
    setRotationDegrees(node, degrees) {
      node.setRotationFromEuler(0, 0, degrees);
    },
    setOpacity(node, opacity) {
      requireUIOpacity(node).opacity = opacity;
    },
    setActive(node, active) {
      node.active = active;
    },
    createBackgroundNode(name, color, width, height) {
      const node = new Node(name);
      requireUITransform(node).setContentSize(width, height);
      requireUITransform(node).setAnchorPoint(0.5, 0.5);
      const graphics = node.addComponent(Graphics);
      graphics.fillColor = numberToColor(color, 255);
      graphics.rect(-width / 2, -height / 2, width, height);
      graphics.fill();
      return node;
    },
    createImageNode(name, spriteFrame) {
      const node = new Node(name);
      const sprite = node.addComponent(Sprite);
      sprite.spriteFrame = spriteFrame;
      sprite.color = new Color(255, 255, 255, 255);
      return node;
    },
    getSpriteFrameSize(spriteFrame) {
      return readSpriteFrameSize(spriteFrame);
    },
    applyBlendMode(node, _config) {
      requireSprite(node);
    },
  };
}

function requireUITransform(node: Node): UITransform {
  return node.getComponent(UITransform) ?? node.addComponent(UITransform);
}

function requireUIOpacity(node: Node): UIOpacity {
  return node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
}

function requireSprite(node: Node): Sprite {
  const sprite = node.getComponent(Sprite);
  if (!sprite) {
    throw new Error(
      `Cocos node "${node.name}" does not have a Sprite component.`,
    );
  }
  return sprite;
}

function numberToColor(color: number, alpha: number): Color {
  return new Color((color >> 16) & 255, (color >> 8) & 255, color & 255, alpha);
}

function readSpriteFrameSize(spriteFrame: SpriteFrame): V5GSize | null {
  const readable = spriteFrame as ReadableSpriteFrame;
  const fromMethod = readable.getOriginalSize?.() ?? readable.getRect?.();
  if (isReadableSize(fromMethod)) return fromMethod;
  if (isReadableSize(readable.originalSize)) return readable.originalSize;
  if (isReadableSize(readable.rect)) return readable.rect;
  if (
    typeof readable.width === "number" &&
    Number.isFinite(readable.width) &&
    typeof readable.height === "number" &&
    Number.isFinite(readable.height)
  ) {
    return {
      width: readable.width,
      height: readable.height,
    };
  }
  return null;
}

function isReadableSize(value: unknown): value is ReadableSpriteFrameSize {
  if (typeof value !== "object" || value === null) return false;
  const size = value as Partial<ReadableSpriteFrameSize>;
  return (
    typeof size.width === "number" &&
    Number.isFinite(size.width) &&
    typeof size.height === "number" &&
    Number.isFinite(size.height)
  );
}
