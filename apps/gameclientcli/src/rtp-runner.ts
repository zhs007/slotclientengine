import {
  ConnectionState,
  DisconnectEventPayload,
  Logger,
  SlotcraftClient,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";
import {
  RtpStatsAccumulator,
  assertFiniteNumber,
  assertNonNegativeInteger,
} from "./stats";
import {
  FailFastEventHandlers,
  RtpCliConfig,
  RtpRunSummary,
  RtpRunnerDependencies,
  SlotcraftClientLike,
  SpinOutcome,
  SpinRequestConfig,
  UserSummary,
} from "./types";

class FailFastMonitor {
  private failure: Error | null = null;
  private disconnectExpected = false;
  private readonly waiters = new Set<(error: Error) => void>();
  public readonly logger: Logger;
  public readonly handlers: FailFastEventHandlers;

  constructor() {
    this.logger = {
      log: () => undefined,
      warn: (...args: any[]) =>
        this.fail(`netcore logger.warn: ${formatUnknownList(args)}`),
      error: (...args: any[]) =>
        this.fail(`netcore logger.error: ${formatUnknownList(args)}`),
    };

    this.handlers = {
      error: (error: unknown) =>
        this.fail(`client error event: ${formatUnknown(error)}`),
      disconnect: (payload: DisconnectEventPayload) => {
        if (!this.disconnectExpected) {
          this.fail(`client disconnect event: ${formatUnknown(payload)}`);
        }
      },
      reconnecting: (payload: unknown) => {
        this.fail(`client reconnecting event: ${formatUnknown(payload)}`);
      },
      message: (message: any) => {
        if (message?.msgid === "noticemsg2") {
          this.fail(`server noticemsg2: ${formatUnknown(message)}`);
        }
      },
    };
  }

  public markDisconnectExpected(): void {
    this.disconnectExpected = true;
  }

  public throwIfFailed(): void {
    if (this.failure) {
      throw this.failure;
    }
  }

  public async race<T>(operation: Promise<T>): Promise<T> {
    this.throwIfFailed();
    let rejectWaiter: ((error: Error) => void) | null = null;
    const failPromise = new Promise<never>((_, reject) => {
      rejectWaiter = reject;
      this.waiters.add(reject);
    });

    try {
      return await Promise.race([operation, failPromise]);
    } finally {
      if (rejectWaiter) {
        this.waiters.delete(rejectWaiter);
      }
    }
  }

  private fail(reason: string | Error): void {
    if (this.failure) {
      return;
    }

    this.failure = reason instanceof Error ? reason : new Error(reason);
    for (const reject of this.waiters) {
      reject(this.failure);
    }
    this.waiters.clear();
  }
}

export async function runRtp(
  config: RtpCliConfig,
  dependencies: RtpRunnerDependencies = {},
): Promise<RtpRunSummary> {
  const output = dependencies.output ?? ((line: string) => console.log(line));
  const monitor = new FailFastMonitor();
  const client = createClient(config, monitor.logger, dependencies);
  attachFailFastHandlers(client, monitor);
  const stats = new RtpStatsAccumulator(config.spin);
  let initialBalance = 0;

  outputStartupSummary(config, output);

  try {
    await monitor.race(client.connect());
    monitor.throwIfFailed();

    await monitor.race(client.enterGame());
    monitor.throwIfFailed();

    await settleToInGame(
      client,
      monitor,
      config.requestTimeoutMs,
      "enterGame",
      "collect",
    );

    const initialUser = readUserSummary(client.getUserInfo(), "initialBalance");
    initialBalance = initialUser.balance;
    outputUserSummary(initialUser, output);

    for (let index = 0; index < config.spins; index += 1) {
      const result = await monitor.race(
        client.spin(createSpinParams(config.spin)),
      );
      monitor.throwIfFailed();

      const outcome = validateSpinOutcome(result, config.spin);
      const needsFinalCollect = shouldCollectFinalResult(
        outcome.totalwin,
        outcome.results,
      );

      if (config.verbose) {
        outputVerboseSpin(index + 1, client.getUserInfo(), outcome, output);
      }

      if (needsFinalCollect) {
        await monitor.race(client.collect());
        monitor.throwIfFailed();
      }

      await settleToInGame(
        client,
        monitor,
        config.requestTimeoutMs,
        `spin #${index + 1}`,
        needsFinalCollect ? "already-collected" : "forbid-collect",
      );

      const snapshot = stats.addSpin(outcome.totalwin, outcome.results);
      outputSpinProgress(
        index + 1,
        config.spins,
        outcome.totalwin,
        snapshot,
        output,
      );
    }

    const finalBalance = readFiniteBalance(
      client.getUserInfo(),
      "finalBalance",
    );
    const snapshot = stats.snapshot();
    if (snapshot.totalStake <= 0) {
      throw new Error("totalStake 必须大于 0");
    }

    const summary: RtpRunSummary = {
      ...snapshot,
      initialBalance,
      finalBalance,
      balanceDelta: finalBalance - initialBalance,
    };

    outputFinalSummary(summary, output);
    return summary;
  } finally {
    monitor.markDisconnectExpected();
    client.disconnect();
  }
}

export function validateSpinOutcome(
  result: any,
  request: SpinRequestConfig,
): SpinOutcome {
  if (!result || typeof result !== "object") {
    throw new Error("spin() 返回值必须是对象");
  }
  if (!Object.prototype.hasOwnProperty.call(result, "totalwin")) {
    throw new Error("spin() 返回缺少 totalwin");
  }
  if (!Object.prototype.hasOwnProperty.call(result, "results")) {
    throw new Error("spin() 返回缺少 results");
  }

  const totalwin = result.totalwin;
  const results = result.results;
  assertFiniteNumber(totalwin, "totalwin");
  assertNonNegativeInteger(results, "results");

  const gmi = result.gmi;
  if (!gmi || typeof gmi !== "object") {
    throw new Error("spin() 返回缺少 gmi");
  }
  if (!gmi.replyPlay || typeof gmi.replyPlay !== "object") {
    throw new Error("spin() 返回缺少 gmi.replyPlay");
  }
  if (!Array.isArray(gmi.replyPlay.results)) {
    throw new Error("spin() 返回缺少 gmi.replyPlay.results");
  }

  const replyPlayResultsLength = gmi.replyPlay.results.length;
  if (results !== replyPlayResultsLength) {
    throw new Error(
      `results 与 gmi.replyPlay.results.length 不一致：results=${results}, length=${replyPlayResultsLength}`,
    );
  }

  if (typeof gmi.bet === "number" && gmi.bet !== request.bet) {
    throw new Error(
      `gmi.bet 与请求不一致：request=${request.bet}, gmi=${gmi.bet}`,
    );
  }
  if (typeof gmi.lines === "number" && gmi.lines !== request.lines) {
    throw new Error(
      `gmi.lines 与请求不一致：request=${request.lines}, gmi=${gmi.lines}`,
    );
  }

  return {
    gmi,
    totalwin,
    results,
    replyPlayResultsLength,
  };
}

export function shouldCollectFinalResult(
  totalwin: number,
  results: number,
): boolean {
  assertFiniteNumber(totalwin, "totalwin");
  assertNonNegativeInteger(results, "results");
  return (totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
}

function createClient(
  config: RtpCliConfig,
  logger: Logger,
  dependencies: RtpRunnerDependencies,
): SlotcraftClientLike {
  const options: SlotcraftClientOptions = {
    url: config.url,
    token: config.token,
    gamecode: config.gamecode,
    businessid: config.businessid,
    jurisdiction: config.jurisdiction,
    clienttype: config.clienttype,
    language: config.language,
    requestTimeout: config.requestTimeoutMs,
    maxReconnectAttempts: 0,
    logger,
  };

  if (dependencies.createClient) {
    return dependencies.createClient(options);
  }

  return new SlotcraftClient(options);
}

function attachFailFastHandlers(
  client: SlotcraftClientLike,
  monitor: FailFastMonitor,
): void {
  client.on("error", monitor.handlers.error);
  client.on("disconnect", monitor.handlers.disconnect);
  client.on("reconnecting", monitor.handlers.reconnecting);
  client.on("message", monitor.handlers.message);
}

function createSpinParams(config: SpinRequestConfig): SpinParams {
  return {
    bet: config.bet,
    lines: config.lines,
    times: config.times,
    autonums: config.autonums,
  };
}

async function settleToInGame(
  client: SlotcraftClientLike,
  monitor: FailFastMonitor,
  timeoutMs: number,
  context: string,
  spinEndPolicy: "collect" | "already-collected" | "forbid-collect",
): Promise<void> {
  let currentSpinEndPolicy = spinEndPolicy;

  for (let guard = 0; guard < 20; guard += 1) {
    monitor.throwIfFailed();
    const state = client.getState();

    switch (state) {
      case ConnectionState.IN_GAME:
        return;
      case ConnectionState.SPINEND:
        if (currentSpinEndPolicy === "already-collected") {
          throw new Error(`${context} 最终 collect 后仍停留在 SPINEND`);
        }
        if (currentSpinEndPolicy === "forbid-collect") {
          throw new Error(
            `${context} 本次结果不需要 collect，但状态停留在 SPINEND，拒绝沿用旧结果收集`,
          );
        }
        await monitor.race(client.collect());
        monitor.throwIfFailed();
        currentSpinEndPolicy = "already-collected";
        break;
      case ConnectionState.RESUMING:
        await waitForNextState(client, monitor, timeoutMs);
        break;
      case ConnectionState.WAITTING_PLAYER:
        throw new Error(
          `${context} 进入 WAITTING_PLAYER，本任务不自动选择。optionals=${formatUnknown(
            client.getUserInfo().optionals ?? [],
          )}`,
        );
      default:
        throw new Error(`${context} 进入未处理状态：${state}`);
    }
  }

  throw new Error(`${context} 状态整理超过保护次数`);
}

async function waitForNextState(
  client: SlotcraftClientLike,
  monitor: FailFastMonitor,
  timeoutMs: number,
): Promise<void> {
  await monitor.race(
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.off("state", onState);
        reject(new Error(`等待 RESUMING 后续 state 事件超时：${timeoutMs}ms`));
      }, timeoutMs);

      const onState = () => {
        clearTimeout(timer);
        resolve();
      };

      client.once("state", onState);
    }),
  );
}

