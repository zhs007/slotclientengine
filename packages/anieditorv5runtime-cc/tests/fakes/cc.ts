export const _decorator = {
  ccclass() {
    return function decorateClass(): void {
      // Cocos editor handles this decorator at runtime.
    };
  },
  property() {
    return function decorateProperty(): void {
      // Cocos editor handles this decorator at runtime.
    };
  },
};

export class Component {
  node = new Node("Component");
}

export class JsonAsset {
  constructor(readonly json: unknown = null) {}
}

export class Color {
  static readonly WHITE = new Color(255, 255, 255, 255);

  constructor(
    readonly r = 255,
    readonly g = 255,
    readonly b = 255,
    readonly a = 255,
  ) {}
}

export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
}

export class Quat {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}
}

export class Vec2 {
  constructor(
    public x = 0,
    public y = 0,
  ) {}
}

export class Rect {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}
}

export class Size {
  constructor(
    public width = 0,
    public height = 0,
  ) {}
}

const BlendFactor = {
  ZERO: 0,
  ONE: 1,
  SRC_ALPHA: 2,
  DST_ALPHA: 3,
  ONE_MINUS_SRC_ALPHA: 4,
  ONE_MINUS_DST_ALPHA: 5,
  SRC_COLOR: 6,
  DST_COLOR: 7,
  ONE_MINUS_SRC_COLOR: 8,
  ONE_MINUS_DST_COLOR: 9,
  SRC_ALPHA_SATURATE: 10,
  CONSTANT_COLOR: 11,
  ONE_MINUS_CONSTANT_COLOR: 12,
  CONSTANT_ALPHA: 13,
  ONE_MINUS_CONSTANT_ALPHA: 14,
} as const;

const BlendOp = {
  ADD: 0,
  SUB: 1,
  REV_SUB: 2,
  MIN: 3,
  MAX: 4,
} as const;

export class Node {
  active = true;
  parent: Node | null = null;
  children: Node[] = [];
  destroyed = false;
  position = new Vec3();
  scale = new Vec3(1, 1, 1);
  rotation = new Vec3();
  private readonly components = new Map<new () => unknown, unknown>();

  constructor(readonly name = "") {}

  get isValid(): boolean {
    return !this.destroyed;
  }

  get eulerAngles(): Vec3 {
    return new Vec3(this.rotation.x, this.rotation.y, this.rotation.z);
  }

  addChild(child: Node): void {
    child.removeFromParent();
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parent = this;
    this.children.push(child);
  }

  setSiblingIndex(index: number): void {
    if (!this.parent) return;
    const siblings = this.parent.children.filter((child) => child !== this);
    const target = Math.max(0, Math.min(siblings.length, index));
    siblings.splice(target, 0, this);
    this.parent.children = siblings;
  }

  removeFromParent(): void {
    if (this.parent) {
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
      this.parent = null;
    }
  }

  destroy(): void {
    this.destroyed = true;
  }

  setPosition(x: number, y: number, z = 0): void {
    this.position = new Vec3(x, y, z);
  }

  setScale(x: number, y: number, z = 1): void {
    this.scale = new Vec3(x, y, z);
  }

  setRotationFromEuler(x: number, y: number, z: number): void {
    this.rotation = new Vec3(x, y, z);
  }

  getWorldPosition(out = new Vec3()): Vec3 {
    const transform = captureNodeWorldTransform(this);
    out.x = transform.x;
    out.y = transform.y;
    out.z = this.position.z;
    return out;
  }

  setWorldPosition(x: number, y: number, z = 0): void {
    const local = getNodeLocalTransformForWorld(
      {
        ...captureNodeWorldTransform(this),
        x,
        y,
      },
      this.parent,
    );
    this.position = new Vec3(local.x, local.y, z);
  }

  getWorldScale(out = new Vec3()): Vec3 {
    const transform = captureNodeWorldTransform(this);
    out.x = transform.scaleX;
    out.y = transform.scaleY;
    out.z = this.scale.z;
    return out;
  }

