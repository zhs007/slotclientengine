declare module "cc" {
  export const _decorator: {
    ccclass: (name: string) => ClassDecorator;
    property: (type?: unknown) => PropertyDecorator;
  };

  export class Component {
    node: Node;
    start?(): void;
    update?(deltaTime: number): void;
    onDestroy?(): void;
  }

  export class JsonAsset {
    json: unknown;
  }

  export class Color {
    constructor(r?: number, g?: number, b?: number, a?: number);
    r: number;
    g: number;
    b: number;
    a: number;
    static readonly WHITE: Color;
  }

  export class Vec3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
  }

  export class Quat {
    constructor(x?: number, y?: number, z?: number, w?: number);
    x: number;
    y: number;
    z: number;
    w: number;
  }

  export class Vec2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
  }

  export class Rect {
    constructor(x?: number, y?: number, width?: number, height?: number);
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export class Size {
    constructor(width?: number, height?: number);
    width: number;
    height: number;
  }

  interface BlendTarget {
    blend: boolean;
    blendEq: number;
    blendAlphaEq: number;
    blendSrc: number;
    blendDst: number;
    blendSrcAlpha: number;
    blendDstAlpha: number;
  }

  interface BlendState {
    targets: BlendTarget[];
    setTarget(index: number, target: BlendTarget): void;
  }

  interface Pass {
    blendState: BlendState;
    _updatePassHash(): void;
  }

  interface MaterialInstance {
    passes: Pass[];
  }

  export class Node {
    name: string;
    readonly isValid: boolean;
    active: boolean;
    parent: Node | null;
    children: Node[];
    position: Vec3;
    scale: Vec3;
    eulerAngles: Vec3;
    constructor(name?: string);
    addChild(child: Node): void;
    removeFromParent(): void;
    destroy(): void;
    setPosition(x: number, y: number, z?: number): void;
    setScale(x: number, y: number, z?: number): void;
    setRotationFromEuler(x: number, y: number, z: number): void;
    getWorldPosition(out?: Vec3): Vec3;
    setWorldPosition(x: number, y: number, z?: number): void;
    getWorldScale(out?: Vec3): Vec3;
    setWorldScale(x: number, y: number, z?: number): void;
    getWorldRotation(out?: Quat): Quat;
    setWorldRotation(rotation: Quat): void;
    setSiblingIndex(index: number): void;
    addComponent<T>(component: new (...args: never[]) => T): T;
    getComponent<T>(component: new (...args: never[]) => T): T | null;
  }

  export class UITransform {
    setContentSize(width: number, height: number): void;
    setAnchorPoint(x: number, y: number): void;
  }

  export class UIOpacity {
    opacity: number;
  }

  export class SpriteFrame {
    originalSize?: { width: number; height: number };
    rect?: { x: number; y: number; width: number; height: number };
    texture?: unknown;
    rotated?: boolean;
    width?: number;
    height?: number;
    reset(info: {
      texture: unknown;
      rect: Rect;
      originalSize: Size;
      offset: Vec2;
      isRotate: boolean;
    }): void;
    destroy(): void;
  }

  export class SpriteAtlas {
    getSpriteFrame(name: string): SpriteFrame | null;
  }

  export class Sprite {
    spriteFrame: SpriteFrame | null;
    color: Color;
    srcBlendFactor: number;
    dstBlendFactor: number;
    updateMaterial(): void;
    _updateBlendFunc(): void;
    getMaterialInstance(index: number): MaterialInstance | null;
  }

  export class Label {
    string: string;
    color: Color;
  }

  export class Mask {
    static readonly Type: {
      IMAGE_STENCIL: number;
    };
    type: number;
    inverted: boolean;
  }

  export class Graphics {
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    rect(x: number, y: number, width: number, height: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    stroke(): void;
    getMaterialInstance(index: number): MaterialInstance | null;
    getRenderMaterial(index: number): MaterialInstance | null;
    fill(): void;
    clear(): void;
  }
}
