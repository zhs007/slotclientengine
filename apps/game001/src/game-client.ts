import {
  SlotcraftClient,
  type DisconnectEventPayload,
  type Logger,
  type SlotcraftClientOptions,
  type SpinParams,
  type UserInfo,
} from "@slotclientengine/netcore";
import {
  createGameLogicFromGmi,
  type GameLogic,
  type GameLogicMeta,
  type SceneMatrix,
} from "@slotclientengine/logiccore";
import type { Game001EnvConfig } from "./env.js";
import { getReplyPlayResultsLength, validateGame001Scene } from "./scene.js";

type Listener = (...args: any[]) => void;

export interface Game001Client {
  connect(): Promise<Game001InitialState>;
  spin(): Promise<Game001SpinResult>;
  disconnect(): void;
  getUserInfo(): Readonly<UserInfo>;
}

export interface Game001InitialState {
  readonly defaultScene: SceneMatrix | null;
}

export interface Game001SpinResult {
  readonly gmi: unknown;
  readonly totalwin: number;
  readonly results: number;
  readonly scene: SceneMatrix;
  readonly logic: GameLogic;
}

export interface SlotcraftClientLike {
  getUserInfo(): Readonly<UserInfo>;
  connect(token?: string): Promise<void>;
  enterGame(gamecode?: string): Promise<unknown>;
  spin(params: SpinParams): Promise<unknown>;
  collect(playIndex?: number): Promise<unknown>;
  disconnect(): void;
  on(event: string, callback: Listener): void;
  off?(event: string, callback: Listener): void;
  once?(event: string, callback: Listener): void;
}

export interface Game001ClientDependencies {
  readonly clientFactory?: (
    options: SlotcraftClientOptions,
  ) => SlotcraftClientLike;
  readonly logicFactory?: (gmi: unknown, meta: GameLogicMeta) => GameLogic;
}

export function createGame001Client(
  config: Game001EnvConfig,
  dependencies: Game001ClientDependencies = {},
): Game001Client {
  return new Game001LiveClient(config, dependencies);
}

class Game001LiveClient implements Game001Client {
  readonly #config: Game001EnvConfig;
  readonly #monitor = new FailFastMonitor();
  readonly #client: SlotcraftClientLike;
  readonly #logicFactory: (gmi: unknown, meta: GameLogicMeta) => GameLogic;
  #spinInFlight = false;

  constructor(
    config: Game001EnvConfig,
    dependencies: Game001ClientDependencies,
  ) {
    this.#config = config;
    this.#logicFactory = dependencies.logicFactory ?? createGameLogicFromGmi;
    const clientFactory =
      dependencies.clientFactory ?? ((options) => new SlotcraftClient(options));
    this.#client = clientFactory({
      url: config.serverUrl,
      token: config.token,
      gamecode: config.gamecode,
      businessid: config.businessid,
      clienttype: config.clienttype,
      jurisdiction: config.jurisdiction,
      language: config.language,
      requestTimeout: config.requestTimeoutMs,
      maxReconnectAttempts: 0,
      autoCollectIntermediateResults: true,
      logger: this.#monitor.logger,
    });
    attachFailFastHandlers(this.#client, this.#monitor);
  }

  async connect(): Promise<Game001InitialState> {
    await this.#monitor.race(this.#client.connect(this.#config.token));
    this.#monitor.throwIfFailed();

    await this.#monitor.race(this.#client.enterGame(this.#config.gamecode));
    this.#monitor.throwIfFailed();

    const userInfo = this.#client.getUserInfo();
    validateLiveUserInfo(userInfo);
    const defaultScene =
      userInfo.defaultScene === undefined
        ? null
        : validateGame001Scene(userInfo.defaultScene, "live defaultScene");
    return Object.freeze({ defaultScene });
  }

  async spin(): Promise<Game001SpinResult> {
    if (this.#spinInFlight) {
      throw new Error("game001 spin request is already in progress.");
    }

    this.#spinInFlight = true;
    try {
      const result = await this.#monitor.race(
        this.#client.spin({
          bet: this.#config.bet,
          lines: this.#config.lines,
          times: this.#config.times,
        }),
      );
      this.#monitor.throwIfFailed();
      const spinResult = validateGame001SpinResult(result, {
        request: this.#config,
        userInfo: this.#client.getUserInfo(),
        logicFactory: this.#logicFactory,
      });
      if (
        shouldCollectGame001FinalResult(spinResult.totalwin, spinResult.results)
      ) {
        await this.#monitor.race(this.#client.collect());
        this.#monitor.throwIfFailed();
      }
      return spinResult;
    } finally {
      this.#spinInFlight = false;
    }
  }

  disconnect(): void {
    this.#monitor.markDisconnectExpected();
    this.#client.disconnect();
  }

  getUserInfo(): Readonly<UserInfo> {
    return this.#client.getUserInfo();
  }
}

