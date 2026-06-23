import {
  BlendFactor,
  BlendOp,
  Color,
  Graphics,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  UIOpacity,
} from "cc";
import type {
  CocosBlendFactorName,
  CocosBlendModeConfig,
  CocosBlendOperationName,
} from "./blend-mode.js";
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

interface CocosBlendTargetLike {
  blend: boolean;
  blendEq: BlendOp;
  blendAlphaEq: BlendOp;
  blendSrc: BlendFactor;
  blendDst: BlendFactor;
  blendSrcAlpha: BlendFactor;
  blendDstAlpha: BlendFactor;
}

interface CocosBlendStateLike {
  targets: CocosBlendTargetLike[];
  setTarget(index: number, target: CocosBlendTargetLike): void;
}

interface CocosPassLike {
  blendState: CocosBlendStateLike;
  _updatePassHash(): void;
}

interface CocosMaterialInstanceLike {
  passes: CocosPassLike[];
}

interface BlendableSprite {
  srcBlendFactor: BlendFactor;
  dstBlendFactor: BlendFactor;
  updateMaterial?: () => void;
  _updateBlendFunc?: () => void;
  getMaterialInstance?: (index: number) => CocosMaterialInstanceLike | null;
}

const COCOS_BLEND_FACTORS: Record<CocosBlendFactorName, BlendFactor> = {
  ZERO: BlendFactor.ZERO,
  ONE: BlendFactor.ONE,
  SRC_ALPHA: BlendFactor.SRC_ALPHA,
  ONE_MINUS_SRC_ALPHA: BlendFactor.ONE_MINUS_SRC_ALPHA,
  SRC_COLOR: BlendFactor.SRC_COLOR,
  DST_COLOR: BlendFactor.DST_COLOR,
  ONE_MINUS_SRC_COLOR: BlendFactor.ONE_MINUS_SRC_COLOR,
};

const COCOS_BLEND_OPERATIONS: Record<CocosBlendOperationName, BlendOp> = {
  ADD: BlendOp.ADD,
  MAX: BlendOp.MAX,
};

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
    applyBlendMode(node, config) {
      applySpriteBlendMode(node.name, requireSprite(node), config);
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

function applySpriteBlendMode(
  nodeName: string,
  sprite: Sprite,
  config: CocosBlendModeConfig,
): void {
  if (config.strategy !== "sprite-blend-state") {
    throw new Error(
      `Unsupported Cocos blend strategy "${config.strategy}" for V5G blend mode "${config.mode}" on node "${nodeName}".`,
    );
  }

  const blendable = sprite as Sprite & Partial<BlendableSprite>;
  if (!("srcBlendFactor" in blendable) || !("dstBlendFactor" in blendable)) {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" does not expose blend factor fields required for V5G blend mode "${config.mode}".`,
    );
  }

  blendable.srcBlendFactor = getCocosBlendFactor(
    config.color.sourceFactor,
    config.mode,
  );
  blendable.dstBlendFactor = getCocosBlendFactor(
    config.color.destinationFactor,
    config.mode,
  );

  if (typeof blendable.updateMaterial === "function") {
    blendable.updateMaterial();
  } else if (typeof blendable._updateBlendFunc === "function") {
    blendable._updateBlendFunc();
  } else {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" cannot update material blend state for V5G blend mode "${config.mode}".`,
    );
  }

  const pass = getCocosSpriteBlendPass(nodeName, blendable, config.mode);
  const target = pass.blendState.targets[0];
  if (!target) {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" has no blend target for V5G blend mode "${config.mode}".`,
    );
  }

  target.blend = true;
  target.blendEq = getCocosBlendOperation(config.color.operation, config.mode);
  target.blendAlphaEq = getCocosBlendOperation(
    config.alpha.operation,
    config.mode,
  );
  target.blendSrc = getCocosBlendFactor(config.color.sourceFactor, config.mode);
  target.blendDst = getCocosBlendFactor(
    config.color.destinationFactor,
    config.mode,
  );
  target.blendSrcAlpha = getCocosBlendFactor(
    config.alpha.sourceFactor,
    config.mode,
  );
  target.blendDstAlpha = getCocosBlendFactor(
    config.alpha.destinationFactor,
    config.mode,
  );
  pass.blendState.setTarget(0, target);
  pass._updatePassHash();
}

function getCocosSpriteBlendPass(
  nodeName: string,
  sprite: Partial<BlendableSprite>,
  blendMode: string,
): CocosPassLike {
  if (typeof sprite.getMaterialInstance !== "function") {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" cannot provide a material instance for V5G blend mode "${blendMode}".`,
    );
  }
  const material = sprite.getMaterialInstance(0);
  const pass = material?.passes[0];
  if (!pass) {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" has no material pass for V5G blend mode "${blendMode}".`,
    );
  }
  if (
    !pass.blendState ||
    !Array.isArray(pass.blendState.targets) ||
    typeof pass.blendState.setTarget !== "function"
  ) {
    throw new Error(
      `Cocos Sprite material on node "${nodeName}" has no mutable blend state for V5G blend mode "${blendMode}".`,
    );
  }
  if (typeof pass._updatePassHash !== "function") {
    throw new Error(
      `Cocos Sprite material on node "${nodeName}" cannot refresh pass hash for V5G blend mode "${blendMode}".`,
    );
  }
  return pass;
}

function getCocosBlendFactor(
  factor: CocosBlendFactorName,
  blendMode: string,
): BlendFactor {
  const cocosFactor = COCOS_BLEND_FACTORS[factor];
  if (cocosFactor === undefined) {
    throw new Error(
      `Unsupported Cocos blend factor "${factor}" for V5G blend mode "${blendMode}".`,
    );
  }
  return cocosFactor;
}

function getCocosBlendOperation(
  operation: CocosBlendOperationName,
  blendMode: string,
): BlendOp {
  const cocosOperation = COCOS_BLEND_OPERATIONS[operation];
  if (cocosOperation === undefined) {
    throw new Error(
      `Unsupported Cocos blend operation "${operation}" for V5G blend mode "${blendMode}".`,
    );
  }
  return cocosOperation;
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
