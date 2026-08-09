import type {
  SlotGameBetOption,
  SlotGameLiveConfig,
  SlotGameSpinRequest,
} from "@slotclientengine/gameframeworks";
import {
  parseLeoLauncherParameters,
  type LeoLauncherParameters,
} from "@slotclientengine/platformbootstrap-leo";

export const GAME002V2_SERVER_URL =
  "wss://gameserv.rgstest.slammerstudios.com/";

export interface Game002v2LaunchConfig {
  readonly platform: LeoLauncherParameters;
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly spinRequest: SlotGameSpinRequest;
}

export function parseLaunchQuery(search: string): Game002v2LaunchConfig {
  const params = new URLSearchParams(search);
  if (params.has("serverUrl") || params.has("skin"))
    throw new Error("game002v2 does not accept serverUrl or skin overrides.");
  const platform = parseLeoLauncherParameters(params);
  const clienttype = required(params, "clienttype");
  const bet = positive(params, "bet");
  const lines = positive(params, "lines");
  if (lines !== 30) throw new Error("game002v2 requires lines=30.");
  const times = positive(params, "times");
  const autonums = integer(params, "autonums");
  const requestTimeoutMs = positive(params, "requestTimeoutMs");
  const betOption = Object.freeze({ bet, lines, times });
  return Object.freeze({
    platform,
    live: Object.freeze({
      serverUrl: GAME002V2_SERVER_URL,
      token: platform.credential,
      gamecode: platform.gameCode,
      businessid: platform.businessCode,
      clienttype,
      jurisdiction: platform.jurisdiction,
      language: platform.language,
      requestTimeoutMs,
    }),
    betOptions: Object.freeze([betOption]),
    spinRequest: Object.freeze({ bet, lines, times, autonums }),
  });
}

function required(params: URLSearchParams, name: string): string {
  const value = params.get(name)?.trim();
  if (!value) throw new Error(`${name} query parameter is required.`);
  return value;
}

function positive(params: URLSearchParams, name: string): number {
  const value = Number(required(params, name));
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive number.`);
  return value;
}

function integer(params: URLSearchParams, name: string): number {
  const value = Number(required(params, name));
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}
