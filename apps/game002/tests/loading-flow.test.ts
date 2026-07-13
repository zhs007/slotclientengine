import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GAME002_LIVE_SERVER_URL,
  parseGame002FrameworkConfigFromQuery,
} from "../src/framework-config.js";

const frameworkMocks = vi.hoisted(() => ({
  prepareSlotGameLiveSession: vi.fn(),
  createSlotGameFramework: vi.fn(),
}));

vi.mock("@slotclientengine/gameframeworks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@slotclientengine/gameframeworks")>();
  return {
    ...actual,
    prepareSlotGameLiveSession: frameworkMocks.prepareSlotGameLiveSession,
    createSlotGameFramework: frameworkMocks.createSlotGameFramework,
  };
});

describe("game002 loading flow", () => {
  beforeEach(() => {
    frameworkMocks.prepareSlotGameLiveSession.mockReset();
    frameworkMocks.createSlotGameFramework.mockReset();
  });

  it("prepares one live session at 99 percent without creating framework", async () => {
    const liveSession = createLiveSession();
    frameworkMocks.prepareSlotGameLiveSession.mockResolvedValue(liveSession);
    const { prepareGame002At99 } = await import("../src/game-entry.js");

    const prepared = await prepareGame002At99({ search: validQuery() });

    expect(prepared.liveSession).toBe(liveSession);
    expect(prepared.skin.id).toBe("1");
    expect(frameworkMocks.prepareSlotGameLiveSession).toHaveBeenCalledOnce();
    expect(frameworkMocks.prepareSlotGameLiveSession).toHaveBeenCalledWith({
      live: expect.objectContaining({
        serverUrl: GAME002_LIVE_SERVER_URL,
        gamecode: "GAME_CODE",
        token: "TOKEN",
      }),
    });
    expect(frameworkMocks.createSlotGameFramework).not.toHaveBeenCalled();
  });

  it("rejects legacy serverUrl and old skins before live preparation", async () => {
    const { prepareGame002At99 } = await import("../src/game-entry.js");
    await expect(
      prepareGame002At99({
        search: `${validQuery()}&serverUrl=wss%3A%2F%2Fexample.test%2F`,
      }),
    ).rejects.toThrow(/serverUrl query parameter is not supported/);
    await expect(
      prepareGame002At99({ search: validQuery({ skin: "5" }) }),
    ).rejects.toThrow(/skin query parameter must be exactly "1"/);
    expect(frameworkMocks.prepareSlotGameLiveSession).not.toHaveBeenCalled();
  });

  it("enters with the prepared session and cleans up all failure paths", async () => {
    const config = parseGame002FrameworkConfigFromQuery(validQuery());
    const skin = await import("../src/skin-config.js").then((module) =>
      module.getGame002SkinConfig("1"),
    );
    const liveSession = createLiveSession();
    const framework = createFramework();
    frameworkMocks.createSlotGameFramework.mockReturnValue(framework);
    const { enterGame002 } = await import("../src/game-entry.js");

    const entered = await enterGame002({
      root: document.createElement("div"),
      prepared: { config, skin, liveSession },
    });
    expect(frameworkMocks.createSlotGameFramework).toHaveBeenCalledWith(
      expect.objectContaining({
        liveSession,
        live: config.live,
        designSize: { width: 1125, height: 2000 },
        framePolicy: expect.objectContaining({
          mode: "maximized-focus",
          resolveViewportSize: expect.any(Function),
        }),
      }),
    );
    const frameworkOptions =
      frameworkMocks.createSlotGameFramework.mock.calls[0]?.[0];
    expect(frameworkOptions).toBeDefined();
    if (!frameworkOptions) {
      throw new Error("game002 framework options were not captured.");
    }
    const framePolicy = frameworkOptions.framePolicy;
    expect(framePolicy?.mode).toBe("maximized-focus");
    if (framePolicy?.mode !== "maximized-focus") {
      throw new Error("game002 must pass the maximized-focus frame policy.");
    }
    expect(
      framePolicy.resolveViewportSize({ width: 1200, height: 1200 }),
    ).toEqual({
      width: 1200,
      height: 1200,
    });
    expect(framework.connect).toHaveBeenCalledOnce();
    expect(liveSession.connect).not.toHaveBeenCalled();
    entered.destroy();
    entered.destroy();
    expect(framework.destroy).toHaveBeenCalledOnce();

    const failingFramework = createFramework();
    failingFramework.connect.mockRejectedValue(new Error("framework failed"));
    frameworkMocks.createSlotGameFramework.mockReturnValue(failingFramework);
    await expect(
      enterGame002({
        root: document.createElement("div"),
        prepared: { config, skin, liveSession },
      }),
    ).rejects.toThrow(/framework failed/);
    expect(failingFramework.destroy).toHaveBeenCalledOnce();

    const thrownSession = createLiveSession();
    frameworkMocks.createSlotGameFramework.mockImplementation(() => {
      throw new Error("create failed");
    });
    await expect(
      enterGame002({
        root: document.createElement("div"),
        prepared: { config, skin, liveSession: thrownSession },
      }),
    ).rejects.toThrow(/create failed/);
    expect(thrownSession.disconnect).toHaveBeenCalledOnce();
  });
});

function validQuery(overrides: Record<string, string> = {}): string {
  return `?${new URLSearchParams({
    skin: "1",
    token: "TOKEN",
    gamecode: "GAME_CODE",
    businessid: "guest",
    clienttype: "web",
    jurisdiction: "MT",
    language: "en",
    bet: "5",
    lines: "30",
    times: "1",
    autonums: "-1",
    requestTimeoutMs: "30000",
    ...overrides,
  }).toString()}`;
}

function createLiveSession() {
  return {
    getUserInfo: vi.fn(() => ({ balance: 1000 })),
    connect: vi.fn(async () => ({ balance: 1000 })),
    spin: vi.fn(),
    collect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createFramework() {
  return {
    connect: vi.fn(async () => undefined),
    spin: vi.fn(),
    setBetIndex: vi.fn(),
    setMuted: vi.fn(),
    setFastMode: vi.fn(),
    setAutoMode: vi.fn(),
    getState: vi.fn(),
    destroy: vi.fn(),
  };
}
