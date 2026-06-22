import { describe, expect, it } from "vitest";
import {
  createSlotGameFramework,
  type GameLogic,
  type GameLogicMeta,
  type SlotGameAdapter,
  type SlotGameClientLike,
  type SlotGameInitialState,
} from "@slotclientengine/gameframeworks";
import { parseGame001FrameworkConfig } from "../src/framework-config.js";

describe("game001 framework flow", () => {
  it("uses game001 config for spin and collects only after adapter play resolves", async () => {
    const config = parseGame001FrameworkConfig(validEnv());
    const client = new FakeClient();
    client.spinResult = createSpinResult({ totalwin: 12, results: 1 });
    const adapter = new FlowAdapter();
    let resolvePlay: () => void = () => undefined;
    adapter.playPromise = new Promise((resolve) => {
      resolvePlay = resolve;
    });
    const framework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: adapter,
      live: config.live,
      betOptions: config.betOptions,
      initialBetIndex: config.initialBetIndex,
      buildSpinRequest: () => config.spinRequest,
      clientFactory: () => client,
      logicFactory: (_gmi, meta) => createFakeLogic(meta),
    });

    await framework.connect();
    const spinPromise = framework.spin();
    await waitForState(() => framework.getState().spinState, "presenting");

    expect(client.spinParams).toEqual([
      { bet: 10, lines: 25, times: 2, autonums: 4 },
    ]);
    expect(client.collectCalls).toEqual([]);
    expect(adapter.lastLogic?.getTotalWin()).toBe(12);

    resolvePlay();
    await spinPromise;

    expect(client.collectCalls).toEqual([undefined]);
    expect(client.calls.indexOf("collect")).toBeGreaterThan(
      client.calls.indexOf("spin"),
    );
    expect(framework.getState()).toMatchObject({
      spinState: "idle",
      win: 12,
      balance: 1100,
    });
  });

  it("passes live defaultScene to the adapter without inventing one", async () => {
    const config = parseGame001FrameworkConfig(validEnv());
    const client = new FakeClient();
    client.userInfo.defaultScene = [
      [2, 0, 3, 0, 4],
      [2, 0, 3, 0, 4],
      [0, 4, 0, 5, 0],
      [1, 1, 1, 1, 1],
      [9, 0, 6, 0, 6],
    ];
    const adapter = new FlowAdapter();
    const framework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: adapter,
      live: config.live,
      betOptions: config.betOptions,
      buildSpinRequest: () => config.spinRequest,
      clientFactory: () => client,
      logicFactory: (_gmi, meta) => createFakeLogic(meta),
    });

    await framework.connect();

    expect(adapter.initialState?.defaultScene).toEqual(
      client.userInfo.defaultScene,
    );

    const noSceneClient = new FakeClient();
    const noSceneAdapter = new FlowAdapter();
    const noSceneFramework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: noSceneAdapter,
      live: config.live,
      betOptions: config.betOptions,
      buildSpinRequest: () => config.spinRequest,
      clientFactory: () => noSceneClient,
      logicFactory: (_gmi, meta) => createFakeLogic(meta),
    });
    await noSceneFramework.connect();
    expect(noSceneAdapter.initialState?.defaultScene).toBeUndefined();
  });

  it("keeps zero single result uncollected and zero multi-result collected after play", async () => {
    const single = await spinWithResult({ totalwin: 0, results: 1 });
    expect(single.client.collectCalls).toEqual([]);

    const multi = await spinWithResult({ totalwin: 0, results: 2 });
    expect(multi.client.collectCalls).toEqual([undefined]);
  });

  it("does not collect when adapter rejects and rejects concurrent direct spins", async () => {
    const config = parseGame001FrameworkConfig(validEnv());
    const client = new FakeClient();
    client.spinResult = createSpinResult({ totalwin: 5, results: 1 });
    const adapter = new FlowAdapter();
    adapter.playPromise = Promise.reject(new Error("adapter failed"));
    const framework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: adapter,
      live: config.live,
      betOptions: config.betOptions,
      buildSpinRequest: () => config.spinRequest,
      clientFactory: () => client,
      logicFactory: (_gmi, meta) => createFakeLogic(meta),
    });
    await framework.connect();
    await expect(framework.spin()).rejects.toThrow(/adapter failed/);
    expect(client.collectCalls).toEqual([]);
    expect(framework.getState().spinState).toBe("error");

    const slowClient = new FakeClient();
    let resolveSpin: (value: unknown) => void = () => undefined;
    slowClient.spinPromise = new Promise((resolve) => {
      resolveSpin = resolve;
    });
    const concurrentFramework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: new FlowAdapter(),
      live: config.live,
      betOptions: config.betOptions,
      buildSpinRequest: () => config.spinRequest,
      clientFactory: () => slowClient,
      logicFactory: (_gmi, meta) => createFakeLogic(meta),
    });
    await concurrentFramework.connect();
    const first = concurrentFramework.spin();
    await expect(concurrentFramework.spin()).rejects.toThrow(
      /already in progress/,
    );
    resolveSpin(createSpinResult({ totalwin: 0, results: 1 }));
    await first;
  });
});

