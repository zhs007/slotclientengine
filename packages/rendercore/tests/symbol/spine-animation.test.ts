import { beforeEach, describe, expect, it, vi } from "vitest";

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
    source = {};

    constructor(readonly options?: unknown) {}
  }

  class MockSprite extends MockContainer {
    constructor(public texture: MockTexture) {
      super();
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
    MockMatrix,
    MockRectangle,
    MockSprite,
    MockTexture,
  };
});

const spineRuntimeMock = vi.hoisted(() => ({
  animationNames: ["Idle", "Start"] as string[],
  atlasPageName: "Symbol.png",
  atlasPageSetTexture: vi.fn(),
  spineTextureFrom: vi.fn((source: unknown) => ({ source })),
  spineUpdate: vi.fn(),
}));

vi.mock("pixi.js", () => ({
  Assets: {
    load: pixiMock.assetsLoad,
  },
  Container: pixiMock.MockContainer,
  Matrix: pixiMock.MockMatrix,
  Rectangle: pixiMock.MockRectangle,
  Sprite: pixiMock.MockSprite,
  Texture: pixiMock.MockTexture,
}));

vi.mock("@esotericsoftware/spine-pixi-v8", () => {
  class MockAtlasAttachmentLoader {
    constructor(readonly atlas: unknown) {}
  }

  class MockSkeletonJson {
    constructor(readonly loader: unknown) {}

    readSkeletonData(skeleton: unknown): unknown {
      return {
        skeleton,
        animations: spineRuntimeMock.animationNames.map((name) => ({ name })),
        findAnimation: (name: string) =>
          spineRuntimeMock.animationNames.includes(name) ? { name } : null,
      };
    }
  }

  class MockSpine extends pixiMock.MockContainer {
    autoUpdate = true;
    skeleton: {
      data: {
        findAnimation(name: string): { readonly name: string } | null;
      };
      setupPose: ReturnType<typeof vi.fn>;
    };
    state: {
      clearTracks: ReturnType<typeof vi.fn>;
      clearListeners: ReturnType<typeof vi.fn>;
      setAnimation: ReturnType<typeof vi.fn>;
    };
    #entry: {
      readonly loop: boolean;
      listener?: {
        complete?(entry: unknown): void;
      };
    } | null = null;

    constructor(options: {
      readonly skeletonData: MockSpine["skeleton"]["data"];
    }) {
      super();
      this.skeleton = {
        data: options.skeletonData,
        setupPose: vi.fn(),
      };
      this.state = {
        clearTracks: vi.fn(() => {
          this.#entry = null;
        }),
        clearListeners: vi.fn(() => {
          if (this.#entry) {
            this.#entry.listener = undefined;
          }
        }),
        setAnimation: vi.fn(
          (_track: number, _animation: unknown, loop: boolean) => {
            this.#entry = { loop };
            return this.#entry;
          },
        ),
      };
    }

    update(deltaSeconds: number): void {
      spineRuntimeMock.spineUpdate(deltaSeconds);
      if (this.#entry && !this.#entry.loop && deltaSeconds >= 1) {
        this.#entry.listener?.complete?.(this.#entry);
      }
    }
  }

  class MockTextureAtlas {
    pages = [
      {
        name: spineRuntimeMock.atlasPageName,
        setTexture: spineRuntimeMock.atlasPageSetTexture,
      },
    ];

    constructor(readonly atlasText: string) {}
  }

  return {
    AtlasAttachmentLoader: MockAtlasAttachmentLoader,
    SkeletonJson: MockSkeletonJson,
    Spine: MockSpine,
    SpineTexture: {
      from: spineRuntimeMock.spineTextureFrom,
    },
    TextureAtlas: MockTextureAtlas,
  };
});

import { Container, Sprite, Texture } from "pixi.js";
import {
  SpineSymbolAni,
  createSymbolSpineAnimationResolver,
  type RendercoreSpineSymbolPlayer,
  type SpineSymbolAniPlayerFactory,
  type SymbolAnimationContext,
  type SymbolSpineAnimationResource,
} from "../../src/symbol/index.js";

beforeEach(() => {
  vi.clearAllMocks();
  pixiMock.assetsLoad.mockResolvedValue(pixiMock.MockTexture.WHITE);
  spineRuntimeMock.animationNames = ["Idle", "Start", "Win"];
  spineRuntimeMock.atlasPageName = "Symbol.png";
});