function readUserSummary(
  userInfo: Readonly<UserInfo>,
  label: string,
): UserSummary {
  return {
    pid: userInfo.pid,
    nickname: userInfo.nickname,
    currency: userInfo.currency,
    balance: readFiniteBalance(userInfo, label),
  };
}

function readFiniteBalance(
  userInfo: Readonly<UserInfo>,
  label: string,
): number {
  const balance = userInfo.balance;
  assertFiniteNumber(balance as number, label);
  return balance as number;
}

function outputStartupSummary(
  config: RtpCliConfig,
  output: (line: string) => void,
): void {
  output("启动配置摘要");
  output(`server: ${config.url}`);
  output(`gamecode: ${config.gamecode}`);
  output(`spins: ${config.spins}`);
  output(`bet: ${config.spin.bet}`);
  output(`lines: ${config.spin.lines}`);
  output(`times: ${config.spin.times}`);
  output(`autonums: ${config.spin.autonums}`);
  output(`requestTimeoutMs: ${config.requestTimeoutMs}`);
  if (config.overrides.length > 0) {
    output(`overrides: ${config.overrides.join(", ")}`);
  }
}

function outputUserSummary(
  user: UserSummary,
  output: (line: string) => void,
): void {
  output("登录用户摘要");
  output(`pid: ${user.pid ?? ""}`);
  output(`nickname: ${user.nickname ?? ""}`);
  output(`currency: ${user.currency ?? ""}`);
  output(`initialBalance: ${user.balance}`);
}

