import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type {
  GameLogic,
  SceneMatrix,
  SlotGameMountContext,
} from "@slotclientengine/gameframeworks";
import { createGame003Adapter } from "../src/game-adapter.js";
import {
  GAME003_DEFAULT_SCENE,
  GAME003_SPIN_SCENE,
} from "./fixtures/game003-gmi.js";

describe("game003 package-only adapter", () => {
  it("mounts only the package presentation and handles viewport/state lifecycle", async () => {
    const harness = createHarness();

    expect(() =>
      harness.adapter.applyInitialState?.({
        userInfo: {},
        balance: 100,
        defaultScene: GAME003_DEFAULT_SCENE,
      }),
    ).toThrow(/not mounted/);
    expect(() => harness.adapter.playSpin(createLogic())).toThrow(
      /not mounted/,
    );

    await harness.adapter.mount(harness.context);
    expect(harness.app.init).toHaveBeenCalledWith({
      width: 1174,
      height: 2000,
      antialias: true,
      autoDensity: false,
      resolution: 1,
    });
    expect([...harness.context.gameLayer.children]).toEqual([
      harness.app.canvas,
    ]);
    expect(harness.app.stage.children).toEqual([
      harness.packageRuntime.container,
    ]);
    expect(harness.reelRuntime.mainReelsLayer.children).toEqual([
      harness.coinOverlay.container,
      harness.carousel.container,
    ]);
    expect(harness.applyViewport).toHaveBeenCalledWith({
      width: 1174,
      height: 2000,
    });
    await expect(harness.adapter.mount(harness.context)).rejects.toThrow(
      /already mounted/,
    );

    harness.adapter.applyInitialState?.({ userInfo: {}, balance: 100 });
    harness.adapter.applyInitialState?.({
      userInfo: {},
      balance: 100,
      defaultScene: GAME003_DEFAULT_SCENE,
    });
    expect(harness.runtimeState.appliedScenes).toEqual([GAME003_DEFAULT_SCENE]);
    expect(harness.coinOverlay.clear).toHaveBeenCalledTimes(2);

    harness.context.emitViewport({ width: 1600, height: 1000 });
    expect(harness.app.renderer.resize).toHaveBeenLastCalledWith(1600, 1000);
    expect(harness.coinOverlay.refresh).toHaveBeenCalledTimes(2);
    expect(harness.applyViewport).toHaveBeenLastCalledWith({
      width: 1600,
      height: 1000,
    });

    harness.app.canvas.dispatchEvent(new Event("pointerdown"));
    expect(harness.winAmountPlayer.requestAdvance).toHaveBeenCalledOnce();
    harness.adapter.destroy?.();
    expect(harness.destroyPresentation).toHaveBeenCalledOnce();
    expect(harness.coinOverlay.destroy).toHaveBeenCalledOnce();
    expect(harness.carousel.destroy).toHaveBeenCalledOnce();
    expect(harness.winAmountPlayer.destroy).toHaveBeenCalledOnce();
    expect(harness.app.destroy).toHaveBeenCalledOnce();
    expect(harness.context.gameLayer.children).toHaveLength(0);

    harness.app.canvas.dispatchEvent(new Event("pointerdown"));
    expect(harness.winAmountPlayer.requestAdvance).toHaveBeenCalledOnce();
    harness.context.emitViewport({ width: 1000, height: 1600 });
    expect(harness.app.renderer.resize).toHaveBeenCalledTimes(2);
  });

  it("spins through the package reel runtime without conveyor or minecart phases", async () => {
    const harness = createHarness();
    await harness.adapter.mount(harness.context);

    const spin = harness.adapter.playSpin(createLogic());
    expect(harness.runtimeState.spinTargets).toEqual([GAME003_SPIN_SCENE]);
    expect(harness.winAmountPlayer.dismissImmediately).toHaveBeenCalledOnce();
    expect(harness.carousel.clear).toHaveBeenCalledOnce();
    expect(() => harness.adapter.playSpin(createLogic())).toThrow(
      /already in progress/,
    );

    harness.tick(5000);
    expect(harness.runtimeState.updateDeltas[0]).toBeCloseTo(1 / 30);
    harness.runtimeState.completeNextUpdate = true;
    harness.tick(16);
    await spin;

    expect(harness.coinOverlay.show).toHaveBeenCalledWith([]);
    expect(harness.carousel.start).not.toHaveBeenCalled();
    expect(harness.winAmountPlayer.start).not.toHaveBeenCalled();
    expect(harness.runtimeState.currentScene).toEqual(GAME003_SPIN_SCENE);
  });

  it("waits for package win carousel and amount playback before resolving", async () => {
    const harness = createHarness({ groupCount: 1 });
    await harness.adapter.mount(harness.context);

    const spin = harness.adapter.playSpin(createLogic({ winAmountRaw: 500 }));
    harness.runtimeState.completeNextUpdate = true;
    harness.tick(16);
    expect(harness.winAmountPlayer.start).toHaveBeenCalledWith({
      betAmountRaw: 50,
      winAmountRaw: 500,
    });
    expect(harness.carousel.start).toHaveBeenCalledOnce();

    harness.tick(16);
    await spin;
    expect(harness.carousel.update).toHaveBeenCalled();
    expect(harness.winAmountPlayer.update).toHaveBeenCalled();

    harness.tick(16);
    expect(harness.runtimeState.updateDeltas).toHaveLength(3);
  });

  it("rejects runtime failures and pending spins during destruction", async () => {
    const failing = createHarness();
    await failing.adapter.mount(failing.context);
    const rejectedSpin = failing.adapter.playSpin(createLogic());
    failing.runtimeState.updateError = new Error("runtime exploded");
    failing.tick(16);
    await expect(rejectedSpin).rejects.toThrow(/runtime exploded/);
    expect(failing.app.ticker.stop).toHaveBeenCalledOnce();

    const pending = createHarness();
    await pending.adapter.mount(pending.context);
    const pendingSpin = pending.adapter.playSpin(createLogic());
    pending.adapter.destroy?.();
    await expect(pendingSpin).rejects.toThrow(/destroyed/);
  });

  it("rolls back an initialized package presentation when mounting fails", async () => {
    const harness = createHarness({ failCoinOverlayCreation: true });

    await expect(harness.adapter.mount(harness.context)).rejects.toThrow(
      /coin overlay failed/,
    );
    expect(harness.destroyPresentation).toHaveBeenCalledOnce();
    expect(harness.app.destroy).toHaveBeenCalledOnce();
  });
});

