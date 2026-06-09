import {
  ConnectionState,
  Logger,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";
import { describe, expect, it } from "vitest";
import { createDefaultConfig } from "../src/config";
import {
  runRtp,
  shouldCollectFinalResult,
  validateSpinOutcome,
} from "../src/rtp-runner";
import { RtpCliConfig, SlotcraftClientLike } from "../src/types";

type Listener = (...args: any[]) => void;

class FakeSlotcraftClient implements SlotcraftClientLike {
  public state = ConnectionState.IDLE;
  public userInfo: UserInfo = {
    pid: "pid-1",
    nickname: "guest-1",
    currency: "USD",
    balance: 1000,
    gameid: 69002,
  };
  public readonly spinCalls: SpinParams[] = [];
  public collectCalls = 0;
  public disconnectCalls = 0;
  public options?: SlotcraftClientOptions;
  public spinHandler?: () => Promise<any>;
  public collectHandler?: () => Promise<any>;
  public connectHandler?: () => Promise<void>;
  public enterGameHandler?: () => Promise<any>;
  private readonly listeners = new Map<string, Listener[]>();

  public getState(): ConnectionState {
    return this.state;
  }

  public getUserInfo(): Readonly<UserInfo> {
    return this.userInfo;
  }

  public async connect(): Promise<void> {
    if (this.connectHandler) {
      await this.connectHandler();
      return;
    }
    this.state = ConnectionState.LOGGED_IN;
  }

  public async enterGame(): Promise<any> {
    if (this.enterGameHandler) {
      return this.enterGameHandler();
    }
    this.state = ConnectionState.IN_GAME;
    return {};
  }

  public async spin(params: SpinParams): Promise<any> {
    this.spinCalls.push(params);
    if (this.spinHandler) {
      return this.spinHandler();
    }

    this.state = ConnectionState.IN_GAME;
    this.userInfo.lastGMI = spinResult(0, 1).gmi;
    return spinResult(0, 1);
  }

  public async collect(): Promise<any> {
    this.collectCalls += 1;
    if (this.collectHandler) {
      return this.collectHandler();
    }
    this.state = ConnectionState.IN_GAME;
    return {};
  }

  public async selectOptional(): Promise<any> {
    return {};
  }

  public disconnect(): void {
    this.disconnectCalls += 1;
    this.state = ConnectionState.DISCONNECTED;
  }

  public on(event: string, callback: Listener): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(callback);
    this.listeners.set(event, listeners);
  }

  public off(event: string, callback: Listener): void {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      listeners.filter((listener) => listener !== callback),
    );
  }

  public once(event: string, callback: Listener): void {
    const wrapper: Listener = (...args: any[]) => {
      this.off(event, wrapper);
      callback(...args);
    };
    this.on(event, wrapper);
  }

  public emit(event: string, ...args: any[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...args);
    }
  }
}

