import type {
  SlotGameBetOption,
  SlotGameLiveConfig,
  SlotGameSpinRequest,
} from "@slotclientengine/gameframeworks";
import { parseGame002SkinId, type Game002SkinId } from "./skin-id.js";

export const GAME002_LIVE_SERVER_URL =
  "wss://gameserv.rgstest.slammerstudios.com/";
export const GAME002_LINES = 30;

export interface Game002QueryConfig {
  readonly skin: Game002SkinId;
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

export interface Game002FrameworkConfig {
  readonly skin: Game002SkinId;
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex: number;
  readonly spinRequest: SlotGameSpinRequest;
}

export function parseGame002QueryConfig(
  search: string | URLSearchParams,
): Game002QueryConfig {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  rejectUnsupportedQueryParameter(params, "serverUrl");
  const skin = parseGame002SkinId(parseRequiredQueryString(params, "skin"));
  const lines = parsePositiveQueryNumber(params, "lines");
  if (lines !== GAME002_LINES) {
    throw new Error(
      `lines query parameter must be exactly ${GAME002_LINES} for game002.`,
    );
  }

  return Object.freeze({
    skin,
    token: parseRequiredQueryString(params, "token"),
    gamecode: parseRequiredQueryString(params, "gamecode"),
    businessid: parseRequiredQueryString(params, "businessid"),
    clienttype: parseRequiredQueryString(params, "clienttype"),
    jurisdiction: parseRequiredQueryString(params, "jurisdiction"),
    language: parseRequiredQueryString(params, "language"),
    bet: parsePositiveQueryNumber(params, "bet"),
    lines,
    times: parsePositiveQueryNumber(params, "times"),
    autonums: parseQueryInteger(params, "autonums"),
    requestTimeoutMs: parsePositiveQueryNumber(params, "requestTimeoutMs"),
  });
}

export function parseGame002FrameworkConfigFromQuery(
  search: string | URLSearchParams,
): Game002FrameworkConfig {
  const parsed = parseGame002QueryConfig(search);
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
      serverUrl: GAME002_LIVE_SERVER_URL,
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

function rejectUnsupportedQueryParameter(
  params: URLSearchParams,
  name: string,
): void {
  if (params.has(name)) {
    throw new Error(
      `${name} query parameter is not supported; game002 uses a fixed live server.`,
    );
  }
}

function parseRequiredQueryString(
  params: URLSearchParams,
  name: string,
): string {
  const values = params.getAll(name);
  if (values.length === 0) {
    throw new Error(`${name} query parameter is required.`);
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
