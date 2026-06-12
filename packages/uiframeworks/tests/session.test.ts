import type { SlotcraftClientOptions } from "@slotclientengine/netcore";
import {
  SlotUiLiveSession,
  buildSpinParams,
  createSlotcraftClientOptions,
  requireFiniteBalance,
  shouldCollectFinalResult,
  validateLiveServerUrl,
  validateSlotUiSpinResult
} from "../src/index.js";
import {
  BET_OPTIONS,
  MockClient,
  createGmiFixture,
  createMockGameLogic,
  createSpinResult,
  createStateSnapshot
} from "./test-helpers.js";
import type { SlotcraftClientLike } from "../src/index.js";

describe("session", () => {
  it("rejects non-live URL protocols before client creation", () => {
    expect(() => validateLiveServerUrl("http://localhost/replay")).toThrow(/ws/);
    expect(() => validateLiveServerUrl("bad-url")).toThrow(/valid URL/);
    expect(() => validateLiveServerUrl("wss://example.test/game")).not.toThrow();
  });

  it("creates strict SlotcraftClient options", () => {
    const logger = console;
    const options = createSlotcraftClientOptions(
      {
        serverUrl: "ws://localhost",
        token: "token",
        gamecode: "game",
        requestTimeoutMs: 123
      },
      logger,
    );
    expect(options).toMatchObject({
      url: "ws://localhost",
      token: "token",
      gamecode: "game",
      requestTimeout: 123,
      maxReconnectAttempts: 0,
      autoCollectIntermediateResults: true,
      logger
    });
  });

  it("connects in order and validates balance", async () => {
    const client = new MockClient();
    const session = createSession(client);
    await expect(session.connect()).resolves.toMatchObject({ balance: 1000 });
    expect(client.calls.slice(0, 3)).toEqual([
      "connect:token",
      "enterGame:game001",
      "getUserInfo"
    ]);

    const missingBalance = new MockClient();
    missingBalance.userInfo = Object.freeze({ gameid: 1 });
    await createSession(missingBalance).connect();
    expect(() => requireFiniteBalance(missingBalance.userInfo)).toThrow(/balance/);
  });

  it("builds default and callback spin params without using fast implicitly", () => {
    const state = createStateSnapshot({ fastMode: true });
    expect(buildSpinParams(state, BET_OPTIONS[1])).toEqual({
      bet: 2,
      lines: 10,
      times: 2
    });
    expect(
      buildSpinParams(state, BET_OPTIONS[0], () => ({ bet: 9, lines: 1, fast: true })),
    ).toEqual({ bet: 9, lines: 1, fast: true });
    expect(() => buildSpinParams(state, BET_OPTIONS[0], () => null as never)).toThrow(/object/);
  });

  it("validates spin result fields and replyPlay length", () => {
    const state = createStateSnapshot();
    expect(
      validateSlotUiSpinResult(createSpinResult(3), {
        state,
        bet: BET_OPTIONS[0],
        userInfo: { gameid: 1 },
        logicFactory: createMockGameLogic
      }),
    ).toMatchObject({ totalwin: 3, results: 1 });
    expect(() =>
      validateSlotUiSpinResult({ totalwin: 0, results: 1 }, resultOptions(state)),
    ).toThrow(/gmi/);
    expect(() =>
      validateSlotUiSpinResult(
        { gmi: createGmiFixture(), results: 1 },
        resultOptions(state),
      ),
    ).toThrow(/totalwin/);
    expect(() =>
      validateSlotUiSpinResult(
        { gmi: createGmiFixture(), totalwin: 0 },
        resultOptions(state),
      ),
    ).toThrow(/results/);
    expect(() =>
      validateSlotUiSpinResult(createSpinResult(0, 2), resultOptions(state)),
    ).not.toThrow();
    expect(() =>
      validateSlotUiSpinResult(
        { gmi: createGmiFixture(1), totalwin: 0, results: 2 },
        resultOptions(state),
      ),
    ).toThrow(/length/);
    expect(() =>
      validateSlotUiSpinResult(createSpinResult(0), {
        ...resultOptions(state),
        logicFactory: () => {
          throw new Error("logic fail");
        }
      }),
    ).toThrow(/logic fail/);
  });

  it("prevents concurrent spin and collects when final result requires it", async () => {
    const client = new MockClient();
    client.spinResult = createSpinResult(10, 1);
    const session = createSession(client);
    await session.connect();
    await expect(
      session.spin({ state: createStateSnapshot(), bet: BET_OPTIONS[0] }),
    ).resolves.toMatchObject({ totalwin: 10 });
    expect(client.calls.some((call) => call.startsWith("collect"))).toBe(true);

    const slowClient = new MockClient();
    const deferred = createDeferred<unknown>();
    slowClient.spinPromise = deferred.promise;
    const slowSession = createSession(slowClient);
    await slowSession.connect();
    const first = slowSession.spin({
      state: createStateSnapshot(),
      bet: BET_OPTIONS[0]
    });
    await expect(
      slowSession.spin({ state: createStateSnapshot(), bet: BET_OPTIONS[0] }),
    ).rejects.toThrow(/already/);
    deferred.resolve(createSpinResult(0, 1));
    await first;
  });

  it("does not collect when rule says no collect is needed", async () => {
    const client = new MockClient();
    client.spinResult = createSpinResult(0, 1);
    const session = createSession(client);
    await session.connect();
    await session.spin({ state: createStateSnapshot(), bet: BET_OPTIONS[0] });
    expect(client.calls.some((call) => call.startsWith("collect"))).toBe(false);
    expect(shouldCollectFinalResult(0, 2)).toBe(true);
    expect(shouldCollectFinalResult(0, 1)).toBe(false);
  });

  it("fails current operation on netcore events and logger warnings", async () => {
    const client = new MockClient();
    client.connectPromise = new Promise(() => undefined);
    const session = createSession(client);
    const connect = session.connect();
    client.emit("error", new Error("network down"));
    await expect(connect).rejects.toThrow(/network down/);

    const warnClient = new MockClient();
    let capturedLogger: SlotcraftClientOptions["logger"] | undefined;
    const warnSession = new SlotUiLiveSession({
      live: { serverUrl: "ws://localhost" },
      clientFactory: (_live, options) => {
        capturedLogger = options.logger;
        return warnClient;
      },
      logicFactory: createMockGameLogic
    });
    await warnSession.connect();
    warnClient.spinPromise = new Promise(() => undefined);
    const spin = warnSession.spin({
      state: createStateSnapshot(),
      bet: BET_OPTIONS[0]
    });
    capturedLogger?.warn("warning from client");
    await expect(spin).rejects.toThrow(/logger.warn/);
  });

  it("fails on reconnecting, server notice, and unexpected disconnect", async () => {
    const reconnecting = new MockClient();
    reconnecting.spinPromise = new Promise(() => undefined);
    const reconnectingSession = createSession(reconnecting);
    await reconnectingSession.connect();
    const spin = reconnectingSession.spin({
      state: createStateSnapshot(),
      bet: BET_OPTIONS[0]
    });
    reconnecting.emit("reconnecting", { attempt: 1 });
    await expect(spin).rejects.toThrow(/reconnecting/);

    const notice = new MockClient();
    notice.spinPromise = new Promise(() => undefined);
    const noticeSession = createSession(notice);
    await noticeSession.connect();
    const noticeSpin = noticeSession.spin({
      state: createStateSnapshot(),
      bet: BET_OPTIONS[0]
    });
    notice.emit("message", { msgid: "noticemsg2", message: "server says no" });
    await expect(noticeSpin).rejects.toThrow(/server error/);

    const disconnected = new MockClient();
    disconnected.spinPromise = new Promise(() => undefined);
    const disconnectedSession = createSession(disconnected);
    await disconnectedSession.connect();
    const disconnectSpin = disconnectedSession.spin({
      state: createStateSnapshot(),
      bet: BET_OPTIONS[0]
    });
    disconnected.emit("disconnect", { code: 1006, reason: "lost", wasClean: false });
    await expect(disconnectSpin).rejects.toThrow(/disconnect/);
  });

  it("covers strict validation edge cases and parsed server messages", async () => {
    expect(() => shouldCollectFinalResult(0, -1)).toThrow(/non-negative/);
    expect(() =>
      validateSlotUiSpinResult(null, resultOptions()),
    ).toThrow(/object/);
    expect(() =>
      validateSlotUiSpinResult(
        { gmi: { replyPlay: { results: {} } }, totalwin: 0, results: 0 },
        resultOptions(),
      ),
    ).toThrow(/results must be an array/);
    expect(() =>
      validateSlotUiSpinResult(createSpinResult(0), {
        ...resultOptions(),
        userInfo: { gameid: -1 }
      }),
    ).toThrow(/gameid/);

    const client = new MockClient();
    client.spinPromise = new Promise(() => undefined);
    const session = createSession(client);
    await session.connect();
    const spin = session.spin({ state: createStateSnapshot(), bet: BET_OPTIONS[0] });
    client.emit("message", "not-json");
    client.emit("message", "{\"errorMessage\":\"server failed\"}");
    await expect(spin).rejects.toThrow(/server error/);
  });

  it("allows expected disconnect during destroy", async () => {
    const client = new MockClient();
    const session = createSession(client);
    await session.connect();
    expect(() => session.disconnect()).not.toThrow();
    expect(client.calls).toContain("disconnect");

    const noOffSource = new MockClient();
    const noOffClient: SlotcraftClientLike = {
      getUserInfo: () => noOffSource.getUserInfo(),
      connect: (token) => noOffSource.connect(token),
      enterGame: (gamecode) => noOffSource.enterGame(gamecode),
      spin: (params) => noOffSource.spin(params),
      collect: (playIndex) => noOffSource.collect(playIndex),
      disconnect: () => noOffSource.disconnect(),
      on: (event, callback) => noOffSource.on(event, callback)
    };
    const noOffSession = createSession(noOffClient);
    await noOffSession.connect();
    expect(() => noOffSession.disconnect()).not.toThrow();
  });
});

function createSession(client: SlotcraftClientLike): SlotUiLiveSession {
  return new SlotUiLiveSession({
    live: {
      serverUrl: "ws://localhost",
      token: "token",
      gamecode: "game001"
    },
    clientFactory: () => client,
    logicFactory: createMockGameLogic
  });
}

function resultOptions(state = createStateSnapshot()) {
  return {
    state,
    bet: BET_OPTIONS[0],
    userInfo: { gameid: 1 },
    logicFactory: createMockGameLogic
  };
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}
