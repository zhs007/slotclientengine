import { describe, expect, it, vi } from "vitest";
import {
  isHandshakeMessage,
  launchRuntimeWindow,
  readRuntimeNonce,
} from "../src/runtime/launch-channel.js";
import { parseGameViewerLaunchPayload } from "../src/runtime/launch-payload.js";

const config = {
  kind: "scene-layout-slot-template",
  version: 1,
  title: "sample",
  live: {
    serverUrl: "wss://example.com/",
    gamecode: "code",
    clienttype: "web",
    requestTimeoutMs: 1000,
  },
  wager: {
    betOptions: [{ bet: 1, lines: 1 }],
    initialBetIndex: 0,
  },
  round: {
    kind: "slot-round-flow",
    version: 1,
    components: { spin: "spin", wins: [] },
    amount: { cashFields: ["cashWin"], cashUnit: "cents" },
  },
  presentation: {
    reel: {
      kind: "standard",
      version: 1,
      direction: "forward",
      speedSymbolsPerSecond: 20,
      minimumSpinCycles: 3,
      baseDurationMs: 800,
      startDelayMs: 0,
      stopDelayMs: 100,
      bounceStrength: 0,
    },
    flow: {
      version: 1,
      symbolStates: { normal: "normal", win: "win", remove: "remove" },
      dimmingAlpha: 0.5,
      popup: { enabled: false },
      cascade: {
        emphasisFadeInMs: 100,
        emphasisHoldMs: 100,
        emphasisFadeOutMs: 100,
        baseFallSeconds: 0.2,
        perRowFallSeconds: 0.1,
        maxFallSeconds: 1,
        settleSeconds: 0.1,
      },
    },
  },
} as const;

