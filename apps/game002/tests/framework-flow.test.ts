import { describe, expect, it } from "vitest";
import {
  createSlotGameFramework,
  type GameLogic,
  type GameLogicMeta,
  type SlotGameAdapter,
  type SlotGameClientLike,
  type SlotGameInitialState,
  type SlotGameMountContext,
} from "@slotclientengine/gameframeworks";
import { GAME002_SAMPLE_DEFAULT_SCENE } from "./fixtures/game002-gmi.js";
import {
  GAME002_GRID_LAYOUT,
  GAME002_FOCUS_REGION,
  GAME002_REFERENCE_SIZE,
  createGame002FramePolicy,
  createGame002Layout,
} from "../src/game-layout.js";
import {
  GAME002_LIVE_SERVER_URL,
  parseGame002FrameworkConfigFromQuery,
} from "../src/framework-config.js";

describe("game002 framework flow", () => {
  it("maximizes the expanded reel focus by page orientation", async () => {
    for (const [pageSize, expectedFrameSize] of [
      [
        { width: 390, height: 844 },
        { width: 840, height: (840 * 844) / 390 },
      ],
      [
        { width: 1200, height: 1200 },
        { width: 1200, height: 1200 },
      ],
      [
        { width: 1430, height: 1464 },
        { width: (1430 * 1200) / 1464, height: 1200 },
      ],
      [
        { width: 1920, height: 1080 },
        { width: 2000, height: 1200 },
      ],
    ] as const) {
      const root = document.createElement("div");
      setRootSize(root, pageSize.width, pageSize.height);
      const adapter = new FlowAdapter();
      const framework = createSlotGameFramework({
        root,
        gameAdapter: adapter,
        live: parseGame002FrameworkConfigFromQuery(validQuery()).live,
        betOptions: [{ bet: 5, lines: 30 }],
        designSize: GAME002_REFERENCE_SIZE,
        framePolicy: createGame002FramePolicy(),
        buildSpinRequest: () => ({
          bet: 5,
          lines: 30,
          times: 1,
          autonums: -1,
        }),
        clientFactory: () => new FakeClient(),
        logicFactory: (_gmi, meta) => createFakeLogic(meta),
      });

      await framework.connect();
      const frameSize = adapter.mountContext?.getViewport().frameDesignSize;
      expect(frameSize).toBeDefined();
      if (!frameSize) {
        throw new Error("game002 adapter did not receive a frame viewport.");
      }
      expect(frameSize.width).toBeCloseTo(expectedFrameSize.width, 10);
      expect(frameSize.height).toBeCloseTo(expectedFrameSize.height, 10);
      const layout = createGame002Layout({
        viewportSize: frameSize,
        gridLayout: GAME002_GRID_LAYOUT,
        focusRegion: GAME002_FOCUS_REGION,
      });
      const scale = adapter.mountContext?.getViewport().scale;
      expect(scale).toBeDefined();
      if (scale === undefined) {
        throw new Error("game002 adapter did not receive a frame scale.");
      }
      const expectedFocusScale = Math.min(
        pageSize.width / GAME002_FOCUS_REGION.width,
        pageSize.height / GAME002_FOCUS_REGION.height,
      );
      expect(scale).toBeCloseTo(expectedFocusScale, 10);
      const requestedFrameSize = {
        width: pageSize.width / expectedFocusScale,
        height: pageSize.height / expectedFocusScale,
      };
      if (
        requestedFrameSize.width <= 2000 &&
        requestedFrameSize.height <= 2000
      ) {
        expect(adapter.mountContext?.getViewport().offsetX).toBeCloseTo(0, 10);
        expect(adapter.mountContext?.getViewport().offsetY).toBeCloseTo(0, 10);
      }
      expect(
        layout.boardFrameInViewport.y + layout.boardFrameInViewport.height,
      ).toBeLessThanOrEqual(layout.viewportSize.height);
      framework.destroy();
    }
  });

  it("uses game002 default spin request and collects only after adapter play resolves", async () => {
    const config = parseGame002FrameworkConfigFromQuery(validQuery());
    expect(config.skin).toBe("1");
    expect(config.live.serverUrl).toBe(GAME002_LIVE_SERVER_URL);
    expect(config.live.gamecode).toBe("GAME_CODE");
    const client = new FakeClient();
    client.spinResult = createSpinResult({ totalwin: 1575, results: 1 });
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
      { bet: 5, lines: 30, times: 1, autonums: -1 },
    ]);
    expect(client.collectCalls).toEqual([]);
    expect(adapter.lastLogic?.getTotalWin()).toBe(1575);

    resolvePlay();
    await spinPromise;

    expect(client.collectCalls).toEqual([undefined]);
    expect(client.calls.indexOf("collect")).toBeGreaterThan(
      client.calls.indexOf("spin"),
    );
    expect(framework.getState()).toMatchObject({
      spinState: "idle",
      win: 1575,
      balance: 1100,
    });
  });

  it("passes live defaultScene to the adapter without inventing one", async () => {
    const config = parseGame002FrameworkConfigFromQuery(validQuery());
    expect(config.skin).toBe("1");
    expect(config.live.gamecode).toBe("GAME_CODE");
    const client = new FakeClient();
    client.userInfo.defaultScene = GAME002_SAMPLE_DEFAULT_SCENE;
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
    const config = parseGame002FrameworkConfigFromQuery(validQuery());
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
    gamecode: "GAME_CODE",
    businessid: "guest",
    clienttype: "web",
    jurisdiction: "MT",
    language: "en",
    bet: "5",
    lines: "30",
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
  mountContext: SlotGameMountContext | null = null;
  mount(context: SlotGameMountContext): void {
    this.mountContext = context;
  }

  applyInitialState(state: SlotGameInitialState): void {
    this.initialState = state;
  }

  async playSpin(logic: GameLogic): Promise<void> {
    this.lastLogic = logic;
    await this.playPromise;
  }
}

function setRootSize(root: HTMLElement, width: number, height: number): void {
  Object.defineProperty(root, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(root, "clientHeight", {
    configurable: true,
    value: height,
  });
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
