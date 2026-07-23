import {
  createStringMap,
  type SlotPlatformBootstrapWarning,
} from "@slotclientengine/platformbootstrap";
import type { LeoLauncherConfigProjection } from "./launcher-config.js";

export interface LeoTranslationResult {
  readonly translations: Readonly<Record<string, string>>;
  readonly warnings: readonly SlotPlatformBootstrapWarning[];
}

export async function loadLeoTranslations(options: {
  readonly config: LeoLauncherConfigProjection;
  readonly fetch: typeof globalThis.fetch;
  readonly signal: AbortSignal;
}): Promise<LeoTranslationResult> {
  const common = await loadTranslationMap(
    options.config.commonTranslationJsonUrl,
    options.fetch,
    options.signal,
    "common",
  );
  const gameUrl = options.config.gameTranslationJsonUrl;
  if (gameUrl === undefined) {
    return Object.freeze({ translations: common, warnings: Object.freeze([]) });
  }
  try {
    const game = await loadTranslationMap(
      gameUrl,
      options.fetch,
      options.signal,
      "game",
    );
    return Object.freeze({
      translations: createStringMap({ ...common, ...game }, "translations"),
      warnings: Object.freeze([]),
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    return Object.freeze({
      translations: common,
      warnings: Object.freeze([
        Object.freeze({
          code: "leo-game-translation-unavailable",
          message:
            "Game translation could not be loaded; common translation is in use.",
        }),
      ]),
    });
  }
}

async function loadTranslationMap(
  url: string,
  fetchImplementation: typeof globalThis.fetch,
  signal: AbortSignal,
  kind: "common" | "game",
): Promise<Readonly<Record<string, string>>> {
  let response: Response;
  try {
    response = await fetchImplementation(url, { method: "GET", signal });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(`Leo ${kind} translation request failed.`);
  }
  if (!response.ok) throw new Error(`Leo ${kind} translation request failed.`);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Leo ${kind} translation response must be JSON.`);
  }
  return createStringMap(body, `${kind} translations`);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
