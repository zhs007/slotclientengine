import type { GameLogic } from "@slotclientengine/logiccore";
import {
  SlotGameConfigError,
  createSlotGameFramework,
  type SlotGameAdapter,
  type SlotGameFramePolicy,
  type SlotGameFramework,
  type SlotGameLiveSessionLike,
  type SlotGameMountContext,
  type SlotGameStateSnapshot,
  type SlotGameUi,
  type SlotGameUiCreateContext,
  type SlotGameUiFactory,
  type SlotGameViewportListener,
  type SlotGameViewportSnapshot,
} from "../src/index.js";
import { BET_OPTIONS, MockAdapter, createSpinResult } from "./test-helpers.js";

describe("SlotGameUiFactory contract", () => {
  it("keeps the default controller DOM and button command behavior", async () => {
    const root = document.createElement("div");
    const session = new DeferredLiveSession();
    const framework = createSlotGameFramework({
      root,
      gameAdapter: new MockAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      liveSession: session,
    });
    await framework.connect();

    expect(root.querySelector(".slot-ui-frame")).toBeTruthy();
    click(root, ".slot-ui-bet-increase");
    click(root, ".slot-ui-sound-button");
    click(root, ".slot-ui-fast-button");
    click(root, ".slot-ui-auto-button");
    expect(framework.getState()).toMatchObject({
      betIndex: 1,
      muted: true,
      fastMode: true,
      autoMode: true,
    });

    click(root, ".slot-ui-spin-button");
    await waitFor(() => session.calls.includes("spin"));
    await waitFor(() => framework.getState().spinState === "idle");
    expect(session.calls.filter((call) => call === "spin")).toHaveLength(1);
    framework.destroy();
  });

  it("creates one isolated UI per framework with frozen context and stable adapter hosts", () => {
    const factory = new RecordingUiFactory();
    const firstAdapter = new MockAdapter();
    const secondAdapter = new MockAdapter();
    const formatMoney = (amount: number) => `$${amount}`;
    const first = createFramework({
      factory,
      adapter: firstAdapter,
      uiConfig: {
        framePolicy: { mode: "fixed" },
        brandLabel: "FACTORY TEST",
        currency: "USD",
        locale: "en-US",
        formatMoney,
      },
    });
    const second = createFramework({ factory, adapter: secondAdapter });

    expect(factory.contexts).toHaveLength(2);
    const firstContext = factory.contexts[0];
    expect(Object.isFrozen(firstContext)).toBe(true);
    expect(Object.isFrozen(firstContext.designSize)).toBe(true);
    expect(Object.isFrozen(firstContext.betOptions)).toBe(true);
    expect(Object.isFrozen(firstContext.betOptions[0])).toBe(true);
    expect(Object.isFrozen(firstContext.initialState)).toBe(true);
    expect(Object.isFrozen(firstContext.initialState.betOption)).toBe(true);
    expect(Object.isFrozen(firstContext.commands)).toBe(true);
    expect(Object.isFrozen(firstContext.framePolicy)).toBe(true);
    expect(firstContext).toMatchObject({
      brandLabel: "FACTORY TEST",
      currency: "USD",
      locale: "en-US",
      formatMoney,
    });
    expect(firstAdapter.context?.frame).toBe(factory.uis[0].elements.frame);
    expect(firstAdapter.context?.gameLayer).toBe(
      factory.uis[0].elements.gameLayer,
    );
    expect(firstAdapter.context?.overlay).toBe(factory.uis[0].elements.overlay);
    expect(secondAdapter.context?.frame).toBe(factory.uis[1].elements.frame);
    expect(factory.uis[0].elements.frame).not.toBe(
      factory.uis[1].elements.frame,
    );
    expect(factory.uis[0].updates).toEqual([first.getState()]);
    expect(factory.uis[1].updates).toEqual([second.getState()]);

    factory.contexts[0].commands.increaseBet();
    factory.contexts[0].commands.setMuted(true);
    expect(first.getState()).toMatchObject({ betIndex: 1, muted: true });
    expect(second.getState()).toMatchObject({ betIndex: 0, muted: false });
    expect(factory.uis[0].updates.at(-1)).toBe(first.getState());
    expect(factory.uis[1].updates).toHaveLength(1);

    first.destroy();
    second.destroy();
  });

  it("drives framework commands and absorbs duplicate fire-and-forget spin requests", async () => {
    const factory = new RecordingUiFactory();
    const session = new DeferredLiveSession();
    const framework = createFramework({ factory, session });
    await framework.connect();

    const spinDeferred = deferred<unknown>();
    session.spinDeferred = spinDeferred;
    factory.contexts[0].commands.requestSpin();
    factory.contexts[0].commands.requestSpin();
    await waitFor(() => session.calls.filter((call) => call === "spin").length);

    expect(session.calls.filter((call) => call === "spin")).toHaveLength(1);
    factory.contexts[0].commands.decreaseBet();
    factory.contexts[0].commands.setMuted(true);
    factory.contexts[0].commands.setFastMode(true);
    factory.contexts[0].commands.setAutoMode(true);
    expect(framework.getState()).toMatchObject({
      muted: true,
      fastMode: true,
      autoMode: true,
    });

    spinDeferred.resolve(createSpinResult());
    await waitFor(() => framework.getState().spinState === "idle");
    framework.destroy();

    factory.contexts[0].commands.requestSpin();
    factory.contexts[0].commands.increaseBet();
    expect(session.calls.filter((call) => call === "spin")).toHaveLength(1);
  });

  it("projects the complete successful round state sequence to the injected UI", async () => {
    const factory = new RecordingUiFactory();
    const session = new DeferredLiveSession();
    session.spinResult = createSpinResult({ totalwin: 10 });
    const framework = createFramework({ factory, session });

    await framework.connect();
    await framework.spin();

    expect(factory.uis[0].updates.map((state) => state.spinState)).toEqual([
      "idle",
      "connecting",
      "idle",
      "spinning",
      "presenting",
      "collecting",
      "idle",
    ]);
    framework.destroy();
  });

  it("forwards viewport snapshots and subscriptions through the injected UI", () => {
    const factory = new RecordingUiFactory();
    const adapter = new MockAdapter();
    const framework = createFramework({ factory, adapter });
    const ui = factory.uis[0];
    const snapshots: SlotGameViewportSnapshot[] = [];

    expect(adapter.context?.getViewport()).toEqual(ui.viewport);
    const unsubscribe = adapter.context?.onViewportChange((viewport) => {
      snapshots.push(viewport);
    });
    const changed = createViewport(900, 1600);
    ui.emitViewport(changed);
    expect(snapshots).toEqual([changed]);

    unsubscribe?.();
    ui.emitViewport(createViewport(800, 1400));
    expect(snapshots).toEqual([changed]);

    framework.destroy();
    ui.emitViewport(createViewport(700, 1200));
    expect(snapshots).toEqual([changed]);
  });

  it("destroys UI, session, and adapter exactly once and disables retained commands", async () => {
    const factory = new RecordingUiFactory();
    const session = new DeferredLiveSession();
    const adapter = new CountingAdapter();
    const framework = createFramework({ factory, session, adapter });
    await framework.connect();

    framework.destroy();
    framework.destroy();
    factory.contexts[0].commands.requestSpin();

    expect(factory.uis[0].destroyCalls).toBe(1);
    expect(session.calls.filter((call) => call === "disconnect")).toHaveLength(
      1,
    );
    expect(adapter.destroyCalls).toBe(1);
    expect(session.calls).not.toContain("spin");
  });

  it("prevents late initial state after destroy during connect", async () => {
    const factory = new RecordingUiFactory();
    const session = new DeferredLiveSession();
    const connectDeferred = deferred<Readonly<{ balance: number }>>();
    session.connectDeferred = connectDeferred;
    const adapter = new CountingAdapter();
    const framework = createFramework({ factory, session, adapter });
    const connectPromise = framework.connect();
    await waitFor(() => session.calls.includes("connect"));

    framework.destroy();
    connectDeferred.resolve(Object.freeze({ balance: 500 }));

    await expect(connectPromise).rejects.toThrow(/destroyed/);
    expect(adapter.calls).not.toContain("initial");
    expect(factory.uis[0].updates.map((state) => state.spinState)).toEqual([
      "idle",
      "connecting",
    ]);
  });

  it("prevents late presentation and collect after destroy during session spin", async () => {
    const factory = new RecordingUiFactory();
    const session = new DeferredLiveSession();
    const adapter = new CountingAdapter();
    const framework = createFramework({ factory, session, adapter });
    await framework.connect();
    const spinDeferred = deferred<unknown>();
    session.spinDeferred = spinDeferred;
    const spinPromise = framework.spin();
    await waitFor(() => session.calls.includes("spin"));

    framework.destroy();
    spinDeferred.resolve(createSpinResult({ totalwin: 10 }));

    await expect(spinPromise).rejects.toThrow(/destroyed/);
    expect(adapter.calls).not.toContain("play");
    expect(session.calls).not.toContain("collect");
  });

  it("prevents late collect after destroy during adapter presentation", async () => {
    const factory = new RecordingUiFactory();
    const session = new DeferredLiveSession();
    session.spinResult = createSpinResult({ totalwin: 10 });
    const adapter = new CountingAdapter();
    const playDeferred = deferred<void>();
    adapter.playDeferred = playDeferred;
    const framework = createFramework({ factory, session, adapter });
    await framework.connect();
    const spinPromise = framework.spin();
    await waitFor(() => adapter.calls.includes("play"));

    framework.destroy();
    playDeferred.resolve();

    await expect(spinPromise).rejects.toThrow(/destroyed/);
    expect(session.calls).not.toContain("collect");
    expect(factory.uis[0].updates.at(-1)?.spinState).toBe("presenting");
  });

  it("fails fast for invalid factories and malformed UI handles", () => {
    expect(() => createFramework({ factory: {} as SlotGameUiFactory })).toThrow(
      SlotGameConfigError,
    );

    const destroy = vi.fn();
    const invalidFactory: SlotGameUiFactory = {
      create: () =>
        ({
          elements: { frame: null },
          getViewport: () => createViewport(1125, 2000),
          onViewportChange: () => () => undefined,
          update: () => undefined,
          destroy,
        }) as never,
    };
    expect(() => createFramework({ factory: invalidFactory })).toThrow(
      /frame|gameLayer|overlay/,
    );
    expect(destroy).toHaveBeenCalledTimes(1);

    const missingUpdateDestroy = vi.fn();
    expect(() =>
      createFramework({
        factory: {
          create: () =>
            createUiHandle({
              update: undefined,
              destroy: missingUpdateDestroy,
            }) as never,
        },
      }),
    ).toThrow(/update/);
    expect(missingUpdateDestroy).toHaveBeenCalledTimes(1);

    const invalidViewportDestroy = vi.fn();
    expect(() =>
      createFramework({
        factory: {
          create: () =>
            createUiHandle({
              getViewport: () => ({ scale: Number.NaN }) as never,
              destroy: invalidViewportDestroy,
            }),
        },
      }),
    ).toThrow(/viewport/);
    expect(invalidViewportDestroy).toHaveBeenCalledTimes(1);
  });

  it("preserves a UI update error, reports it once, and cleans up without recursive update", async () => {
    const updateError = new Error("UI update exploded");
    const factory = new RecordingUiFactory("connecting", updateError);
    const session = new DeferredLiveSession();
    const adapter = new CountingAdapter();
    const errors: Error[] = [];
    const framework = createFramework({
      factory,
      session,
      adapter,
      onError: (error) => errors.push(error),
    });

    await expect(framework.connect()).rejects.toBe(updateError);
    expect(factory.uis[0].updates).toHaveLength(2);
    expect(factory.uis[0].destroyCalls).toBe(1);
    expect(session.calls.filter((call) => call === "disconnect")).toHaveLength(
      1,
    );
    expect(adapter.destroyCalls).toBe(1);
    expect(errors).toEqual([updateError]);
  });
});

