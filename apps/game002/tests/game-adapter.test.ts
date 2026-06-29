import { describe, expect, it } from "vitest";
import { Container, Texture } from "pixi.js";
import type { GameLogic, SceneMatrix } from "@slotclientengine/gameframeworks";
import {
  RenderSymbol,
  type SymbolAssetMap,
} from "@slotclientengine/rendercore";
import { createTextureSet } from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  GAME002_SAMPLE_DEFAULT_SCENE,
  GAME002_SAMPLE_SPIN_SCENE,
} from "./fixtures/game002-gmi.js";
import {
  createGame002Adapter,
  type Game002AdapterOptions,
} from "../src/game-adapter.js";
import type { Game002ReelRuntime } from "../src/game-demo.js";
import {
  GAME002_SKIN1_DISPLAY_SYMBOLS,
  getGame002SkinConfig,
} from "../src/skin-config.js";

describe("game002 adapter", () => {
  it("fails clearly before mount and when mounting twice", async () => {
    const fakeApp = createFakeApplication();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => new FakeRuntime().asRuntime(),
    });

    expect(() =>
      adapter.applyInitialState?.({
        userInfo: {},
        balance: 100,
        defaultScene: GAME002_SAMPLE_DEFAULT_SCENE,
      }),
    ).toThrow(/not mounted/);
    expect(() =>
      adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE)),
    ).toThrow(/not mounted/);

    await adapter.mount(createMountContext());
    await expect(adapter.mount(createMountContext())).rejects.toThrow(
      /already mounted/,
    );
  });

  it("mounts Pixi canvas and applies live defaultScene only when present", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const context = createMountContext();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });

    await adapter.mount(context);

    expect(fakeApp.initOptions).toEqual({
      width: 1125,
      height: 2000,
      antialias: true,
      autoDensity: false,
      resolution: 1,
    });
    expect([...context.gameLayer.children]).toEqual([fakeApp.canvas]);
    expect(fakeApp.stage.children).toHaveLength(1);
    expect(fakeApp.resizeCalls).toEqual([[1125, 2000]]);
    expect(fakeApp.stage.children[0]?.position).toMatchObject({
      x: -437.5,
      y: -0,
    });
    adapter.applyInitialState?.({ userInfo: {}, balance: 100 });
    expect(runtime.appliedScenes).toEqual([]);

    adapter.applyInitialState?.({
      userInfo: {},
      balance: 100,
      defaultScene: GAME002_SAMPLE_DEFAULT_SCENE,
    });
    expect(runtime.appliedScenes).toEqual([GAME002_SAMPLE_DEFAULT_SCENE]);
  });

  it("passes the selected skin symbol scale map into the default runtime", async () => {
    const fakeApp = createFakeApplication();
    const adapter = createGame002Adapter({
      skin: getGame002SkinConfig("1"),
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () =>
        createSymbolTextures(GAME002_SKIN1_DISPLAY_SYMBOLS),
    });

    await adapter.mount(createMountContext());
    adapter.applyInitialState?.({
      userInfo: {},
      balance: 100,
      defaultScene: GAME002_SAMPLE_DEFAULT_SCENE,
    });

    const renderSymbols = collectRenderSymbols(fakeApp.stage);
    expect(renderSymbols.length).toBeGreaterThan(0);
    expect(new Set(renderSymbols.map((symbol) => symbol.scale.x))).toEqual(
      new Set([0.8]),
    );
    expect(new Set(renderSymbols.map((symbol) => symbol.scale.y))).toEqual(
      new Set([0.8]),
    );
  });

  it("resizes Pixi backing size and moves the art world on viewport changes", async () => {
    const fakeApp = createFakeApplication();
    const context = createMountContext();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => new FakeRuntime().asRuntime(),
    });

    await adapter.mount(context);
    context.emitViewport({ width: 1200, height: 1200 });
    expect(fakeApp.resizeCalls).toEqual([
      [1125, 2000],
      [1200, 1200],
    ]);
    expect(fakeApp.stage.children[0]?.position).toMatchObject({
      x: -397.5,
      y: -270,
    });

    context.emitViewport({ width: 2000, height: 1200 });
    expect(fakeApp.resizeCalls.at(-1)).toEqual([2000, 1200]);
    expect(fakeApp.stage.children[0]?.position).toMatchObject({
      x: -0,
      y: -270,
    });
  });

  it("uses the selected skin focus region instead of the board frame on resize", async () => {
    const fakeApp = createFakeApplication();
    const context = createMountContext();
    const skin = {
      ...getGame002SkinConfig("2"),
      focusRegion: Object.freeze({
        x: 760,
        y: 210,
        width: 480,
        height: 600,
      }),
    };
    const adapter = createGame002Adapter({
      skin,
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => new FakeRuntime().asRuntime(),
    });

    await adapter.mount(context);
    context.emitViewport({ width: 1200, height: 1200 });

    expect(fakeApp.resizeCalls.at(-1)).toEqual([1200, 1200]);
    expect(fakeApp.stage.children[0]?.position).toMatchObject({
      x: -400,
      y: -0,
    });
  });

  it("resolves playSpin only after runtime completion and visual scene verification", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE)),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(runtime.spinTargets).toEqual([GAME002_SAMPLE_SPIN_SCENE]);

    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
    expect(runtime.currentScene).toEqual(GAME002_SAMPLE_SPIN_SCENE);
  });

  it("caps oversized ticker deltas so grid-cell spin stays visible after resize", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE)),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    fakeApp.tick(5_000);
    await Promise.resolve();

    expect(runtime.updateDeltas).toHaveLength(1);
    expect(runtime.updateDeltas[0]).toBeCloseTo(1 / 30);
    expect(runtime.spinning).toBe(true);
    expect(resolved).toBe(false);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
  });

  it("rejects playSpin on runtime errors and prevents concurrent animations", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const first = adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE));
    expect(() =>
      adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE)),
    ).toThrow(/already in progress/);

    runtime.updateError = new Error("runtime exploded");
    fakeApp.tick(16);

    await expect(first).rejects.toThrow(/runtime exploded/);
    expect(fakeApp.stopped).toBe(true);
  });

  it("rejects when the completed visual scene does not match the target", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    runtime.forceVisualScene = GAME002_SAMPLE_DEFAULT_SCENE;
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const pending = adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE));
    runtime.completeNextUpdate = true;
    fakeApp.tick(16);

    await expect(pending).rejects.toThrow(/does not match/);
    expect(fakeApp.stopped).toBe(true);
  });

  it("destroy rejects pending animation and removes the canvas", async () => {
    const fakeApp = createFakeApplication();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => new FakeRuntime().asRuntime(),
    });
    const context = createMountContext();
    await adapter.mount(context);

    const pending = adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE));
    adapter.destroy?.();

    await expect(pending).rejects.toThrow(/destroyed/);
    expect(context.gameLayer.children).toHaveLength(0);
    expect(fakeApp.stopped).toBe(true);
    expect(fakeApp.destroyed).toBe(true);
    const resizeCount = fakeApp.resizeCalls.length;
    context.emitViewport({ width: 1200, height: 1200 });
    expect(fakeApp.resizeCalls).toHaveLength(resizeCount);
  });
});

