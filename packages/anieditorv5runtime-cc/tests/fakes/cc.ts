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

export class Node {
  active = true;
  parent: Node | null = null;
  children: Node[] = [];
  destroyed = false;
  position = { x: 0, y: 0, z: 0 };
  scale = { x: 1, y: 1, z: 1 };
  rotation = { x: 0, y: 0, z: 0 };
  private readonly components = new Map<new () => unknown, unknown>();

  constructor(readonly name = "") {}

  addChild(child: Node): void {
    child.parent = this;
    this.children.push(child);
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
    this.position = { x, y, z };
  }

  setScale(x: number, y: number, z = 1): void {
    this.scale = { x, y, z };
  }

  setRotationFromEuler(x: number, y: number, z: number): void {
    this.rotation = { x, y, z };
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
  rect?: { width: number; height: number };
  width?: number;
  height?: number;

  constructor(width?: number, height?: number) {
    if (width !== undefined && height !== undefined) {
      this.width = width;
      this.height = height;
      this.originalSize = { width, height };
    }
  }

  getOriginalSize(): { width: number; height: number } | undefined {
    return this.originalSize;
  }
}

export class Sprite {
  spriteFrame: SpriteFrame | null = null;
  color = Color.WHITE;
  srcBlendFactor?: number;
  dstBlendFactor?: number;
}

export class Graphics {
  fillColor = Color.WHITE;
  rects: Array<{ x: number; y: number; width: number; height: number }> = [];
  filled = false;

  rect(x: number, y: number, width: number, height: number): void {
    this.rects.push({ x, y, width, height });
  }

  fill(): void {
    this.filled = true;
  }

  clear(): void {
    this.rects = [];
    this.filled = false;
  }
}

export enum BlendFactor {
  SRC_ALPHA = 770,
  ONE_MINUS_SRC_ALPHA = 771,
  ONE = 1,
}
