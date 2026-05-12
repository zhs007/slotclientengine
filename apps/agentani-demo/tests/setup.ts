import { vi } from "vitest";

type Child = MockContainer | MockSprite;

class MockContainer {
  children: Child[] = [];
  parent: MockContainer | null = null;
  label = "";
  x = 0;
  y = 0;
  rotation = 0;
  alpha = 1;
  visible = true;
  blendMode: string | number = 0;
  mask: Child | null = null;
  destroyed = false;
  position = {
    set: (x: number, y: number) => {
      this.x = x;
      this.y = y;
    },
  };
  scale = {
    x: 1,
    y: 1,
    set: (x: number, y?: number) => {
      this.scale.x = x;
      this.scale.y = y ?? x;
    },
  };

  addChild<T extends Child>(child: T) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  removeChildren() {
    const children = this.children;
    this.children = [];
    for (const child of children) {
      child.parent = null;
    }
    return children;
  }

  destroy() {
    this.destroyed = true;
    this.removeChildren();
  }
}

class MockTexture {
  static EMPTY = new MockTexture();
  static WHITE = new MockTexture();

  width = 64;
  height = 64;
}

class MockSprite extends MockContainer {
  anchor = {
    set: vi.fn(),
  };

  constructor(public readonly texture: MockTexture = MockTexture.EMPTY) {
    super();
  }
}

const assetsLoad = vi.fn(async () => new MockTexture());

vi.mock("pixi.js", () => ({
  Application: class {
    stage = new MockContainer();
    canvas = { style: {} };

    async init() {
      return undefined;
    }
  },
  Assets: {
    load: assetsLoad,
  },
  BLEND_MODES: {
    NORMAL: 0,
    ADD: 1,
    MULTIPLY: 2,
    SCREEN: 3,
  },
  Container: MockContainer,
  Sprite: MockSprite,
  Texture: MockTexture,
}));

Object.assign(globalThis, {
  __agentaniAssetsLoad: assetsLoad,
});