function createFramework(options: {
  readonly factory: SlotGameUiFactory;
  readonly session?: DeferredLiveSession;
  readonly adapter?: SlotGameAdapter;
  readonly onError?: (error: Error) => void;
  readonly uiConfig?: {
    readonly framePolicy?: SlotGameFramePolicy;
    readonly brandLabel?: string;
    readonly currency?: string;
    readonly locale?: string;
    readonly formatMoney?: (amount: number) => string;
  };
}): SlotGameFramework {
  return createSlotGameFramework({
    root: document.createElement("div"),
    gameAdapter: options.adapter ?? new MockAdapter(),
    live: { serverUrl: "ws://localhost" },
    betOptions: BET_OPTIONS,
    designSize: { width: 1125, height: 2000 },
    liveSession: options.session ?? new DeferredLiveSession(),
    uiFactory: options.factory,
    onError: options.onError,
    ...options.uiConfig,
  });
}

class RecordingUiFactory implements SlotGameUiFactory {
  readonly contexts: SlotGameUiCreateContext[] = [];
  readonly uis: RecordingUi[] = [];

  constructor(
    private readonly throwOnSpinState?: SlotGameStateSnapshot["spinState"],
    private readonly updateError = new Error("UI update failed"),
  ) {}

  create(context: SlotGameUiCreateContext): SlotGameUi {
    this.contexts.push(context);
    const ui = new RecordingUi(this.throwOnSpinState, this.updateError);
    context.root.replaceChildren(ui.elements.frame);
    this.uis.push(ui);
    return ui;
  }
}

