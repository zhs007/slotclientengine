import { beforeEach, describe, expect, it, vi } from "vitest";
import { Assets } from "pixi.js";
import {
  GAME002_LIVE_SERVER_URL,
  parseGame002LaunchQuery,
} from "../src/framework-config.js";
import type { Game002ReadinessResult } from "../src/game002-bootstrap.js";

const frameworkMocks = vi.hoisted(() => ({
  createSlotGameFramework: vi.fn(),
}));

vi.mock("@slotclientengine/gameframeworks", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@slotclientengine/gameframeworks")>();
  return {
    ...actual,
    createSlotGameFramework: frameworkMocks.createSlotGameFramework,
  };
});

describe("game002 99 percent finalization and ownership", () => {
  beforeEach(() => frameworkMocks.createSlotGameFramework.mockReset());

  it("finalizes skin only after an already prepared platform/session result", async () => {
    const sizes = [
      [36, 49],
      [26, 48],
      [37, 48],
      [36, 49],
      [35, 48],
      [33, 49],
      [34, 49],
      [35, 48],
      [35, 49],
      [34, 48],
    ] as const;
    const loadTexture = vi
      .spyOn(Assets, "load")
      .mockImplementation(async (source) => {
        const unresolved = Array.isArray(source) ? source[0] : source;
        const url =
          typeof unresolved === "string"
            ? unresolved
            : String((unresolved as { src?: unknown } | undefined)?.src ?? "");
        const digit = Number(/u003([0-9])\.png/u.exec(url)?.[1]);
        const [width, height] = sizes[digit] ?? [];
        return { width, height } as never;
      });
    const readiness = createReadiness();
    const { finalizeGame002At99 } = await import("../src/game-entry.js");
    const prepared = await finalizeGame002At99({
      readinessResult: readiness,
      signal: new AbortController().signal,
    });
    expect(prepared.readiness).toBe(readiness);
    expect(prepared.skin.id).toBe("1");
    expect(readiness.destroy).not.toHaveBeenCalled();
    await prepared.valuePresentationResourceBundle.destroy();
    loadTexture.mockRestore();
  });

  it("cleans readiness when finalization is aborted", async () => {
    const readiness = createReadiness();
    const controller = new AbortController();
    controller.abort();
    const { finalizeGame002At99 } = await import("../src/game-entry.js");
    await expect(
      finalizeGame002At99({
        readinessResult: readiness,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(readiness.destroy).toHaveBeenCalledOnce();
  });

  it("injects platform presentation/preferences and cleans entered ownership", async () => {
    const config = parseGame002LaunchQuery(validQuery());
    const skin = await import("../src/skin-config.js").then((module) =>
      module.getGame002SkinConfig("1"),
    );
    const readiness = createReadiness(config);
    const framework = createFramework();
    frameworkMocks.createSlotGameFramework.mockReturnValue(framework);
    const valueBundle = {
      resources: {},
      destroy: vi.fn(async () => undefined),
    };
    const { enterGame002 } = await import("../src/game-entry.js");
    const entered = await enterGame002({
      root: document.createElement("div"),
      prepared: {
        readiness,
        skin,
        valuePresentationResourceBundle: valueBundle,
      },
    });
    expect(frameworkMocks.createSlotGameFramework).toHaveBeenCalledWith(
      expect.objectContaining({
        liveSession: readiness.liveSession,
        live: config.live,
        initialMuted: true,
        initialFastMode: true,
        initialAutoMode: false,
        brandLabel: "game002",
        currency: "USD",
        locale: "en-US",
        designSize: { width: 1125, height: 2000 },
        framePolicy: expect.objectContaining({ mode: "maximized-focus" }),
        uiFactory: expect.objectContaining({ create: expect.any(Function) }),
      }),
    );
    expect(framework.connect).toHaveBeenCalledOnce();
    expect(readiness.liveSession.connect).not.toHaveBeenCalled();
    entered.destroy();
    entered.destroy();
    await Promise.resolve();
    expect(framework.destroy).toHaveBeenCalledOnce();
    expect(readiness.platformHandle.destroy).toHaveBeenCalledOnce();
    expect(valueBundle.destroy).toHaveBeenCalledOnce();
  });

  it("cleans framework, platform and bundle when framework connect fails", async () => {
    const skin = await import("../src/skin-config.js").then((module) =>
      module.getGame002SkinConfig("1"),
    );
    const { enterGame002 } = await import("../src/game-entry.js");
    const readiness = createReadiness();
    const valueBundle = {
      resources: {},
      destroy: vi.fn(async () => undefined),
    };
    const framework = createFramework();
    framework.connect.mockRejectedValue(new Error("connect failed"));
    frameworkMocks.createSlotGameFramework.mockReturnValue(framework);
    let caught: unknown;
    try {
      await enterGame002({
        root: document.createElement("div"),
        prepared: {
          readiness,
          skin,
          valuePresentationResourceBundle: valueBundle,
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("connect failed");
    expect(framework.destroy).toHaveBeenCalledOnce();
    expect(readiness.liveSession.disconnect).not.toHaveBeenCalled();
    expect(readiness.platformHandle.destroy).toHaveBeenCalledOnce();
    expect(valueBundle.destroy).toHaveBeenCalledOnce();
  });
});

function createReadiness(
  config = parseGame002LaunchQuery(validQuery()),
): Game002ReadinessResult & { readonly destroy: ReturnType<typeof vi.fn> } {
  const liveSession = {
    getUserInfo: vi.fn(() => ({ balance: 1000 })),
    connect: vi.fn(async () => ({ balance: 1000 })),
    spin: vi.fn(),
    collect: vi.fn(),
    disconnect: vi.fn(),
  };
  const platformHandle = {
    snapshot: Object.freeze({
      platform: "leo",
      mode: "real" as const,
      gameCode: "GAME_CODE",
      businessCode: "guest",
      language: "en",
      jurisdiction: "MT",
      presentation: Object.freeze({
        brandLabel: "game002",
        currency: "USD",
        locale: "en-US",
      }),
      initialPreferences: Object.freeze({
        muted: true,
        fastMode: true,
        autoMode: false,
      }),
      translations: Object.freeze({ spin: "SPIN NOW" }),
      warnings: Object.freeze([]),
    }),
    destroy: vi.fn(),
  };
  const destroy = vi.fn(() => {
    platformHandle.destroy();
    liveSession.disconnect();
  });
  return Object.freeze({ config, liveSession, platformHandle, destroy });
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

function validQuery(): string {
  return `?${new URLSearchParams({
    skin: "1",
    token: "FAKE_TOKEN",
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
  })}`;
}

expect(GAME002_LIVE_SERVER_URL).toBe(
  "wss://gameserv.rgstest.slammerstudios.com/",
);
