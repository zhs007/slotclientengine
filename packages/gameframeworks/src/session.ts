import { SlotcraftClient } from "@slotclientengine/netcore";
import type {
  Logger,
  SlotcraftClientOptions,
  SpinParams,
  UserInfo,
} from "@slotclientengine/netcore";
import { SlotGameConfigError, SlotGameRuntimeError } from "./errors.js";
import type {
  SlotGameClientFactory,
  SlotGameClientLike,
  SlotGameLiveConfig,
  SlotGameLiveSessionLike,
} from "./types.js";

type Listener = (...args: unknown[]) => void;

export interface SlotGameSessionOptions {
  readonly live: SlotGameLiveConfig;
  readonly clientFactory?: SlotGameClientFactory;
  readonly logger?: Logger | null;
}

export class SlotGameLiveSession implements SlotGameLiveSessionLike {
  readonly #live: SlotGameLiveConfig;
  readonly #monitor: FailFastMonitor;
  readonly #client: SlotGameClientLike;
  readonly #detachHandlers: () => void;
  #connected = false;
  #spinInFlight = false;

  constructor(options: SlotGameSessionOptions) {
    validateLiveServerUrl(options.live.serverUrl);
    this.#live = options.live;
    this.#monitor = new FailFastMonitor(options.logger);
    const clientOptions = createSlotcraftClientOptions(
      options.live,
      this.#monitor.logger,
    );
    const clientFactory =
      options.clientFactory ??
      ((_live, slotcraftOptions) => new SlotcraftClient(slotcraftOptions));
    this.#client = clientFactory(options.live, clientOptions);
    this.#detachHandlers = attachFailFastHandlers(this.#client, this.#monitor);
  }

  getUserInfo(): Readonly<UserInfo> {
    return this.#client.getUserInfo();
  }

  async connect(): Promise<Readonly<UserInfo>> {
    if (this.#connected) {
      this.#monitor.throwIfFailed();
      const currentUserInfo = this.#client.getUserInfo();
      validateLiveUserInfo(currentUserInfo);
      return currentUserInfo;
    }
    await this.#monitor.race(this.#client.connect(this.#live.token));
    this.#monitor.throwIfFailed();
    await this.#monitor.race(this.#client.enterGame(this.#live.gamecode));
    this.#monitor.throwIfFailed();
    const userInfo = this.#client.getUserInfo();
    validateLiveUserInfo(userInfo);
    this.#connected = true;
    return userInfo;
  }

  async spin(params: SpinParams): Promise<unknown> {
    if (!this.#connected) {
      throw new SlotGameRuntimeError("Cannot spin before connect succeeds.");
    }
    if (this.#spinInFlight) {
      throw new SlotGameRuntimeError(
        "A slot game spin request is already in progress.",
      );
    }

    this.#spinInFlight = true;
    try {
      const rawResult = await this.#monitor.race(this.#client.spin(params));
      this.#monitor.throwIfFailed();
      return rawResult;
    } finally {
      this.#spinInFlight = false;
    }
  }

  async collect(playIndex?: number): Promise<Readonly<UserInfo>> {
    if (!this.#connected) {
      throw new SlotGameRuntimeError("Cannot collect before connect succeeds.");
    }
    await this.#monitor.race(this.#client.collect(playIndex));
    this.#monitor.throwIfFailed();
    const userInfo = this.#client.getUserInfo();
    validateLiveUserInfo(userInfo);
    return userInfo;
  }

  disconnect(): void {
    this.#monitor.markDisconnectExpected();
    this.#detachHandlers();
    this.#client.disconnect();
    this.#connected = false;
  }
}

export async function prepareSlotGameLiveSession(options: {
  readonly live: SlotGameLiveConfig;
  readonly clientFactory?: SlotGameClientFactory;
}): Promise<SlotGameLiveSession> {
  const session = new SlotGameLiveSession(options);
  try {
    await session.connect();
    return session;
  } catch (error) {
    session.disconnect();
    throw error;
  }
}

export function validateLiveServerUrl(serverUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(serverUrl);
  } catch {
    throw new SlotGameConfigError("live.serverUrl must be a valid URL.");
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw new SlotGameConfigError(
      "gameframeworks live mode only accepts ws:// or wss:// serverUrl.",
    );
  }
}

export function createSlotcraftClientOptions(
  live: SlotGameLiveConfig,
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
    logger,
  });
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

function validateLiveUserInfo(userInfo: Readonly<UserInfo>): void {
  if (userInfo.balance !== undefined) {
    assertFiniteNumber(userInfo.balance, "live userInfo.balance");
  }
  if (
    userInfo.gameid !== undefined &&
    (!Number.isFinite(userInfo.gameid) || userInfo.gameid < 0)
  ) {
    throw new SlotGameRuntimeError(
      "live userInfo.gameid must be a finite non-negative number when present.",
    );
  }
}

function attachFailFastHandlers(
  client: SlotGameClientLike,
  monitor: FailFastMonitor,
): () => void {
  const bindings: readonly [string, Listener][] = [
    [
      "error",
      (error: unknown) => {
        monitor.fail(`client error event: ${formatUnknown(error)}`);
      },
    ],
    [
      "disconnect",
      (payload: unknown) => {
        if (!monitor.disconnectExpected) {
          monitor.fail(`client disconnect event: ${formatUnknown(payload)}`);
        }
      },
    ],
    [
      "reconnecting",
      (payload: unknown) => {
        monitor.fail(`client reconnecting event: ${formatUnknown(payload)}`);
      },
    ],
    [
      "message",
      (message: unknown) => {
        if (isServerFailureMessage(message)) {
          monitor.fail(`server error message: ${formatUnknown(message)}`);
        }
      },
    ],
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
    this.failure =
      reason instanceof Error ? reason : new SlotGameRuntimeError(reason);
    for (const reject of this.#waiters) {
      reject(this.failure);
    }
    this.#waiters.clear();
  }
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new SlotGameRuntimeError(`${label} must be a finite number.`);
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

function parseMaybeStringRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
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
