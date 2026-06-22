import {
  validateLiveServerUrl,
  type SlotGameBetOption,
  type SlotGameLiveConfig,
  type SlotGameSpinRequest,
} from "@slotclientengine/gameframeworks";

export interface Game001EnvConfig {
  readonly serverUrl: string;
  readonly token: string;
  readonly gamecode: string;
  readonly businessid: string;
  readonly clienttype: string;
  readonly jurisdiction: string;
  readonly language: string;
  readonly bet: number;
  readonly lines: number;
  readonly times: number;
  readonly autonums: number;
  readonly requestTimeoutMs: number;
}

export interface Game001FrameworkConfig {
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex: number;
  readonly spinRequest: SlotGameSpinRequest;
}

export const DEFAULT_GAME001_ENV_CONFIG: Game001EnvConfig = Object.freeze({
  serverUrl: "wss://gameserv.rgstest.slammerstudios.com/",
  token: "3a820433c341f7932d6654c4f16147a2",
  gamecode: "CqbQ0Y7gtBpO5419j8h02",
  businessid: "guest",
  clienttype: "web",
  jurisdiction: "MT",
  language: "en",
  bet: 10,
  lines: 10,
  times: 1,
  autonums: -1,
  requestTimeoutMs: 30000,
});

export function parseGame001Env(
  env: Record<string, unknown>,
): Game001EnvConfig {
  const serverUrl = parseStringWithDefault(
    env.VITE_GAME001_SERVER_URL,
    "VITE_GAME001_SERVER_URL",
    DEFAULT_GAME001_ENV_CONFIG.serverUrl,
  );
  validateGame001ServerUrl(serverUrl);

  return Object.freeze({
    serverUrl,
    token: parseStringWithDefault(
      env.VITE_GAME001_TOKEN,
      "VITE_GAME001_TOKEN",
      DEFAULT_GAME001_ENV_CONFIG.token,
    ),
    gamecode: parseStringWithDefault(
      env.VITE_GAME001_GAMECODE,
      "VITE_GAME001_GAMECODE",
      DEFAULT_GAME001_ENV_CONFIG.gamecode,
    ),
    businessid: parseStringWithDefault(
      env.VITE_GAME001_BUSINESSID,
      "VITE_GAME001_BUSINESSID",
      DEFAULT_GAME001_ENV_CONFIG.businessid,
    ),
    clienttype: parseStringWithDefault(
      env.VITE_GAME001_CLIENTTYPE,
      "VITE_GAME001_CLIENTTYPE",
      DEFAULT_GAME001_ENV_CONFIG.clienttype,
    ),
    jurisdiction: parseStringWithDefault(
      env.VITE_GAME001_JURISDICTION,
      "VITE_GAME001_JURISDICTION",
      DEFAULT_GAME001_ENV_CONFIG.jurisdiction,
    ),
    language: parseStringWithDefault(
      env.VITE_GAME001_LANGUAGE,
      "VITE_GAME001_LANGUAGE",
      DEFAULT_GAME001_ENV_CONFIG.language,
    ),
    bet: parsePositiveNumberWithDefault(
      env.VITE_GAME001_BET,
      "VITE_GAME001_BET",
      DEFAULT_GAME001_ENV_CONFIG.bet,
    ),
    lines: parsePositiveNumberWithDefault(
      env.VITE_GAME001_LINES,
      "VITE_GAME001_LINES",
      DEFAULT_GAME001_ENV_CONFIG.lines,
    ),
    times: parsePositiveNumberWithDefault(
      env.VITE_GAME001_TIMES,
      "VITE_GAME001_TIMES",
      DEFAULT_GAME001_ENV_CONFIG.times,
    ),
    autonums: parseIntegerWithDefault(
      env.VITE_GAME001_AUTONUMS,
      "VITE_GAME001_AUTONUMS",
      DEFAULT_GAME001_ENV_CONFIG.autonums,
    ),
    requestTimeoutMs: parsePositiveNumberWithDefault(
      env.VITE_GAME001_REQUEST_TIMEOUT_MS,
      "VITE_GAME001_REQUEST_TIMEOUT_MS",
      DEFAULT_GAME001_ENV_CONFIG.requestTimeoutMs,
    ),
  });
}

export function parseGame001FrameworkConfig(
  env: Record<string, unknown>,
): Game001FrameworkConfig {
  const parsed = parseGame001Env(env);
  const betOption: SlotGameBetOption = Object.freeze({
    bet: parsed.bet,
    lines: parsed.lines,
    times: parsed.times,
  });
  const spinRequest: SlotGameSpinRequest = Object.freeze({
    bet: parsed.bet,
    lines: parsed.lines,
    times: parsed.times,
    autonums: parsed.autonums,
  });

  return Object.freeze({
    live: Object.freeze({
      serverUrl: parsed.serverUrl,
      token: parsed.token,
      gamecode: parsed.gamecode,
      businessid: parsed.businessid,
      clienttype: parsed.clienttype,
      jurisdiction: parsed.jurisdiction,
      language: parsed.language,
      requestTimeoutMs: parsed.requestTimeoutMs,
    }),
    betOptions: Object.freeze([betOption]),
    initialBetIndex: 0,
    spinRequest,
  });
}

function validateGame001ServerUrl(value: string): void {
  try {
    validateLiveServerUrl(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `VITE_GAME001_SERVER_URL must be a valid ws:// or wss:// live URL. ${reason}`,
    );
  }
}

function parseRequiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function parseStringWithDefault(
  value: unknown,
  label: string,
  fallback: string,
): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must not be empty when provided.`);
  }
  return trimmed;
}

function parsePositiveNumber(value: unknown, label: string): number {
  const raw = parseRequiredString(value, label);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
  return parsed;
}

function parsePositiveNumberWithDefault(
  value: unknown,
  label: string,
  fallback: number,
): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  return parsePositiveNumber(value, label);
}

function parseIntegerWithDefault(
  value: unknown,
  label: string,
  fallback: number,
): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  const raw = parseRequiredString(value, label);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
}