function createHarness(
  options: {
    readonly groupCount?: number;
    readonly failCoinOverlayCreation?: boolean;
  } = {},
) {
  const canvas = document.createElement("canvas");
  const tickerListeners = new Set<(ticker: { deltaMS: number }) => void>();
  const app = {
    canvas,
    stage: new Container(),
    renderer: { resize: vi.fn() },
    ticker: {
      add: vi.fn((listener: (ticker: { deltaMS: number }) => void) => {
        tickerListeners.add(listener);
      }),
      remove: vi.fn((listener: (ticker: { deltaMS: number }) => void) => {
        tickerListeners.delete(listener);
      }),
      stop: vi.fn(),
    },
    init: vi.fn(async () => undefined),
    destroy: vi.fn(),
  };
  const runtimeState = {
    currentScene: null as SceneMatrix | null,
    targetScene: null as SceneMatrix | null,
    completeNextUpdate: false,
    updateError: null as Error | null,
    appliedScenes: [] as SceneMatrix[],
    spinTargets: [] as SceneMatrix[],
    updateDeltas: [] as number[],
  };
  const reelRuntime = {
    mainReelsLayer: new Container(),
    gameConfig: {
      getSymbolCode: (symbol: string) => (symbol === "CO" ? 11 : undefined),
    },
    applyScene: vi.fn((scene: SceneMatrix) => {
      runtimeState.appliedScenes.push(scene);
      runtimeState.currentScene = scene;
      return [0, 0, 0, 0, 0];
    }),
    spinToScene: vi.fn((scene: SceneMatrix) => {
      runtimeState.spinTargets.push(scene);
      runtimeState.targetScene = scene;
      return { axes: [] };
    }),
    update: vi.fn((deltaSeconds: number) => {
      runtimeState.updateDeltas.push(deltaSeconds);
      if (runtimeState.updateError) throw runtimeState.updateError;
      if (runtimeState.completeNextUpdate && runtimeState.targetScene) {
        runtimeState.currentScene = runtimeState.targetScene;
        runtimeState.targetScene = null;
        return {
          completed: true,
          spinning: false,
          startedAxes: [],
          stoppedAxes: [],
        };
      }
      return {
        completed: false,
        spinning: runtimeState.targetScene !== null,
        startedAxes: [],
        stoppedAxes: [],
      };
    }),
    getVisualSnapshot: vi.fn(() => ({
      visible: true,
      spinning: false,
      visibleScene: runtimeState.currentScene,
      requestedStates: [],
      reelCount: 5,
      layerX: 0,
      layerY: 0,
    })),
    requestVisibleSymbolStates: vi.fn(),
    getVisibleSymbolStateSnapshots: vi.fn(() => []),
    getVisibleSymbolGeometrySnapshots: vi.fn(() => []),
  };
  const packageRuntime = { container: new Container() };
  const applyViewport = vi.fn();
  const destroyPresentation = vi.fn();
  const winAmountState = { playing: false };
  const winAmountPlayer = {
    container: new Container(),
    start: vi.fn(() => {
      winAmountState.playing = true;
    }),
    update: vi.fn(() => {
      winAmountState.playing = false;
      return {
        completed: false,
        phase: "awaiting-dismiss" as const,
        displayedAmountRaw: 500,
      };
    }),
    requestAdvance: vi.fn(),
    requestDismiss: vi.fn(),
    dismissImmediately: vi.fn(() => {
      winAmountState.playing = false;
    }),
    applyLayout: vi.fn(),
    isPlaying: vi.fn(() => winAmountState.playing),
    destroy: vi.fn(),
  };
  const coinOverlay = {
    container: new Container(),
    show: vi.fn(),
    clear: vi.fn(),
    refresh: vi.fn(),
    getSnapshot: vi.fn(),
    destroy: vi.fn(),
  };
  const carouselState = { phase: "idle" as "idle" | "playing" };
  const prepared = { groupCount: options.groupCount ?? 0, groups: [] };
  const carousel = {
    container: new Container(),
    firstCycleComplete: false,
    prepare: vi.fn(() => prepared),
    start: vi.fn(() => {
      carouselState.phase = "playing";
      return { started: true };
    }),
    clear: vi.fn(() => {
      carouselState.phase = "idle";
    }),
    update: vi.fn(() => {
      carouselState.phase = "idle";
      return { firstCycleComplete: true };
    }),
    getSnapshot: vi.fn(() => ({
      phase: carouselState.phase,
      firstCycleComplete: false,
      currentIndex: null,
      componentName: null,
      resultIndex: null,
      amountVisible: false,
      amountText: "",
      amountPosition: null,
    })),
    destroy: vi.fn(),
  };
  const presentation = {
    reelRuntime,
    packageRuntime,
    winAmountPlayer,
    applyViewport,
    destroy: destroyPresentation,
  };
  const adapter = createGame003Adapter({
    skin: {
      id: "2",
      label: "minecart2",
      winSymbolLoop: {
        componentNames: ["bg-wins"],
        cyclePauseSeconds: 0.2,
        resultAmount: {
          yOffsetRatioFromCellCenter: 0,
          fontSize: 24,
          fill: "#ffffff",
          stroke: "#000000",
          strokeWidth: 1,
        },
      },
      coinOverlay: {
        coinSymbol: "CO",
        componentName: "bg-gencoins",
      },
    } as never,
    createApplication: () => app,
    createCoinOverlayRuntime: () => {
      if (options.failCoinOverlayCreation) {
        throw new Error("coin overlay failed");
      }
      return coinOverlay as never;
    },
    createSymbolWinCarousel: () => carousel as never,
    createSceneLayoutPresentation: vi.fn(async () => presentation) as never,
  });
  const context = createMountContext();
  return {
    adapter,
    app,
    runtimeState,
    reelRuntime,
    packageRuntime,
    applyViewport,
    destroyPresentation,
    winAmountPlayer,
    coinOverlay,
    carousel,
    context,
    tick(deltaMS: number) {
      for (const listener of tickerListeners) listener({ deltaMS });
    },
  };
}

