import type { GameLogic } from "@slotclientengine/logiccore";
import type { SpinParams, UserInfo } from "@slotclientengine/netcore";
import type {
  SlotGameAdapter,
  SlotGameBetOption,
  SlotGameClientLike,
  SlotGameMountContext,
  SlotGameStateSnapshot,
} from "../src/index.js";

export const BET_OPTIONS: readonly SlotGameBetOption[] = Object.freeze([
  Object.freeze({ bet: 1, lines: 10 }),
  Object.freeze({ bet: 2, lines: 20, times: 2, label: "2 x 20" }),
]);

export function createGmiFixture(
  options: {
    readonly totalwin?: number;
    readonly results?: number;
    readonly componentName?: string;
  } = {},
): Record<string, unknown> {
  const totalwin = options.totalwin ?? 0;
  const results = options.results ?? 1;
  const componentName = options.componentName ?? "lineWin";
  return {
    defaultScene: createScene(0),
    replyPlay: {
      randomNumbers: [11, 22, 33],
      results: Array.from({ length: results }, (_item, index) =>
        createStep(index, totalwin, componentName),
      ),
      finished: true,
    },
  };
}

export function createSpinResult(
  options: {
    readonly totalwin?: number;
    readonly results?: number;
    readonly componentName?: string;
  } = {},
): Record<string, unknown> {
  const totalwin = options.totalwin ?? 0;
  const results = options.results ?? 1;
  return {
    gmi: createGmiFixture({
      totalwin,
      results,
      componentName: options.componentName,
    }),
    totalwin,
    results,
  };
}

export function createMockGameLogic(totalwin = 0): GameLogic {
  const step = {
    getIndex: () => 0,
    getCoinWin: () => totalwin,
    getCashWin: () => totalwin,
    getRawStep: () => ({}),
    getRawClientData: () => ({}),
    getCurGameMod: () => "base",
    getCurGameModParam: () => ({}),
    getSceneCount: () => 1,
    getScene: () => [[1, 2, 3]],
    getScenes: () => [[[1, 2, 3]]],
    getOtherSceneCount: () => 1,
    getOtherScene: () => [[0, totalwin, 0]],
    getOtherScenes: () => [[[0, totalwin, 0]]],
    getResultCount: () => (totalwin > 0 ? 1 : 0),
    getResult: () => ({ pos: [0, 0], coinWin: totalwin, cashWin: totalwin }),
    getResults: () =>
      totalwin > 0
        ? [{ pos: [0, 0], coinWin: totalwin, cashWin: totalwin }]
        : [],
    hasComponent: (name: string) => name === "lineWin",
    getComponent: (name: string) =>
      name === "lineWin"
        ? {
            name,
            raw: {},
            hasBasicComponentData: true,
            usedSceneIndexes: [0],
            usedOtherSceneIndexes: [0],
            usedResultIndexes: totalwin > 0 ? [0] : [],
          }
        : undefined,
    getComponentScenes: (name: string) =>
      name === "lineWin" ? [[[1, 2, 3]]] : [],
    getComponentOtherScenes: (name: string) =>
      name === "lineWin" ? [[[0, totalwin, 0]]] : [],
    getComponentResults: (name: string) =>
      name === "lineWin" && totalwin > 0
        ? [{ pos: [0, 0], coinWin: totalwin, cashWin: totalwin }]
        : [],
  };
  return {
    getGameModuleName: () => "mock",
    getGameId: () => 9,
    getBet: () => 1,
    getLines: () => 10,
    getTotalWin: () => totalwin,
    getPlayWin: () => undefined,
    getRawMessage: () => ({}),
    getRawGmi: () => createGmiFixture({ totalwin }),
    getDefaultScene: () => [[1, 2, 3]],
    getRandomNumbers: () => [11, 22, 33],
    getStepCount: () => 1,
    getStep: () => step,
    getSteps: () => [step],
    getScene: () => [[1, 2, 3]],
    getOtherScene: () => [[0, totalwin, 0]],
    getResult: () => ({ pos: [0, 0], coinWin: totalwin, cashWin: totalwin }),
    hasComponent: (_stepIndex, name) => name === "lineWin",
    getComponent: (_stepIndex, name) => step.getComponent(name),
    getComponentScenes: (_stepIndex, name) => step.getComponentScenes(name),
    getComponentOtherScenes: (_stepIndex, name) =>
      step.getComponentOtherScenes(name),
    getComponentResults: (_stepIndex, name) => step.getComponentResults(name),
  };
}

