import {
  Color,
  Node,
  Quat,
  Sprite,
  SpriteFrame,
  UITransform,
  UIOpacity,
  Vec3,
} from "cc";
import type {
  CocosBlendFactorName,
  CocosBlendModeConfig,
  CocosBlendOperationName,
} from "./blend-mode.js";
import type {
  V5GCocosNodeDriver,
  V5GCocosNodeTransformSnapshot,
  V5GSize,
} from "./node-driver.js";

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
  blendEq: number;
  blendAlphaEq: number;
  blendSrc: number;
  blendDst: number;
  blendSrcAlpha: number;
  blendDstAlpha: number;
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
  srcBlendFactor: number;
  dstBlendFactor: number;
  _srcBlendFactor?: number;
  _dstBlendFactor?: number;
  updateMaterial?: () => void;
  _updateBlendFunc?: () => void;
  getRenderMaterial?: (index: number) => CocosMaterialInstanceLike | null;
  getMaterialInstance?: (index: number) => CocosMaterialInstanceLike | null;
}

interface CocosLocalTransformSnapshot {
  position: Vec3;
  scale: Vec3;
  eulerAngles: Vec3;
}

interface CocosWorldTransformSnapshot {
  position: Vec3;
  scale: Vec3;
  rotation: Quat;
}

interface CocosNodeWithValidity extends Node {
  isValid?: boolean;
}

// Cocos Creator 3.8.6 exposes these enum values internally, but not all builds
// re-export BlendFactor / BlendOp from "cc".
const COCOS_BLEND_FACTORS: Record<CocosBlendFactorName, number> = {
  ZERO: 0,
  ONE: 1,
  SRC_ALPHA: 2,
  ONE_MINUS_SRC_ALPHA: 4,
  SRC_COLOR: 6,
  DST_COLOR: 7,
  ONE_MINUS_SRC_COLOR: 8,
};

const COCOS_BLEND_OPERATIONS: Record<CocosBlendOperationName, number> = {
  ADD: 0,
  MAX: 4,
};

export function createCocosNodeDriver(): V5GCocosNodeDriver<Node, SpriteFrame> {
  return {
    createNode(name) {
      return new Node(name);
    },
    isValidNode(node) {
      return isValidCocosNode(node);
    },
    appendChild(parent, child) {
      parent.addChild(child);
    },
    removeChild(parent, child) {
      if (child.parent === parent) {
        child.removeFromParent();
      }
    },
    getParent(node) {
      if (!isValidCocosNode(node)) return null;
      return node.parent;
    },
    captureLocalTransform(node) {
      return {
        position: copyVec3(node.position),
        scale: copyVec3(node.scale),
        eulerAngles: copyVec3(node.eulerAngles),
      };
    },
    restoreLocalTransform(node, snapshot) {
      const transform = requireLocalTransformSnapshot(snapshot);
      node.setPosition(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      node.setScale(transform.scale.x, transform.scale.y, transform.scale.z);
      node.setRotationFromEuler(
        transform.eulerAngles.x,
        transform.eulerAngles.y,
        transform.eulerAngles.z,
      );
    },
    captureWorldTransform(node) {
      return {
        position: node.getWorldPosition(new Vec3()),
        scale: node.getWorldScale(new Vec3()),
        rotation: node.getWorldRotation(new Quat()),
      };
    },
    restoreWorldTransform(node, snapshot) {
      const transform = requireWorldTransformSnapshot(snapshot);
      node.setWorldPosition(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );
      node.setWorldScale(
        transform.scale.x,
        transform.scale.y,
        transform.scale.z,
      );
      node.setWorldRotation(transform.rotation);
    },
    destroyNode(node) {
      if (!isValidCocosNode(node)) return;
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

function isValidCocosNode(node: Node | null | undefined): node is Node {
  return (
    node !== null &&
    node !== undefined &&
    (node as CocosNodeWithValidity).isValid !== false
  );
}

function copyVec3(source: Vec3): Vec3 {
  return new Vec3(source.x, source.y, source.z);
}

function requireLocalTransformSnapshot(
  snapshot: V5GCocosNodeTransformSnapshot,
): CocosLocalTransformSnapshot {
  return snapshot as CocosLocalTransformSnapshot;
}

function requireWorldTransformSnapshot(
  snapshot: V5GCocosNodeTransformSnapshot,
): CocosWorldTransformSnapshot {
  return snapshot as CocosWorldTransformSnapshot;
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

  if (config.mode === "normal") {
    return;
  }

  const blendable = sprite as Sprite & Partial<BlendableSprite>;
  setSpriteBlendFactors(
    nodeName,
    blendable,
    getCocosBlendFactor(config.color.sourceFactor, config.mode),
    getCocosBlendFactor(config.color.destinationFactor, config.mode),
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

function setSpriteBlendFactors(
  nodeName: string,
  sprite: Partial<BlendableSprite>,
  sourceFactor: number,
  destinationFactor: number,
  blendMode: string,
): void {
  if ("srcBlendFactor" in sprite && "dstBlendFactor" in sprite) {
    sprite.srcBlendFactor = sourceFactor;
    sprite.dstBlendFactor = destinationFactor;
    return;
  }
  if ("_srcBlendFactor" in sprite && "_dstBlendFactor" in sprite) {
    sprite._srcBlendFactor = sourceFactor;
    sprite._dstBlendFactor = destinationFactor;
    return;
  }
  throw new Error(
    `Cocos Sprite on node "${nodeName}" does not expose blend factor fields required for V5G blend mode "${blendMode}".`,
  );
}

function getCocosSpriteBlendPass(
  nodeName: string,
  sprite: Partial<BlendableSprite>,
  blendMode: string,
): CocosPassLike {
  if (
    typeof sprite.getMaterialInstance !== "function" &&
    typeof sprite.getRenderMaterial !== "function"
  ) {
    throw new Error(
      `Cocos Sprite on node "${nodeName}" cannot provide a material instance for V5G blend mode "${blendMode}".`,
    );
  }
  const material =
    sprite.getMaterialInstance?.(0) ?? sprite.getRenderMaterial?.(0);
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
): number {
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
): number {
  const cocosOperation = COCOS_BLEND_OPERATIONS[operation];
  if (cocosOperation === undefined) {
    throw new Error(
      `Unsupported Cocos blend operation "${operation}" for V5G blend mode "${blendMode}".`,
    );
  }
  return cocosOperation;
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