describe("runRtp", () => {
  it("sends default spin macros to netcore", async () => {
    const { fake } = await runWithFakeClient({ spins: 1 });

    expect(fake.spinCalls).toEqual([
      {
        bet: 10,
        lines: 10,
        times: 1,
        autonums: -1,
      },
    ]);
  });

  it("returns completedSpins after N spins", async () => {
    const { summary } = await runWithFakeClient({ spins: 3 });

    expect(summary.completedSpins).toBe(3);
    expect(summary.totalStake).toBe(300);
  });

  it("rejects missing balance before spinning", async () => {
    const fake = new FakeSlotcraftClient();
    fake.userInfo.balance = undefined;

    await expect(runWithExistingFake(fake, { spins: 1 })).rejects.toThrow(
      "initialBalance",
    );
    expect(fake.spinCalls).toHaveLength(0);
  });

  it("stops when spin rejects and does not continue", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      throw new Error("spin failed");
    };

    await expect(runWithExistingFake(fake, { spins: 2 })).rejects.toThrow(
      "spin failed",
    );
    expect(fake.spinCalls).toHaveLength(1);
  });

  it("stops when final collect rejects", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.state = ConnectionState.SPINEND;
      return spinResult(10, 1);
    };
    fake.collectHandler = async () => {
      throw new Error("collect failed");
    };

    await expect(runWithExistingFake(fake, { spins: 1 })).rejects.toThrow(
      "collect failed",
    );
  });

  it("fails fast on disconnect events during active work", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.emit("disconnect", { code: 1006, reason: "lost", wasClean: false });
      return new Promise(() => undefined);
    };

    await expect(runWithExistingFake(fake, { spins: 1 })).rejects.toThrow(
      "disconnect",
    );
  });

  it("fails fast on error events during active work", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.emit("error", new Error("socket error"));
      return new Promise(() => undefined);
    };

    await expect(runWithExistingFake(fake, { spins: 1 })).rejects.toThrow(
      "socket error",
    );
  });

  it("fails fast on noticemsg2 messages", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.emit("message", { msgid: "noticemsg2", message: "server refused" });
      return new Promise(() => undefined);
    };

    await expect(runWithExistingFake(fake, { spins: 1 })).rejects.toThrow(
      "noticemsg2",
    );
  });

  it.each([
    ["warn", "logger.warn failed"],
    ["error", "logger.error failed"],
  ] as const)(
    "fails fast when netcore logger.%s is called",
    async (method, message) => {
      const fake = new FakeSlotcraftClient();
      fake.connectHandler = async () => {
        const logger = fake.options?.logger as Logger;
        logger[method](message);
        return new Promise(() => undefined);
      };

      await expect(runWithExistingFake(fake, { spins: 1 })).rejects.toThrow(
        message,
      );
    },
  );

  it("rejects WAITTING_PLAYER instead of selecting an option", async () => {
    const fake = new FakeSlotcraftClient();
    fake.enterGameHandler = async () => {
      fake.state = ConnectionState.WAITTING_PLAYER;
      fake.userInfo.optionals = [{ command: "pick", param: "0" }];
    };

    await expect(runWithExistingFake(fake, { spins: 1 })).rejects.toThrow(
      "WAITTING_PLAYER",
    );
  });

  it("collects winning spin results and returns to IN_GAME", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.state = ConnectionState.SPINEND;
      return spinResult(25, 1);
    };

    await runWithExistingFake(fake, { spins: 1 });

    expect(fake.collectCalls).toBe(1);
    expect(fake.getState()).toBe(ConnectionState.DISCONNECTED);
  });

  it("still collects multi-result wins even when netcore already returned IN_GAME", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.state = ConnectionState.IN_GAME;
      return spinResult(25, 2);
    };

    await runWithExistingFake(fake, { spins: 1 });

    expect(fake.collectCalls).toBe(1);
  });

  it("collects multi-result zero-win spins", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.state = ConnectionState.IN_GAME;
      return spinResult(0, 2);
    };

    await runWithExistingFake(fake, { spins: 1 });

    expect(fake.collectCalls).toBe(1);
  });

  it("does not collect single-result zero-win spins", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.state = ConnectionState.IN_GAME;
      return spinResult(0, 1);
    };

    await runWithExistingFake(fake, { spins: 1 });

    expect(fake.collectCalls).toBe(0);
  });

  it("rejects SPINEND after a spin result that does not need collect", async () => {
    const fake = new FakeSlotcraftClient();
    fake.spinHandler = async () => {
      fake.state = ConnectionState.SPINEND;
      return spinResult(0, 1);
    };

    await expect(runWithExistingFake(fake, { spins: 1 })).rejects.toThrow(
      "本次结果不需要 collect",
    );
    expect(fake.collectCalls).toBe(0);
  });
});

describe("validateSpinOutcome", () => {
  it.each([
    [{ results: 1, gmi: { replyPlay: { results: [{}] } } }, "totalwin"],
    [
      {
        totalwin: Number.NaN,
        results: 1,
        gmi: { replyPlay: { results: [{}] } },
      },
      "totalwin",
    ],
    [{ totalwin: 0, gmi: { replyPlay: { results: [{}] } } }, "results"],
    [
      { totalwin: 0, results: 1.5, gmi: { replyPlay: { results: [{}] } } },
      "results",
    ],
    [
      { totalwin: 0, results: -1, gmi: { replyPlay: { results: [{}] } } },
      "results",
    ],
    [{ totalwin: 0, results: 1, gmi: {} }, "gmi.replyPlay"],
    [
      { totalwin: 0, results: 2, gmi: { replyPlay: { results: [{}] } } },
      "不一致",
    ],
    [spinResult(0, 1, 20, 10), "gmi.bet"],
    [spinResult(0, 1, 10, 20), "gmi.lines"],
  ])("rejects invalid spin result %#", (result, expectedMessage) => {
    expect(() =>
      validateSpinOutcome(result, {
        bet: 10,
        lines: 10,
        times: 1,
        autonums: -1,
      }),
    ).toThrow(expectedMessage);
  });
});

describe("shouldCollectFinalResult", () => {
  it.each([
    [1, 1, true],
    [0, 2, true],
    [0, 1, false],
    [0, 0, false],
  ])("totalwin=%s results=%s -> %s", (totalwin, results, expected) => {
    expect(shouldCollectFinalResult(totalwin, results)).toBe(expected);
  });
});

async function runWithFakeClient(overrides: Partial<RtpCliConfig> = {}) {
  const fake = new FakeSlotcraftClient();
  const summary = await runWithExistingFake(fake, overrides);
  return { fake, summary };
}

async function runWithExistingFake(
  fake: FakeSlotcraftClient,
  overrides: Partial<RtpCliConfig> = {},
) {
  const config = createConfig(overrides);
  const output: string[] = [];
  const summary = await runRtp(config, {
    createClient: (options) => {
      fake.options = options;
      return fake;
    },
    output: (line) => output.push(line),
  });

  return summary;
}

function createConfig(overrides: Partial<RtpCliConfig> = {}): RtpCliConfig {
  return {
    ...createDefaultConfig(),
    spins: 1,
    ...overrides,
    spin: {
      ...createDefaultConfig().spin,
      ...overrides.spin,
    },
  };
}

function spinResult(totalwin: number, results: number, bet = 10, lines = 10) {
  return {
    totalwin,
    results,
    gmi: {
      bet,
      lines,
      replyPlay: {
        results: Array.from({ length: results }, (_, index) => ({ index })),
      },
    },
  };
}
