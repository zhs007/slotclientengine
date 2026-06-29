import { describe, expect, it, vi } from "vitest";
import { Assets, Container, Texture } from "pixi.js";
import type { GameLogic, SceneMatrix } from "@slotclientengine/gameframeworks";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import {
  GAME003_DEFAULT_SCENE,
  GAME003_SPIN_SCENE,
} from "./fixtures/game003-gmi.js";
import {
  createGame003Adapter,
  type Game003AdapterOptions,
  type Game003StaticTextures,
} from "../src/game-adapter.js";
import type { Game003ReelRuntime } from "../src/game-demo.js";
import { createGame003ReelLayout } from "../src/game-layout.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 adapter", () => {
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
        defaultScene: GAME003_DEFAULT_SCENE,
      }),
    ).toThrow(/not mounted/);
    expect(() => adapter.playSpin(createLogic(GAME003_SPIN_SCENE))).toThrow(
      /not mounted/,
    );

    await adapter.mount(createMountContext());
    await expect(adapter.mount(createMountContext())).rejects.toThrow(
      /already mounted/,
    );
  });

  it("mounts Pixi canvas, applies default scene, and keeps live untouched on resize", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const context = createMountContext({ width: 1174, height: 2000 });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });

    await adapter.mount(context);

    expect(fakeApp.initOptions).toEqual({
      width: 1174,
      height: 2000,
      antialias: true,
      autoDensity: false,
      resolution: 1,
    });
    expect([...context.gameLayer.children]).toEqual([fakeApp.canvas]);
    expect(fakeApp.stage.children).toHaveLength(1);
    expect(fakeApp.resizeCalls).toEqual([[1174, 2000]]);
    expect(runtime.layoutCalls.at(-1)).toMatchObject({
      x: 157,
      y: 793.5,
    });

    adapter.applyInitialState?.({ userInfo: {}, balance: 100 });
    expect(runtime.appliedScenes).toEqual([]);
    adapter.applyInitialState?.({
      userInfo: {},
      balance: 100,
      defaultScene: GAME003_DEFAULT_SCENE,
    });
    expect(runtime.appliedScenes).toEqual([GAME003_DEFAULT_SCENE]);

    context.emitViewport({ width: 1600, height: 1000 });
    expect(fakeApp.resizeCalls.at(-1)).toEqual([1600, 1000]);
    expect(runtime.layoutCalls.at(-1)).toMatchObject({
      x: 717,
      y: 675,
    });
    expect(fakeApp.stage.children).toHaveLength(1);
  });

  it("default loaders validate static texture sizes and load symbol state textures", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const loadSpy = vi
      .spyOn(Assets, "load")
      .mockImplementation(async (url: unknown) => {
        return createTextureForUrl(String(url)) as never;
      });
    const adapter = createGame003Adapter({
      skin: getGame003SkinConfig("1"),
      createApplication: () => fakeApp.app,
      createRuntime: () => runtime.asRuntime(),
    });

    await adapter.mount(createMountContext());

    expect(loadSpy.mock.calls.length).toBeGreaterThanOrEqual(47);
    expect(runtime.layoutCalls).toHaveLength(2);
    loadSpy.mockRestore();
  });

  it("default static loader fails when a scene texture size drifts", async () => {
    const fakeApp = createFakeApplication();
    const loadSpy = vi
      .spyOn(Assets, "load")
      .mockImplementation(async (url: unknown) => {
        if (String(url).includes("bg2")) {
          return createSizedTexture(100, 100) as never;
        }
        return createTextureForUrl(String(url)) as never;
      });
    const adapter = createGame003Adapter({
      skin: getGame003SkinConfig("1"),
      createApplication: () => fakeApp.app,
      createRuntime: () => new FakeRuntime().asRuntime(),
    });

    await expect(adapter.mount(createMountContext())).rejects.toThrow(
      /bg2\.jpg size/,
    );
    loadSpy.mockRestore();
  });

  it("resolves playSpin only after runtime completion and caps large ticker deltas", async () => {
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
      adapter.playSpin(createLogic(GAME003_SPIN_SCENE)),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(runtime.spinTargets).toEqual([GAME003_SPIN_SCENE]);

    fakeApp.tick(5_000);
    await Promise.resolve();
    expect(runtime.updateDeltas[0]).toBeCloseTo(1 / 30);
    expect(resolved).toBe(false);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
    expect(runtime.currentScene).toEqual(GAME003_SPIN_SCENE);
  });

  it("rejects playSpin errors, visual mismatches, and destroy removes listeners", async () => {
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

    const first = adapter.playSpin(createLogic(GAME003_SPIN_SCENE));
    expect(() => adapter.playSpin(createLogic(GAME003_SPIN_SCENE))).toThrow(
      /already in progress/,
    );
    runtime.updateError = new Error("runtime exploded");
    fakeApp.tick(16);
    await expect(first).rejects.toThrow(/runtime exploded/);
    expect(fakeApp.stopped).toBe(true);

    const mismatchRuntime = new FakeRuntime();
    mismatchRuntime.forceVisualScene = GAME003_DEFAULT_SCENE;
    const mismatchApp = createFakeApplication();
    const mismatchAdapter = createTestAdapter({
      createApplication: () => mismatchApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => mismatchRuntime.asRuntime(),
    });
    await mismatchAdapter.mount(createMountContext());
    const pending = mismatchAdapter.playSpin(createLogic(GAME003_SPIN_SCENE));
    mismatchRuntime.completeNextUpdate = true;
    mismatchApp.tick(16);
    await expect(pending).rejects.toThrow(/does not match/);

    const destroyRuntime = new FakeRuntime();
    const destroyApp = createFakeApplication();
    const destroyContext = createMountContext();
    const destroyAdapter = createTestAdapter({
      createApplication: () => destroyApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => destroyRuntime.asRuntime(),
    });
    await destroyAdapter.mount(destroyContext);
    const destroyPending = destroyAdapter.playSpin(
      createLogic(GAME003_SPIN_SCENE),
    );
    destroyAdapter.destroy?.();
    await expect(destroyPending).rejects.toThrow(/destroyed/);
    expect(destroyContext.gameLayer.children).toHaveLength(0);
    const resizeCount = destroyApp.resizeCalls.length;
    destroyContext.emitViewport({ width: 1600, height: 1000 });
    expect(destroyApp.resizeCalls).toHaveLength(resizeCount);
  });
});

