import { createGameLogicFromGmi } from "@slotclientengine/logiccore";
import { SlotcraftClient } from "@slotclientengine/netcore";
import type { GameLogic, GameLogicMeta } from "@slotclientengine/logiccore";
import type {
  DisconnectEventPayload,
  Logger,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo
} from "@slotclientengine/netcore";
import { SlotUiConfigError, SlotUiRuntimeError } from "./errors.js";
import type {
  SlotUiBetOption,
  SlotcraftClientFactory,
  SlotcraftClientLike,
  SlotUiLiveConfig,
  SlotUiSpinResult,
  SlotUiStateSnapshot
} from "./types.js";

type Listener = (...args: unknown[]) => void;

export interface SlotUiSessionOptions {
  readonly live: SlotUiLiveConfig;
  readonly clientFactory?: SlotcraftClientFactory;
  readonly logicFactory?: (gmi: unknown, meta: GameLogicMeta) => GameLogic;
  readonly logger?: Logger | null;
}

export interface SlotUiSessionSpinOptions {
  readonly state: SlotUiStateSnapshot;
  readonly bet: SlotUiBetOption;
  readonly buildSpinParams?: (
    state: SlotUiStateSnapshot,
    bet: SlotUiBetOption,
  ) => SpinParams;
  readonly onCollectStart?: () => void;
}

export class SlotUiLiveSession {
  readonly #live: SlotUiLiveConfig;
  readonly #monitor: FailFastMonitor;
  readonly #client: SlotcraftClientLike;
  readonly #logicFactory: (gmi: unknown, meta: GameLogicMeta) => GameLogic;
  readonly #detachHandlers: () => void;
  #connected = false;
  #spinInFlight = false;

  constructor(options: SlotUiSessionOptions) {
    validateLiveServerUrl(options.live.serverUrl);
    this.#live = options.live;
    this.#monitor = new FailFastMonitor(options.logger);
    this.#logicFactory = options.logicFactory ?? createGameLogicFromGmi;
    const clientOptions = createSlotcraftClientOptions(options.live, this.#monitor.logger);
    const clientFactory =
      options.clientFactory ??
      ((_live, slotcraftOptions) => new SlotcraftClient(slotcraftOptions));
    this.#client = clientFactory(options.live, clientOptions);
    this.#detachHandlers = attachFailFastHandlers(this.#client, this.#monitor);
  }

  async connect(): Promise<Readonly<UserInfo>> {
    await this.#monitor.race(this.#client.connect(this.#live.token));
    this.#monitor.throwIfFailed();
    await this.#monitor.race(this.#client.enterGame(this.#live.gamecode));
    this.#monitor.throwIfFailed();
    const userInfo = this.#client.getUserInfo();
    validateLiveUserInfo(userInfo);
    this.#connected = true;
    return userInfo;
  }

  async spin(options: SlotUiSessionSpinOptions): Promise<SlotUiSpinResult> {
    if (!this.#connected) {
      throw new SlotUiRuntimeError("Cannot spin before connect succeeds.");
    }
    if (this.#spinInFlight) {
      throw new SlotUiRuntimeError("A slot UI spin request is already in progress.");
    }

    this.#spinInFlight = true;
    try {
      const params = buildSpinParams(options.state, options.bet, options.buildSpinParams);
      const rawResult = await this.#monitor.race(this.#client.spin(params));
      this.#monitor.throwIfFailed();
      const result = validateSlotUiSpinResult(rawResult, {
        state: options.state,
        bet: options.bet,
        userInfo: this.#client.getUserInfo(),
        logicFactory: this.#logicFactory
      });

      if (shouldCollectFinalResult(result.totalwin, result.results)) {
        options.onCollectStart?.();
        await this.#monitor.race(this.#client.collect());
        this.#monitor.throwIfFailed();
      }

      const userInfo = this.#client.getUserInfo();
      validateLiveUserInfo(userInfo);
      return Object.freeze({
        ...result,
        userInfo
      });
    } finally {
      this.#spinInFlight = false;
    }
  }

  disconnect(): void {
    this.#monitor.markDisconnectExpected();
    this.#detachHandlers();
    this.#client.disconnect();
    this.#connected = false;
  }
}

export function validateLiveServerUrl(serverUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
  } catch {
    throw new SlotUiConfigError("live.serverUrl must be a valid URL.");
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new SlotUiConfigError(
      "uiframeworks live mode only accepts ws:// or wss:// serverUrl.",
    );
  }
}

