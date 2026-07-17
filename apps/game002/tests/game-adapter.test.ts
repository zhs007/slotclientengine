import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createSlotGameLogicResult,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import type {
  CreateSymbolCascadePlayerOptions,
  PreparedSymbolCascade,
  SymbolCascadeGroup,
  SymbolCascadePlayer,
} from "@slotclientengine/rendercore";
import type { SpineBackgroundPlayer } from "@slotclientengine/rendercore/background";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import {
  createGame002Adapter,
  type Game002AdapterOptions,
} from "../src/game-adapter.js";
import type { Game002ReelRuntime } from "../src/game-demo.js";
import { getGame002SkinConfig } from "../src/skin-config.js";
import {
  GAME002_CASCADE_DROPDOWN_SCENE,
  GAME002_CASCADE_GMI,
  GAME002_CASCADE_INITIAL_SCENE,
  GAME002_CASCADE_REFILL_POS,
  GAME002_CASCADE_REFILL_SCENE,
  GAME002_CASCADE_REMOVED_SCENE,
} from "./fixtures/game002-cascade-gmi.js";

type TestPosition = { readonly x: number; readonly y: number };

describe("game002 task 95 adapter", () => {
  it("fails lifecycle misuse and resolves a terminal zero-win spin without cascade", async () => {
    const events: string[] = [];
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime(events);
    const cascade = new FakeCascadePlayer(events, runtime);
    const winAmount = new FakeWinAmountPlayer(
      events,
      () => runtime.updateCalls,
    );
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createRuntime: () => runtime.asRuntime(),
      createSymbolCascadePlayer: () => cascade,
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    expect(() => adapter.playSpin(createTerminalLogic())).toThrow(
      /not mounted/,
    );
    expect(() =>
      adapter.applyInitialState?.({ userInfo: {}, balance: 0 }),
    ).toThrow(/not mounted/);
    const context = createMountContext();
    await adapter.mount(context);
    await expect(adapter.mount(context)).rejects.toThrow(/already mounted/);
    adapter.applyInitialState?.({ userInfo: {}, balance: 0 });
    adapter.applyInitialState?.({
      userInfo: {},
      balance: 0,
      defaultScene: GAME002_CASCADE_INITIAL_SCENE,
    });
    adapter.setFrameworkState?.(context.getState());
    fakeApp.tick(16);
    fakeApp.canvas.dispatchEvent(new Event("pointerdown"));
    expect(winAmount.advanceRequests).toBe(1);

    const pending = adapter.playSpin(createTerminalLogic());
    fakeApp.tick(1000);
    await pending;
    expect(cascade.preparedGroups).toEqual([]);
    expect(winAmount.starts).toEqual([]);
    expect(runtime.currentScene).toEqual(GAME002_CASCADE_INITIAL_SCENE);
    const localPending = adapter.playSpin(createTerminalLogic(false));
    fakeApp.tick(16);
    await localPending;
    expect(runtime.spinValues.at(-1)).toBeUndefined();
    adapter.destroy?.();
    adapter.destroy?.();
  });

  it("mounts the single cascade amount owner between reels and win amount", async () => {
    const events: string[] = [];
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime(events);
    const cascade = new FakeCascadePlayer(events, runtime);
    const winAmount = new FakeWinAmountPlayer(
      events,
      () => runtime.updateCalls,
    );
    let cascadeOptions: CreateSymbolCascadePlayerOptions | undefined;
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createRuntime: () => runtime.asRuntime(),
      createSymbolCascadePlayer: (options) => {
        cascadeOptions = options;
        return cascade;
      },
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });

    await adapter.mount(createMountContext());

    const world = fakeApp.stage.children[0] as Container;
    expect(world.children).toEqual([
      expect.any(Container),
      runtime.mainReelsLayer,
      cascade.container,
      winAmount.container,
    ]);
    expect(cascade.container.position).toMatchObject({
      x: runtime.layerLayout.x,
      y: runtime.layerLayout.y,
    });
    expect(cascadeOptions?.winSummaryCollect).toMatchObject({
      countDurationSeconds: 0.35,
      sequentialCollectStartIntervalSeconds: 0.5,
      position: {
        x: runtime.layerLayout.rawReelsContentWidth / 2,
        y: runtime.layerLayout.rawReelsContentHeight + 36,
      },
      textStyle: {
        fontSize: 48,
        fontWeight: 900,
        fill: "#fff7d6",
        stroke: "#5a2500",
        strokeWidth: 6,
      },
    });
    expect(cascadeOptions).toMatchObject({
      emphasisSeconds: 1,
      dimmingInSeconds: 0.1,
      dimmingOutSeconds: 0.1,
      nonWinningDimmingAlpha: 0.5,
      startPresentationsWithEmphasis: true,
    });
  });

  it("plays the complete fixture with protected WL and one unified fall", async () => {
    const events: string[] = [];
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime(events);
    const cascade = new FakeCascadePlayer(events, runtime);
    const winAmount = new FakeWinAmountPlayer(
      events,
      () => runtime.updateCalls,
    );
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createRuntime: () => runtime.asRuntime(),
      createSymbolCascadePlayer: () => cascade,
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    await adapter.mount(createMountContext());

    let settled = false;
    const pending = Promise.resolve(
      adapter.playSpin(createCascadeLogic()),
    ).then(() => {
      events.push("playSpin.resolve");
      settled = true;
    });
    expect(runtime.spinTargets[0]).toEqual(GAME002_CASCADE_INITIAL_SCENE);
    expect(runtime.spinValues[0]).toBeDefined();

    for (let index = 0; index < 12 && !settled; index += 1) {
      fakeApp.tick(16);
      await Promise.resolve();
    }
    await pending;

    expect(cascade.preparedGroups).toHaveLength(3);
    expect(cascade.preparedGroups[0].removePositions).toHaveLength(3);
    expect(cascade.preparedGroups[1].removePositions).not.toContainEqual({
      x: 0,
      y: 5,
    });
    expect(runtime.released.flat()).toHaveLength(12);
    expect(runtime.dropSource).toEqual(GAME002_CASCADE_REMOVED_SCENE);
    expect(runtime.dropSettled).toEqual(GAME002_CASCADE_DROPDOWN_SCENE);
    expect(runtime.dropTarget).toEqual(GAME002_CASCADE_REFILL_SCENE);
    expect(runtime.refillPositions.flatMap(({ x, y }) => [x, y])).toEqual(
      GAME002_CASCADE_REFILL_POS,
    );
    expect(runtime.currentScene).toEqual(GAME002_CASCADE_REFILL_SCENE);
    expect(winAmount.starts).toEqual([
      { betAmountRaw: 300, winAmountRaw: 290 },
    ]);
    expect(winAmount.runtimeUpdatesAtUpdate).toEqual([
      winAmount.runtimeUpdatesAtStart + 1,
    ]);
    expect(events).toEqual([
      "spin.start",
      "spin.complete",
      "group[0].win.start",
      "group[0].win.complete",
      "group[0].remove.start",
      "group[0].remove.complete",
      "group[1].win.start",
      "group[1].win.complete",
      "group[1].remove.start",
      "group[1].remove.complete",
      "group[2].win.start",
      "group[2].win.complete",
      "group[2].remove.start",
      "group[2].remove.complete",
      "fall.start",
      "fall.complete",
      "gencoins.values-ready",
      "win-amount.start",
      "win-amount.awaiting-dismiss",
      "playSpin.resolve",
    ]);
  });

  it("uses dropdown, effect sweep and selective refill while anticipation persists", async () => {
    const events: string[] = [];
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime(events);
    runtime.anticipationActive = true;
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createRuntime: () => runtime.asRuntime(),
      createSymbolCascadePlayer: () => new FakeCascadePlayer(events, runtime),
      createWinAmountPlayer: () =>
        new FakeWinAmountPlayer(events, () => runtime.updateCalls).asPlayer(),
    });
    await adapter.mount(createMountContext());
    let settled = false;
    const pending = Promise.resolve(
      adapter.playSpin(createCascadeLogic()),
    ).then(() => {
      settled = true;
    });
    for (let index = 0; index < 20 && !settled; index += 1) {
      fakeApp.tick(16);
      await Promise.resolve();
    }
    await pending;
    expect(events).toEqual(
      expect.arrayContaining([
        "dropdown.start",
        "dropdown.complete",
        "sweep.start",
        "sweep.complete",
        "refill.start",
        "refill.complete",
      ]),
    );
    expect(events.indexOf("dropdown.start")).toBeLessThan(
      events.indexOf("sweep.start"),
    );
    expect(events.indexOf("sweep.complete")).toBeLessThan(
      events.indexOf("refill.start"),
    );
    expect(runtime.currentScene).toEqual(GAME002_CASCADE_REFILL_SCENE);
  });

  it("prevalidates the whole sequence before mutating the reels", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime([]);
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());
    const invalid = structuredClone(GAME002_CASCADE_GMI) as any;
    invalid.gmi.replyPlay.results[1].clientData.curGameModParam.mapComponents[
      "bg-refill"
    ].basicComponentData.pos.pop();

    expect(() => adapter.playSpin(createCascadeLogic(invalid))).toThrow();
    expect(runtime.spinTargets).toEqual([]);

    const invalidCashShare = structuredClone(GAME002_CASCADE_GMI) as any;
    const firstStep = invalidCashShare.gmi.replyPlay.results[0];
    firstStep.cashWin = 291;
    firstStep.clientData.results[2].cashWin64 = 81;
    firstStep.clientData.curGameModParam.mapComponents[
      "bg-win"
    ].basicComponentData.cashWin = 291;
    invalidCashShare.totalwin = 291;
    expect(() =>
      adapter.playSpin(createCascadeLogic(invalidCashShare)),
    ).toThrow(/cash share must divide.*exactly/);
    expect(runtime.spinTargets).toEqual([]);
  });

  it("rejects concurrent play and rejects a pending play on destroy", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime([]);
    runtime.completeOperations = false;
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      createRuntime: () => runtime.asRuntime(),
    });
    const context = createMountContext();
    await adapter.mount(context);
    const pending = adapter.playSpin(createCascadeLogic());

    expect(() => adapter.playSpin(createCascadeLogic())).toThrow(/in progress/);
    adapter.destroy?.();
    await expect(pending).rejects.toThrow(/destroyed/);
    expect(context.gameLayer.children).toHaveLength(0);
    expect(fakeApp.stopped).toBe(true);
    expect(fakeApp.destroyed).toBe(true);
  });
});

