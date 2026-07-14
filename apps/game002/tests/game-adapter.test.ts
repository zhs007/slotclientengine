import { describe, expect, it } from "vitest";
import { Container, Texture } from "pixi.js";
import {
  createSlotGameLogicResult,
  type GameLogic,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import {
  RenderSymbol,
  type SymbolAssetMap,
  type SymbolWinCarousel,
  type PreparedSymbolValuePresentation,
  type SymbolValuePresentationItem,
  type SymbolValuePresenter,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import type { SpineBackgroundPlayer } from "@slotclientengine/rendercore/background";
import { createTextureSet } from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  GAME002_SAMPLE_DEFAULT_SCENE,
  GAME002_SAMPLE_SPIN_SCENE,
  GAME002_CN_VALUE_SPIN_RESULT,
} from "./fixtures/game002-gmi.js";
import {
  createGame002Adapter,
  type Game002AdapterOptions,
} from "../src/game-adapter.js";
import type { Game002ReelRuntime } from "../src/game-demo.js";
import { getGame002SkinConfig } from "../src/skin-config.js";

describe("game002 adapter", () => {
  it("fails clearly before mount and when mounting twice", async () => {
    const fakeApp = createFakeApplication();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
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
    const background = new FakeBackgroundPlayer();
    const runtime = new FakeRuntime();
    const context = createMountContext();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createBackgroundPlayer: () => background.asPlayer(),
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
    expect(background.initialized).toBe(true);
    expect(fakeApp.stage.children[0]?.children[0]).toBe(background.container);
    expect(fakeApp.stage.children[0]?.children[1]).toBe(runtime.mainReelsLayer);
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
      createBackgroundPlayer: () => new FakeBackgroundPlayer().asPlayer(),
      loadSymbolTextures: async () =>
        createSymbolTextures(getGame002SkinConfig("1").displaySymbols),
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
      new Set([1]),
    );
    expect(new Set(renderSymbols.map((symbol) => symbol.scale.y))).toEqual(
      new Set([1]),
    );
  });

  it("resizes Pixi backing size and moves the art world on viewport changes", async () => {
    const fakeApp = createFakeApplication();
    const context = createMountContext();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
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
      ...getGame002SkinConfig("1"),
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
      createBackgroundPlayer: () => new FakeBackgroundPlayer().asPlayer(),
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

  it("updates the background and reels while idle and uses the same capped delta during spin", async () => {
    const fakeApp = createFakeApplication();
    const background = new FakeBackgroundPlayer();
    const runtime = new FakeRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createBackgroundPlayer: () => background.asPlayer(),
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    fakeApp.tick(5_000);
    expect(background.updateDeltas).toEqual([1 / 30]);
    expect(runtime.updateDeltas).toEqual([1 / 30]);

    const pending = Promise.resolve(
      adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE)),
    );
    await Promise.resolve();
    runtime.completeNextUpdate = true;
    fakeApp.tick(5_000);
    await pending;
    expect(background.updateDeltas.at(-1)).toBeCloseTo(1 / 30);
    expect(runtime.updateDeltas.at(-1)).toBeCloseTo(1 / 30);
  });

  it("rolls back the Pixi mount when background initialization fails", async () => {
    const fakeApp = createFakeApplication();
    const background = new FakeBackgroundPlayer();
    background.initError = new Error("background init exploded");
    const context = createMountContext();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createBackgroundPlayer: () => background.asPlayer(),
      loadSymbolTextures: async () => ({}),
      createRuntime: () => new FakeRuntime().asRuntime(),
    });

    await expect(adapter.mount(context)).rejects.toThrow(
      /background init exploded/,
    );
    expect(context.gameLayer.children).toHaveLength(0);
    expect(background.destroyed).toBe(true);
    expect(fakeApp.stopped).toBe(true);
    expect(fakeApp.destroyed).toBe(true);
  });

  it("stops and reports background update failures without a pending spin", async () => {
    const fakeApp = createFakeApplication();
    const background = new FakeBackgroundPlayer();
    const reported: Error[] = [];
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createBackgroundPlayer: () => background.asPlayer(),
      loadSymbolTextures: async () => ({}),
      createRuntime: () => new FakeRuntime().asRuntime(),
      reportFatalError: (error) => reported.push(error),
    });
    await adapter.mount(createMountContext());
    background.updateError = new Error("background update exploded");

    fakeApp.tick(16);

    expect(fakeApp.stopped).toBe(true);
    expect(reported).toEqual([background.updateError]);
  });

  it("starts win amount after reels, waits for awaiting-dismiss and forwards clicks", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const winAmount = new FakeWinAmountPlayer({ completeOnFirstUpdate: false });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    const context = createMountContext();
    await adapter.mount(context);

    const pending = adapter.playSpin(
      createLogic(GAME002_SAMPLE_SPIN_SCENE, { totalWin: 2_250 }),
    );
    await Promise.resolve();
    expect(winAmount.immediateDismissRequests).toBe(1);
    expect(winAmount.starts).toEqual([]);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    expect(winAmount.starts).toEqual([
      { betAmountRaw: 150, winAmountRaw: 2_250 },
    ]);
    expect(winAmount.phase).toBe("major-counting");

    fakeApp.canvas.dispatchEvent(new Event("pointerdown"));
    expect(winAmount.advanceRequests).toBe(1);
    expect(winAmount.phase).toBe("awaiting-dismiss");
    fakeApp.tick(16);
    await pending;

    const updateCount = winAmount.updateDeltas.length;
    fakeApp.tick(16);
    expect(winAmount.updateDeltas).toHaveLength(updateCount + 1);
    context.emitViewport({ width: 1200, height: 1200 });
    expect(winAmount.layoutCalls.length).toBeGreaterThan(1);

    fakeApp.canvas.dispatchEvent(new Event("pointerdown"));
    expect(winAmount.phase).toBe("complete");
    adapter.destroy?.();
    expect(winAmount.destroyed).toBe(true);
    const advanceCount = winAmount.advanceRequests;
    fakeApp.canvas.dispatchEvent(new Event("pointerdown"));
    expect(winAmount.advanceRequests).toBe(advanceCount);
  });

  it("starts the generic symbol carousel only after reels and waits for its first cycle", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const carousel = new FakeSymbolWinCarousel(1);
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createSymbolWinCarousel: () => carousel,
    });
    await adapter.mount(createMountContext());

    expect(fakeApp.stage.children[0]?.children[2]).toBe(carousel.container);
    expect(carousel.container.position).toMatchObject({ x: 637.5, y: 330 });
    const pending = Promise.resolve(
      adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE)),
    );
    await Promise.resolve();
    expect(carousel.prepareCalls).toHaveLength(1);
    expect(carousel.clearCount).toBe(1);
    expect(carousel.startCount).toBe(0);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    expect(carousel.startCount).toBe(1);
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    carousel.complete = true;
    fakeApp.tick(16);
    await pending;
    const updateCount = carousel.updateCount;
    fakeApp.tick(16);
    expect(carousel.updateCount).toBe(updateCount + 1);

    adapter.destroy?.();
    expect(carousel.destroyed).toBe(true);
  });

  it("prepares CN values before spin and carries server values in target reel slots", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const presenter = new FakeSymbolValuePresenter();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createSymbolValuePresenter: () => presenter,
    });
    await adapter.mount(createMountContext());
    const logic = createSlotGameLogicResult(GAME002_CN_VALUE_SPIN_RESULT, {
      bet: { bet: 5, lines: 30, times: 1 },
      userInfo: { balance: 1000, gameid: 69002 },
    }).logic;

    const pending = adapter.playSpin(logic);
    expect(runtime.spinTargets).toEqual([]);
    await Promise.resolve();
    expect(presenter.prepareCalls[0]).toEqual([
      { x: 2, y: 6, symbol: "CN", symbolCode: 8, value: 2 },
      { x: 2, y: 7, symbol: "CN", symbolCode: 8, value: 25 },
      { x: 5, y: 3, symbol: "CN", symbolCode: 8, value: 1 },
      { x: 5, y: 4, symbol: "CN", symbolCode: 8, value: 1 },
    ]);
    expect(runtime.spinTargets).toEqual([
      GAME002_CN_VALUE_SPIN_RESULT.gmi.replyPlay.results[0].clientData.scenes[0].values.map(
        (column) => column.values,
      ),
    ]);
    expect(runtime.spinTargetPresentationValues[0]?.[2][6]).toBe(2);
    expect(runtime.spinTargetPresentationValues[0]?.[2][7]).toBe(25);
    expect(runtime.spinTargetPresentationValues[0]?.[5][3]).toBe(1);
    expect(runtime.spinTargetPresentationValues[0]?.[5][4]).toBe(1);
    expect(runtime.spinTargetPresentationValues[0]?.[0][0]).toBeNull();
    expect(presenter.discardCalls).toBe(0);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await pending;
    expect(presenter.discardCalls).toBe(1);
    expect(presenter.updateDeltas.length).toBeGreaterThan(0);
  });

  it("skips win playback for zero and rejects invalid monetary inputs", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const winAmount = new FakeWinAmountPlayer();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    await adapter.mount(createMountContext());

    const zeroWin = adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE));
    await Promise.resolve();
    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await zeroWin;
    expect(winAmount.starts).toEqual([]);

    expect(() =>
      adapter.playSpin(
        createLogic(GAME002_SAMPLE_SPIN_SCENE, { bet: 0, totalWin: 1 }),
      ),
    ).toThrow(/bet amount must be a finite positive number/);
    expect(() =>
      adapter.playSpin(
        createLogic(GAME002_SAMPLE_SPIN_SCENE, { totalWin: -1 }),
      ),
    ).toThrow(/win amount must be a finite non-negative number/);
    expect(() =>
      adapter.playSpin(
        createLogic(GAME002_SAMPLE_SPIN_SCENE, { totalWin: Number.NaN }),
      ),
    ).toThrow(/win amount must be a finite non-negative number/);
  });

  it("caps oversized ticker deltas so grid-cell spin stays visible after resize", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE)),
    );
    await Promise.resolve();
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
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const first = adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE));
    expect(() =>
      adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE)),
    ).toThrow(/already in progress/);

    await Promise.resolve();

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
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const pending = adapter.playSpin(createLogic(GAME002_SAMPLE_SPIN_SCENE));
    await Promise.resolve();
    runtime.completeNextUpdate = true;
    fakeApp.tick(16);

    await expect(pending).rejects.toThrow(/does not match/);
    expect(fakeApp.stopped).toBe(true);
  });

  it("destroy rejects pending animation and removes the canvas", async () => {
    const fakeApp = createFakeApplication();
    const background = new FakeBackgroundPlayer();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createBackgroundPlayer: () => background.asPlayer(),
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
    expect(background.destroyed).toBe(true);
    const resizeCount = fakeApp.resizeCalls.length;
    context.emitViewport({ width: 1200, height: 1200 });
    expect(fakeApp.resizeCalls).toHaveLength(resizeCount);
  });
});