async function spinWithResult(result: {
  readonly totalwin: number;
  readonly results: number;
}) {
  const config = parseGame001FrameworkConfig(validEnv());
  const client = new FakeClient();
  client.spinResult = createSpinResult(result);
  const framework = createSlotGameFramework({
    root: document.createElement("div"),
    gameAdapter: new FlowAdapter(),
    live: config.live,
    betOptions: config.betOptions,
    buildSpinRequest: () => config.spinRequest,
    clientFactory: () => client,
    logicFactory: (_gmi, meta) => createFakeLogic(meta),
  });
  await framework.connect();
  await framework.spin();
  return { client, framework };
}

function validEnv(): Record<string, unknown> {
  return {
    VITE_GAME001_SERVER_URL: "wss://example.test/game",
    VITE_GAME001_TOKEN: "token-1",
    VITE_GAME001_GAMECODE: "game001",
    VITE_GAME001_BET: "10",
    VITE_GAME001_LINES: "25",
    VITE_GAME001_TIMES: "2",
    VITE_GAME001_AUTONUMS: "4",
  };
}

function createSpinResult(options: {
  readonly totalwin: number;
  readonly results: number;
}) {
  return {
    gmi: {
      replyPlay: {
        results: Array.from({ length: options.results }, () => ({})),
      },
    },
    totalwin: options.totalwin,
    results: options.results,
  };
}

function createFakeLogic(meta: GameLogicMeta): GameLogic {
  return {
    getTotalWin: () => meta.totalwin,
  } as GameLogic;
}

async function waitForState(
  getState: () => string,
  expected: string,
): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
    if (getState() === expected) {
      return;
    }
  }
  throw new Error(`state did not become ${expected}: ${getState()}`);
}

class FlowAdapter implements SlotGameAdapter {
  initialState: SlotGameInitialState | null = null;
  lastLogic: GameLogic | null = null;
  playPromise: Promise<void> = Promise.resolve();

  mount(): void {
    return undefined;
  }

  applyInitialState(state: SlotGameInitialState): void {
    this.initialState = state;
  }

  async playSpin(logic: GameLogic): Promise<void> {
    this.lastLogic = logic;
    await this.playPromise;
  }
}

class FakeClient implements SlotGameClientLike {
  userInfo: Record<string, unknown> = {
    balance: 1000,
    gameid: 69002,
  };
  calls: string[] = [];
  collectCalls: Array<number | undefined> = [];
  spinParams: Array<Parameters<SlotGameClientLike["spin"]>[0]> = [];
  spinResult: unknown = createSpinResult({ totalwin: 0, results: 1 });
  spinPromise: Promise<unknown> | null = null;

  getUserInfo() {
    return this.userInfo;
  }

  async connect(): Promise<void> {
    this.calls.push("connect");
  }

  async enterGame(): Promise<unknown> {
    this.calls.push("enterGame");
    return {};
  }

  async spin(params: Parameters<SlotGameClientLike["spin"]>[0]) {
    this.calls.push("spin");
    this.spinParams.push(params);
    return this.spinPromise ?? this.spinResult;
  }

  async ["collect"](playIndex?: number): Promise<unknown> {
    this.calls.push("collect");
    this.collectCalls.push(playIndex);
    this.userInfo.balance = 1100;
    return {};
  }

  disconnect(): void {
    this.calls.push("disconnect");
  }

  on(): void {
    return undefined;
  }
}
