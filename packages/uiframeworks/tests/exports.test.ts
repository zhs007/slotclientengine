import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SlotUiConfigError,
  SlotUiRuntimeError,
  createSlotUiController,
  createSlotUiFramework,
  validateBetOptions,
} from "../src/index.js";
import {
  BET_OPTIONS,
  MockClient,
  createStateSnapshot,
  createMockGameLogic,
  createSpinResult,
} from "./test-helpers.js";
import type { SlotGameAdapter, SlotUiSpinResult } from "../src/index.js";

describe("public exports and framework", () => {
  it("exports stable public API and CSS package path", () => {
    expect(typeof createSlotUiFramework).toBe("function");
    expect(typeof createSlotUiController).toBe("function");
    expect(() => validateBetOptions(BET_OPTIONS)).not.toThrow();
    expect(new SlotUiConfigError("bad")).toBeInstanceOf(Error);
    expect(new SlotUiRuntimeError("bad")).toBeInstanceOf(Error);
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(packageJson.exports["./styles.css"]).toBe("./dist/uiframeworks.css");
  });

  it("creates a UI-only controller without live session ownership", () => {
    const root = document.createElement("div");
    const calls: string[] = [];
    const controller = createSlotUiController({
      root,
      betOptions: BET_OPTIONS,
      initialBalance: 100,
      handlers: {
        onSpin: () => calls.push("spin"),
        onIncreaseBet: () => calls.push("increase"),
        onDecreaseBet: () => calls.push("decrease"),
        onMutedChange: (muted) => calls.push(`muted:${muted}`),
        onFastModeChange: (enabled) => calls.push(`fast:${enabled}`),
        onAutoModeChange: (enabled) => calls.push(`auto:${enabled}`),
      },
    });

    expect(root.querySelector(".slot-ui-frame")).toBe(
      controller.elements.frame,
    );
    controller.update(createStateSnapshot({ spinState: "presenting" }));
    const spinButton = root.querySelector(
      ".slot-ui-spin-button",
    ) as HTMLButtonElement;
    spinButton.click();
    expect(calls).toEqual([]);
    expect(controller.elements.frame.dataset.slotSpinState).toBe("presenting");

    controller.update(createStateSnapshot({ spinState: "idle" }));
    spinButton.click();
    expect(calls).toEqual(["spin"]);
    controller.destroy();
  });

  it("connects, spins, updates UI state, and destroys adapter", async () => {
    const root = document.createElement("div");
    document.body.append(root);
    const client = new MockClient();
    client.spinResult = createSpinResult(12, 1);
    client.userInfo = Object.freeze({
      balance: 988,
      gameid: 7,
      defaultScene: [[1, 2, 3]],
    });
    const states: string[] = [];
    const callbacks: string[] = [];
    const adapter = createAdapter(true);
    const framework = createSlotUiFramework({
      root,
      gameAdapter: adapter,
      live: { serverUrl: "ws://localhost", token: "t", gamecode: "g" },
      betOptions: BET_OPTIONS,
      initialBetIndex: 1,
      brandLabel: "HYPER GAMING",
      clock: { format: () => "18:25", updateIntervalMs: 60_000 },
      buyBonus: { label: "BUY BONUS" },
      onMenu: () => callbacks.push("menu"),
      onBuyBonus: () => callbacks.push("buyBonus"),
      currency: "USD",
      clientFactory: () => client,
      logicFactory: createMockGameLogic,
      onStateChange: (state) => states.push(state.spinState),
    });

    expect(root.querySelector(".slot-ui-frame")).toBeTruthy();
    expect(root.querySelector(".slot-ui-brand")?.textContent).toBe(
      "HYPER GAMING",
    );
    expect(root.querySelector(".slot-ui-clock")?.textContent).toBe("18:25");
    expect(framework.getState().betIndex).toBe(1);
    await framework.connect();
    expect(framework.getState()).toMatchObject({
      connected: true,
      balance: 988,
    });
    const result = await framework.spin();
    expect(result.totalwin).toBe(12);
    expect(adapter.initialBalance).toBe(988);
    expect(adapter.lastResult?.totalwin).toBe(12);
    expect(framework.getState()).toMatchObject({ win: 12, spinState: "idle" });
    expect(states).toContain("connecting");
    expect(states).toContain("spinning");
    expect(states).toContain("collecting");

    const increaseButton = root.querySelector(
      ".slot-ui-bet-increase",
    ) as HTMLButtonElement;
    const decreaseButton = root.querySelector(
      ".slot-ui-bet-decrease",
    ) as HTMLButtonElement;
    const menuButton = root.querySelector(
      ".slot-ui-menu-button",
    ) as HTMLButtonElement;
    const fastButton = root.querySelector(
      ".slot-ui-fast-button",
    ) as HTMLButtonElement;
    const buyBonusButton = root.querySelector(
      ".slot-ui-buy-bonus-button",
    ) as HTMLButtonElement;
    menuButton.click();
    fastButton.click();
    buyBonusButton.click();
    expect(callbacks).toEqual(["menu", "buyBonus"]);
    increaseButton.click();
    expect(framework.getState().betIndex).toBe(2);
    decreaseButton.click();
    expect(framework.getState().betIndex).toBe(1);

    framework.setBetIndex(2);
    framework.setMuted(true);
    framework.setFastMode(true);
    framework.setAutoMode(true);
    framework.setBalance(777);
    expect(framework.getState()).toMatchObject({
      betIndex: 2,
      muted: true,
      fastMode: true,
      autoMode: true,
      balance: 777,
    });
    framework.destroy();
    framework.destroy();
    expect(adapter.destroyed).toBe(true);
    expect(() => framework.setBalance(1)).toThrow(/destroyed/);
  });

  it("rejects spin before connect and propagates connect failures", async () => {
    const root = document.createElement("div");
    const client = new MockClient();
    const framework = createSlotUiFramework({
      root,
      gameAdapter: createAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => client,
      logicFactory: createMockGameLogic,
    });
    await expect(framework.spin()).rejects.toThrow(/before connect/);
    framework.destroy();

    const failing = new MockClient();
    failing.userInfo = Object.freeze({});
    const errors: string[] = [];
    const failedFramework = createSlotUiFramework({
      root: document.createElement("div"),
      gameAdapter: createAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => failing,
      logicFactory: createMockGameLogic,
      onError: (error) => errors.push(error.message),
    });
    await expect(failedFramework.connect()).rejects.toThrow(/balance/);
    expect(failedFramework.getState().spinState).toBe("error");
    expect(errors[0]).toContain("balance");
    failedFramework.destroy();
  });

  it("sets UI error state when adapter spin application fails", async () => {
    const root = document.createElement("div");
    const client = new MockClient();
    const framework = createSlotUiFramework({
      root,
      gameAdapter: {
        mount: () => undefined,
        applySpinResult: () => {
          throw new Error("adapter failed");
        },
      },
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => client,
      logicFactory: createMockGameLogic,
    });
    await framework.connect();
    await expect(framework.spin()).rejects.toThrow(/adapter failed/);
    expect(framework.getState()).toMatchObject({
      spinState: "error",
      error: "adapter failed",
    });
    framework.destroy();
  });

  it("rejects invalid framework options", () => {
    expect(() =>
      createSlotUiFramework({
        root: document.createElement("div"),
        gameAdapter: createAdapter(),
        live: { serverUrl: "http://localhost" },
        betOptions: BET_OPTIONS,
      }),
    ).toThrow(/ws/);
    expect(() =>
      createSlotUiFramework({
        root: {} as HTMLElement,
        gameAdapter: createAdapter(),
        live: { serverUrl: "ws://localhost" },
        betOptions: BET_OPTIONS,
      }),
    ).toThrow(/root/);
    expect(() =>
      createSlotUiFramework({
        root: document.createElement("div"),
        gameAdapter: { mount: () => undefined } as unknown as SlotGameAdapter,
        live: { serverUrl: "ws://localhost" },
        betOptions: BET_OPTIONS,
      }),
    ).toThrow(/gameAdapter/);
    expect(() =>
      createSlotUiFramework({
        root: document.createElement("div"),
        gameAdapter: createAdapter(),
        live: {} as never,
        betOptions: BET_OPTIONS,
      }),
    ).toThrow(/serverUrl/);
    expect(() =>
      createSlotUiFramework({
        root: document.createElement("div"),
        gameAdapter: createAdapter(),
        live: { serverUrl: "ws://localhost" },
        betOptions: BET_OPTIONS,
        clock: { updateIntervalMs: 0 },
      }),
    ).toThrow(/clock\.updateIntervalMs/);
  });
});

function createAdapter(readContext = false): SlotGameAdapter & {
  initialBalance: number | null;
  lastResult: SlotUiSpinResult | null;
  destroyed: boolean;
} {
  return {
    initialBalance: null,
    lastResult: null,
    destroyed: false,
    mount(root, context) {
      if (readContext) {
        expect(context.getState().betIndex).toBe(1);
      }
      const marker = document.createElement("div");
      marker.className = "test-game-layer";
      root.append(marker);
    },
    applyInitialState(state) {
      this.initialBalance = state.balance;
    },
    applySpinResult(result) {
      this.lastResult = result;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}