function createTestAdapter(options: Omit<Game002AdapterOptions, "skin">) {
  return createGame002Adapter({
    skin: getGame002SkinConfig("1"),
    createBackgroundPlayer: () => new FakeBackgroundPlayer().asPlayer(),
    loadSymbolTextures: async () => ({}),
    createWinAmountPlayer: () => new FakeWinAmountPlayer([]).asPlayer(),
    createSymbolCascadePlayer: (playerOptions) =>
      new FakeCascadePlayer([], playerOptions.target).asPlayer(),
    ...options,
  });
}

function createCascadeLogic(value: unknown = GAME002_CASCADE_GMI) {
  return createSlotGameLogicResult(value, {
    bet: { bet: 10, lines: 30, times: 1 },
    userInfo: { gameid: 0 },
  }).logic;
}

function createTerminalLogic(withServerValues = true) {
  const value = structuredClone(GAME002_CASCADE_GMI) as any;
  value.gmi.replyPlay.results.splice(1);
  value.results = 1;
  value.totalwin = 0;
  value.gmi.replyPlay.results[0].cashWin = 0;
  const params = value.gmi.replyPlay.results[0].clientData.curGameModParam;
  params.historyComponents = withServerValues
    ? ["bg-spin", "bg-gencoins"]
    : ["bg-spin"];
  if (!withServerValues) delete params.mapComponents["bg-gencoins"];
  delete params.mapComponents["bg-win"];
  delete params.mapComponents["bg-remove"];
  return createCascadeLogic(value);
}

