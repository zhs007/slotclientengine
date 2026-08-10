import type {
  SlotGameBetOption,
  SlotGameLiveConfig,
  SlotGameSpinRequest,
} from "@slotclientengine/gameframeworks";
import { GAME003V2_CONFIG } from "./config.js";

export interface Game003v2LaunchConfig {
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly spinRequest: SlotGameSpinRequest;
}

export function parseGame003v2Launch(search: string): Game003v2LaunchConfig {
  const params = new URLSearchParams(search);
  if (params.has("serverUrl"))
    throw new Error("game003v2 does not accept serverUrl overrides.");
  const gamecode = params.get("gamecode") ?? GAME003V2_CONFIG.live.gamecode;
  if (gamecode !== GAME003V2_CONFIG.live.gamecode)
    throw new Error(`gamecode must be ${GAME003V2_CONFIG.live.gamecode}.`);
  if ((params.get("skin") ?? "2") !== "2")
    throw new Error('game003v2 only supports skin "2".');
  const bet = positive(params, "bet");
  const lines = positive(params, "lines");
  const times = positive(params, "times");
  const autonums = integer(params, "autonums");
  const betOption = Object.freeze({ bet, lines, times });
  return Object.freeze({
    live: Object.freeze({
      serverUrl: GAME003V2_CONFIG.live.serverUrl,
      token: required(params, "token"),
      gamecode,
      businessid: required(params, "businessid"),
      clienttype: required(params, "clienttype"),
      jurisdiction: required(params, "jurisdiction"),
      language: required(params, "language"),
      requestTimeoutMs: positive(params, "requestTimeoutMs"),
    }),
    betOptions: Object.freeze([betOption]),
    spinRequest: Object.freeze({ bet, lines, times, autonums }),
  });
}

function required(params: URLSearchParams, name: string): string {
  const values = params.getAll(name);
  if (values.length !== 1 || !values[0]?.trim())
    throw new Error(`${name} query parameter is required exactly once.`);
  return values[0];
}

function positive(params: URLSearchParams, name: string): number {
  const value = Number(required(params, name));
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive number.`);
  return value;
}

function integer(params: URLSearchParams, name: string): number {
  const value = Number(required(params, name));
  if (!Number.isSafeInteger(value))
    throw new Error(`${name} must be an integer.`);
  return value;
}
