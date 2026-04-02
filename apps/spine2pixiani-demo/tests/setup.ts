import { vi } from "vitest";

type Child = MockContainer | MockSprite;

class MockContainer {
  children: Child[] = [];
  parent: MockContainer | null = null;
  name = "";
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

vi.mock("pixi.js", () => ({
  Container: MockContainer,
  Sprite: MockSprite,
  Texture: MockTexture
}));