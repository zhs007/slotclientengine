import {
  SlotGameRuntimeError,
  buildSpinParams,
  createSlotGameFramework,
  toSlotGameError,
} from "../src/index.js";
import {
  BET_OPTIONS,
  MockAdapter,
  MockClient,
  createMockGameLogic,
  createSpinResult,
} from "./test-helpers.js";

describe("framework flow", () => {
  it("connects, spins, presents logic, collects after play resolves, and returns the same GameLogic", async () => {
    const root = document.createElement("div");
    const client = new MockClient();
    client.spinResult = createSpinResult({ totalwin: 12, results: 1 });
    const adapter = new MockAdapter();
    let resolvePlay: () => void = () => undefined;
    adapter.playPromise = new Promise((resolve) => {
      resolvePlay = resolve;
    });
    const states: string[] = [];
    const framework = createSlotGameFramework({
      root,
      gameAdapter: adapter,
      live: { serverUrl: "ws://localhost", token: "t", gamecode: "g" },
      betOptions: BET_OPTIONS,
      initialBetIndex: 1,
      clientFactory: () => client,
      onStateChange: (state) => states.push(state.spinState),
    });

    await framework.connect();
    const spinPromise = framework.spin();
    await waitForState(() => framework.getState().spinState, "presenting");

    expect(framework.getState().spinState).toBe("presenting");
    expect(client.calls).not.toContain("collect:");
    expect(adapter.lastLogic).not.toBeNull();
    expect(root.querySelector(".slot-ui-spin-button")).toHaveProperty(
      "disabled",
      true,
    );

    resolvePlay();
    const logic = await spinPromise;
    expect(logic).toBe(adapter.lastLogic);
    expect(client.calls.indexOf("collect:")).toBeGreaterThan(
      client.calls.findIndex((call) => call.startsWith("spin:")),
    );
    expect(framework.getState()).toMatchObject({
      spinState: "idle",
      win: 12,
      balance: 1100,
    });
    expect(states).toEqual(
      expect.arrayContaining([
        "connecting",
        "spinning",
        "presenting",
        "collecting",
        "idle",
      ]),
    );
  });

  it("blocks spin before connect and concurrent direct spin calls", async () => {
    const root = document.createElement("div");
    const client = new MockClient();
    let resolveSpin: (value: unknown) => void = () => undefined;
    client.spinPromise = new Promise((resolve) => {
      resolveSpin = resolve;
    });
    const framework = createSlotGameFramework({
      root,
      gameAdapter: new MockAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => client,
      logicFactory: () => createMockGameLogic(0),
    });

    await expect(framework.spin()).rejects.toThrow(/before connect/);
    await framework.connect();
    const first = framework.spin();
    await expect(framework.spin()).rejects.toThrow(/already in progress/);
    resolveSpin(createSpinResult({ totalwin: 0 }));
    await first;
  });

  it("does not collect on single zero-win result and keeps zero multi-result collect", async () => {
    const zeroClient = new MockClient();
    zeroClient.spinResult = createSpinResult({ totalwin: 0, results: 1 });
    const zeroFramework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: new MockAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => zeroClient,
    });
    await zeroFramework.connect();
    await zeroFramework.spin();
    expect(zeroClient.calls).not.toContain("collect:");

    const multiClient = new MockClient();
    multiClient.spinResult = createSpinResult({ totalwin: 0, results: 2 });
    const multiFramework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: new MockAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => multiClient,
    });
    await multiFramework.connect();
    await multiFramework.spin();
    expect(multiClient.calls).toContain("collect:");
  });

  it("moves to error without collect when adapter or collect fails", async () => {
    const adapterClient = new MockClient();
    adapterClient.spinResult = createSpinResult({ totalwin: 5 });
    const adapter = new MockAdapter();
    adapter.playPromise = Promise.reject(new Error("play failed"));
    const framework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: adapter,
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => adapterClient,
    });
    await framework.connect();
    await expect(framework.spin()).rejects.toThrow(/play failed/);
    expect(adapterClient.calls).not.toContain("collect:");
    expect(framework.getState()).toMatchObject({ spinState: "error" });

    const collectClient = new MockClient();
    collectClient.spinResult = createSpinResult({ totalwin: 5 });
    collectClient.collectPromise = Promise.reject(new Error("collect failed"));
    const collectFramework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: new MockAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => collectClient,
    });
    await collectFramework.connect();
    await expect(collectFramework.spin()).rejects.toThrow(/collect failed/);
    expect(collectFramework.getState()).toMatchObject({ spinState: "error" });
  });

  it("validates params, supports toggles, and throws after destroy", async () => {
    const root = document.createElement("div");
    const client = new MockClient();
    const adapter = new MockAdapter();
    const framework = createSlotGameFramework({
      root,
      gameAdapter: adapter,
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => client,
      buildSpinRequest: () => ({ ctrlname: "spin2", autonums: 3 }),
    });

    expect(buildSpinParams(framework.getState(), BET_OPTIONS[0])).toEqual({
      bet: 1,
      lines: 10,
    });
    await framework.connect();
    framework.setBetIndex(1);
    framework.setMuted(true);
    framework.setFastMode(true);
    framework.setAutoMode(true);
    await framework.spin();
    expect(client.calls).toContain(
      'spin:{"bet":2,"lines":20,"times":2,"ctrlname":"spin2","autonums":3}',
    );
    expect(framework.getState()).toMatchObject({
      muted: true,
      fastMode: true,
      autoMode: true,
    });
    framework.destroy();
    framework.destroy();
    expect(adapter.destroyed).toBe(true);
    expect(() => framework.setBetIndex(0)).toThrow(/destroyed/);
    await expect(framework.connect()).rejects.toThrow(/destroyed/);
    await expect(framework.spin()).rejects.toThrow(/destroyed/);
    expect(new SlotGameRuntimeError("bad")).toBeInstanceOf(Error);
  });

  it("fails fast on bad framework configuration and spin request shape", async () => {
    expect(() =>
      createSlotGameFramework({
        root: null as never,
        gameAdapter: new MockAdapter(),
        live: { serverUrl: "ws://localhost" },
        betOptions: BET_OPTIONS,
      }),
    ).toThrow(/root/);
    expect(() =>
      createSlotGameFramework({
        root: document.createElement("div"),
        gameAdapter: {} as never,
        live: { serverUrl: "ws://localhost" },
        betOptions: BET_OPTIONS,
      }),
    ).toThrow(/gameAdapter/);
    expect(() =>
      createSlotGameFramework({
        root: document.createElement("div"),
        gameAdapter: new MockAdapter(),
        live: {} as never,
        betOptions: BET_OPTIONS,
      }),
    ).toThrow(/serverUrl/);

    const framework = createSlotGameFramework({
      root: document.createElement("div"),
      gameAdapter: new MockAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => new MockClient(),
      buildSpinRequest: () => null as never,
    });
    await framework.connect();
    await expect(framework.spin()).rejects.toThrow(/buildSpinRequest/);
    expect(framework.getState()).toMatchObject({ spinState: "error" });
    expect(toSlotGameError("raw", "fallback").message).toContain(
      "fallback raw",
    );
    expect(toSlotGameError(new Error("native"), "fallback").message).toBe(
      "native",
    );
  });
});

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
