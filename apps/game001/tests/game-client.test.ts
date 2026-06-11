import { describe, expect, it, vi } from "vitest";
import type {
  GameLogic,
  GameLogicMeta,
  SceneMatrix,
} from "@slotclientengine/logiccore";
import type {
  DisconnectEventPayload,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";
import type { Game001EnvConfig } from "../src/env.js";
import {
  createGame001Client,
  shouldCollectGame001FinalResult,
  validateGame001SpinResult,
  type SlotcraftClientLike,
} from "../src/game-client.js";

const TARGET_SCENE: SceneMatrix = Object.freeze([
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([0, 4, 0, 5, 0]),
  Object.freeze([1, 1, 1, 1, 1]),
  Object.freeze([9, 0, 6, 0, 6]),
]);

describe("game001 client", () => {
  it("connects live client and returns live defaultScene without fixture fallback", async () => {
    const fake = new FakeSlotcraftClient();
    fake.userInfo.defaultScene = TARGET_SCENE.map((column) => [...column]);
    const client = createGame001Client(config(), {
      clientFactory: (options) => {
        fake.options = options;
        return fake;
      },
    });

    const initialState = await client.connect();

    expect(fake.connectToken).toBe("token-1");
    expect(fake.enterGamecode).toBe("game001");
    expect(fake.options?.autoCollectIntermediateResults).toBe(true);
    expect(initialState.defaultScene).toEqual(TARGET_SCENE);
  });

  it("keeps initial scene null when live defaultScene is absent", async () => {
    const fake = new FakeSlotcraftClient();
    const client = createGame001Client(config(), {
      clientFactory: () => fake,
    });

    await expect(client.connect()).resolves.toEqual({ defaultScene: null });
  });

  it("parses spin result with request meta and optional live gameid", async () => {
    const fake = new FakeSlotcraftClient();
    const logicFactory = vi.fn((gmi: unknown, meta: GameLogicMeta) =>
      createFakeLogic(TARGET_SCENE),
    );
    fake.spinHandler = async () => spinResult();
    const client = createGame001Client(config(), {
      clientFactory: () => fake,
      logicFactory,
    });

    const result = await client.spin();

    expect(fake.spinCalls).toEqual([{ bet: 10, lines: 25, times: 1 }]);
    expect(fake.collectCalls).toEqual([undefined]);
    expect(logicFactory).toHaveBeenCalledWith(spinResult().gmi, {
      bet: 10,
      lines: 25,
      totalwin: 7,
      gameid: 69002,
    });
    expect(result.scene).toEqual(TARGET_SCENE);
  });

  it("collects final results only when the current spin outcome requires it", async () => {
    const winningFake = new FakeSlotcraftClient();
    winningFake.spinHandler = async () =>
      spinResult({ totalwin: 1, results: 1 });
    const winningClient = createGame001Client(config(), {
      clientFactory: () => winningFake,
      logicFactory: () => createFakeLogic(TARGET_SCENE),
    });
    await winningClient.spin();
    expect(winningFake.collectCalls).toEqual([undefined]);

    const multiStageNoWinFake = new FakeSlotcraftClient();
    multiStageNoWinFake.spinHandler = async () =>
      spinResult({ totalwin: 0, results: 2 });
    const multiStageNoWinClient = createGame001Client(config(), {
      clientFactory: () => multiStageNoWinFake,
      logicFactory: () => createFakeLogic(TARGET_SCENE),
    });
    await multiStageNoWinClient.spin();
    expect(multiStageNoWinFake.collectCalls).toEqual([undefined]);

    const noWinFake = new FakeSlotcraftClient();
    noWinFake.spinHandler = async () => spinResult({ totalwin: 0, results: 1 });
    const noWinClient = createGame001Client(config(), {
      clientFactory: () => noWinFake,
      logicFactory: () => createFakeLogic(TARGET_SCENE),
    });
    await noWinClient.spin();
    expect(noWinFake.collectCalls).toEqual([]);
  });

  it("rejects when required final collect fails", async () => {
    const fake = new FakeSlotcraftClient();
    fake.collectHandler = async () => {
      throw new Error("collect rejected");
    };
    const client = createGame001Client(config(), {
      clientFactory: () => fake,
      logicFactory: () => createFakeLogic(TARGET_SCENE),
    });

    await expect(client.spin()).rejects.toThrow(/collect rejected/);
    expect(fake.collectCalls).toEqual([undefined]);
  });

  it("does not invent gameid when live userInfo does not include one", () => {
    let capturedMeta: GameLogicMeta | null = null;

    validateGame001SpinResult(spinResult(), {
      request: config(),
      userInfo: {},
      logicFactory: (_gmi, meta) => {
        capturedMeta = meta;
        return createFakeLogic(TARGET_SCENE);
      },
    });

    expect(capturedMeta).toEqual({ bet: 10, lines: 25, totalwin: 7 });
    expect(Object.prototype.hasOwnProperty.call(capturedMeta, "gameid")).toBe(
      false,
    );
  });

  it("rejects invalid spin payloads", () => {
    expect(() =>
      validateGame001SpinResult({ totalwin: 0, results: 1 }, parseOptions()),
    ).toThrow(/missing gmi/);
    expect(() =>
      validateGame001SpinResult(
        { gmi: { replyPlay: { results: [{}] } }, results: 1 },
        parseOptions(),
      ),
    ).toThrow(/missing totalwin/);
    expect(() =>
      validateGame001SpinResult(
        { gmi: { replyPlay: { results: [{}] } }, totalwin: 0, results: 2 },
        parseOptions(),
      ),
    ).toThrow(/must equal/);
    expect(() =>
      validateGame001SpinResult(
        { gmi: { replyPlay: { results: [{}] } }, totalwin: 0, results: 1 },
        {
          ...parseOptions(),
          logicFactory: () => createFakeLogic([[1, 2, 3, 4, 5]] as any),
        },
      ),
    ).toThrow(/width/);
    expect(() =>
      validateGame001SpinResult(
        {
          gmi: { replyPlay: { results: [{}] } },
          totalwin: Number.NaN,
          results: 1,
        },
        parseOptions(),
      ),
    ).toThrow(/totalwin/);
    expect(() =>
      validateGame001SpinResult(
        { gmi: { replyPlay: { results: [{}] } }, totalwin: 0, results: -1 },
        parseOptions(),
      ),
    ).toThrow(/results/);
    expect(() =>
      validateGame001SpinResult(
        { gmi: { replyPlay: { results: [{}] } }, totalwin: 0, results: 1 },
        { ...parseOptions(), userInfo: { gameid: -1 } },
      ),
    ).toThrow(/gameid/);
  });

  it("derives final collect need from the current spin totalwin and results", () => {
    expect(shouldCollectGame001FinalResult(1, 1)).toBe(true);
    expect(shouldCollectGame001FinalResult(0, 2)).toBe(true);
    expect(shouldCollectGame001FinalResult(0, 1)).toBe(false);
    expect(shouldCollectGame001FinalResult(0, 0)).toBe(false);
    expect(() => shouldCollectGame001FinalResult(Number.NaN, 1)).toThrow(
      /totalwin/,
    );
    expect(() => shouldCollectGame001FinalResult(0, -1)).toThrow(/results/);
  });

  it("fails fast on netcore logger warnings and client events", async () => {
    const fake = new FakeSlotcraftClient();
    const client = createGame001Client(config(), {
      clientFactory: (options) => {
        fake.options = options;
        return fake;
      },
      logicFactory: () => createFakeLogic(TARGET_SCENE),
    });
    fake.spinHandler = async () =>
      new Promise(() => {
        fake.options?.logger?.warn("warning");
      });

    await expect(client.spin()).rejects.toThrow(/logger.warn/);

    const disconnectFake = new FakeSlotcraftClient();
    const disconnectingClient = createGame001Client(config(), {
      clientFactory: () => disconnectFake,
      logicFactory: () => createFakeLogic(TARGET_SCENE),
    });
    disconnectFake.spinHandler = async () =>
      new Promise(() => {
        disconnectFake.emit("disconnect", {
          code: 1006,
          reason: "lost",
          wasClean: false,
        });
      });

    await expect(disconnectingClient.spin()).rejects.toThrow(
      /disconnect event/,
    );

    const eventFake = new FakeSlotcraftClient();
    const eventClient = createGame001Client(config(), {
      clientFactory: () => eventFake,
      logicFactory: () => createFakeLogic(TARGET_SCENE),
    });
    eventFake.spinHandler = async () =>
      new Promise(() => {
        eventFake.emit("message", {
          msgid: "noticemsg2",
          text: "server notice",
        });
      });
    await expect(eventClient.spin()).rejects.toThrow(/noticemsg2/);
  });

  it("rejects concurrent spin requests", async () => {
    const fake = new FakeSlotcraftClient();
    let resolveSpin: (value: unknown) => void = () => undefined;
    fake.spinHandler = async () =>
      new Promise((resolve) => {
        resolveSpin = resolve;
      });
    const client = createGame001Client(config(), {
      clientFactory: () => fake,
      logicFactory: () => createFakeLogic(TARGET_SCENE),
    });

    const firstSpin = client.spin();
    await expect(client.spin()).rejects.toThrow(/already in progress/);
    resolveSpin(spinResult());
    await expect(firstSpin).resolves.toMatchObject({ totalwin: 7, results: 1 });
  });

  it("ignores expected disconnect and rejects invalid live user info", async () => {
    const fake = new FakeSlotcraftClient();
    const client = createGame001Client(config(), { clientFactory: () => fake });
    expect(() => client.disconnect()).not.toThrow();

    const invalidInfo = new FakeSlotcraftClient();
    invalidInfo.userInfo.gameid = Number.NaN;
    const invalidClient = createGame001Client(config(), {
      clientFactory: () => invalidInfo,
    });
    await expect(invalidClient.connect()).rejects.toThrow(/gameid/);

    invalidInfo.userInfo.gameid = 1;
    invalidInfo.userInfo.linebets = [1, Number.NaN];
    await expect(invalidClient.connect()).rejects.toThrow(/linebets/);
  });
});

class FakeSlotcraftClient implements SlotcraftClientLike {
  public userInfo: UserInfo = { gameid: 69002 };
  public readonly spinCalls: SpinParams[] = [];
  public readonly collectCalls: Array<number | undefined> = [];
  public options?: SlotcraftClientOptions;
  public connectToken?: string;
  public enterGamecode?: string;
  public spinHandler?: () => Promise<unknown>;
  public collectHandler?: (playIndex?: number) => Promise<unknown>;
  private readonly listeners = new Map<
    string,
    Array<(...args: any[]) => void>
  >();

  getUserInfo(): Readonly<UserInfo> {
    return this.userInfo;
  }

  async connect(token?: string): Promise<void> {
    this.connectToken = token;
  }

  async enterGame(gamecode?: string): Promise<unknown> {
    this.enterGamecode = gamecode;
    return {};
  }

  async spin(params: SpinParams): Promise<unknown> {
    this.spinCalls.push(params);
    if (this.spinHandler) {
      return this.spinHandler();
    }
    return spinResult();
  }

  async collect(playIndex?: number): Promise<unknown> {
    this.collectCalls.push(playIndex);
    if (this.collectHandler) {
      return this.collectHandler(playIndex);
    }
    return { isok: true, cmdid: "collect" };
  }

  disconnect(): void {
    this.emit("disconnect", { code: 1000, reason: "expected", wasClean: true });
  }

  on(event: string, callback: (...args: any[]) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(callback);
    this.listeners.set(event, listeners);
  }

  emit(event: string, ...args: any[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

function config(): Game001EnvConfig {
  return {
    serverUrl: "wss://example.test/game",
    token: "token-1",
    gamecode: "game001",
    businessid: "",
    clienttype: "web",
    jurisdiction: "MT",
    language: "en",
    bet: 10,
    lines: 25,
    times: 1,
    requestTimeoutMs: 1000,
  };
}

function parseOptions() {
  return {
    request: config(),
    userInfo: { gameid: 69002 },
    logicFactory: () => createFakeLogic(TARGET_SCENE),
  };
}

function spinResult(
  options: { readonly totalwin?: number; readonly results?: number } = {},
) {
  const results = options.results ?? 1;
  return {
    totalwin: options.totalwin ?? 7,
    results,
    gmi: {
      replyPlay: {
        results: Array.from({ length: results }, () => ({})),
      },
    },
  };
}

function createFakeLogic(scene: SceneMatrix): GameLogic {
  return {
    getStep: () => ({
      getScene: () => scene,
    }),
  } as unknown as GameLogic;
}