  setWorldScale(x: number, y: number, z = 1): void {
    const local = getNodeLocalTransformForWorld(
      {
        ...captureNodeWorldTransform(this),
        scaleX: x,
        scaleY: y,
      },
      this.parent,
    );
    this.scale = new Vec3(local.scaleX, local.scaleY, z);
  }

  getWorldRotation(out = new Quat()): Quat {
    out.z = captureNodeWorldTransform(this).rotation;
    return out;
  }

  setWorldRotation(rotation: Quat): void {
    const local = getNodeLocalTransformForWorld(
      {
        ...captureNodeWorldTransform(this),
        rotation: rotation.z,
      },
      this.parent,
    );
    this.rotation = new Vec3(this.rotation.x, this.rotation.y, local.rotation);
  }

  addComponent<T>(component: new () => T): T {
    const instance = new component();
    this.components.set(component, instance);
    return instance;
  }

  getComponent<T>(component: new () => T): T | null {
    return (this.components.get(component) as T | undefined) ?? null;
  }
}

interface NodeTransformSnapshot {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

function captureNodeLocalTransform(node: Node): NodeTransformSnapshot {
  return {
    x: node.position.x,
    y: node.position.y,
    scaleX: node.scale.x,
    scaleY: node.scale.y,
    rotation: node.rotation.z,
  };
}

function captureNodeWorldTransform(node: Node): NodeTransformSnapshot {
  const local = captureNodeLocalTransform(node);
  if (!node.parent) return local;
  const parentWorld = captureNodeWorldTransform(node.parent);
  const radians = (parentWorld.rotation * Math.PI) / 180;
  const scaledX = local.x * parentWorld.scaleX;
  const scaledY = local.y * parentWorld.scaleY;
  return {
    x:
      parentWorld.x + scaledX * Math.cos(radians) - scaledY * Math.sin(radians),
    y:
      parentWorld.y + scaledX * Math.sin(radians) + scaledY * Math.cos(radians),
    scaleX: parentWorld.scaleX * local.scaleX,
    scaleY: parentWorld.scaleY * local.scaleY,
    rotation: parentWorld.rotation + local.rotation,
  };
}

function getNodeLocalTransformForWorld(
  world: NodeTransformSnapshot,
  parent: Node | null,
): NodeTransformSnapshot {
  if (!parent) return { ...world };
  const parentWorld = captureNodeWorldTransform(parent);
  const radians = (-parentWorld.rotation * Math.PI) / 180;
  const dx = world.x - parentWorld.x;
  const dy = world.y - parentWorld.y;
  const unrotatedX = dx * Math.cos(radians) - dy * Math.sin(radians);
  const unrotatedY = dx * Math.sin(radians) + dy * Math.cos(radians);
  return {
    x: unrotatedX / parentWorld.scaleX,
    y: unrotatedY / parentWorld.scaleY,
    scaleX: world.scaleX / parentWorld.scaleX,
    scaleY: world.scaleY / parentWorld.scaleY,
    rotation: world.rotation - parentWorld.rotation,
  };
}

export class UITransform {
  width = 0;
  height = 0;
  anchorX = 0.5;
  anchorY = 0.5;

  setContentSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  setAnchorPoint(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
  }
}

export class UIOpacity {
  opacity = 255;
}

export class SpriteFrame {
  originalSize?: { width: number; height: number };
  rect?: { x: number; y: number; width: number; height: number };
  texture?: unknown;
  rotated = false;
  width?: number;
  height?: number;
  destroyed = false;

  constructor(width?: number, height?: number) {
    if (width !== undefined && height !== undefined) {
      this.width = width;
      this.height = height;
      this.originalSize = { width, height };
      this.rect = { x: 0, y: 0, width, height };
      this.texture = {};
    }
  }

  reset(info: {
    texture: unknown;
    rect: Rect;
    originalSize: Size;
    offset: Vec2;
    isRotate: boolean;
  }): void {
    this.texture = info.texture;
    this.rect = {
      x: info.rect.x,
      y: info.rect.y,
      width: info.rect.width,
      height: info.rect.height,
    };
    this.originalSize = {
      width: info.originalSize.width,
      height: info.originalSize.height,
    };
    this.width = info.originalSize.width;
    this.height = info.originalSize.height;
    this.rotated = info.isRotate;
  }