function createContext(options: {
  readonly symbol?: string;
  readonly state?: "normal" | "appear" | "win";
}): SymbolAnimationContext {
  const stateId = options.state ?? "appear";
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
    symbol: options.symbol ?? "H1",
    pays: [0],
    requestedState: stateId,
    resolvedState: stateId,
    state: {
      id: stateId,
      phase: stateId === "normal" ? "stable" : "once",
      playback: stateId === "normal" ? "static" : "once",
    },
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

function createResource(
  state: "normal" | "appear" | "win",
): SymbolSpineAnimationResource {
  return {
    symbol: "H1",
    state,
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
        animationName:
          state === "normal" ? "Idle" : state === "win" ? "Win" : "Start",
        loop: state === "normal",
      },
      transform: {
        x: 12,
        y: -8,
        scale: 0.75,
      },
    },
  };
}

function createPlayerFactory(options: { readonly failInit?: boolean } = {}) {
  const view = new Container();
  let completed = false;
  const calls = {
    init: vi.fn(async () => {
      if (options.failInit) {
        throw new Error("init failed");
      }
    }),
    play: vi.fn(() => {
      completed = false;
    }),
    update: vi.fn((deltaSeconds: number) => {
      if (deltaSeconds >= 1) {
        completed = true;
      }
      return { completed };
    }),
    reset: vi.fn(() => {
      completed = false;
    }),
    destroy: vi.fn(() => {
      view.parent?.removeChild(view);
    }),
  };
  const factory: SpineSymbolAniPlayerFactory = vi.fn(() => {
    const player: RendercoreSpineSymbolPlayer = {
      view,
      init: calls.init,
      play: calls.play,
      update: calls.update,
      reset: calls.reset,
      destroy: calls.destroy,
    };
    return player;
  });
  return { factory, calls, view };
}