function outputVerboseSpin(
  spinIndex: number,
  userInfo: Readonly<UserInfo>,
  outcome: SpinOutcome,
  output: (line: string) => void,
): void {
  output(
    [
      `verbose spin=${spinIndex}`,
      `gameid=${userInfo.gameid ?? ""}`,
      `bet=${outcome.gmi.bet ?? ""}`,
      `lines=${outcome.gmi.lines ?? ""}`,
      `totalwin=${outcome.totalwin}`,
      `replyPlay.results.length=${outcome.replyPlayResultsLength}`,
    ].join(" "),
  );
}

function outputSpinProgress(
  completed: number,
  total: number,
  totalwin: number,
  snapshot: { totalStake: number; totalWin: number; rtpPercent: number },
  output: (line: string) => void,
): void {
  output(
    `spin ${completed}/${total}: totalwin=${totalwin}, totalStake=${snapshot.totalStake}, totalWin=${snapshot.totalWin}, rtp=${snapshot.rtpPercent.toFixed(
      4,
    )}%`,
  );
}

function outputFinalSummary(
  summary: RtpRunSummary,
  output: (line: string) => void,
): void {
  output("最终统计");
  output(`completedSpins: ${summary.completedSpins}`);
  output(`totalStake: ${summary.totalStake}`);
  output(`totalWin: ${summary.totalWin}`);
  output(`rtp: ${summary.rtp}`);
  output(`rtpPercent: ${summary.rtpPercent}`);
  output(`initialBalance: ${summary.initialBalance}`);
  output(`finalBalance: ${summary.finalBalance}`);
  output(`balanceDelta: ${summary.balanceDelta}`);
}

function formatUnknownList(values: unknown[]): string {
  return values.map((value) => formatUnknown(value)).join(" ");
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
