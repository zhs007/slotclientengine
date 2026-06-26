import {
  validateLiveServerUrl,
  type SlotGameBetOption,
  type SlotGameLiveConfig,
  type SlotGameSpinRequest,
} from "@slotclientengine/gameframeworks";

export interface Game002QueryConfig {
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

export interface Game002FrameworkConfig {
  readonly live: SlotGameLiveConfig;
  readonly betOptions: readonly SlotGameBetOption[];
  readonly initialBetIndex: number;
  readonly spinRequest: SlotGameSpinRequest;
}

export interface Game002QueryParseOptions {
  readonly pageProtocol?: string;
}

export function parseGame002QueryConfig(
  search: string | URLSearchParams,
  options: Game002QueryParseOptions = {},
): Game002QueryConfig {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const serverUrl = parseRequiredQueryString(params, "serverUrl");
  validateGame002ServerUrl(serverUrl, options.pageProtocol);

  return Object.freeze({
    serverUrl,
    token: parseRequiredQueryString(params, "token"),
    gamecode: parseRequiredQueryString(params, "gamecode"),
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

export function parseGame002FrameworkConfigFromQuery(
  search: string | URLSearchParams,
  options: Game002QueryParseOptions = {},
): Game002FrameworkConfig {
  const parsed = parseGame002QueryConfig(search, options);
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

function validateGame002ServerUrl(value: string, pageProtocol?: string): void {
  try {
    validateLiveServerUrl(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `serverUrl query parameter must be a valid ws:// or wss:// live URL. ${reason}`,
    );
  }

  const parsed = new URL(value);
  if (pageProtocol === "https:" && parsed.protocol === "ws:") {
    throw new Error(
      "serverUrl query parameter must use wss:// when the page is served over https:.",
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