function createTestAdapter(options: Omit<Game003AdapterOptions, "skin">) {
  return createGame003Adapter({
    skin: getGame003SkinConfig("1"),
    ...options,
  });
}

function createMountContext(
  initialFrameDesignSize: {
    readonly width: number;
    readonly height: number;
  } = {
    width: 1174,
    height: 2000,
  },
) {
  const frame = document.createElement("div");
  const gameLayer = document.createElement("div");
  const overlay = document.createElement("div");
  type TestViewportSnapshot = ReturnType<typeof createViewportSnapshot>;
  let viewport: TestViewportSnapshot = createViewportSnapshot(
    initialFrameDesignSize,
  );
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
      betOption: { bet: 5, lines: 10, times: 1 },
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

async function loadFakeStaticTextures(): Promise<Game003StaticTextures> {
  return {
    landscapeBackground: Texture.EMPTY,
    portraitBackground: Texture.EMPTY,
    mainReelBackground: Texture.EMPTY,
    landscapeConveyor: Texture.EMPTY,
    portraitConveyor: Texture.EMPTY,
  };
}

function createTextureForUrl(url: string): Texture {
  if (url.includes("bg1")) {
    return createSizedTexture(2000, 2000);
  }
  if (url.includes("bg2")) {
    return createSizedTexture(1174, 2000);
  }
  if (url.includes("mainreelbg")) {
    return createSizedTexture(1130, 824);
  }
  if (url.includes("conveyor1")) {
    return createSizedTexture(284, 775);
  }
  if (url.includes("conveyor2")) {
    return createSizedTexture(934, 227);
  }
  return createSizedTexture(172, 130);
}

function createSizedTexture(width: number, height: number): Texture {
  const texture = new Texture({ source: Texture.WHITE.source });
  Object.defineProperty(texture, "width", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(texture, "height", {
    configurable: true,
    value: height,
  });
  return texture;
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
  readonly layoutCalls: unknown[] = [];
  currentScene: SceneMatrix | null = null;
  targetScene: SceneMatrix | null = null;
  completeNextUpdate = false;
  updateError: Error | null = null;
  spinning = false;
  forceVisualScene: SceneMatrix | null = null;
  readonly updateDeltas: number[] = [];

  asRuntime(): Game003ReelRuntime {
    return {
      mainReelsLayer: this.mainReelsLayer,
      applyScene: (scene: SceneMatrix) => {
        this.appliedScenes.push(scene);
        this.currentScene = scene;
        this.mainReelsLayer.visible = true;
        return [0, 0, 0, 0, 0];
      },
      spinToScene: (scene: SceneMatrix) => {
        if (this.spinning) {
          throw new Error("game003 reels are already spinning.");
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
            startedAxes: [0],
            stoppedAxes: [],
          };
        }
        this.currentScene = this.targetScene;
        this.targetScene = null;
        this.spinning = false;
        this.mainReelsLayer.visible = true;
        return {
          completed: true,
          spinning: false,
          startedAxes: [0, 1, 2, 3, 4],
          stoppedAxes: [0, 1, 2, 3, 4],
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
          ],
          reelCount: 5,
          layerX: 0,
          layerY: 0,
        };
      },
      applyLayout: (layout: unknown) => {
        this.layoutCalls.push(layout);
      },
      config: {} as any,
      gameConfig: {} as any,
      layout: createGame003ReelLayout(),
      layerLayout: {} as any,
      getCurrentScene: () => this.currentScene,
      getTargetScene: () => this.targetScene,
      getFinalYs: () => [0, 0, 0, 0, 0],
      createSpinPlan: () => ({}) as any,
    };
  }
}
