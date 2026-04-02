import { vi } from "vitest";

type Child = { parent?: MockContainer | null };

class MockContainer {
  children: Child[] = [];
  parent: MockContainer | null = null;
  alpha = 1;
  x = 0;
  y = 0;
  mask?: unknown;
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
  pivot = {
    x: 0,
    y: 0,
    set: (x: number, y?: number) => {
      this.pivot.x = x;
      this.pivot.y = y ?? x;
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

  removeChildren() {
    this.children.forEach((child) => {
      child.parent = null;
    });
    this.children = [];
  }
}

class MockGraphics extends MockContainer {
  beginFill() {
    return this;
  }

  drawRoundedRect() {
    return this;
  }

  endFill() {
    return this;
  }

  clear() {
    return this;
  }

  rect() {
    return this;
  }

  circle() {
    return this;
  }

  fill() {
    return this;
  }
}

class MockText extends MockContainer {
  text: string;
  style: unknown;
  anchor = { set: vi.fn() };
  width = 0;
  height = 0;

  constructor({ text = "", style = {} } = {}) {
    super();
    this.text = text;
    this.style = style;
    const fontSize =
      typeof (style as { fontSize?: unknown })?.fontSize === "number"
        ? ((style as { fontSize?: number }).fontSize ?? 16)
        : 16;
    this.width = fontSize * 0.6;
    this.height = fontSize * 1.2;
  }
}

class MockTextStyle {
  constructor(public options: Record<string, unknown>) {}
}

class MockSprite extends MockContainer {
  texture: any;
  anchor = { set: vi.fn() };
  width = 10; // default for tests
  height = 10;
  constructor() {
    super();
  }
}

class MockTexture {
  static EMPTY = new MockTexture();
}

vi.mock("pixi.js", () => ({
  Container: MockContainer,
  Graphics: MockGraphics,
  Text: MockText,
  TextStyle: MockTextStyle,
  Sprite: MockSprite,
  Texture: MockTexture
}));