function createTestAdapter(options: Omit<Game002AdapterOptions, "skin">) {
  return createGame002Adapter({
    skin: getGame002SkinConfig("1"),
    createBackgroundPlayer: () => new FakeBackgroundPlayer().asPlayer(),
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

function createSymbolTextures(symbols: readonly string[]): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      symbols.map((symbol) => [symbol, createTextureSet(200, 200)]),
    ),
  );
}

class FakeBackgroundPlayer {
  readonly container = new Container();
  readonly updateDeltas: number[] = [];
  initialized = false;
  destroyed = false;
  initError: Error | null = null;
  updateError: Error | null = null;

  asPlayer(): SpineBackgroundPlayer {
    return {
      container: this.container,
      init: async () => {
        if (this.initError) {
          throw this.initError;
        }
        this.initialized = true;
      },
      update: (deltaSeconds) => {
        if (this.updateError) {
          throw this.updateError;
        }
        this.updateDeltas.push(deltaSeconds);
      },
      requestState: async () => undefined,
      getSnapshot: () => ({
        stableState: "BaseGame",
        targetState: null,
        phase: "stable",
      }),
      destroy: () => {
        this.destroyed = true;
        this.container.parent?.removeChild(this.container);
      },
    };
  }
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

function createLogic(
  scene: SceneMatrix,
  options: {
    readonly bet?: number;
    readonly lines?: number;
    readonly totalWin?: number;
  } = {},
): GameLogic {
  return {
    getBet: () => options.bet ?? 5,
    getLines: () => options.lines ?? 30,
    getTotalWin: () => options.totalWin ?? 0,
    getStep: () => ({
      getScene: () => scene,
      hasComponent: () => false,
      getComponent: () => undefined,
    }),
  } as unknown as GameLogic;
}

class FakeWinAmountPlayer {
  readonly container = new Container();
  readonly starts: Array<{
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }> = [];
  readonly updateDeltas: number[] = [];
  readonly layoutCalls: unknown[] = [];
  advanceRequests = 0;
  immediateDismissRequests = 0;
  phase:
    | "idle"
    | "minor-counting"
    | "major-counting"
    | "tier-counting"
    | "awaiting-dismiss"
    | "dismissing"
    | "complete" = "idle";
  destroyed = false;
  completeNextUpdate: boolean;

