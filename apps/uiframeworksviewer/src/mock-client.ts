import type {
  SlotcraftClientLike,
  SlotUiLiveConfig,
} from "@slotclientengine/uiframeworks";
import type { ViewerScenario } from "./scenarios.js";

export interface ViewerMockClientOptions {
  readonly scenario: ViewerScenario;
  readonly live: SlotUiLiveConfig;
}

type Listener = (...args: unknown[]) => void;
type SpinParams = Parameters<SlotcraftClientLike["spin"]>[0];
type ReadonlyUserInfo = ReturnType<SlotcraftClientLike["getUserInfo"]>;

export class ViewerMockClient implements SlotcraftClientLike {
  readonly #scenario: ViewerScenario;
  readonly #live: SlotUiLiveConfig;
  readonly #listeners = new Map<string, Set<Listener>>();
  #connected = false;
  #userInfo: ReadonlyUserInfo;

  constructor(options: ViewerMockClientOptions) {
    this.#scenario = options.scenario;
    this.#live = options.live;
    this.#userInfo = this.#createUserInfo(options.scenario.balance);
  }

  getUserInfo(): ReadonlyUserInfo {
    return this.#userInfo;
  }

  async connect(token?: string): Promise<void> {
    if (this.#scenario.mockConnectMode === "pending") {
      return new Promise(() => undefined);
    }
    if (this.#scenario.mockConnectMode === "error") {
      throw new Error("mock connect error");
    }
    if (token !== undefined && token.length === 0) {
      throw new Error("mock token must not be empty when provided.");
    }
    this.#connected = true;
    this.emit("connect");
  }

  async enterGame(gamecode?: string): Promise<unknown> {
    if (!this.#connected) {
      throw new Error("mock client must connect before enterGame.");
    }
    return Object.freeze({
      gamecode: gamecode ?? this.#live.gamecode ?? "mock-game",
    });
  }

  async spin(params: SpinParams): Promise<unknown> {
    if (!this.#connected) {
      throw new Error("mock client must connect before spin.");
    }
    this.#userInfo = this.#createUserInfo(this.#scenario.mockBalanceAfterSpin);
    return createViewerMockSpinResult({
      totalwin: this.#scenario.mockTotalWin,
      bet: Number.isFinite(params.bet) ? Number(params.bet) : 1,
      lines: Number.isFinite(params.lines) ? Number(params.lines) : 10,
    });
  }

  async collect(): Promise<unknown> {
    return Object.freeze({ collected: true });
  }

  disconnect(): void {
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
      linebets: [1, 2, 5, 25],
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
  readonly bet: number;
  readonly lines: number;
}): Readonly<Record<string, unknown>> {
  const stepCount = options.totalwin > 0 ? 1 : 1;
  return Object.freeze({
    gmi: createViewerMockGmi(stepCount, options.totalwin),
    totalwin: options.totalwin,
    results: stepCount,
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
      otherScenes: [],
      results:
        totalwin > 0
          ? [
              {
                pos: [0, 0, 1, 0, 2, 0],
                coinWin: totalwin,
                cashWin: totalwin,
                type: "line",
                symbol: 7,
              },
            ]
          : [],
      curGameMod: "base",
      curGameModParam: {
        historyComponents: [],
        mapComponents: {},
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
