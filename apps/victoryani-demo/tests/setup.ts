import { vi } from "vitest";

type Child = MockContainer | MockSprite | MockText | MockGraphics;

class MockContainer {
  children: Child[] = [];
  parent: MockContainer | null = null;
  label = "";
  x = 0;
  y = 0;
  width = 120;
  height = 120;
  rotation = 0;
  alpha = 1;
  visible = true;
  blendMode: string | number = 0;
  filters: unknown[] = [];
  mask: Child | null = null;
  destroyed = false;
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
  skew = {
    x: 0,
    y: 0
  };

  addChild<T extends Child>(child: T) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  removeChild<T extends Child>(child: T) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parent = null;
    return child;
  }

  removeChildAt(index: number) {
    const child = this.children[index];
    this.children.splice(index, 1);
    child.parent = null;
    return child;
  }

  destroy() {
    this.destroyed = true;
    this.children = [];
  }
}

class MockTexture {
  static EMPTY = new MockTexture();
  static WHITE = new MockTexture();

  destroyed = false;
  width = 64;
  height = 64;

  static from(_source: unknown) {
    return new MockTexture();
  }

  destroy() {
    this.destroyed = true;
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

class MockText extends MockContainer {
  anchor = {
    set: vi.fn()
  };

  constructor(public readonly options: { text: string; style?: unknown }) {
    super();
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

  drawRect(_x: number, _y: number, width: number, height: number) {
    this.width = width;
    this.height = height;
    return this;
  }

  moveTo(_x: number, _y: number) {
    return this;
  }

  lineTo(_x: number, _y: number) {
    return this;
  }
}

class MockDisplacementFilter {
  scale = {
    x: 0,
    y: 0,
    set: (x: number, y?: number) => {
      this.scale.x = x;
      this.scale.y = y ?? x;
    }
  };

  constructor(public readonly options: { sprite: MockSprite; scale: number }) {
    this.scale.set(options.scale);
  }
}

const assetsLoad = vi.fn(async () => new MockTexture());

vi.mock("pixi.js", () => ({
  Application: class {},
  Assets: {
    load: assetsLoad
  },
  BLEND_MODES: {
    NORMAL: 0,
    ADD: 1,
    MULTIPLY: 2,
    SCREEN: 3
  },
  Container: MockContainer,
  DisplacementFilter: MockDisplacementFilter,
  Graphics: MockGraphics,
  Sprite: MockSprite,
  Text: MockText,
  Texture: MockTexture
}));

Object.assign(globalThis, {
  __victoryaniAssetsLoad: assetsLoad
});