class RecordingUi implements SlotGameUi {
  readonly elements: SlotGameUi["elements"];
  readonly updates: SlotGameStateSnapshot[] = [];
  readonly listeners = new Set<SlotGameViewportListener>();
  viewport = createViewport(1125, 2000);
  destroyCalls = 0;

  constructor(
    private readonly throwOnSpinState?: SlotGameStateSnapshot["spinState"],
    private readonly updateError = new Error("UI update failed"),
  ) {
    const frame = document.createElement("div");
    const gameLayer = document.createElement("div");
    const overlay = document.createElement("div");
    frame.append(gameLayer, overlay);
    this.elements = Object.freeze({ frame, gameLayer, overlay });
  }

  getViewport(): SlotGameViewportSnapshot {
    return this.viewport;
  }

  onViewportChange(listener: SlotGameViewportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(state: SlotGameStateSnapshot): void {
    this.updates.push(state);
    if (state.spinState === this.throwOnSpinState) {
      throw this.updateError;
    }
  }

  emitViewport(viewport: SlotGameViewportSnapshot): void {
    this.viewport = viewport;
    for (const listener of this.listeners) {
      listener(viewport);
    }
  }

  destroy(): void {
    this.destroyCalls += 1;
    this.listeners.clear();
    this.elements.frame.remove();
  }
}

class DeferredLiveSession implements SlotGameLiveSessionLike {
  readonly calls: string[] = [];
  userInfo = Object.freeze({ balance: 500 });
  connectDeferred: Deferred<Readonly<{ balance: number }>> | null = null;
  spinDeferred: Deferred<unknown> | null = null;
  spinResult: unknown = createSpinResult();

