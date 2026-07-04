import { describe, expect, it, vi } from "vitest";

const pixiMock = vi.hoisted(() => {
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
    zIndex = 0;
    sortableChildren = false;
    tint = 0xffffff;
    blendMode = "normal";
    position = new MockPoint();
    pivot = new MockPoint();
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

    setFromMatrix(matrix: { readonly tx: number; readonly ty: number }): void {
      this.position.set(matrix.tx, matrix.ty);
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
      this.source = { update };
    }
  }

  class MockSprite extends MockContainer {
    constructor(public texture: MockTexture) {
      super();
    }
  }

  class MockGraphics extends MockContainer {
    rect(): this {
      return this;
    }

    fill(): this {
      return this;
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
    assetsLoad: vi.fn(async () => MockTexture.WHITE),
    MockContainer,
    MockGraphics,
    MockMatrix,
    MockRectangle,
    MockSprite,
    MockTexture,
  };
});

vi.mock("pixi.js", () => ({
  Assets: {
    load: pixiMock.assetsLoad,
  },
  Container: pixiMock.MockContainer,
  Graphics: pixiMock.MockGraphics,
  Matrix: pixiMock.MockMatrix,
  Rectangle: pixiMock.MockRectangle,
  Sprite: pixiMock.MockSprite,
  Texture: pixiMock.MockTexture,
}));

import { Container, Sprite, Texture } from "pixi.js";
import {
  SpineNormalFallbackAni,
  VniSymbolAni,
  createSymbolVniAnimationResolver,
  destroyVniSymbolAnimationCache,
  type RendercoreSpineSymbolPlayer,
  type SymbolAnimationContext,
  type SymbolSpineAnimationResource,
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

function createSpineResource(): SymbolSpineAnimationResource {
  return {
    symbol: "H1",
    state: "normal",
    skeleton: {},
    atlasText:
      "Symbol.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n",
    textureUrl: "/assets/Symbol.png",
    atlasPage: "Symbol.png",
    spec: {
      kind: "spine",
      skeleton: "./H1.json",
      atlas: "./Symbol.atlas",
      texture: "./Symbol.png",
      playback: {
        mode: "animation",
        animationName: "Idle",
        loop: true,
      },
    },
  };
}

function createSpinBlurEquivalentContext(
  spinBlurTexture: Texture,
): SymbolAnimationContext {
  return {
    ...createContext(),
    symbol: "H1",
    requestedState: "spinBlur",
    resolvedState: "normal",
    state: { id: "normal", phase: "stable", playback: "static" },
    stateTextures: { spinBlur: spinBlurTexture },
    requiredStateTextures: ["spinBlur"],
  };
}

function createPlayerFactory() {
  let complete: (() => void) | null = null;
  const root = new pixiMock.MockContainer();
  const calls = {
    init: vi.fn(async function init(this: { readonly parent: Container }) {
      this.parent.addChild(root as unknown as Container);
    }),
    getDisplayObject: vi.fn(() => root as unknown as Container),
    playRange: vi.fn(),
    update: vi.fn((deltaSeconds: number) => {
      if (deltaSeconds >= 1) {
        complete?.();
      }
    }),
    destroy: vi.fn(() => {
      root.parent?.removeChild(root);
    }),
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
      init: calls.init.bind({ parent: options.parent }),
      getDisplayObject: calls.getDisplayObject,
      playRange: calls.playRange,
      update: calls.update,
      destroy: calls.destroy,
      pause: calls.pause,
      onPlaybackComplete: calls.onPlaybackComplete,
    };
    return player;
  });
  return { factory, calls, root };
}

