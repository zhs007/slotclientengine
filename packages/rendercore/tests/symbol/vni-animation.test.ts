import { describe, expect, it, vi } from "vitest";

const pixiMock = vi.hoisted(() => {
  const sourceUpdates: ReturnType<typeof vi.fn>[] = [];

  class MockPoint {
    x = 0;
    y = 0;

    set(x: number, y = x): void {
      this.x = x;
      this.y = y;
    }
  }

  class MockContainer {
    children: MockContainer[] = [];
    parent: MockContainer | null = null;
    visible = true;
    alpha = 1;
    rotation = 0;
    position = new MockPoint();
    scale = new MockPoint();
    anchor = new MockPoint();
    mask: MockContainer | null = null;

    addChild(...children: MockContainer[]): MockContainer | undefined {
      for (const child of children) {
        child.parent?.removeChild(child);
        child.parent = this;
      }
      this.children.push(...children);
      return children[0];
    }

    removeChild(...children: MockContainer[]): MockContainer | undefined {
      for (const child of children) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
          this.children.splice(index, 1);
          child.parent = null;
        }
      }
      return children[0];
    }

    removeChildren(): MockContainer[] {
      const children = this.children;
      for (const child of children) {
        child.parent = null;
      }
      this.children = [];
      return children;
    }

    destroy(): void {
      this.removeChildren();
      this.parent = null;
    }
  }

  class MockTexture {
    static EMPTY = new MockTexture();
    static WHITE = new MockTexture();
    static from = vi.fn(() => new MockTexture());
    source: { update: ReturnType<typeof vi.fn> };
    update = vi.fn();
    destroy = vi.fn();
    width = 64;
    height = 64;

    constructor(readonly options?: unknown) {
      const update = vi.fn();
      sourceUpdates.push(update);
      this.source = { update };
    }
  }

  class MockSprite extends MockContainer {
    constructor(public texture: MockTexture) {
      super();
    }
  }

  class MockRectangle {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly width: number,
      readonly height: number,
    ) {}
  }

  return {
    MockContainer,
    MockRectangle,
    MockSprite,
    MockTexture,
    sourceUpdates,
  };
});

vi.mock("pixi.js", () => ({
  Container: pixiMock.MockContainer,
  Rectangle: pixiMock.MockRectangle,
  Sprite: pixiMock.MockSprite,
  Texture: pixiMock.MockTexture,
}));

import { Container, Sprite, Texture } from "pixi.js";
import {
  VniSymbolAni,
  createSymbolVniAnimationResolver,
  type SymbolAnimationContext,
  type SymbolVniAnimationResource,
  type VniSymbolAniPlayer,
} from "../../src/symbol/index.js";

function createContext(): SymbolAnimationContext {
  const root = new Container();
  const underlayLayer = new Container();
  const baseLayer = new Container();
  const sprite = new Sprite(Texture.WHITE);
  const stateSprite = new Sprite(Texture.WHITE);
  const overlayLayer = new Container();
  baseLayer.addChild(sprite);
  root.addChild(underlayLayer, baseLayer, stateSprite, overlayLayer);
  return {
    code: 1,
    symbol: "L1",
    pays: [0],
    requestedState: "win",
    resolvedState: "win",
    state: { id: "win", phase: "once", playback: "once" },
    texture: Texture.WHITE,
    stateTextures: {},
    requiredStateTextures: [],
    root,
    underlayLayer,
    baseLayer,
    sprite,
    layers: [
      {
        index: 0,
        texture: Texture.WHITE,
        keyframes: [],
        sprite,
      },
    ],
    stateSprite,
    overlayLayer,
  };
}

function createResource(): SymbolVniAnimationResource {
  return {
    symbol: "L1",
    state: "win",
    spec: {
      kind: "vni",
      project: "./L1-wins.json",
      stageRect: { x: 4, y: 5, width: 32, height: 32 },
      playback: { mode: "range", startTime: 0, endTime: 2, loop: false },
    },
    project: {
      schemaVersion: "VNI_0.010",
      editor: { name: "VNI", version: "VNI_0.010" },
      engineTarget: { name: "cocos_creator", version: "3.8.6" },
      name: "L1 wins",
      stage: {
        width: 100,
        height: 100,
        coordinate: "center",
        duration: 2,
        backgroundColor: "#000000",
      },
      assets: [],
      layerGroups: [],
      layers: [],
      particles: [],
    },
    assetUrls: {},
  };
}

