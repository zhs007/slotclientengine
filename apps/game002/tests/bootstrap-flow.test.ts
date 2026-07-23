import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  providerPrepare: vi.fn(),
  createProvider: vi.fn(),
  prepareSession: vi.fn(),
}));

vi.mock("@slotclientengine/platformbootstrap-leo", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@slotclientengine/platformbootstrap-leo")
    >();
  return {
    ...actual,
    createLeoPlatformBootstrapProvider: mocks.createProvider,
  };
});

vi.mock("@slotclientengine/gameframeworks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@slotclientengine/gameframeworks")>();
  return { ...actual, prepareSlotGameLiveSession: mocks.prepareSession };
});

describe("game002 early readiness coordinator", () => {
  beforeEach(() => {
    mocks.providerPrepare.mockReset();
    mocks.prepareSession.mockReset();
    mocks.createProvider.mockReset();
    mocks.createProvider.mockReturnValue({ prepare: mocks.providerPrepare });
  });

  it("starts one platform prepare and one live session before either settles", async () => {
    const platform = deferred<ReturnType<typeof createPlatformHandle>>();
    const session = deferred<ReturnType<typeof createSession>>();
    mocks.providerPrepare.mockReturnValue(platform.promise);
    mocks.prepareSession.mockReturnValue(session.promise);
    const { startGame002Readiness } =
      await import("../src/game002-bootstrap.js");
    const pending = startGame002Readiness({
      search: validQuery(),
      signal: new AbortController().signal,
    });
    expect(mocks.providerPrepare).toHaveBeenCalledOnce();
    expect(mocks.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        presentation: expect.objectContaining({
          localeByLanguage: {
            en: "en-US",
            en_GB: "en-GB",
          },
        }),
      }),
    );
    expect(mocks.prepareSession).toHaveBeenCalledOnce();
    expect(mocks.prepareSession).toHaveBeenCalledWith({
      live: expect.objectContaining({
        serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
        token: "FAKE_TOKEN",
        gamecode: "GAME_CODE",
      }),
      signal: expect.any(AbortSignal),
    });
    const platformHandle = createPlatformHandle();
    const liveSession = createSession();
    platform.resolve(platformHandle);
    session.resolve(liveSession);
    const result = await pending;
    expect(result.platformHandle).toBe(platformHandle);
    expect(result.liveSession).toBe(liveSession);
    result.destroy();
    result.destroy();
    expect(platformHandle.destroy).toHaveBeenCalledOnce();
    expect(liveSession.disconnect).toHaveBeenCalledOnce();
  });

  it("aborts the sibling and cleans a late session after platform failure", async () => {
    const failure = new Error("platform failed");
    const liveSession = createSession();
    mocks.providerPrepare.mockRejectedValue(failure);
    mocks.prepareSession.mockResolvedValue(liveSession);
    const { startGame002Readiness } =
      await import("../src/game002-bootstrap.js");
    await expect(
      startGame002Readiness({
        search: validQuery(),
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(failure);
    expect(liveSession.disconnect).toHaveBeenCalledOnce();
    expect(
      (mocks.prepareSession.mock.calls[0]?.[0] as { signal: AbortSignal })
        .signal.aborted,
    ).toBe(true);
  });

  it("cleans a completed platform handle after session failure", async () => {
    const platformHandle = createPlatformHandle();
    const failure = new Error("session failed");
    mocks.providerPrepare.mockResolvedValue(platformHandle);
    mocks.prepareSession.mockRejectedValue(failure);
    const { startGame002Readiness } =
      await import("../src/game002-bootstrap.js");
    await expect(
      startGame002Readiness({
        search: validQuery(),
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(failure);
    expect(platformHandle.destroy).toHaveBeenCalledOnce();
    expect(
      (mocks.providerPrepare.mock.calls[0]?.[0] as AbortSignal).aborted,
    ).toBe(true);
  });

  it("rejects replay before provider or session creation", async () => {
    const { startGame002Readiness } =
      await import("../src/game002-bootstrap.js");
    await expect(
      startGame002Readiness({
        search: validQuery({
          replayurl: "https://replay.test/data",
          mode: "REPLAY",
        }),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/replay mode is not supported/);
    expect(mocks.createProvider).not.toHaveBeenCalled();
    expect(mocks.prepareSession).not.toHaveBeenCalled();
  });
});

function createPlatformHandle() {
  return {
    snapshot: {
      platform: "leo",
      mode: "real" as const,
      gameCode: "GAME_CODE",
      businessCode: "business",
      language: "en",
      jurisdiction: "MT",
      presentation: { brandLabel: "game002", currency: "USD", locale: "en-US" },
      initialPreferences: { muted: false, fastMode: false, autoMode: false },
      translations: {},
      warnings: [],
    },
    destroy: vi.fn(),
  };
}

function createSession() {
  return {
    getUserInfo: vi.fn(() => ({ balance: 1000 })),
    connect: vi.fn(),
    spin: vi.fn(),
    collect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function validQuery(overrides: Record<string, string> = {}): string {
  return `?${new URLSearchParams({
    skin: "1",
    platformToken: "FAKE_TOKEN",
    gameCode: "GAME_CODE",
    businessCode: "business",
    clienttype: "web",
    jurisdiction: "MT",
    lang: "en",
    bet: "5",
    lines: "30",
    times: "1",
    autonums: "-1",
    requestTimeoutMs: "30000",
    ...overrides,
  })}`;
}
