import type {
  SlotGameBetOption,
  SlotGameLiveConfig,
  SlotGameSpinRequest,
} from "@slotclientengine/gameframeworks";
import {
  parseLeoLauncherParameters,
  type LeoLauncherParameters,
} from "@slotclientengine/platformbootstrap-leo";
import { parseGame002SkinQuery, type Game002SkinId } from "./skin-id.js";

export const GAME002_LIVE_SERVER_URL =
  "wss://gameserv.rgstest.slammerstudios.com/";
export const GAME002_LINES = 30;

export interface Game002LaunchConfig {
  readonly platform: LeoLauncherParameters;
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex: 0;
  readonly spinRequest: SlotGameSpinRequest;
  readonly skin: Game002SkinId;
}

export function parseGame002LaunchQuery(
  search: string | URLSearchParams,
): Game002LaunchConfig {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  rejectUnsupportedQueryParameter(params, "serverUrl");
  const platform = parseLeoLauncherParameters(params);
  const skin = parseGame002SkinQuery(params);
  const clienttype = parseRequiredQueryString(params, "clienttype");
  const bet = parsePositiveQueryNumber(params, "bet");
  const lines = parsePositiveQueryNumber(params, "lines");
  if (lines !== GAME002_LINES) {
    throw new Error(
      `lines query parameter must be exactly ${GAME002_LINES} for game002.`,
    );
  }
  const times = parsePositiveQueryNumber(params, "times");
  const autonums = parseQueryInteger(params, "autonums");
  const requestTimeoutMs = parsePositiveQueryNumber(params, "requestTimeoutMs");
  const betOption: SlotGameBetOption = Object.freeze({ bet, lines, times });
  return Object.freeze({
    platform,
    live: Object.freeze({
      serverUrl: GAME002_LIVE_SERVER_URL,
      token: platform.credential,
      gamecode: platform.gameCode,
      businessid: platform.businessCode,
      clienttype,
      jurisdiction: platform.jurisdiction,
      language: platform.language,
      requestTimeoutMs,
    }),
    betOptions: Object.freeze([betOption]),
    initialBetIndex: 0,
    spinRequest: Object.freeze({ bet, lines, times, autonums }),
    skin,
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
  if (/\s/u.test(trimmed)) {
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