function createTestAdapter(options: Omit<Game002AdapterOptions, "skin">) {
  return createGame002Adapter({
    skin: getGame002SkinConfig("2"),
    ...options,
  });
}

function createMountContext() {
  const frame = document.createElement("div");
  const gameLayer = document.createElement("div");
  const overlay = document.createElement("div");
  type TestViewportSnapshot = ReturnType<typeof createViewportSnapshot>;
  let viewport: TestViewportSnapshot = createViewportSnapshot({
    width: 1125,
    height: 2000,
  });
  const viewportListeners = new Set<(next: TestViewportSnapshot) => void>();
  return {
    frame,
    gameLayer,
    overlay,
    getState: () => ({
      connected: false,
      spinState: "connecting" as const,
      balance: null,
      win: 0,
      betIndex: 0,
      betOption: { bet: 5, lines: 30, times: 1 },
      muted: false,
      fastMode: false,
      autoMode: false,
      error: null,
    }),
    getViewport: () => viewport,
    onViewportChange: (listener: (next: TestViewportSnapshot) => void) => {
      viewportListeners.add(listener);
      return () => {
        viewportListeners.delete(listener);
      };
    },
    emitViewport: (frameDesignSize: {
      readonly width: number;
      readonly height: number;
    }) => {
      viewport = createViewportSnapshot(frameDesignSize);
      for (const listener of viewportListeners) {
        listener(viewport);
      }
    },
  };
}

