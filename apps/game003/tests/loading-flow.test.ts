import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GAME003_GAMECODE,
  parseGame003FrameworkConfigFromQuery,
} from "../src/framework-config.js";
import minecart2LayoutManifest from "../../../assets/minecart2/layout.manifest.json";

const mocks = vi.hoisted(() => ({
  prepareSlotGameLiveSession: vi.fn(),
  createSlotGameFramework: vi.fn(),
  prepareGame003SkinConfig: vi.fn(),
  readGame003Minecart2PackageFiles: vi.fn(() => new Map()),
}));

vi.mock("@slotclientengine/gameframeworks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@slotclientengine/gameframeworks")>();
  return {
    ...actual,
    prepareSlotGameLiveSession: mocks.prepareSlotGameLiveSession,
    createSlotGameFramework: mocks.createSlotGameFramework,
  };
});

vi.mock("../src/skin-config.js", () => ({
  prepareGame003SkinConfig: mocks.prepareGame003SkinConfig,
}));

vi.mock("../src/loading-resources.js", () => ({
  readGame003Minecart2PackageFiles: mocks.readGame003Minecart2PackageFiles,
}));

describe("game003 loading flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareGame003SkinConfig.mockResolvedValue({
      skin: createSkin(),
      resourceOwner: { destroy: vi.fn() },
    });
  });

  it("prepares package ownership and live session at 99 percent", async () => {
    const liveSession = createLiveSession();
    mocks.prepareSlotGameLiveSession.mockResolvedValue(liveSession);
    const { prepareGame003At99 } = await import("../src/game-entry.js");

    const prepared = await prepareGame003At99({
      search: validQuery(),
      loadedResources: new Map(),
    });

    expect(prepared.liveSession).toBe(liveSession);
    expect(prepared.skin.id).toBe("2");
    expect(mocks.prepareGame003SkinConfig).toHaveBeenCalledWith("2", {
      minecart2Files: expect.any(Map),
    });
    expect(mocks.prepareSlotGameLiveSession).toHaveBeenCalledWith({
      live: expect.objectContaining({ gamecode: GAME003_GAMECODE }),
    });
    expect(mocks.createSlotGameFramework).not.toHaveBeenCalled();
  });

  it("rejects the removed skin and legacy server override before connecting", async () => {
    const { prepareGame003At99 } = await import("../src/game-entry.js");
    await expect(
      prepareGame003At99({ search: validQuery({ skin: "1" }) }),
    ).rejects.toThrow(/skin query parameter must be exactly "2"/);
    await expect(
      prepareGame003At99({ search: `${validQuery()}&serverUrl=wss://old/` }),
    ).rejects.toThrow(/serverUrl query parameter is not supported/);
    expect(mocks.prepareSlotGameLiveSession).not.toHaveBeenCalled();
  });

  it("stops before opening a live session when preparation is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { prepareGame003At99 } = await import("../src/game-entry.js");

    await expect(
      prepareGame003At99({ search: validQuery(), signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.prepareSlotGameLiveSession).not.toHaveBeenCalled();
  });

  it("enters using the prepared package manifest and destroys owned resources", async () => {
    const framework = createFramework();
    mocks.createSlotGameFramework.mockReturnValue(framework);
    const owner = { destroy: vi.fn() };
    const { enterGame003 } = await import("../src/game-entry.js");
    const entered = await enterGame003({
      root: document.createElement("div"),
      prepared: {
        config: parseGame003FrameworkConfigFromQuery(validQuery()),
        skin: createSkin() as never,
        skinResourceOwner: owner,
        liveSession: createLiveSession(),
      },
    });

    expect(mocks.createSlotGameFramework).toHaveBeenCalledWith(
      expect.objectContaining({
        designSize: { width: 1174, height: 2000 },
        brandLabel: "minecart2",
      }),
    );
    expect(framework.connect).toHaveBeenCalledOnce();
    await entered.destroy();
    await entered.destroy();
    expect(framework.destroy).toHaveBeenCalledOnce();
    expect(owner.destroy).toHaveBeenCalledOnce();
  });

  it("rejects a non-orientation-focus package and releases pre-owned resources", async () => {
    const owner = { destroy: vi.fn() };
    const liveSession = createLiveSession();
    const skin = createSkin();
    const invalidSkin = {
      ...skin,
      resource: {
        manifest: {
          ...skin.resource.manifest,
          adaptation: {
            ...skin.resource.manifest.adaptation,
            mode: "contain",
          },
        },
      },
    };
    const { enterGame003 } = await import("../src/game-entry.js");

    await expect(
      enterGame003({
        root: document.createElement("div"),
        prepared: {
          config: parseGame003FrameworkConfigFromQuery(validQuery()),
          skin: invalidSkin as never,
          skinResourceOwner: owner,
          liveSession,
        },
      }),
    ).rejects.toThrow(/orientation-focus/);
    expect(liveSession.disconnect).toHaveBeenCalledOnce();
    expect(owner.destroy).toHaveBeenCalledOnce();
  });

  it("destroys a created framework when connection fails", async () => {
    const framework = createFramework();
    framework.connect.mockRejectedValue(new Error("connect failed"));
    mocks.createSlotGameFramework.mockReturnValue(framework);
    const owner = { destroy: vi.fn() };
    const { enterGame003 } = await import("../src/game-entry.js");

    await expect(
      enterGame003({
        root: document.createElement("div"),
        prepared: {
          config: parseGame003FrameworkConfigFromQuery(validQuery()),
          skin: createSkin() as never,
          skinResourceOwner: owner,
          liveSession: createLiveSession(),
        },
      }),
    ).rejects.toThrow(/connect failed/);
    expect(framework.destroy).toHaveBeenCalledOnce();
    expect(owner.destroy).toHaveBeenCalledOnce();
  });
});

function validQuery(overrides: Record<string, string> = {}): string {
  return `?${new URLSearchParams({
    skin: "2",
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
    ...overrides,
  }).toString()}`;
}

function createSkin() {
  return {
    id: "2",
    resource: {
      manifest: minecart2LayoutManifest,
    },
  };
}

function createLiveSession() {
  return {
    getUserInfo: vi.fn(() => ({ balance: 1000 })),
    connect: vi.fn(),
    spin: vi.fn(),
    collect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createFramework() {
  return {
    connect: vi.fn(async () => undefined),
    destroy: vi.fn(),
  };
}
