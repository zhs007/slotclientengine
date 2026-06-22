import { describe, expect, it } from "vitest";
import { Container, Texture } from "pixi.js";
import type { GameLogic, SceneMatrix } from "@slotclientengine/gameframeworks";
import { createGame001Adapter } from "../src/game-adapter.js";
import type { Game001ReelRuntime } from "../src/game-demo.js";

const INITIAL_SCENE: SceneMatrix = Object.freeze([
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([0, 4, 0, 5, 0]),
  Object.freeze([1, 1, 1, 1, 1]),
  Object.freeze([9, 0, 6, 0, 6]),
]);

const TARGET_SCENE: SceneMatrix = Object.freeze([
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([0, 4, 0, 5, 0]),
  Object.freeze([1, 1, 2, 1, 1]),
  Object.freeze([9, 0, 6, 0, 6]),
]);

describe("game001 adapter", () => {
  it("mounts Pixi canvas into the framework game layer and applies live defaultScene only when present", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const context = createMountContext();
    const adapter = createGame001Adapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });

    await adapter.mount(context);

    expect([...context.gameLayer.children]).toEqual([fakeApp.canvas]);
    expect(fakeApp.stage.children).toHaveLength(5);
    adapter.applyInitialState?.({ userInfo: {}, balance: 100 });
    expect(runtime.appliedScenes).toEqual([]);

    adapter.applyInitialState?.({
      userInfo: {},
      balance: 100,
      defaultScene: INITIAL_SCENE,
    });
    expect(runtime.appliedScenes).toEqual([INITIAL_SCENE]);
  });

  it("resolves playSpin only after the runtime reports animation completion", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createGame001Adapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(createLogic(TARGET_SCENE)),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(runtime.spinTargets).toEqual([TARGET_SCENE]);

    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
    expect(runtime.currentScene).toEqual(TARGET_SCENE);
  });

  it("rejects playSpin on runtime errors and prevents concurrent adapter animations", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createGame001Adapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const first = adapter.playSpin(createLogic(TARGET_SCENE));
    expect(() => adapter.playSpin(createLogic(TARGET_SCENE))).toThrow(
      /already in progress/,
    );

    runtime.updateError = new Error("runtime exploded");
    fakeApp.tick(16);

    await expect(first).rejects.toThrow(/runtime exploded/);
    expect(fakeApp.stopped).toBe(true);
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
      betOption: { bet: 10, lines: 10, times: 1 },
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
  const state = {
    stopped: false,
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
    async init() {
      return undefined;
    },
    destroy() {
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
    logo: Texture.EMPTY,
    mainReelsBackground: Texture.EMPTY,
    secondaryReelsBackground: Texture.EMPTY,
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

  asRuntime() {
    return {
      mainReelsLayer: this.mainReelsLayer,
      applyScene: (scene: SceneMatrix) => {
        this.appliedScenes.push(scene);
        this.currentScene = scene;
        return [0, 0, 0, 0, 0];
      },
      spinToScene: (scene: SceneMatrix) => {
        if (this.spinning) {
          throw new Error("game001 reels are already spinning.");
        }
        this.spinTargets.push(scene);
        this.targetScene = scene;
        this.spinning = true;
        return {};
      },
      update: () => {
        if (this.updateError) {
          throw this.updateError;
        }
        if (!this.completeNextUpdate || !this.targetScene) {
          return {
            completed: false,
            spinning: true,
            startedAxes: [0, 1, 2, 4],
            stoppedAxes: [],
          };
        }
        this.currentScene = this.targetScene;
        this.targetScene = null;
        this.spinning = false;
        return {
          completed: true,
          spinning: false,
          startedAxes: [0, 1, 2, 4],
          stoppedAxes: [0, 1, 2, 4],
        };
      },
      isSpinning: () => this.spinning,
      getVisualSnapshot: () => {
        const scene = this.currentScene;
        if (!scene) {
          throw new Error("fake runtime has no current scene.");
        }
        return {
          visible: true,
          spinning: false,
          normalAxisIndexes: [0, 1, 2, 4],
          startedNormalAxes: [0, 1, 2, 4],
          stoppedNormalAxes: [0, 1, 2, 4],
          normalVisibleScene: [scene[0], scene[1], scene[2], scene[4]],
          normalRequestedStates: [
            ["normal"],
            ["normal"],
            ["normal"],
            ["normal"],
          ],
          lockedAxis: {
            xIndex: 3,
            sceneY: 2,
            code: scene[3][2],
            symbol: "S0",
            x: 0,
            y: 0,
            rotation: 0,
            requestedState: "normal",
            visibleSymbolCount: 1,
          },
        };
      },
    } as unknown as Game001ReelRuntime;
  }
}