  destroy(): void {
    this.destroyed = true;
  }

  getOriginalSize(): { width: number; height: number } | undefined {
    return this.originalSize;
  }
}

export class SpriteAtlas {
  private readonly frames = new Map<string, SpriteFrame>();

  setSpriteFrame(name: string, frame: SpriteFrame): void {
    this.frames.set(name, frame);
  }

  getSpriteFrame(name: string): SpriteFrame | null {
    return this.frames.get(name) ?? null;
  }
}

export class BlendTarget {
  blend = false;
  blendEq = BlendOp.ADD;
  blendAlphaEq = BlendOp.ADD;
  blendSrc = BlendFactor.SRC_ALPHA;
  blendDst = BlendFactor.ONE_MINUS_SRC_ALPHA;
  blendSrcAlpha = BlendFactor.SRC_ALPHA;
  blendDstAlpha = BlendFactor.ONE_MINUS_SRC_ALPHA;
}

export class BlendState {
  targets = [new BlendTarget()];

  setTarget(index: number, target: BlendTarget): void {
    this.targets[index] = target;
  }
}

export class Pass {
  blendState = new BlendState();
  passHashUpdates = 0;

  _updatePassHash(): void {
    this.passHashUpdates += 1;
  }
}

export class MaterialInstance {
  passes = [new Pass()];
}

export class Sprite {
  spriteFrame: SpriteFrame | null = null;
  color = Color.WHITE;
  srcBlendFactor = BlendFactor.SRC_ALPHA;
  dstBlendFactor = BlendFactor.ONE_MINUS_SRC_ALPHA;
  materialUpdates = 0;
  private readonly materialInstance = new MaterialInstance();

  updateMaterial(): void {
    this.materialUpdates += 1;
    this._updateBlendFunc();
  }

  _updateBlendFunc(): void {
    const pass = this.materialInstance.passes[0];
    const target = pass.blendState.targets[0];
    target.blend = true;
    target.blendEq = BlendOp.ADD;
    target.blendAlphaEq = BlendOp.ADD;
    target.blendSrc = this.srcBlendFactor;
    target.blendDst = this.dstBlendFactor;
    target.blendSrcAlpha = BlendFactor.SRC_ALPHA;
    target.blendDstAlpha = BlendFactor.ONE_MINUS_SRC_ALPHA;
    pass.blendState.setTarget(0, target);
    pass._updatePassHash();
  }

  getMaterialInstance(index: number): MaterialInstance | null {
    if (index !== 0) return null;
    return this.materialInstance;
  }
}

export class Label {
  string = "";
  color = Color.WHITE;
}

export class Mask {
  static readonly Type = {
    IMAGE_STENCIL: 0,
  } as const;

  type = Mask.Type.IMAGE_STENCIL;
  inverted = false;
}

export class Graphics {
  fillColor = Color.WHITE;
  strokeColor = Color.WHITE;
  lineWidth = 1;
  rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  lines: Array<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width: number;
    color: Color;
  }> = [];
  filled = false;
  private lineStart = { x: 0, y: 0 };
  private lineEnd = { x: 0, y: 0 };
  private readonly materialInstance = new MaterialInstance();

  rect(x: number, y: number, width: number, height: number): void {
    this.rects.push({ x, y, width, height });
  }

  fill(): void {
    this.filled = true;
  }

  moveTo(x: number, y: number): void {
    this.lineStart = { x, y };
  }

  lineTo(x: number, y: number): void {
    this.lineEnd = { x, y };
  }

  stroke(): void {
    this.lines.push({
      x1: this.lineStart.x,
      y1: this.lineStart.y,
      x2: this.lineEnd.x,
      y2: this.lineEnd.y,
      width: this.lineWidth,
      color: this.strokeColor,
    });
  }

  getMaterialInstance(index: number): MaterialInstance | null {
    return index === 0 ? this.materialInstance : null;
  }

  getRenderMaterial(index: number): MaterialInstance | null {
    return this.getMaterialInstance(index);
  }

  clear(): void {
    this.rects = [];
    this.lines = [];
    this.filled = false;
  }
}