export function createSlotcraftClientOptions(
  live: SlotUiLiveConfig,
  logger: Logger,
): SlotcraftClientOptions {
  return Object.freeze({
    url: live.serverUrl,
    token: live.token,
    gamecode: live.gamecode,
    businessid: live.businessid,
    clienttype: live.clienttype,
    jurisdiction: live.jurisdiction,
    language: live.language,
    requestTimeout: live.requestTimeoutMs,
    maxReconnectAttempts: 0,
    autoCollectIntermediateResults: true,
    logger
  });
}

export function buildSpinParams(
  state: SlotUiStateSnapshot,
  bet: SlotUiBetOption,
  buildSpinParamsCallback?: (
    state: SlotUiStateSnapshot,
    bet: SlotUiBetOption,
  ) => SpinParams,
): SpinParams {
  if (buildSpinParamsCallback) {
    const params = buildSpinParamsCallback(state, bet);
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      throw new SlotUiConfigError("buildSpinParams must return an object.");
    }
    return params;
  }

  return Object.freeze({
    bet: bet.bet,
    lines: bet.lines,
    ...(bet.times === undefined ? {} : { times: bet.times })
  });
}

export function validateSlotUiSpinResult(
  rawResult: unknown,
  options: {
    readonly state: SlotUiStateSnapshot;
    readonly bet: SlotUiBetOption;
    readonly userInfo: Readonly<UserInfo>;
    readonly logicFactory?: (gmi: unknown, meta: GameLogicMeta) => GameLogic;
  },
): Omit<SlotUiSpinResult, "userInfo"> {
  const resultRecord = assertRecord(rawResult, "spin result");
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "gmi")) {
    throw new SlotUiRuntimeError("spin result is missing gmi.");
  }
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "totalwin")) {
    throw new SlotUiRuntimeError("spin result is missing totalwin.");
  }
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "results")) {
    throw new SlotUiRuntimeError("spin result is missing results.");
  }

  const gmi = resultRecord.gmi;
  const totalwin = assertFiniteNumber(resultRecord.totalwin, "spin result totalwin");
  const results = assertNonNegativeInteger(resultRecord.results, "spin result results");
  const replyPlayResultsLength = getReplyPlayResultsLength(gmi);
  if (results !== replyPlayResultsLength) {
    throw new SlotUiRuntimeError(
      `results must equal gmi.replyPlay.results.length: results=${results}, length=${replyPlayResultsLength}.`,
    );
  }

  const logic = (options.logicFactory ?? createGameLogicFromGmi)(
    gmi,
    createLogicMeta(options.bet, totalwin, options.userInfo),
  );

  return Object.freeze({
    rawResult,
    gmi,
    logic,
    totalwin,
    results
  });
}