  constructor(options: { readonly completeOnFirstUpdate?: boolean } = {}) {
    this.completeNextUpdate = options.completeOnFirstUpdate ?? true;
  }

  asPlayer(): WinAmountAnimationPlayer {
    return {
      container: this.container,
      start: (input) => {
        this.starts.push(input);
        this.phase = "major-counting";
      },
      update: (deltaSeconds) => {
        this.updateDeltas.push(deltaSeconds);
        if (this.completeNextUpdate && this.phase === "major-counting") {
          this.phase = "awaiting-dismiss";
        }
        return {
          completed: this.phase === "idle" || this.phase === "complete",
          phase: this.phase,
          displayedAmountRaw: this.starts.at(-1)?.winAmountRaw ?? 0,
        };
      },
      requestAdvance: () => {
        this.advanceRequests += 1;
        if (this.phase === "awaiting-dismiss") {
          this.phase = "complete";
        } else if (
          this.phase === "minor-counting" ||
          this.phase === "major-counting" ||
          this.phase === "tier-counting"
        ) {
          this.phase = "awaiting-dismiss";
        }
      },
      requestDismiss: () => {
        this.phase = "complete";
      },
      dismissImmediately: () => {
        this.immediateDismissRequests += 1;
        this.phase = "complete";
      },
      applyLayout: (layout) => {
        this.layoutCalls.push(layout);
      },
      isPlaying: () => this.phase !== "idle" && this.phase !== "complete",
      destroy: () => {
        this.destroyed = true;
        this.phase = "complete";
      },
    };
  }
}

class FakeSymbolWinCarousel implements SymbolWinCarousel {
  readonly container = new Container();
  readonly prepareCalls: unknown[] = [];
  firstCycleComplete = false;
  clearCount = 0;
  startCount = 0;
  updateCount = 0;
  complete = false;
  destroyed = false;
  phase: "idle" | "playing" | "destroyed" = "idle";

