import { describe, expect, it } from "vitest";
import { Container, Texture } from "pixi.js";
import type { GameLogic, SceneMatrix } from "@slotclientengine/gameframeworks";
import {
  GAME002_SAMPLE_DEFAULT_SCENE,
  GAME002_SAMPLE_SPIN_SCENE,
} from "./fixtures/game002-gmi.js";
import { createGame002Adapter } from "../src/game-adapter.js";
import type { Game002ReelRuntime } from "../src/game-demo.js";

describe("game002 adapter", () => {
  it("fails clearly before mount and when mounting twice", async () => {
    const fakeApp = createFakeApplication();
    const adapter = createGame002Adapter({
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
    const adapter = createGame002Adapter({
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
    expect(fakeApp.stage.children).toHaveLength(2);
    adapter.applyInitialState?.({ userInfo: {}, balance: 100 });
    expect(runtime.appliedScenes).toEqual([]);

    adapter.applyInitialState?.({
      userInfo: {},
      balance: 100,
      defaultScene: GAME002_SAMPLE_DEFAULT_SCENE,
    });
    expect(runtime.appliedScenes).toEqual([GAME002_SAMPLE_DEFAULT_SCENE]);
  });

  it("resolves playSpin only after runtime completion and visual scene verification", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createGame002Adapter({
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

  it("rejects playSpin on runtime errors and prevents concurrent animations", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createGame002Adapter({
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
    const adapter = createGame002Adapter({
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
    const adapter = createGame002Adapter({
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
  });
});

function createMountContext() {
  const frame = document.createElement("div");
  const gameLayer = document.createElement("div");
  const overlay = document.createElement("div");
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
  } = {
    stopped: false,
    destroyed: false,
    initOptions: null,
  };
  const app = {
    canvas,
    stage,
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
    tick(deltaMS: number) {
      for (const listener of listeners) {
        listener({ deltaMS });
      }
    },
  };
}

async function loadFakeStaticTextures() {
  return {
    background: Texture.EMPTY,
  };
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
      update: () => {
        if (this.updateError) {
          throw this.updateError;
        }
        if (!this.completeNextUpdate || !this.targetScene) {
          return {
            completed: false,
            spinning: true,
            startedAxes: [0, 1, 2, 3, 4, 5],
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
          startedAxes: [0, 1, 2, 3, 4, 5],
          stoppedAxes: [0, 1, 2, 3, 4, 5],
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
          layerX: 200,
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
