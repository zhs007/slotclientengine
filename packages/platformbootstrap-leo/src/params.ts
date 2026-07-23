import type { SlotPlatformMode } from "@slotclientengine/platformbootstrap";

export const DEFAULT_LEO_CONFIG_URL =
  "https://launcher.rgstest.slammerstudios.com/bggs/v1/gameclient/config";

export interface LeoLauncherParameters {
  readonly configUrl: string;
  readonly jurisdiction: string;
  readonly license?: string;
  readonly gameCode: string;
  readonly language: string;
  readonly credential: string;
  readonly businessCode: string;
  readonly moneyMode?: string;
  readonly replayUrl?: string;
  readonly mode: SlotPlatformMode;
  readonly currency?: string;
}

const UNIQUE_KEYS = Object.freeze([
  "configUrl",
  "jurisdiction",
  "license",
  "gameCode",
  "gamecode",
  "lang",
  "language",
  "platformToken",
  "token",
  "businessCode",
  "businessid",
  "moneymode",
  "replayurl",
  "mode",
  "currency",
] as const);

export function parseLeoLauncherParameters(
  search: string | URLSearchParams,
): LeoLauncherParameters {
  const params =
    search instanceof URLSearchParams ? search : new URLSearchParams(search);
  for (const key of UNIQUE_KEYS) rejectDuplicate(params, key);

  const configUrl =
    parseOptional(params, "configUrl") ?? DEFAULT_LEO_CONFIG_URL;
  validateHttpsUrl(configUrl, "configUrl");
  const jurisdiction = parseRequired(params, "jurisdiction");
  const license = parseOptional(params, "license");
  const gameCode = parseAlias(params, "gameCode", "gamecode");
  const language = parseAlias(params, "lang", "language");
  const credential = parseAlias(params, "platformToken", "token", true);
  const businessCode = parseAlias(params, "businessCode", "businessid");
  const moneyMode = parseOptional(params, "moneymode");
  const replayUrl = parseOptional(params, "replayurl");
  const rawMode = parseOptional(params, "mode");
  const currency = parseOptional(params, "currency");

  if (rawMode !== undefined && rawMode !== "REPLAY") {
    throw new Error("mode query parameter is not recognized.");
  }
  if (moneyMode !== undefined && moneyMode !== "fun") {
    throw new Error("moneymode query parameter is not recognized.");
  }
  const hasReplayUrl = replayUrl !== undefined;
  const hasReplayMode = rawMode === "REPLAY";
  if (hasReplayUrl !== hasReplayMode) {
    throw new Error("replayurl and mode=REPLAY must be provided together.");
  }
  const fun = businessCode === "guest" && moneyMode === "fun";
  if (hasReplayUrl && fun) {
    throw new Error("replay and fun mode cannot be enabled together.");
  }
  if (currency !== undefined) validateCurrency(currency);

  return Object.freeze({
    configUrl,
    jurisdiction,
    ...(license === undefined ? {} : { license }),
    gameCode,
    language,
    credential,
    businessCode,
    ...(moneyMode === undefined ? {} : { moneyMode }),
    ...(replayUrl === undefined ? {} : { replayUrl }),
    mode: hasReplayUrl ? "replay" : fun ? "fun" : "real",
    ...(currency === undefined ? {} : { currency }),
  });
}

export function validateHttpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `${label} must be an absolute HTTPS URL without credentials or fragment.`,
    );
  }
  return url;
}

export function validateWssUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute WSS URL.`);
  }
  if (
    url.protocol !== "wss:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      `${label} must be an absolute WSS URL without credentials or fragment.`,
    );
  }
  return url;
}

export function validateCurrency(value: string): string {
  try {
    const normalized = new Intl.NumberFormat("en", {
      style: "currency",
      currency: value,
    }).resolvedOptions().currency;
    if (normalized !== value.toUpperCase()) throw new Error();
    return normalized;
  } catch {
    throw new Error("currency query parameter is invalid.");
  }
}

function parseAlias(
  params: URLSearchParams,
  canonical: string,
  compatibility: string,
  secret = false,
): string {
  const canonicalValue = parseOptional(params, canonical, secret);
  const compatibilityValue = parseOptional(params, compatibility, secret);
  if (canonicalValue === undefined && compatibilityValue === undefined) {
    throw new Error(`${canonical} query parameter is required.`);
  }
  if (
    canonicalValue !== undefined &&
    compatibilityValue !== undefined &&
    canonicalValue !== compatibilityValue
  ) {
    throw new Error(
      `${canonical} and ${compatibility} query parameters conflict.`,
    );
  }
  return canonicalValue ?? compatibilityValue ?? "";
}

function parseRequired(params: URLSearchParams, name: string): string {
  const value = parseOptional(params, name);
  if (value === undefined)
    throw new Error(`${name} query parameter is required.`);
  return value;
}

function parseOptional(
  params: URLSearchParams,
  name: string,
  secret = false,
): string | undefined {
  if (!params.has(name)) return undefined;
  const raw = params.get(name) ?? "";
  const value = raw.trim();
  if (value.length === 0) {
    throw new Error(`${name} query parameter must not be empty.`);
  }
  if (/\s/u.test(value)) {
    throw new Error(
      secret
        ? `${name} query parameter must be URL encoded.`
        : `${name} query parameter must be URL encoded and contain no whitespace.`,
    );
  }
  return value;
}

function rejectDuplicate(params: URLSearchParams, name: string): void {
  if (params.getAll(name).length > 1) {
    throw new Error(
      `${name} query parameter must not be provided more than once.`,
    );
  }
}
