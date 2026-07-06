import type { GameLogic } from "@slotclientengine/logiccore";
import type { SpinParams, UserInfo } from "@slotclientengine/netcore";
import type {
  SlotUiBetOption,
  SlotUiStateSnapshot,
  SlotcraftClientLike,
} from "../src/index.js";

export const BET_OPTIONS: readonly SlotUiBetOption[] = Object.freeze([
  Object.freeze({ bet: 1, lines: 10 }),
  Object.freeze({ bet: 2, lines: 10, times: 2, label: "2 x 10" }),
  Object.freeze({ bet: 5, lines: 20 }),
]);

export function createStateSnapshot(
  overrides: Partial<SlotUiStateSnapshot> = {},
): SlotUiStateSnapshot {
  const betIndex = overrides.betIndex ?? 0;
  return Object.freeze({
    designSize: Object.freeze({ width: 941, height: 1672 }),
    connected: true,
    spinState: "idle",
    balance: 1000,
    win: 0,
    betIndex,
    betOption: BET_OPTIONS[betIndex],
    muted: false,
    fastMode: false,
    autoMode: false,
    error: null,
    ...overrides,
  });
}

export function createMockGameLogic(): GameLogic {
  return {
    getGameModuleName: () => "mock",
    getGameId: () => 7,
    getBet: () => 1,
    getLines: () => 10,
    getTotalWin: () => 0,
    getPlayWin: () => undefined,
    getRawMessage: () => ({}),
    getRawGmi: () => createGmiFixture(),
    getDefaultScene: () => [[1, 2, 3]],
    getRandomNumbers: () => [1, 2, 3],
    getStepCount: () => 1,
    getStep: () => {
      throw new Error("not used");
    },
    getSteps: () => [],
    getScene: () => [[1, 2, 3]],
    getOtherScene: () => [[0, 0, 0]],
    getResult: () => ({ pos: [0, 0] }),
    hasComponent: () => false,
    getComponent: () => undefined,
    getComponentScenes: () => [],
    getComponentOtherScenes: () => [],
    getComponentResults: () => [],
  };
}

export function createGmiFixture(stepCount = 1): Record<string, unknown> {
  return {
    defaultScene: createScene(0),
    replyPlay: {
      randomNumbers: [1, 2, 3],
      results: Array.from({ length: stepCount }, (_item, index) => ({
        coinWin: 0,
        cashWin: 0,
        clientData: {
          scenes: [createScene(index + 1)],
          otherScenes: [],
          results: [],
          curGameMod: "base",
          curGameModParam: {
            historyComponents: [],
            mapComponents: {},
          },
        },
      })),
    },
  };
}

export function createSpinResult(
  totalwin = 0,
  stepCount = 1,
): Record<string, unknown> {
  return {
    gmi: createGmiFixture(stepCount),
    totalwin,
    results: stepCount,
  };
}

export class MockClient implements SlotcraftClientLike {
  public readonly calls: string[] = [];
  public readonly listeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();
  public userInfo: Readonly<UserInfo> = Object.freeze({
    balance: 1000,
    gameid: 7,
    defaultScene: [[1, 2, 3]],
  });
  public spinResult: unknown = createSpinResult();
  public connectPromise: Promise<void> | null = null;
  public spinPromise: Promise<unknown> | null = null;

  getUserInfo(): Readonly<UserInfo> {
    this.calls.push("getUserInfo");
    return this.userInfo;
  }

  async connect(token?: string): Promise<void> {
    this.calls.push(`connect:${token ?? ""}`);
    await this.connectPromise;
  }

  async enterGame(gamecode?: string): Promise<unknown> {
    this.calls.push(`enterGame:${gamecode ?? ""}`);
    return {};
  }

  async spin(params: SpinParams): Promise<unknown> {
    this.calls.push(`spin:${JSON.stringify(params)}`);
    if (this.spinPromise) {
      return this.spinPromise;
    }
    return this.spinResult;
  }

  async collect(playIndex?: number): Promise<unknown> {
    this.calls.push(`collect:${playIndex ?? ""}`);
    return {};
  }

  disconnect(): void {
    this.calls.push("disconnect");
    this.emit("disconnect", { code: 1000, reason: "closed", wasClean: true });
  }

  on(event: string, callback: (...args: unknown[]) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(callback);
    this.listeners.set(event, listeners);
  }

  off(event: string, callback: (...args: unknown[]) => void): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

function createScene(seed: number): Record<string, unknown> {
  return {
    values: [
      { values: [seed, 1, 2] },
      { values: [3, seed, 4] },
      { values: [5, 6, seed] },
    ],
    indexes: [],
    validRow: [],
  };
}