function createFakeApplication() {
  const listeners = new Set<(ticker: { readonly deltaMS: number }) => void>();
  const canvas = document.createElement("canvas");
  const stage = new Container();
  const state: {
    stopped: boolean;
    destroyed: boolean;
    initOptions: unknown;
    resizeCalls: number[][];
  } = {
    stopped: false,
    destroyed: false,
    initOptions: null,
    resizeCalls: [],
  };
  const app = {
    canvas,
    stage,
    renderer: {
      resize(width: number, height: number) {
        state.resizeCalls.push([width, height]);
      },
    },
    ticker: {
      add(listener: (ticker: { readonly deltaMS: number }) => void) {
        listeners.add(listener);
      },
      remove(listener: (ticker: { readonly deltaMS: number }) => void) {
        listeners.delete(listener);
      },
      stop() {
        state.stopped = true;
      },
    },
    async init(options: unknown) {
      state.initOptions = options;
      return undefined;
    },
    destroy() {
      state.destroyed = true;
      return undefined;
    },
  };

  return {
    app,
    canvas,
    stage,
    get stopped() {
      return state.stopped;
    },
    get destroyed() {
      return state.destroyed;
    },
    get initOptions() {
      return state.initOptions;
    },
    get resizeCalls() {
      return state.resizeCalls;
    },
    tick(deltaMS: number) {
      for (const listener of listeners) {
        listener({ deltaMS });
      }
    },
  };
}

function createViewportSnapshot(frameDesignSize: {
  readonly width: number;
  readonly height: number;
}) {
  return {
    pageSize: frameDesignSize,
    frameDesignSize,
    scale: 1,
    cssSize: frameDesignSize,
    offsetX: 0,
    offsetY: 0,
  };
}

async function loadFakeStaticTextures() {
  return {
    background: Texture.EMPTY,
  };
}

function createSymbolTextures(symbols: readonly string[]): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      symbols.map((symbol) => [symbol, createTextureSet(200, 200)]),
    ),
  );
}

function collectRenderSymbols(root: unknown): RenderSymbol[] {
  const found: RenderSymbol[] = [];
  const visit = (node: unknown) => {
    if (node instanceof RenderSymbol) {
      found.push(node);
    }
    if (
      typeof node === "object" &&
      node !== null &&
      "children" in node &&
      Array.isArray(node.children)
    ) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(root);
  return found;
}

function createLogic(scene: SceneMatrix): GameLogic {
  return {
    getStep: () => ({
      getScene: () => scene,
    }),
  } as unknown as GameLogic;
}

class FakeRuntime {
  readonly mainReelsLayer = new Container();
  readonly appliedScenes: SceneMatrix[] = [];
  readonly spinTargets: SceneMatrix[] = [];
  currentScene: SceneMatrix | null = null;
  targetScene: SceneMatrix | null = null;
  completeNextUpdate = false;
  updateError: Error | null = null;
  spinning = false;
  forceVisualScene: SceneMatrix | null = null;
  readonly updateDeltas: number[] = [];

  asRuntime(): Game002ReelRuntime {
    return {
      mainReelsLayer: this.mainReelsLayer,
      applyScene: (scene: SceneMatrix) => {
        this.appliedScenes.push(scene);
        this.currentScene = scene;
        this.mainReelsLayer.visible = true;
        return [61, 26, 12, 4, 19, 2];
      },
      spinToScene: (scene: SceneMatrix) => {
        if (this.spinning) {
          throw new Error("game002 reels are already spinning.");
        }
        this.spinTargets.push(scene);
        this.targetScene = scene;
        this.spinning = true;
        return {} as any;
      },
      update: (deltaSeconds: number) => {
        this.updateDeltas.push(deltaSeconds);
        if (this.updateError) {
          throw this.updateError;
        }
        if (!this.completeNextUpdate || !this.targetScene) {
          return {
            completed: false,
            spinning: true,
            startedCells: [{ x: 0, y: 0, orderIndex: 0 }],
            landedCells: [],
          };
        }
        this.currentScene = this.targetScene;
        this.targetScene = null;
        this.spinning = false;
        this.mainReelsLayer.visible = true;
        return {
          completed: true,
          spinning: false,
          startedCells: [{ x: 0, y: 0, orderIndex: 0 }],
          landedCells: [{ x: 0, y: 0, orderIndex: 0 }],
        };
      },
      isSpinning: () => this.spinning,
      getVisualSnapshot: () => {
        const scene = this.forceVisualScene ?? this.currentScene;
        if (!scene) {
          throw new Error("fake runtime has no current scene.");
        }
        return {
          visible: true,
          spinning: this.spinning,
          visibleScene: scene,
          requestedStates: [
            ["normal"],
            ["normal"],
            ["normal"],
            ["normal"],
            ["normal"],
            ["normal"],
          ],
          reelCount: 6,
          gridCellCount: 54,
          layerX: 637.5,
          layerY: 330,
        };
      },
      config: {} as any,
      gameConfig: {} as any,
      layout: {} as any,
      layerLayout: {} as any,
      getCurrentScene: () => this.currentScene,
      getTargetScene: () => this.targetScene,
      getFinalYs: () => [61, 26, 12, 4, 19, 2],
      createSpinPlan: () => ({}) as any,
    };
  }
}