function createMountContext() {
  const gameLayer = document.createElement("div");
  const viewport = createViewportSnapshot({ width: 1125, height: 2000 });
  return {
    frame: document.createElement("div"),
    gameLayer,
    overlay: document.createElement("div"),
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
    onViewportChange: () => () => undefined,
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

function createFakeApplication() {
  const listeners = new Set<(ticker: { readonly deltaMS: number }) => void>();
  const canvas = document.createElement("canvas");
  const stage = new Container();
  let stopped = false;
  let destroyed = false;
  const app = {
    canvas,
    stage,
    renderer: { resize: () => undefined },
    ticker: {
      add: (listener: (ticker: { readonly deltaMS: number }) => void) =>
        listeners.add(listener),
      remove: (listener: (ticker: { readonly deltaMS: number }) => void) =>
        listeners.delete(listener),
      stop: () => {
        stopped = true;
      },
    },
    init: async () => undefined,
    destroy: () => {
      destroyed = true;
    },
  };
  return {
    app,
    canvas,
    stage,
    get stopped() {
      return stopped;
    },
    get destroyed() {
      return destroyed;
    },
    tick(deltaMS: number) {
      for (const listener of listeners) listener({ deltaMS });
    },
  };
}

class FakeBackgroundPlayer {
  readonly container = new Container();
  asPlayer(): SpineBackgroundPlayer {
    return {
      container: this.container,
      init: async () => undefined,
      update: () => undefined,
      requestState: async () => undefined,
      getSnapshot: () => ({
        stableState: "BaseGame",
        targetState: null,
        phase: "stable",
      }),
      destroy: () => undefined,
    };
  }
}

class FakeRuntime {
  readonly mainReelsLayer = new Container();
  readonly layerLayout = Object.freeze({
    x: 21,
    y: 34,
    rawReelsContentWidth: 720,
    rawReelsContentHeight: 1080,
  });
  readonly spinTargets: SceneMatrix[] = [];
  readonly spinValues: unknown[] = [];
  readonly released: Array<
    readonly { readonly x: number; readonly y: number }[]
  > = [];
  readonly events: string[];
  currentScene: SceneMatrix | null = null;
  dropSource: unknown = null;
  dropSettled: unknown = null;
  dropTarget: unknown = null;
  refillPositions: readonly { readonly x: number; readonly y: number }[] = [];
  operation: "idle" | "spin" | "fall" | "dropdown" | "sweep" | "refill" =
    "idle";
  anticipationActive = false;
  completeOperations = true;
  updateCalls = 0;

  constructor(events: string[]) {
    this.events = events;
  }

  releaseVisibleSymbols(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void {
    this.released.push(positions);
  }

  asRuntime(): Game002ReelRuntime {
    const symbols = [
      "WL",
      "H1",
      "H2",
      "L1",
      "L2",
      "L3",
      "L4",
      "WM",
      "CN",
      "CM",
      "CO",
      "AF",
      "BN",
    ];
    return {
      mainReelsLayer: this.mainReelsLayer,
      layerLayout: this.layerLayout,
      prepare: () => undefined,
      resetPresentationState: () => undefined,
      isAnticipationActive: () => this.anticipationActive,
      getAnticipationSnapshot: () => ({
        active: this.anticipationActive,
        landedTriggerCount: 0,
        activationCoordinate: null,
      }),
      getCurrentScene: () => this.currentScene,
      gameConfig: {
        getSymbolCode: (symbol: string) => symbols.indexOf(symbol),
        getPaytableEntry: (code: number) => ({ symbol: symbols[code] }),
      },
      applyScene: (scene: SceneMatrix) => {
        this.currentScene = scene;
        return [];
      },
      spinToScene: (scene: SceneMatrix, _label?: string, values?: unknown) => {
        this.spinTargets.push(scene);
        this.spinValues.push(values);
        this.currentScene = scene;
        this.operation = "spin";
        this.events.push("spin.start");
        return {};
      },
      update: () => this.update(),
      isSpinning: () => this.operation !== "idle",
      requestVisibleSymbolStates: () => undefined,
      getVisibleSymbolStateSnapshots: (positions: readonly TestPosition[]) =>
        positions.map((position: TestPosition) => ({
          ...position,
          code: 1,
          kind: "textured",
          requestedState: "normal",
          resolvedState: "normal",
          isOnce: false,
        })),
      getVisibleSymbolGeometrySnapshots: (positions: readonly TestPosition[]) =>
        positions.map((position: TestPosition) => ({
          ...position,
          code: 1,
          kind: "textured",
          centerX: 0,
          centerY: 0,
          cellWidth: 100,
          cellHeight: 100,
        })),
      hasVisibleSymbolStateCapability: () => true,
      releaseVisibleSymbols: (positions: readonly TestPosition[]) =>
        this.releaseVisibleSymbols(positions),
      setVisibleSymbolDimming: () => undefined,
      clearVisibleSymbolDimming: () => undefined,
      getCascadeValues: () => [],
      createCascadeDropPlan: (options: any) => {
        this.dropSource = options.sourceScene;
        this.dropSettled = options.settledScene;
        this.dropTarget = options.targetScene;
        this.refillPositions = options.refillPositions;
        return {
          ...options,
          columns: 6,
          rows: 9,
          movements: [],
          totalSeconds: 0.2,
        };
      },
      createCascadeDropdownPlan: (options: any) => {
        this.dropSource = options.sourceScene;
        this.dropSettled = options.settledScene;
        this.dropTarget = options.targetScene;
        this.refillPositions = options.refillPositions;
        return {
          ...options,
          kind: "dropdown",
          targetScene: options.settledScene,
          targetValues: options.settledValues,
          columns: 6,
          rows: 9,
          movements: [],
          totalSeconds: 0.2,
        };
      },
      startRefillEffectSweep: () => {
        this.operation = "sweep";
        this.events.push("sweep.start");
      },
      startSelectiveRefillSpin: (options: any) => {
        this.currentScene = options.targetScene;
        this.operation = "refill";
        this.events.push("refill.start");
        return {};
      },
      startCascadeDrop: (plan: any) => {
        this.currentScene = plan.targetScene as SceneMatrix;
        this.operation = plan.kind === "dropdown" ? "dropdown" : "fall";
        this.events.push(`${this.operation}.start`);
      },
      getVisualSnapshot: () => ({
        visible: true,
        spinning: this.operation !== "idle",
        visibleScene: this.currentScene,
        requestedStates: [],
      }),
      destroy: () => undefined,
    } as unknown as Game002ReelRuntime;
  }

  private update() {
    this.updateCalls += 1;
    if (this.operation === "idle" || !this.completeOperations) {
      return {
        completed: this.operation === "idle",
        spinning: this.operation !== "idle",
        startedCells: [],
        landedCells: [],
      };
    }
    const operation = this.operation;
    this.operation = "idle";
    this.events.push(`${operation}.complete`);
    if (operation === "fall") this.events.push("gencoins.values-ready");
    return {
      completed: true,
      spinning: false,
      startedCells: [],
      landedCells: [],
    };
  }
}

class FakeCascadePlayer implements SymbolCascadePlayer {
  readonly container = new Container();
  readonly preparedGroups: SymbolCascadeGroup[] = [];
  private groups: readonly SymbolCascadeGroup[] = [];
  private groupIndex = 0;
  private phase: "idle" | "win" | "remove" | "complete" = "idle";

  constructor(
    private readonly events: string[],
    private readonly target: Pick<
      CreateSymbolCascadePlayerOptions["target"],
      "releaseVisibleSymbols"
    >,
  ) {}

  asPlayer(): SymbolCascadePlayer {
    return this;
  }
  prepare(groups: readonly SymbolCascadeGroup[]): PreparedSymbolCascade {
    this.preparedGroups.push(...groups);
    return Object.freeze({ groups, groupCount: groups.length });
  }
  start(prepared: PreparedSymbolCascade): void {
    this.groups = prepared.groups;
    this.groupIndex = 0;
    this.phase = this.groups.length === 0 ? "complete" : "win";
    if (this.phase === "win") this.events.push("group[0].win.start");
  }
  update(): { readonly completed: boolean } {
    if (this.phase === "win") {
      this.events.push(`group[${this.groupIndex}].win.complete`);
      this.events.push(`group[${this.groupIndex}].remove.start`);
      this.phase = "remove";
      return { completed: false };
    }
    if (this.phase === "remove") {
      this.events.push(`group[${this.groupIndex}].remove.complete`);
      this.target.releaseVisibleSymbols(
        this.groups[this.groupIndex].removePositions,
      );
      this.groupIndex += 1;
      if (this.groupIndex < this.groups.length) {
        this.phase = "win";
        this.events.push(`group[${this.groupIndex}].win.start`);
        return { completed: false };
      }
      this.phase = "complete";
    }
    return { completed: this.phase === "complete" };
  }
  clear(): void {
    this.phase = "idle";
  }
  getSnapshot(): any {
    return {
      phase: this.phase,
      currentIndex: null,
      componentName: null,
      resultIndex: null,
      amountVisible: false,
      amountText: "",
    };
  }
  destroy(): void {
    this.phase = "complete";
  }
}

class FakeWinAmountPlayer {
  readonly container = new Container();
  readonly starts: Array<{
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }> = [];
  private phase = "idle";
  advanceRequests = 0;
  runtimeUpdatesAtStart = 0;
  readonly runtimeUpdatesAtUpdate: number[] = [];
  constructor(
    private readonly events: string[],
    private readonly getRuntimeUpdateCalls?: () => number,
  ) {}
  asPlayer(): WinAmountAnimationPlayer {
    return {
      container: this.container,
      start: (input: {
        readonly betAmountRaw: number;
        readonly winAmountRaw: number;
      }) => {
        this.starts.push(input);
        this.runtimeUpdatesAtStart = this.getRuntimeUpdateCalls?.() ?? 0;
        this.phase = "major-counting";
        this.events.push("win-amount.start");
      },
      update: () => {
        this.runtimeUpdatesAtUpdate.push(
          this.getRuntimeUpdateCalls?.() ?? this.runtimeUpdatesAtStart,
        );
        this.phase = "awaiting-dismiss";
        this.events.push("win-amount.awaiting-dismiss");
        return {
          completed: false,
          phase: "awaiting-dismiss",
          displayedAmountRaw: this.starts.at(-1)?.winAmountRaw ?? 0,
        };
      },
      requestAdvance: () => {
        this.advanceRequests += 1;
      },
      requestDismiss: () => undefined,
      dismissImmediately: () => {
        this.phase = "complete";
      },
      applyLayout: () => undefined,
      getSnapshot: () => ({
        phase: this.phase,
        displayedAmountRaw: 0,
        visible: false,
        tierId: null,
      }),
      isPlaying: () => this.phase !== "idle" && this.phase !== "complete",
      destroy: () => undefined,
    } as unknown as WinAmountAnimationPlayer;
  }
}
