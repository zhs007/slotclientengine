import {
  validateHttpsUrl,
  validateWssUrl,
  type LeoLauncherParameters,
} from "./params.js";

export interface LeoLauncherConfigProjection {
  readonly commonTranslationJsonUrl: string;
  readonly gameTranslationJsonUrl?: string;
  readonly quickStop: boolean;
  readonly disableSpacebar: boolean;
  readonly gameServerConfig: {
    readonly gameServerApi: string;
    readonly settingApi: string;
  };
}

export function createLeoLauncherConfigRequestUrl(
  params: LeoLauncherParameters,
): string {
  const url = validateHttpsUrl(params.configUrl, "configUrl");
  const additions = [
    ["jurisdiction", params.jurisdiction],
    ...(params.license === undefined ? [] : [["license", params.license]]),
    ["gameCode", params.gameCode],
    ["lang", params.language],
  ] as const;
  for (const [key, value] of additions) {
    if (url.searchParams.has(key)) {
      throw new Error(
        `configUrl must not predefine the ${key} request parameter.`,
      );
    }
    url.searchParams.append(key, value);
  }
  return url.toString();
}

export async function loadLeoLauncherConfig(options: {
  readonly params: LeoLauncherParameters;
  readonly fetch: typeof globalThis.fetch;
  readonly signal: AbortSignal;
}): Promise<LeoLauncherConfigProjection> {
  let response: Response;
  try {
    response = await options.fetch(
      createLeoLauncherConfigRequestUrl(options.params),
      {
        method: "GET",
        signal: options.signal,
      },
    );
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error("Leo launcher config request failed.");
  }
  if (!response.ok) throw new Error("Leo launcher config request failed.");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Leo launcher config response must be JSON.");
  }
  return parseLeoLauncherConfig(body);
}

export function parseLeoLauncherConfig(
  input: unknown,
): LeoLauncherConfigProjection {
  const root = requireRecord(input, "launcher config");
  const server = requireRecord(
    root.gameServerConfig,
    "launcher gameServerConfig",
  );
  const commonTranslationJsonUrl = requireString(
    root.commonTranslationJsonUrl,
    "commonTranslationJsonUrl",
  );
  validateHttpsUrl(commonTranslationJsonUrl, "commonTranslationJsonUrl");
  const gameTranslationJsonUrl = optionalString(
    root.gameTranslationJsonUrl,
    "gameTranslationJsonUrl",
  );
  if (gameTranslationJsonUrl !== undefined) {
    validateHttpsUrl(gameTranslationJsonUrl, "gameTranslationJsonUrl");
  }
  const gameServerApi = requireString(server.gameServerApi, "gameServerApi");
  const settingApi = requireString(server.settingApi, "settingApi");
  validateWssUrl(gameServerApi, "gameServerApi");
  validateHttpsUrl(settingApi, "settingApi");
  return Object.freeze({
    commonTranslationJsonUrl,
    ...(gameTranslationJsonUrl === undefined ? {} : { gameTranslationJsonUrl }),
    quickStop: requireBoolean(root.quickStop, "quickStop"),
    disableSpacebar:
      root.disableSpacebar === undefined
        ? false
        : requireBoolean(root.disableSpacebar, "disableSpacebar"),
    gameServerConfig: Object.freeze({ gameServerApi, settingApi }),
  });
}

export function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireString(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be a boolean.`);
  return value;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