  getUserInfo() {
    return this.userInfo;
  }

  async connect() {
    this.calls.push("connect");
    return this.connectDeferred?.promise ?? this.userInfo;
  }

  async spin(): Promise<unknown> {
    this.calls.push("spin");
    return this.spinDeferred?.promise ?? this.spinResult;
  }

  async collect() {
    this.calls.push("collect");
    return this.userInfo;
  }

  disconnect(): void {
    this.calls.push("disconnect");
  }
}

class CountingAdapter implements SlotGameAdapter {
  readonly calls: string[] = [];
  context: SlotGameMountContext | null = null;
  destroyCalls = 0;
  playDeferred: Deferred<void> | null = null;

  mount(context: SlotGameMountContext): void {
    this.calls.push("mount");
    this.context = context;
  }

  applyInitialState(): void {
    this.calls.push("initial");
  }

  async playSpin(_logic: GameLogic): Promise<void> {
    this.calls.push("play");
    await this.playDeferred?.promise;
  }

  destroy(): void {
    this.calls.push("destroy");
    this.destroyCalls += 1;
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createViewport(
  width: number,
  height: number,
): SlotGameViewportSnapshot {
  return Object.freeze({
    pageSize: Object.freeze({ width, height }),
    frameDesignSize: Object.freeze({ width, height }),
    scale: 1,
    cssSize: Object.freeze({ width, height }),
    offsetX: 0,
    offsetY: 0,
  });
}

function createUiHandle(overrides: Partial<SlotGameUi> = {}): SlotGameUi {
  const frame = document.createElement("div");
  const gameLayer = document.createElement("div");
  const overlay = document.createElement("div");
  return {
    elements: Object.freeze({ frame, gameLayer, overlay }),
    getViewport: () => createViewport(1125, 2000),
    onViewportChange: () => () => undefined,
    update: () => undefined,
    destroy: () => undefined,
    ...overrides,
  };
}

async function waitFor(predicate: () => unknown): Promise<void> {
  for (let index = 0; index < 50; index += 1) {
    if (predicate()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error("condition was not reached");
}

function click(root: HTMLElement, selector: string): void {
  const button = root.querySelector(selector);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`missing button: ${selector}`);
  }
  button.click();
}