export class MockClient implements SlotGameClientLike {
  public readonly calls: string[] = [];
  public readonly listeners = new Map<
    string,
    Set<(...args: unknown[]) => void>
  >();
  public userInfo: Readonly<UserInfo> = Object.freeze({
    balance: 1000,
    gameid: 9,
    defaultScene: [[1, 2, 3]],
  });
  public spinResult: unknown = createSpinResult();
  public connectPromise: Promise<void> | null = null;
  public enterGamePromise: Promise<unknown> | null = null;
  public spinPromise: Promise<unknown> | null = null;
  public collectPromise: Promise<unknown> | null = null;

  getUserInfo(): Readonly<UserInfo> {
    this.calls.push("getUserInfo");
    return this.userInfo;
  }

  async connect(token?: string): Promise<void> {
    this.calls.push(`connect:${token ?? ""}`);
    if (this.connectPromise) {
      return this.connectPromise;
    }
  }

  async enterGame(gamecode?: string): Promise<unknown> {
    this.calls.push(`enterGame:${gamecode ?? ""}`);
    if (this.enterGamePromise) {
      return this.enterGamePromise;
    }
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
    if (this.collectPromise) {
      return this.collectPromise;
    }
    this.userInfo = Object.freeze({ ...this.userInfo, balance: 1100 });
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

export class MockAdapter implements SlotGameAdapter {
  public readonly calls: string[] = [];
  public readonly states: SlotGameStateSnapshot[] = [];
  public context: SlotGameMountContext | null = null;
  public lastLogic: GameLogic | null = null;
  public playPromise: Promise<void> | null = null;
  public destroyed = false;

  mount(context: SlotGameMountContext): void {
    this.calls.push("mount");
    this.context = context;
    context.gameLayer.dataset.mockAdapter = "mounted";
  }

  applyInitialState(): void {
    this.calls.push("initial");
  }

  async playSpin(logic: GameLogic): Promise<void> {
    this.calls.push("play");
    this.lastLogic = logic;
    if (this.playPromise) {
      await this.playPromise;
    }
  }

  setFrameworkState(state: SlotGameStateSnapshot): void {
    this.states.push(state);
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function createStep(
  index: number,
  totalwin: number,
  componentName: string,
): Record<string, unknown> {
  return {
    coinWin: totalwin,
    cashWin: totalwin,
    clientData: {
      scenes: [createScene(index + 1)],
      otherScenes: [createOtherScene(index + totalwin)],
      results:
        totalwin > 0
          ? [{ pos: [0, index], coinWin: totalwin, cashWin: totalwin }]
          : [],
      curGameMod: "base",
      curGameModParam: {
        historyComponents: [componentName],
        historyComponentsEx: [componentName],
        mapComponents: {
          [componentName]: {
            basicComponentData: {
              usedScenes: [0],
              usedResults: totalwin > 0 ? [0] : [],
              usedOtherScenes: [0],
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
  };
}

function createScene(seed: number): Record<string, unknown> {
  return {
    values: [
      { values: [seed + 1, 2, 3] },
      { values: [4, seed + 5, 6] },
      { values: [7, 8, seed + 9] },
    ],
    indexes: [],
    validRow: [],
  };
}

function createOtherScene(seed: number): Record<string, unknown> {
  return {
    values: [
      { values: [0, seed, 0] },
      { values: [0, 0, 0] },
      { values: [0, 0, 0] },
    ],
    indexes: [],
    validRow: [],
  };
}