export function validateGame001SpinResult(
  result: unknown,
  options: {
    readonly request: Pick<Game001EnvConfig, "bet" | "lines" | "times">;
    readonly userInfo: Readonly<UserInfo>;
    readonly logicFactory?: (gmi: unknown, meta: GameLogicMeta) => GameLogic;
  },
): Game001SpinResult {
  const resultRecord = assertRecord(result, "spin result");
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "gmi")) {
    throw new Error("spin result is missing gmi.");
  }
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "totalwin")) {
    throw new Error("spin result is missing totalwin.");
  }
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "results")) {
    throw new Error("spin result is missing results.");
  }

  const totalwin = assertFiniteNumber(
    resultRecord.totalwin,
    "spin result totalwin",
  );
  const results = assertNonNegativeInteger(
    resultRecord.results,
    "spin result results",
  );
  const gmi = resultRecord.gmi;
  const replyPlayResultsLength = getReplyPlayResultsLength(gmi);
  if (results !== replyPlayResultsLength) {
    throw new Error(
      `results must equal gmi.replyPlay.results.length: results=${results}, length=${replyPlayResultsLength}.`,
    );
  }

  const meta = createLogicMeta(options.request, totalwin, options.userInfo);
  const logic = (options.logicFactory ?? createGameLogicFromGmi)(gmi, meta);
  const scene = validateGame001Scene(
    logic.getStep(0).getScene(0),
    "spin main scene",
  );

  return Object.freeze({
    gmi,
    totalwin,
    results,
    scene,
    logic,
  });
}

export function shouldCollectGame001FinalResult(
  totalwin: number,
  results: number,
): boolean {
  assertFiniteNumber(totalwin, "totalwin");
  assertNonNegativeInteger(results, "results");
  return (totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
}

function createLogicMeta(
  request: Pick<Game001EnvConfig, "bet" | "lines">,
  totalwin: number,
  userInfo: Readonly<UserInfo>,
): GameLogicMeta {
  const gameid = userInfo.gameid;
  if (gameid !== undefined && (!Number.isFinite(gameid) || gameid < 0)) {
    throw new Error(
      "live userInfo.gameid must be a finite non-negative number when present.",
    );
  }
  return Object.freeze({
    bet: request.bet,
    lines: request.lines,
    totalwin,
    ...(gameid === undefined ? {} : { gameid }),
  });
}

function validateLiveUserInfo(userInfo: Readonly<UserInfo>): void {
  if (
    userInfo.gameid !== undefined &&
    (!Number.isFinite(userInfo.gameid) || userInfo.gameid < 0)
  ) {
    throw new Error(
      "live userInfo.gameid must be a finite non-negative number when present.",
    );
  }
  if (
    userInfo.defaultLinebet !== undefined &&
    !Number.isFinite(userInfo.defaultLinebet)
  ) {
    throw new Error("live defaultLinebet must be finite when present.");
  }
  assertOptionalNumberArray(userInfo.linebets, "live linebets");
  assertOptionalNumberArray(userInfo.linesOptions, "live linesOptions");
}

function attachFailFastHandlers(
  client: SlotcraftClientLike,
  monitor: FailFastMonitor,
): void {
  client.on("error", (error: unknown) => {
    monitor.fail(`client error event: ${formatUnknown(error)}`);
  });
  client.on("disconnect", (payload: DisconnectEventPayload) => {
    if (!monitor.disconnectExpected) {
      monitor.fail(`client disconnect event: ${formatUnknown(payload)}`);
    }
  });
  client.on("reconnecting", (payload: unknown) => {
    monitor.fail(`client reconnecting event: ${formatUnknown(payload)}`);
  });
  client.on("message", (message: unknown) => {
    if (isNoticeMessage(message)) {
      monitor.fail(`server noticemsg2: ${formatUnknown(message)}`);
    }
  });
}

class FailFastMonitor {
  public failure: Error | null = null;
  public disconnectExpected = false;
  public readonly logger: Logger;
  readonly #waiters = new Set<(error: Error) => void>();

  constructor() {
    this.logger = {
      log: () => undefined,
      warn: (...args: unknown[]) => {
        this.fail(`netcore logger.warn: ${formatUnknownList(args)}`);
      },
      error: (...args: unknown[]) => {
        this.fail(`netcore logger.error: ${formatUnknownList(args)}`);
      },
    };
  }

  markDisconnectExpected(): void {
    this.disconnectExpected = true;
  }

  throwIfFailed(): void {
    if (this.failure) {
      throw this.failure;
    }
  }

  async race<T>(operation: Promise<T>): Promise<T> {
    this.throwIfFailed();
    let rejectWaiter: ((error: Error) => void) | null = null;
    const failPromise = new Promise<never>((_resolve, reject) => {
      rejectWaiter = reject;
      this.#waiters.add(reject);
    });

    try {
      return await Promise.race([operation, failPromise]);
    } finally {
      if (rejectWaiter) {
        this.#waiters.delete(rejectWaiter);
      }
    }
  }

  fail(reason: string | Error): void {
    if (this.failure) {
      return;
    }
    this.failure = reason instanceof Error ? reason : new Error(reason);
    for (const reject of this.#waiters) {
      reject(this.failure);
    }
    this.#waiters.clear();
  }
}

function assertOptionalNumberArray(value: unknown, label: string): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.some((item) => !Number.isFinite(item))) {
    throw new Error(
      `${label} must be an array of finite numbers when present.`,
    );
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value as number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function isNoticeMessage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { readonly msgid?: unknown }).msgid === "noticemsg2"
  );
}

function formatUnknownList(values: readonly unknown[]): string {
  return values.map((value) => formatUnknown(value)).join(" ");
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
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