describe("runtime launch protocol", () => {
  it("strictly validates version, nonce, hash, bytes and credential", () => {
    const nonce = "1".repeat(32);
    const parsed = parseGameViewerLaunchPayload(
      {
        kind: "game-viewer-launch",
        version: 1,
        nonce,
        layoutSha256: "a".repeat(64),
        layoutZipBytes: new Uint8Array([1]),
        config,
        credential: { token: "session-only" },
      },
      nonce,
    );
    expect(parsed.config.title).toBe("sample");
    expect(parsed.credential.token).toBe("session-only");
    expect(() =>
      parseGameViewerLaunchPayload(
        {
          ...parsed,
          nonce: "2".repeat(32),
        },
        nonce,
      ),
    ).toThrow(/nonce/);
  });

  it.each([
    ["payload object", null, /payload 必须是对象/],
    ["payload array", [], /payload 必须是对象/],
    ["unknown field", { hidden: true }, /payload.hidden 不受支持/],
    ["kind", { kind: "other" }, /payload kind 无效/],
    [
      "version",
      { kind: "game-viewer-launch", version: 2 },
      /payload version 无效/,
    ],
    [
      "hash",
      {
        kind: "game-viewer-launch",
        version: 1,
        nonce: "1".repeat(32),
        layoutSha256: "bad",
      },
      /layoutSha256 无效/,
    ],
    [
      "bytes",
      {
        kind: "game-viewer-launch",
        version: 1,
        nonce: "1".repeat(32),
        layoutSha256: "a".repeat(64),
        layoutZipBytes: [],
      },
      /必须是 Uint8Array/,
    ],
    [
      "credential object",
      {
        kind: "game-viewer-launch",
        version: 1,
        nonce: "1".repeat(32),
        layoutSha256: "a".repeat(64),
        layoutZipBytes: new Uint8Array(),
        credential: null,
      },
      /credential 必须是对象/,
    ],
    [
      "credential unknown",
      {
        kind: "game-viewer-launch",
        version: 1,
        nonce: "1".repeat(32),
        layoutSha256: "a".repeat(64),
        layoutZipBytes: new Uint8Array(),
        credential: { password: "secret" },
      },
      /credential.password 不受支持/,
    ],
    [
      "credential token",
      {
        kind: "game-viewer-launch",
        version: 1,
        nonce: "1".repeat(32),
        layoutSha256: "a".repeat(64),
        layoutZipBytes: new Uint8Array(),
        credential: { token: " " },
      },
      /credential.token 必须是非空字符串/,
    ],
  ])("rejects invalid %s", (_label, input, message) => {
    expect(() => parseGameViewerLaunchPayload(input, "1".repeat(32))).toThrow(
      message,
    );
  });

  it("trims both optional credential fields", () => {
    const nonce = "1".repeat(32);
    const parsed = parseGameViewerLaunchPayload(
      {
        kind: "game-viewer-launch",
        version: 1,
        nonce,
        layoutSha256: "a".repeat(64),
        layoutZipBytes: new Uint8Array(),
        config,
        credential: { token: " token ", businessid: " business " },
      },
      nonce,
    );
    expect(parsed.credential).toEqual({
      token: "token",
      businessid: "business",
    });
  });

  it("opens the child synchronously and reports popup blocking", async () => {
    const open = vi.fn(() => null);
    const host = {
      location: new URL("https://example.com/configurator"),
      open,
    } as unknown as Window;
    const promise = launchRuntimeWindow(
      {
        layoutSha256: "a".repeat(64),
        layoutZipBytes: new Uint8Array([1]),
        config,
        credential: {},
      },
      host,
    );
    expect(open).toHaveBeenCalledOnce();
    await expect(promise).rejects.toThrow(/阻止了新窗口/);
  });

  it("transfers one payload only after the authenticated port handshake", async () => {
    let hostMessage:
      | ((event: { origin: string; source: Window; data: unknown }) => void)
      | null = null;
    let received: unknown;
    const child = {
      postMessage: (
        _message: unknown,
        _origin: string,
        ports: readonly MessagePort[],
      ) => {
        const port = ports[0];
        port.onmessage = (event) => {
          received = event.data;
          port.postMessage({
            kind: "game-viewer-runtime-accepted",
            nonce: (event.data as { nonce: string }).nonce,
          });
        };
        port.start();
        const nonce = new URL(
          (open.mock.calls[0] as unknown as [string])[0],
        ).hash.slice("#nonce=".length);
        port.postMessage({
          kind: "game-viewer-runtime-port-ready",
          nonce,
        });
      },
    } as unknown as Window;
    const open = vi.fn(() => child);
    const host = {
      location: new URL("https://example.com/configurator"),
      open,
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      addEventListener: (type: string, listener: typeof hostMessage) => {
        if (type === "message") hostMessage = listener;
      },
      removeEventListener: vi.fn(),
    } as unknown as Window;
    const launched = launchRuntimeWindow(
      {
        layoutSha256: "a".repeat(64),
        layoutZipBytes: new Uint8Array([7, 8]),
        config,
        credential: { token: "session" },
      },
      host,
    );
    const runtimeUrl = new URL((open.mock.calls[0] as unknown as [string])[0]);
    const nonce = runtimeUrl.hash.slice("#nonce=".length);
    expect(hostMessage).not.toBeNull();
    hostMessage!({
      origin: "https://example.com",
      source: child,
      data: { kind: "game-viewer-runtime-ready", nonce },
    });
    await launched;
    expect(received).toMatchObject({
      kind: "game-viewer-launch",
      nonce,
      layoutSha256: "a".repeat(64),
      credential: { token: "session" },
    });
    expect((received as { layoutZipBytes: Uint8Array }).layoutZipBytes).toEqual(
      new Uint8Array([7, 8]),
    );
  });

  it("validates nonce fragments and handshake envelopes", () => {
    const nonce = "a".repeat(32);
    expect(readRuntimeNonce(`#nonce=${nonce}`)).toBe(nonce);
    expect(readRuntimeNonce(`nonce=${nonce}`)).toBe(nonce);
    expect(() => readRuntimeNonce("")).toThrow(/nonce/);
    expect(() => readRuntimeNonce("#nonce=short")).toThrow(/nonce/);
    expect(
      isHandshakeMessage(
        { kind: "game-viewer-runtime-ready", nonce },
        "game-viewer-runtime-ready",
        nonce,
      ),
    ).toBe(true);
    expect(
      isHandshakeMessage(
        { kind: "game-viewer-runtime-ready", nonce: "bad" },
        "game-viewer-runtime-ready",
        nonce,
      ),
    ).toBe(false);
    expect(isHandshakeMessage(null, "kind", nonce)).toBe(false);
    expect(isHandshakeMessage([], "kind", nonce)).toBe(false);
    expect(isHandshakeMessage("kind", "kind", nonce)).toBe(false);
  });
});