describe("VniSymbolAni", () => {
  it("waits for async init, mounts the VNI display tree and reports completion once", async () => {
    const context = createContext();
    const { factory, calls, root } = createPlayerFactory();
    const ani = new VniSymbolAni({
      context,
      resource: createResource(),
      playerFactory: factory,
    });

    ani.reset();

    expect(ani.update(0.2).onceCompleted).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(context.baseLayer.visible).toBe(false);
    expect(context.overlayLayer.children).toHaveLength(1);
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: expect.any(pixiMock.MockContainer),
        autoTick: false,
      }),
    );
    expect(root.parent).toBe(factory.mock.calls[0]?.[0].parent);
    expect(root.pivot).toMatchObject({ x: 50, y: 50 });
    expect(root.position).toMatchObject({ x: 0, y: 0 });
    expect(calls.playRange).toHaveBeenCalledWith({
      range: { unit: "time", start: 0, end: 2 },
      loop: false,
    });

    expect(ani.update(0.4).onceCompleted).toBe(false);
    const completed = ani.update(1);
    expect(completed.onceCompleted).toBe(true);
    expect(ani.update(1).onceCompleted).toBe(false);
  });

  it("detaches the cached player on ani destroy and releases it with the render symbol cache", async () => {
    const context = createContext();
    const { factory, calls } = createPlayerFactory();
    const ani = new VniSymbolAni({
      context,
      resource: createResource(),
      playerFactory: factory,
    });

    ani.reset();
    await Promise.resolve();
    await Promise.resolve();
    expect(context.overlayLayer.children).toHaveLength(1);

    ani.destroy();
    ani.destroy();

    expect(calls.pause).toHaveBeenCalledTimes(2);
    expect(calls.destroy).not.toHaveBeenCalled();
    expect(context.overlayLayer.children).toHaveLength(0);

    destroyVniSymbolAnimationCache(context.root);

    expect(calls.destroy).toHaveBeenCalledTimes(1);
  });

  it("reuses one cached VNI player for repeated same-resource playback", async () => {
    const context = createContext();
    const { factory, calls } = createPlayerFactory();
    const firstAni = new VniSymbolAni({
      context,
      resource: createResource(),
      playerFactory: factory,
    });
    const secondAni = new VniSymbolAni({
      context,
      resource: createResource(),
      playerFactory: factory,
    });

    firstAni.reset();
    await Promise.resolve();
    await Promise.resolve();
    firstAni.destroy();
    secondAni.reset();
    await Promise.resolve();
    await Promise.resolve();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(calls.playRange).toHaveBeenCalledTimes(2);
    expect(calls.onPlaybackComplete).toHaveBeenCalledTimes(2);
    expect(context.overlayLayer.children).toHaveLength(1);
    expect(secondAni.update(1).onceCompleted).toBe(true);
    expect(secondAni.update(1).onceCompleted).toBe(false);

    secondAni.destroy();
    destroyVniSymbolAnimationCache(context.root);
  });

  it("does not attach stale async init results after destroy", async () => {
    const context = createContext();
    const init = createDeferred<void>();
    const root = new pixiMock.MockContainer();
    const calls = {
      playRange: vi.fn(),
      destroy: vi.fn(() => {
        root.parent?.removeChild(root);
      }),
      pause: vi.fn(),
    };
    const factory = vi.fn((options) => {
      const player: VniSymbolAniPlayer = {
        init: async () => {
          await init.promise;
          options.parent.addChild(root as unknown as Container);
        },
        getDisplayObject: () => root as unknown as Container,
        playRange: calls.playRange,
        update: vi.fn(),
        destroy: calls.destroy,
        pause: calls.pause,
        onPlaybackComplete: vi.fn(() => vi.fn()),
      };
      return player;
    });
    const ani = new VniSymbolAni({
      context,
      resource: createResource(),
      playerFactory: factory,
    });

    ani.reset();
    ani.destroy();
    init.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls.playRange).not.toHaveBeenCalled();
    expect(context.overlayLayer.children).toHaveLength(0);
    destroyVniSymbolAnimationCache(context.root);
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

  it("keeps requested state texture when an equivalent state has a normal Spine resource", () => {
    const spinBlurTexture = new pixiMock.MockTexture() as unknown as Texture;
    const context = createSpinBlurEquivalentContext(spinBlurTexture);
    const spinePlayerFactory = vi.fn();
    const resolver = createSymbolVniAnimationResolver({
      resources: {},
      spineResources: { H1: { normal: createSpineResource() } },
      spinePlayerFactory,
    });

    const ani = resolver(context);
    ani.reset();

    expect(ani.stateId).toBe("normal");
    expect(ani.playback).toBe("static");
    expect(spinePlayerFactory).not.toHaveBeenCalled();
    expect(context.baseLayer.visible).toBe(false);
    expect(context.stateSprite.visible).toBe(true);
    expect(context.stateSprite.texture).toBe(spinBlurTexture);
  });

  it("falls back to normal Spine for missing once states on Spine symbols", async () => {
    const context: SymbolAnimationContext = {
      ...createContext(),
      symbol: "H2",
      requestedState: "appear",
      resolvedState: "appear",
      state: { id: "appear", phase: "once", playback: "once" },
    };
    const view = new pixiMock.MockContainer();
    const playerFactory = vi.fn((): RendercoreSpineSymbolPlayer => {
      let completed = false;
      return {
        view: view as unknown as Container,
        init: vi.fn(),
        play: vi.fn(() => {
          completed = false;
        }),
        update: vi.fn(() => ({ completed })),
        reset: vi.fn(),
        destroy: vi.fn(() => {
          view.parent?.removeChild(view);
        }),
      };
    });
    const fallback = vi.fn();
    const resolver = createSymbolVniAnimationResolver({
      resources: {},
      spineResources: { H2: { normal: createSpineResource() } },
      fallback,
      spinePlayerFactory: playerFactory,
    });

    const ani = resolver(context);

    expect(ani).toBeInstanceOf(SpineNormalFallbackAni);
    expect(ani.playback).toBe("once");
    ani.reset();
    await flushSpineFallbackInit();
    expect(playerFactory).toHaveBeenCalledTimes(1);
    expect(view.parent).toBe(context.overlayLayer);
    expect(fallback).not.toHaveBeenCalled();
    expect(ani.update(1 / 120).onceCompleted).toBe(false);
    expect(ani.update(1 / 60).onceCompleted).toBe(true);
    expect(ani.update(1).onceCompleted).toBe(false);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function flushSpineFallbackInit(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
