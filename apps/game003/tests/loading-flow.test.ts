import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GAME003_GAMECODE,
  parseGame003FrameworkConfigFromQuery,
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

describe("game003 loading flow", () => {
  beforeEach(() => {
    frameworkMocks.prepareSlotGameLiveSession.mockReset();
    frameworkMocks.createSlotGameFramework.mockReset();
  });

  it("prepares live session at 99 percent without creating framework", async () => {
    const liveSession = createLiveSession();
    frameworkMocks.prepareSlotGameLiveSession.mockResolvedValue(liveSession);
    const { prepareGame003At99 } = await import("../src/game-entry.js");

    const prepared = await prepareGame003At99({ search: validQuery() });

    expect(prepared.liveSession).toBe(liveSession);
    expect(prepared.skin.id).toBe("1");
    expect(frameworkMocks.prepareSlotGameLiveSession).toHaveBeenCalledWith({
      live: expect.objectContaining({
        gamecode: GAME003_GAMECODE,
        token: "TOKEN",
      }),
    });
    expect(frameworkMocks.createSlotGameFramework).not.toHaveBeenCalled();
  });

  it("continues to reject legacy serverUrl before live preparation", async () => {
    frameworkMocks.prepareSlotGameLiveSession.mockResolvedValue(
      createLiveSession(),
    );
    const { prepareGame003At99 } = await import("../src/game-entry.js");

    await expect(
      prepareGame003At99({
        search: `${validQuery()}&serverUrl=wss%3A%2F%2Fexample.test%2F`,
      }),
    ).rejects.toThrow(/serverUrl query parameter is not supported/);
    expect(frameworkMocks.prepareSlotGameLiveSession).not.toHaveBeenCalled();
  });

  it("enters the game with the prepared session and no second live connect", async () => {
    const config = parseGame003FrameworkConfigFromQuery(validQuery());
    const liveSession = createLiveSession();
    const framework = createFramework();
    frameworkMocks.createSlotGameFramework.mockReturnValue(framework);
    const { enterGame003 } = await import("../src/game-entry.js");

    const entered = await enterGame003({
      root: document.createElement("div"),
      prepared: {
        config,
        skin: await import("../src/skin-config.js").then((module) =>
          module.getGame003SkinConfig("1"),
        ),
        liveSession,
      },
    });

    expect(frameworkMocks.createSlotGameFramework).toHaveBeenCalledWith(
      expect.objectContaining({
        liveSession,
        live: config.live,
      }),
    );
    expect(framework.connect).toHaveBeenCalledTimes(1);
    expect(liveSession.connect).not.toHaveBeenCalled();
    entered.destroy();
    expect(framework.destroy).toHaveBeenCalled();
  });

  it("cleans up framework or prepared session when enterGame fails", async () => {
    const config = parseGame003FrameworkConfigFromQuery(validQuery());
    const skin = await import("../src/skin-config.js").then((module) =>
      module.getGame003SkinConfig("1"),
    );
    const liveSession = createLiveSession();
    const failingFramework = createFramework();
    failingFramework.connect.mockRejectedValue(new Error("framework failed"));
    frameworkMocks.createSlotGameFramework.mockReturnValue(failingFramework);
    const { enterGame003 } = await import("../src/game-entry.js");

    await expect(
      enterGame003({
        root: document.createElement("div"),
        prepared: { config, skin, liveSession },
      }),
    ).rejects.toThrow(/framework failed/);
    expect(failingFramework.destroy).toHaveBeenCalled();

    const thrownLiveSession = createLiveSession();
    frameworkMocks.createSlotGameFramework.mockImplementation(() => {
      throw new Error("create failed");
    });
    await expect(
      enterGame003({
        root: document.createElement("div"),
        prepared: { config, skin, liveSession: thrownLiveSession },
      }),
    ).rejects.toThrow(/create failed/);
    expect(thrownLiveSession.disconnect).toHaveBeenCalled();
  });
});

function validQuery(): string {
  return `?${new URLSearchParams({
    skin: "1",
    token: "TOKEN",
    gamecode: GAME003_GAMECODE,
    businessid: "guest",
    clienttype: "web",
    jurisdiction: "MT",
    language: "en",
    bet: "5",
    lines: "10",
    times: "1",
    autonums: "-1",
    requestTimeoutMs: "30000",
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
