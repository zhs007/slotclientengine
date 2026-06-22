import type {
  SlotGameClientLike,
  SlotGameLiveConfig,
} from "@slotclientengine/gameframeworks";
import type { ViewerScenario } from "./scenarios.js";

export interface ViewerMockClientOptions {
  readonly scenario: ViewerScenario;
  readonly live: SlotGameLiveConfig;
}

type Listener = (...args: unknown[]) => void;
type SpinParams = Parameters<SlotGameClientLike["spin"]>[0];
type ReadonlyUserInfo = ReturnType<SlotGameClientLike["getUserInfo"]>;

export class ViewerMockClient implements SlotGameClientLike {
  public readonly collectCalls: number[] = [];
  public readonly calls: string[] = [];
  readonly #scenario: ViewerScenario;
  readonly #live: SlotGameLiveConfig;
  readonly #listeners = new Map<string, Set<Listener>>();
  #connected = false;
  #userInfo: ReadonlyUserInfo;

  constructor(options: ViewerMockClientOptions) {
    this.#scenario = options.scenario;
    this.#live = options.live;
    this.#userInfo = this.#createUserInfo(options.scenario.balance);
  }

  getUserInfo(): ReadonlyUserInfo {
    this.calls.push("getUserInfo");
    return this.#userInfo;
  }

  async connect(token?: string): Promise<void> {
    this.calls.push(`connect:${token ?? ""}`);
    if (token !== undefined && token.length === 0) {
      throw new Error("mock token must not be empty when provided.");
    }
    this.#connected = true;
    this.emit("connect");
  }

  async enterGame(gamecode?: string): Promise<unknown> {
    this.calls.push(`enterGame:${gamecode ?? ""}`);
    if (!this.#connected) {
      throw new Error("mock client must connect before enterGame.");
    }
    return Object.freeze({
      gamecode: gamecode ?? this.#live.gamecode ?? "mock-game",
    });
  }

  async spin(params: SpinParams): Promise<unknown> {
    this.calls.push(`spin:${JSON.stringify(params)}`);
    if (!this.#connected) {
      throw new Error("mock client must connect before spin.");
    }
    if (this.#scenario.spinDelayMs > 0) {
      await delay(this.#scenario.spinDelayMs);
    }
    this.#userInfo = this.#createUserInfo(this.#scenario.balanceAfterSpin);
    return createViewerMockSpinResult({
      totalwin: this.#scenario.totalwin,
      results: this.#scenario.results,
      bet: Number.isFinite(params.bet) ? Number(params.bet) : 1,
      lines: Number.isFinite(params.lines) ? Number(params.lines) : 10,
    });
  }

  async collect(playIndex?: number): Promise<unknown> {
    this.calls.push(`collect:${playIndex ?? ""}`);
    this.collectCalls.push(playIndex ?? -1);
    this.#userInfo = this.#createUserInfo(this.#scenario.balanceAfterCollect);
    return Object.freeze({ collected: true });
  }

  disconnect(): void {
    this.calls.push("disconnect");
    this.#connected = false;
    this.emit("disconnect", {
      code: 1000,
      reason: "mock disconnect",
      wasClean: true,
    });
  }

  on(event: string, callback: Listener): void {
    const listeners = this.#listeners.get(event) ?? new Set<Listener>();
    listeners.add(callback);
    this.#listeners.set(event, listeners);
  }

  off(event: string, callback: Listener): void {
    this.#listeners.get(event)?.delete(callback);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      listener(...args);
    }
  }

  #createUserInfo(balance: number): ReadonlyUserInfo {
    return Object.freeze({
      token: this.#live.token,
      gamecode: this.#live.gamecode,
      gameid: 9001,
      balance,
      currency: "USD",
      defaultLinebet: 1,
      linebets: [1, 2, 5],
      linesOptions: [10, 20, 50],
      defaultScene: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
    });
  }
}

export function createViewerMockClient(
  options: ViewerMockClientOptions,
): ViewerMockClient {
  return new ViewerMockClient(options);
}

export function createViewerMockSpinResult(options: {
  readonly totalwin: number;
  readonly results: number;
  readonly bet: number;
  readonly lines: number;
}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    gmi: createViewerMockGmi(options.results, options.totalwin),
    totalwin: options.totalwin,
    results: options.results,
    bet: options.bet,
    lines: options.lines,
  });
}

export function createViewerMockGmi(
  stepCount = 1,
  totalwin = 0,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    defaultScene: createScene(0),
    replyPlay: {
      randomNumbers: [17, 23, 42, 64],
      results: Array.from({ length: stepCount }, (_item, index) =>
        createStep(index, totalwin),
      ),
      finished: true,
    },
  });
}

function createStep(
  index: number,
  totalwin: number,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    coinWin: totalwin,
    cashWin: totalwin,
    clientData: {
      scenes: [createScene(index + 1)],
      results:
        totalwin > 0
          ? [
              {
                pos: [0, index],
                coinWin: totalwin,
                cashWin: totalwin,
                type: "line",
                symbol: 7,
              },
            ]
          : [],
      curGameMod: "base",
      curGameModParam: {
        historyComponents: ["lineWin"],
        historyComponentsEx: ["lineWin"],
        mapComponents: {
          lineWin: {
            basicComponentData: {
              usedScenes: [0],
              usedResults: totalwin > 0 ? [0] : [],
              usedOtherScenes: [],
              usedPrizeScenes: [],
              srcScenes: [],
              pos: [],
              mapUsedSPGrid: {},
              coinWin: totalwin,
              cashWin: totalwin,
              targetScene: 0,
              runIndex: index,
              output: 0,
              strOutput: "",
            },
          },
        },
      },
    },
  });
}

function createScene(seed: number): Readonly<Record<string, unknown>> {
  return Object.freeze({
    values: [
      { values: [seed + 1, 2, 3] },
      { values: [4, seed + 5, 6] },
      { values: [7, 8, seed + 9] },
    ],
    indexes: [],
    validRow: [],
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
