import { vi } from "vitest";

type Child = MockContainer | MockSprite;

class MockContainer {
  children: Child[] = [];
  parent: MockContainer | null = null;
  name = "";
  zIndex = 0;
  sortableChildren = false;
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  rotation = 0;
  alpha = 1;
  visible = true;
  tint = 0xffffff;
  blendMode: string | number = "normal";
  eventMode = "auto";
  cursor = "default";
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  position = {
    x: 0,
    y: 0,
    set: (x: number, y: number) => {
      this.x = x;
      this.y = y;
      this.position.x = x;
      this.position.y = y;
    }
  };
  scale = {
    x: 1,
    y: 1,
    set: (x: number, y?: number) => {
      this.scale.x = x;
      this.scale.y = y ?? x;
    }
  };

  setFromMatrix(matrix: { a: number; b: number; c: number; d: number; tx: number; ty: number }) {
    this.position.set(matrix.tx, matrix.ty);
    this.scale.set(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d));
    this.rotation = Math.atan2(matrix.b, matrix.a);
    return this;
  }

  addChild<T extends Child>(child: T) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  removeChild<T extends Child>(child: T) {
    this.children = this.children.filter((item) => item !== child);
    child.parent = null;
    return child;
  }

  sortChildren() {
    this.children.sort((left, right) => left.zIndex - right.zIndex);
  }

  on(eventName: string, listener: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(eventName) ?? [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
    return this;
  }

  emit(eventName: string, ...args: unknown[]) {
    const listeners = this.listeners.get(eventName) ?? [];
    for (const listener of listeners) {
      listener(...args);
    }
  }
}

class MockTexture {
  static EMPTY = new MockTexture();
  static WHITE = new MockTexture();

  static from(_source: unknown) {
    return new MockTexture();
  }
}

class MockSprite extends MockContainer {
  texture: MockTexture;
  anchor = {
    set: vi.fn()
  };

  constructor(texture: MockTexture = MockTexture.EMPTY) {
    super();
    this.texture = texture;
  }
}

class MockMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  tx = 0;
  ty = 0;

  set(a: number, b: number, c: number, d: number, tx: number, ty: number) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
    return this;
  }
}

class MockGraphics extends MockContainer {
  clear() {
    return this;
  }

  lineStyle(_width?: number, _color?: number, _alpha?: number) {
    return this;
  }

  beginFill(_color?: number, _alpha?: number) {
    return this;
  }

  endFill() {
    return this;
  }

  drawPolygon(_points: number[]) {
    return this;
  }

  drawCircle(_x: number, _y: number, _radius: number) {
    return this;
  }

  moveTo(_x: number, _y: number) {
    return this;
  }

  lineTo(_x: number, _y: number) {
    return this;
  }
}

vi.mock("pixi.js", () => ({
  Container: MockContainer,
  Graphics: MockGraphics,
  Matrix: MockMatrix,
  Sprite: MockSprite,
  Texture: MockTexture
}));