  constructor(readonly groupCount: number) {}

  prepare(input: any): any {
    this.prepareCalls.push(input);
    return Object.freeze({
      groupCount: this.groupCount,
      groups: Object.freeze([]),
    });
  }
  start(): { readonly started: boolean } {
    this.startCount += 1;
    this.phase = "playing";
    return { started: this.groupCount > 0 };
  }
  clear(): void {
    this.clearCount += 1;
    this.firstCycleComplete = false;
    this.phase = "idle";
  }
  update(): { readonly firstCycleComplete: boolean } {
    this.updateCount += 1;
    this.firstCycleComplete = this.complete;
    return { firstCycleComplete: this.firstCycleComplete };
  }
  getSnapshot(): any {
    return {
      phase: this.phase,
      firstCycleComplete: this.firstCycleComplete,
      currentIndex: null,
      componentName: null,
      resultIndex: null,
      amountVisible: false,
      amountText: "",
      amountPosition: null,
    };
  }
  destroy(): void {
    this.destroyed = true;
    this.phase = "destroyed";
  }
}

class FakeSymbolValuePresenter implements SymbolValuePresenter {
  readonly container = new Container();
  readonly prepareCalls: Array<readonly SymbolValuePresentationItem[]> = [];
  readonly updateDeltas: number[] = [];
  clearCount = 0;
  discardCalls = 0;
  destroyed = false;

  async prepare(
    items: readonly SymbolValuePresentationItem[],
  ): Promise<PreparedSymbolValuePresentation> {
    this.prepareCalls.push(items);
    return Object.freeze({ itemCount: items.length, items });
  }
  discard(): void {
    this.discardCalls += 1;
  }
  show(): void {}
  update(deltaSeconds: number): void {
    this.updateDeltas.push(deltaSeconds);
  }
  clear(): void {
    this.clearCount += 1;
  }
  getSnapshot(): any {
    return { phase: "idle", activeCount: 0, items: [] };
  }
  destroy(): void {
    this.destroyed = true;
  }
}

class FakeRuntime {
  readonly mainReelsLayer = new Container();
  readonly appliedScenes: SceneMatrix[] = [];
  readonly spinTargets: SceneMatrix[] = [];
  readonly spinTargetPresentationValues: Array<
    readonly (readonly (number | null)[])[] | undefined
  > = [];
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
      spinToScene: (scene: SceneMatrix, _sceneName?: string, values?) => {
        if (this.spinning) {
          throw new Error("game002 reels are already spinning.");
        }
        this.spinTargets.push(scene);
        this.spinTargetPresentationValues.push(values);
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
      requestVisibleSymbolStates: () => undefined,
      getVisibleSymbolStateSnapshots: (positions) =>
        positions.map((position) => ({
          ...position,
          code: 1,
          kind: "textured",
          requestedState: "normal",
          resolvedState: "normal",
          isOnce: false,
        })),
      getVisibleSymbolGeometrySnapshots: (positions) =>
        positions.map((position) => ({
          ...position,
          code: 1,
          kind: "textured",
          centerX: position.x * 120 + 60,
          centerY: position.y * 120 + 60,
          cellWidth: 120,
          cellHeight: 120,
        })),
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
          presentationValues: Array.from({ length: 6 }, () =>
            Array.from({ length: 9 }, () => null),
          ),
          reelCount: 6,
          gridCellCount: 54,
          layerX: 637.5,
          layerY: 330,
        };
      },
      config: {} as any,
      gameConfig: {
        getSymbolCode: (symbol: string) => (symbol === "CN" ? 8 : undefined),
      } as any,
      layout: {} as any,
      layerLayout: { x: 637.5, y: 330 } as any,
      getCurrentScene: () => this.currentScene,
      getTargetScene: () => this.targetScene,
      getFinalYs: () => [61, 26, 12, 4, 19, 2],
      createSpinPlan: () => ({}) as any,
    };
  }
}