describe("SpineSymbolAni", () => {
  it("waits for async init, mounts the Spine display tree and reports once completion once", async () => {
    const context = createContext({ state: "appear" });
    const { factory, calls, view } = createPlayerFactory();
    const ani = new SpineSymbolAni({
      context,
      resource: createResource("appear"),
      playerFactory: factory,
    });

    ani.reset();

    expect(ani.update(0.2).onceCompleted).toBe(false);
    await flushSpineInit();
    expect(context.baseLayer.visible).toBe(false);
    expect(context.stateSprite.visible).toBe(false);
    expect(context.overlayLayer.children).toEqual([view]);
    expect(view.position).toMatchObject({ x: 12, y: -8 });
    expect(view.scale).toMatchObject({ x: 0.75, y: 0.75 });
    expect(calls.play).toHaveBeenCalledWith({
      animationName: "Start",
      loop: false,
    });

    expect(ani.update(0.4).onceCompleted).toBe(false);
    expect(ani.update(1).onceCompleted).toBe(true);
    expect(ani.update(1).onceCompleted).toBe(false);
  });

  it("keeps normal Spine states static even when the runtime animation loops", async () => {
    const context = createContext({ state: "normal" });
    const { factory, calls } = createPlayerFactory();
    const ani = new SpineSymbolAni({
      context,
      resource: createResource("normal"),
      playerFactory: factory,
    });

    ani.reset();
    await flushSpineInit();

    expect(ani.playback).toBe("static");
    expect(calls.play).toHaveBeenCalledWith({
      animationName: "Idle",
      loop: true,
    });
    expect(ani.update(1).onceCompleted).toBe(false);
  });

  it("destroys player and mounted Spine viewport idempotently", async () => {
    const context = createContext({ state: "appear" });
    const { factory, calls } = createPlayerFactory();
    const ani = new SpineSymbolAni({
      context,
      resource: createResource("appear"),
      playerFactory: factory,
    });

    ani.reset();
    await flushSpineInit();
    expect(context.overlayLayer.children).toHaveLength(1);

    ani.destroy();
    ani.destroy();

    expect(calls.destroy).toHaveBeenCalledTimes(1);
    expect(context.overlayLayer.children).toHaveLength(0);
  });

  it("reuses one cached Spine player across states until the last owner is destroyed", async () => {
    const normalContext = createContext({ state: "normal" });
    const winContext: SymbolAnimationContext = {
      ...normalContext,
      requestedState: "win",
      resolvedState: "win",
      state: {
        id: "win",
        phase: "once",
        playback: "once",
      },
    };
    const { factory, calls, view } = createPlayerFactory();
    const normalAni = new SpineSymbolAni({
      context: normalContext,
      resource: createResource("normal"),
      playerFactory: factory,
    });
    const winAni = new SpineSymbolAni({
      context: winContext,
      resource: createResource("win"),
      playerFactory: factory,
    });

    normalAni.reset();
    await flushSpineInit();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(calls.play).toHaveBeenLastCalledWith({
      animationName: "Idle",
      loop: true,
    });
    expect(normalContext.overlayLayer.children).toEqual([view]);

    winAni.reset();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(calls.play).toHaveBeenLastCalledWith({
      animationName: "Win",
      loop: false,
    });
    expect(normalContext.overlayLayer.children).toEqual([view]);

    normalAni.destroy();
    expect(calls.destroy).not.toHaveBeenCalled();
    expect(normalContext.overlayLayer.children).toEqual([view]);

    winAni.destroy();
    expect(calls.destroy).toHaveBeenCalledTimes(1);
    expect(normalContext.overlayLayer.children).toHaveLength(0);
    expect(() => winAni.update(0)).toThrow(/was destroyed/);
    expect(() => winAni.reset()).toThrow(/was destroyed/);
  });

  it("surfaces async initialization errors on update", async () => {
    const context = createContext({ state: "appear" });
    const { factory } = createPlayerFactory({ failInit: true });
    const ani = new SpineSymbolAni({
      context,
      resource: createResource("appear"),
      playerFactory: factory,
    });

    ani.reset();
    await flushSpineInit();

    expect(() => ani.update(0.2)).toThrow(/init failed/);
    expect(context.overlayLayer.children).toHaveLength(0);
  });

  it("uses the official Spine runtime adapter by default", async () => {
    const context = createContext({ state: "appear" });
    const ani = new SpineSymbolAni({
      context,
      resource: createResource("appear"),
    });

    ani.reset();
    await flushSpineInit();

    expect(pixiMock.assetsLoad).toHaveBeenCalledWith("/assets/Symbol.png");
    expect(spineRuntimeMock.spineTextureFrom).toHaveBeenCalledWith(
      pixiMock.MockTexture.WHITE.source,
    );
    expect(spineRuntimeMock.atlasPageSetTexture).toHaveBeenCalledTimes(1);
    expect(context.overlayLayer.children).toHaveLength(1);
    expect(ani.update(1).onceCompleted).toBe(true);
    expect(ani.update(1).onceCompleted).toBe(false);

    ani.destroy();
    expect(context.overlayLayer.children).toHaveLength(0);
  });

  it("does not mount the official Spine runtime if destroyed while texture loading is pending", async () => {
    const load = createDeferred<typeof pixiMock.MockTexture.WHITE>();
    pixiMock.assetsLoad.mockReturnValueOnce(load.promise);
    const context = createContext({ state: "appear" });
    const ani = new SpineSymbolAni({
      context,
      resource: createResource("appear"),
    });

    ani.reset();
    ani.destroy();
    load.resolve(pixiMock.MockTexture.WHITE);
    await flushSpineInit();

    expect(context.overlayLayer.children).toHaveLength(0);
  });

  it("surfaces official runtime animation and atlas contract errors", async () => {
    const missingAnimationContext = createContext({ state: "appear" });
    const missingAnimationAni = new SpineSymbolAni({
      context: missingAnimationContext,
      resource: {
        ...createResource("appear"),
        spec: {
          ...createResource("appear").spec,
          playback: {
            mode: "animation",
            animationName: "Missing",
            loop: false,
          },
        },
      },
    });

    missingAnimationAni.reset();
    await flushSpineInit();
    expect(() => missingAnimationAni.update(0)).toThrow(/was not found/);

    spineRuntimeMock.atlasPageName = "Other.png";
    const atlasContext = createContext({ state: "appear" });
    const atlasAni = new SpineSymbolAni({
      context: atlasContext,
      resource: createResource("appear"),
    });

    atlasAni.reset();
    await flushSpineInit();
    expect(() => atlasAni.update(0)).toThrow(/atlas page contract changed/);
  });

  it("uses fallback resolver for symbols without manifest Spine resources", () => {
    const fallback = vi.fn((context: SymbolAnimationContext) => ({
      stateId: context.resolvedState,
      playback: context.state.playback,
      reset: vi.fn(),
      update: vi.fn(() => ({ loopCompleted: false, onceCompleted: true })),
    }));
    const resolver = createSymbolSpineAnimationResolver({
      resources: { H1: { appear: createResource("appear") } },
      fallback,
      playerFactory: createPlayerFactory().factory,
    });

    expect(resolver(createContext({ state: "appear" }))).toBeInstanceOf(
      SpineSymbolAni,
    );
    expect(
      resolver({
        ...createContext({ symbol: "H2", state: "appear" }),
        symbol: "H2",
      }).stateId,
    ).toBe("appear");
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("fails fast when no Spine resource or fallback exists", () => {
    const resolver = createSymbolSpineAnimationResolver({
      resources: {},
    });

    expect(() =>
      resolver(createContext({ symbol: "H9", state: "appear" })),
    ).toThrow(/No Spine symbol animation/);
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function flushSpineInit(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
