import { describe, expect, it } from "vitest";
import {
  createSlotGameFramework,
  type GameLogic,
  type GameLogicMeta,
  type SlotGameAdapter,
  type SlotGameClientLike,
  type SlotGameInitialState,
} from "@slotclientengine/gameframeworks";
import { GAME003_DEFAULT_SCENE } from "./fixtures/game003-gmi.js";
import {
  GAME003_GAMECODE,
  GAME003_LIVE_SERVER_URL,
  parseGame003FrameworkConfigFromQuery,
} from "../src/framework-config.js";

describe("game003 framework flow", () => {
  it("uses game003 default spin request and collects only after adapter play resolves", async () => {
    const config = parseGame003FrameworkConfigFromQuery(validQuery());
    expect(config.skin).toBe("1");
    expect(config.live.serverUrl).toBe(GAME003_LIVE_SERVER_URL);
    expect(config.live.gamecode).toBe(GAME003_GAMECODE);
    const client = new FakeClient();
    client.spinResult = createSpinResult({ totalwin: 500, results: 1 });
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
      { bet: 5, lines: 10, times: 1, autonums: -1 },
    ]);
    expect(client.collectCalls).toEqual([]);
    expect(adapter.lastLogic?.getTotalWin()).toBe(500);

    resolvePlay();
    await spinPromise;

    expect(client.collectCalls).toEqual([undefined]);
    expect(client.calls.indexOf("collect")).toBeGreaterThan(
      client.calls.indexOf("spin"),
    );
    expect(framework.getState()).toMatchObject({
      spinState: "idle",
      win: 500,
      balance: 1100,
    });
  });

  it("passes live defaultScene to the adapter without inventing one", async () => {
    const config = parseGame003FrameworkConfigFromQuery(validQuery());
    const client = new FakeClient();
    client.userInfo.defaultScene = GAME003_DEFAULT_SCENE;
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

  it("does not collect when adapter rejects", async () => {
    const config = parseGame003FrameworkConfigFromQuery(validQuery());
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
  });
});

function validQuery(overrides: Record<string, string> = {}): string {
  return `?${new URLSearchParams({
    skin: "1",
    token: "TOKEN",
    gamecode: GAME003_GAMECODE,
    businessid: "guest",
    clienttype: "web",
    jurisdiction: "MT",
    language: "en",
    bet: "5",
    lines: "10",
    times: "1",
    autonums: "-1",
    requestTimeoutMs: "30000",
    ...overrides,
  }).toString()}`;
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
    gameid: 69003,
  };
  calls: string[] = [];
  collectCalls: Array<number | undefined> = [];
  spinParams: Array<Parameters<SlotGameClientLike["spin"]>[0]> = [];
  spinResult: unknown = createSpinResult({ totalwin: 0, results: 1 });

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
    return this.spinResult;
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
