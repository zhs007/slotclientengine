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
    active: boolean;
    parent: Node | null;
    children: Node[];
    constructor(name?: string);
    addChild(child: Node): void;
    removeFromParent(): void;
    destroy(): void;
    setPosition(x: number, y: number, z?: number): void;
    setScale(x: number, y: number, z?: number): void;
    setRotationFromEuler(x: number, y: number, z: number): void;
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
    rect?: { width: number; height: number };
    width?: number;
    height?: number;
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

  export class Graphics {
    fillColor: Color;
    rect(x: number, y: number, width: number, height: number): void;
    fill(): void;
    clear(): void;
  }
}
