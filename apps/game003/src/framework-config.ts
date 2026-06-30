import type {
  SlotGameBetOption,
  SlotGameLiveConfig,
  SlotGameSpinRequest,
} from "@slotclientengine/gameframeworks";
import { assertNoRejectedQueryParams } from "@slotclientengine/gameframeworks/static-config";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
import { parseGame003SkinId, type Game003SkinId } from "./skin-id.js";

export const GAME003_GAMECODE = GAME003_STATIC_CONFIG.live.gamecode;
export const GAME003_LIVE_SERVER_URL = GAME003_STATIC_CONFIG.live.serverUrl;

export interface Game003QueryConfig {
  readonly skin: Game003SkinId;
  readonly token: string;
  readonly gamecode: typeof GAME003_GAMECODE;
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

export interface Game003FrameworkConfig {
  readonly skin: Game003SkinId;
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex: number;
  readonly spinRequest: SlotGameSpinRequest;
}

export function parseGame003QueryConfig(
  search: string | URLSearchParams,
): Game003QueryConfig {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  assertNoRejectedQueryParams(
    params,
    GAME003_STATIC_CONFIG.live.rejectQueryParams,
  );
  const skin = parseGame003SkinId(parseRequiredQueryString(params, "skin"));
  const gamecode =
    parseOptionalQueryString(params, "gamecode") ?? GAME003_GAMECODE;
  if (gamecode !== GAME003_GAMECODE) {
    throw new Error(`gamecode query parameter must be ${GAME003_GAMECODE}.`);
  }

  return Object.freeze({
    skin,
    token: parseRequiredQueryString(params, "token"),
    gamecode,
    businessid: parseRequiredQueryString(params, "businessid"),
    clienttype: parseRequiredQueryString(params, "clienttype"),
    jurisdiction: parseRequiredQueryString(params, "jurisdiction"),
    language: parseRequiredQueryString(params, "language"),
    bet: parsePositiveQueryNumber(params, "bet"),
    lines: parsePositiveQueryNumber(params, "lines"),
    times: parsePositiveQueryNumber(params, "times"),
    autonums: parseQueryInteger(params, "autonums"),
    requestTimeoutMs: parsePositiveQueryNumber(params, "requestTimeoutMs"),
  });
}

export function parseGame003FrameworkConfigFromQuery(
  search: string | URLSearchParams,
): Game003FrameworkConfig {
  const parsed = parseGame003QueryConfig(search);
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
    skin: parsed.skin,
    live: Object.freeze({
      serverUrl: GAME003_LIVE_SERVER_URL,
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

function parseRequiredQueryString(
  params: URLSearchParams,
  name: string,
): string {
  const value = parseOptionalQueryString(params, name);
  if (value === null) {
    throw new Error(`${name} query parameter is required.`);
  }
  return value;
}

function parseOptionalQueryString(
  params: URLSearchParams,
  name: string,
): string | null {
  const values = params.getAll(name);
  if (values.length === 0) {
    return null;
  }
  if (values.length > 1) {
    throw new Error(
      `${name} query parameter must not be provided more than once.`,
    );
  }
  const trimmed = values[0]?.trim() ?? "";
  if (trimmed.length === 0) {
    throw new Error(`${name} query parameter must not be empty.`);
  }
  if (/\s/.test(trimmed)) {
    throw new Error(
      `${name} query parameter must be URL encoded and must not contain whitespace.`,
    );
  }
  return trimmed;
}

function parsePositiveQueryNumber(
  params: URLSearchParams,
  name: string,
): number {
  const raw = parseRequiredQueryString(params, name);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `${name} query parameter must be a finite positive number.`,
    );
  }
  return parsed;
}

function parseQueryInteger(params: URLSearchParams, name: string): number {
  const raw = parseRequiredQueryString(params, name);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} query parameter must be an integer.`);
  }
  return parsed;
}