function createMountContext() {
  const gameLayer = document.createElement("div");
  let viewport = createViewport({ width: 1174, height: 2000 });
  const listeners = new Set<(value: typeof viewport) => void>();
  return {
    gameLayer,
    getViewport: () => viewport,
    onViewportChange(listener: (value: typeof viewport) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emitViewport(frameDesignSize: { width: number; height: number }) {
      viewport = createViewport(frameDesignSize);
      for (const listener of listeners) listener(viewport);
    },
  } as unknown as SlotGameMountContext & {
    emitViewport(frameDesignSize: { width: number; height: number }): void;
  };
}

function createViewport(frameDesignSize: { width: number; height: number }) {
  return {
    pageSize: frameDesignSize,
    frameDesignSize,
    scale: 1,
    cssSize: frameDesignSize,
    offsetX: 0,
    offsetY: 0,
  };
}

function createLogic(
  options: { readonly winAmountRaw?: number } = {},
): GameLogic {
  const step = {
    getScene: () => GAME003_SPIN_SCENE,
    hasComponent: () => false,
    getComponent: () => undefined,
  };
  return {
    getStep: () => step,
    getBet: () => 5,
    getLines: () => 10,
    getTotalWin: () => options.winAmountRaw ?? 0,
  } as unknown as GameLogic;
}