function createDocument() {
  const bodyChildren: unknown[] = [];
  const body = {
    appendChild: vi.fn((child: unknown) => {
      bodyChildren.push(child);
      return child;
    }),
  };
  return {
    body,
    bodyChildren,
    createElement: vi.fn(() => {
      const children: unknown[] = [];
      const element = {
        style: {} as Record<string, string>,
        dataset: {} as Record<string, string>,
        appendChild: vi.fn((child: unknown) => {
          children.push(child);
          return child;
        }),
        remove: vi.fn(() => {
          const index = bodyChildren.indexOf(element);
          if (index >= 0) {
            bodyChildren.splice(index, 1);
          }
        }),
        querySelectorAll: vi.fn((selector: string) =>
          selector === "canvas" ? children : [],
        ),
      };
      return element;
    }),
  } as unknown as Document & { readonly bodyChildren: unknown[] };
}

function createPlayerFactory() {
  let complete: (() => void) | null = null;
  const calls = {
    init: vi.fn(async function init(this: { readonly container: HTMLElement }) {
      this.container.appendChild({ nodeName: "CANVAS" } as HTMLCanvasElement);
    }),
    playRange: vi.fn(),
    update: vi.fn((deltaSeconds: number) => {
      if (deltaSeconds >= 1) {
        complete?.();
      }
    }),
    destroy: vi.fn(),
    pause: vi.fn(),
    onPlaybackComplete: vi.fn((listener: () => void) => {
      complete = listener;
      return vi.fn(() => {
        complete = null;
      });
    }),
  };
  const factory = vi.fn((options) => {
    const player: VniSymbolAniPlayer = {
      init: calls.init.bind({ container: options.container }),
      playRange: calls.playRange,
      update: calls.update,
      destroy: calls.destroy,
      pause: calls.pause,
      onPlaybackComplete: calls.onPlaybackComplete,
    };
    return player;
  });
  return { factory, calls };
}

describe("VniSymbolAni", () => {
  it("waits for async init, refreshes the canvas texture and reports completion once", async () => {
    const context = createContext();
    const document = createDocument();
    const { factory, calls } = createPlayerFactory();
    const ani = new VniSymbolAni({
      context,
      resource: createResource(),
      playerFactory: factory,
      documentFactory: () => document,
    });

    ani.reset();

    expect(ani.update(0.2).onceCompleted).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(context.baseLayer.visible).toBe(false);
    expect(context.overlayLayer.children).toHaveLength(1);
    expect(calls.playRange).toHaveBeenCalledWith({
      range: { unit: "time", start: 0, end: 2 },
      loop: false,
    });

    expect(ani.update(0.4).onceCompleted).toBe(false);
    expect(pixiMock.sourceUpdates.at(-1)).toHaveBeenCalled();
    const completed = ani.update(1);
    expect(completed.onceCompleted).toBe(true);
    expect(ani.update(1).onceCompleted).toBe(false);
  });

  it("destroys player, hidden container and overlay sprite idempotently", async () => {
    const context = createContext();
    const document = createDocument();
    const { factory, calls } = createPlayerFactory();
    const ani = new VniSymbolAni({
      context,
      resource: createResource(),
      playerFactory: factory,
      documentFactory: () => document,
    });

    ani.reset();
    await Promise.resolve();
    await Promise.resolve();
    expect(document.bodyChildren).toHaveLength(1);
    expect(context.overlayLayer.children).toHaveLength(1);

    ani.destroy();
    ani.destroy();

    expect(calls.pause).toHaveBeenCalledTimes(1);
    expect(calls.destroy).toHaveBeenCalledTimes(1);
    expect(document.bodyChildren).toHaveLength(0);
    expect(context.overlayLayer.children).toHaveLength(0);
  });

  it("uses fallback resolver for symbols without manifest VNI resources", () => {
    const fallback = vi.fn((context: SymbolAnimationContext) => ({
      stateId: context.resolvedState,
      playback: context.state.playback,
      reset: vi.fn(),
      update: vi.fn(() => ({ loopCompleted: false, onceCompleted: true })),
    }));
    const resolver = createSymbolVniAnimationResolver({
      resources: { L1: { win: createResource() } },
      fallback,
      playerFactory: createPlayerFactory().factory,
      documentFactory: () => createDocument(),
    });

    expect(resolver(createContext())).toBeInstanceOf(VniSymbolAni);
    expect(
      resolver({
        ...createContext(),
        symbol: "H1",
      }).stateId,
    ).toBe("win");
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
