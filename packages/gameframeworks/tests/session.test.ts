import {
  SlotGameLiveSession,
  createSlotcraftClientOptions,
  validateLiveServerUrl,
} from "../src/index.js";
import { MockClient, createSpinResult } from "./test-helpers.js";

describe("session", () => {
  it("validates live URLs and builds fail-fast client options", () => {
    expect(() => validateLiveServerUrl("ws://localhost")).not.toThrow();
    expect(() => validateLiveServerUrl("wss://localhost")).not.toThrow();
    expect(() => validateLiveServerUrl("http://localhost")).toThrow(/ws/);
    expect(() => validateLiveServerUrl("not a url")).toThrow(/valid URL/);
    const logger = console;
    expect(
      createSlotcraftClientOptions(
        {
          serverUrl: "wss://game",
          token: "t",
          gamecode: "g",
          requestTimeoutMs: 200,
        },
        logger,
      ),
    ).toMatchObject({
      url: "wss://game",
      token: "t",
      gamecode: "g",
      requestTimeout: 200,
      maxReconnectAttempts: 0,
      autoCollectIntermediateResults: true,
    });
  });

  it("connects, spins without final collect, collects explicitly, and disconnects", async () => {
    const client = new MockClient();
    client.spinResult = createSpinResult({ totalwin: 10 });
    const session = new SlotGameLiveSession({
      live: { serverUrl: "ws://localhost", token: "t", gamecode: "g" },
      clientFactory: () => client,
    });

    await session.connect();
    await session.spin({ bet: 1, lines: 10 });
    expect(client.calls).toEqual([
      "connect:t",
      "enterGame:g",
      "getUserInfo",
      'spin:{"bet":1,"lines":10}',
    ]);
    await session.collect();
    expect(client.calls).toContain("collect:");
    session.disconnect();
    expect(client.calls.at(-1)).toBe("disconnect");
  });

  it("rejects session operations before connect and concurrent spin", async () => {
    const client = new MockClient();
    const session = new SlotGameLiveSession({
      live: { serverUrl: "ws://localhost" },
      clientFactory: () => client,
    });
    await expect(session.spin({ bet: 1, lines: 10 })).rejects.toThrow(
      /before connect/,
    );
    await expect(session.collect()).rejects.toThrow(/before connect/);
    await session.connect();
    let resolveSpin: (value: unknown) => void = () => undefined;
    client.spinPromise = new Promise((resolve) => {
      resolveSpin = resolve;
    });
    const first = session.spin({ bet: 1, lines: 10 });
    await expect(session.spin({ bet: 1, lines: 10 })).rejects.toThrow(
      /already in progress/,
    );
    resolveSpin(createSpinResult());
    await first;
  });

  it("validates user info during connect and collect", async () => {
    const badBalance = new MockClient();
    badBalance.userInfo = Object.freeze({ balance: Number.NaN });
    await expect(
      new SlotGameLiveSession({
        live: { serverUrl: "ws://localhost" },
        clientFactory: () => badBalance,
      }).connect(),
    ).rejects.toThrow(/balance/);

    const badGameId = new MockClient();
    badGameId.userInfo = Object.freeze({ balance: 100, gameid: -1 });
    await expect(
      new SlotGameLiveSession({
        live: { serverUrl: "ws://localhost" },
        clientFactory: () => badGameId,
      }).connect(),
    ).rejects.toThrow(/gameid/);

    const collectBadBalance = new MockClient();
    const session = new SlotGameLiveSession({
      live: { serverUrl: "ws://localhost" },
      clientFactory: () => collectBadBalance,
    });
    await session.connect();
    collectBadBalance.collectPromise = Promise.resolve().then(() => {
      collectBadBalance.userInfo = Object.freeze({
        balance: Number.POSITIVE_INFINITY,
      });
    });
    await expect(session.collect()).rejects.toThrow(/balance/);
  });

  it("fails fast on client events, server error messages, and logger warnings", async () => {
    const client = new MockClient();
    let resolveSpin: (value: unknown) => void = () => undefined;
    client.spinPromise = new Promise((resolve) => {
      resolveSpin = resolve;
    });
    const session = new SlotGameLiveSession({
      live: { serverUrl: "ws://localhost" },
      clientFactory: () => client,
    });
    await session.connect();
    const spin = session.spin({ bet: 1, lines: 10 });
    client.emit("message", { msgid: "noticemsg2", errmsg: "bad" });
    await expect(spin).rejects.toThrow(/server error/);
    resolveSpin(createSpinResult());

    const warningClient = new MockClient();
    const capturedLoggers: { warn: (...args: unknown[]) => void }[] = [];
    const warningSession = new SlotGameLiveSession({
      live: { serverUrl: "ws://localhost" },
      clientFactory: (_live, options) => {
        if (options.logger) {
          capturedLoggers.push(options.logger);
        }
        return warningClient;
      },
    });
    await warningSession.connect();
    capturedLoggers[0].warn("warning");
    await expect(warningSession.spin({ bet: 1, lines: 10 })).rejects.toThrow(
      /logger.warn/,
    );
  });

  it("fails fast on error, disconnect, reconnecting, logger error, and string error messages", async () => {
    for (const event of ["error", "disconnect", "reconnecting"] as const) {
      const client = new MockClient();
      let resolveSpin: (value: unknown) => void = () => undefined;
      client.spinPromise = new Promise((resolve) => {
        resolveSpin = resolve;
      });
      const session = new SlotGameLiveSession({
        live: { serverUrl: "ws://localhost" },
        clientFactory: () => client,
      });
      await session.connect();
      const spin = session.spin({ bet: 1, lines: 10 });
      client.emit(
        event,
        event === "error" ? new Error("event bad") : { reason: event },
      );
      await expect(spin).rejects.toThrow(
        event === "error" ? /event bad/ : new RegExp(event),
      );
      resolveSpin(createSpinResult());
    }

    const stringClient = new MockClient();
    let resolveStringSpin: (value: unknown) => void = () => undefined;
    stringClient.spinPromise = new Promise((resolve) => {
      resolveStringSpin = resolve;
    });
    const stringSession = new SlotGameLiveSession({
      live: { serverUrl: "ws://localhost" },
      clientFactory: () => stringClient,
    });
    await stringSession.connect();
    const spin = stringSession.spin({ bet: 1, lines: 10 });
    stringClient.emit("message", '{"errorMessage":"bad"}');
    await expect(spin).rejects.toThrow(/server error/);
    resolveStringSpin(createSpinResult());

    const loggerClient = new MockClient();
    const capturedLoggers: { error: (...args: unknown[]) => void }[] = [];
    const loggerSession = new SlotGameLiveSession({
      live: { serverUrl: "ws://localhost" },
      clientFactory: (_live, options) => {
        if (options.logger) {
          capturedLoggers.push(options.logger);
        }
        return loggerClient;
      },
    });
    await loggerSession.connect();
    capturedLoggers[0].error("bad");
    await expect(loggerSession.spin({ bet: 1, lines: 10 })).rejects.toThrow(
      /logger.error/,
    );
  });
});