export function shouldCollectFinalResult(totalwin: number, results: number): boolean {
  assertFiniteNumber(totalwin, "totalwin");
  assertNonNegativeInteger(results, "results");
  return (totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
}

export function requireFiniteBalance(
  userInfo: Readonly<UserInfo>,
  initialBalance?: number,
): number {
  if (initialBalance !== undefined) {
    return assertFiniteNumber(initialBalance, "initialBalance");
  }
  return assertFiniteNumber(userInfo.balance, "live userInfo.balance");
}

function createLogicMeta(
  bet: SlotUiBetOption,
  totalwin: number,
  userInfo: Readonly<UserInfo>,
): GameLogicMeta {
  const gameid = userInfo.gameid;
  if (gameid !== undefined && (!Number.isFinite(gameid) || gameid < 0)) {
    throw new SlotUiRuntimeError(
      "live userInfo.gameid must be a finite non-negative number when present.",
    );
  }
  return Object.freeze({
    bet: bet.bet,
    lines: bet.lines,
    totalwin,
    ...(gameid === undefined ? {} : { gameid })
  });
}

function validateLiveUserInfo(userInfo: Readonly<UserInfo>): void {
  if (
    userInfo.balance !== undefined &&
    !Number.isFinite(userInfo.balance)
  ) {
    throw new SlotUiRuntimeError("live userInfo.balance must be finite when present.");
  }
  if (
    userInfo.gameid !== undefined &&
    (!Number.isFinite(userInfo.gameid) || userInfo.gameid < 0)
  ) {
    throw new SlotUiRuntimeError(
      "live userInfo.gameid must be a finite non-negative number when present.",
    );
  }
}

function attachFailFastHandlers(
  client: SlotcraftClientLike,
  monitor: FailFastMonitor,
): () => void {
  const bindings: readonly [string, Listener][] = [
    [
      "error",
      (error: unknown) => {
        monitor.fail(`client error event: ${formatUnknown(error)}`);
      }
    ],
    [
      "disconnect",
      (payload: unknown) => {
        if (!monitor.disconnectExpected) {
          monitor.fail(`client disconnect event: ${formatUnknown(payload)}`);
        }
      }
    ],
    [
      "reconnecting",
      (payload: unknown) => {
        monitor.fail(`client reconnecting event: ${formatUnknown(payload)}`);
      }
    ],
    [
      "message",
      (message: unknown) => {
        if (isServerFailureMessage(message)) {
          monitor.fail(`server error message: ${formatUnknown(message)}`);
        }
      }
    ]
  ];

  for (const [event, listener] of bindings) {
    client.on(event, listener);
  }

  return () => {
    if (!client.off) {
      return;
    }
    for (const [event, listener] of bindings) {
      client.off(event, listener);
    }
  };
}

class FailFastMonitor {
  public failure: Error | null = null;
  public disconnectExpected = false;
  public readonly logger: Logger;
  readonly #waiters = new Set<(error: Error) => void>();

  constructor(baseLogger?: Logger | null) {
    this.logger = {
      log: (...args: unknown[]) => {
        baseLogger?.log(...args);
      },
      warn: (...args: unknown[]) => {
        baseLogger?.warn(...args);
        this.fail(`netcore logger.warn: ${formatUnknownList(args)}`);
      },
      error: (...args: unknown[]) => {
        baseLogger?.error(...args);
        this.fail(`netcore logger.error: ${formatUnknownList(args)}`);
      }
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
    this.failure = reason instanceof Error ? reason : new SlotUiRuntimeError(reason);
    for (const reject of this.#waiters) {
      reject(this.failure);
    }
    this.#waiters.clear();
  }
}

function getReplyPlayResultsLength(gmi: unknown): number {
  const gmiRecord = assertRecord(gmi, "gmi");
  const replyPlay = assertRecord(gmiRecord.replyPlay, "gmi.replyPlay");
  if (!Array.isArray(replyPlay.results)) {
    throw new SlotUiRuntimeError("gmi.replyPlay.results must be an array.");
  }
  return replyPlay.results.length;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SlotUiRuntimeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new SlotUiRuntimeError(`${label} must be a finite number.`);
  }
  return value as number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new SlotUiRuntimeError(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function isServerFailureMessage(value: unknown): boolean {
  const message = parseMaybeStringRecord(value);
  if (!message) {
    return false;
  }
  return (
    message.msgid === "noticemsg2" ||
    message.error !== undefined ||
    message.err !== undefined ||
    message.errmsg !== undefined ||
    message.errorMessage !== undefined
  );
}

function parseMaybeStringRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

export type { DisconnectEventPayload };
