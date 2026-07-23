import {
  prepareSlotGameLiveSession,
  type SlotGameLiveSessionLike,
} from "@slotclientengine/gameframeworks";
import type { SlotPlatformBootstrapHandle } from "@slotclientengine/platformbootstrap";
import { createLeoPlatformBootstrapProvider } from "@slotclientengine/platformbootstrap-leo";
import {
  GAME002_LIVE_SERVER_URL,
  parseGame002LaunchQuery,
  type Game002LaunchConfig,
} from "./framework-config.js";

export interface Game002ReadinessResult {
  readonly config: Game002LaunchConfig;
  readonly platformHandle: SlotPlatformBootstrapHandle;
  readonly liveSession: SlotGameLiveSessionLike;
  destroy(): void;
}

export async function startGame002Readiness(options: {
  readonly search: string;
  readonly signal: AbortSignal;
}): Promise<Game002ReadinessResult> {
  const config = parseGame002LaunchQuery(options.search);
  if (config.platform.mode === "replay") {
    throw new Error(
      "game002 replay mode is not supported by the current live transport.",
    );
  }
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (options.signal.aborted) controller.abort();
  else options.signal.addEventListener("abort", forwardAbort, { once: true });
  const provider = createLeoPlatformBootstrapProvider({
    params: config.platform,
    presentation: {
      brandLabel: "game002",
      defaultCurrency: "USD",
      defaultLocale: "en-US",
      localeByLanguage: Object.freeze({ en: "en-US" }),
    },
    expectedGameServerUrl: GAME002_LIVE_SERVER_URL,
  });
  let firstError: unknown;
  const failFast = <T>(operation: Promise<T>): Promise<T> =>
    operation.catch((error) => {
      firstError ??= error;
      controller.abort();
      throw error;
    });
  const platformPromise = failFast(provider.prepare(controller.signal));
  const sessionPromise = failFast(
    prepareSlotGameLiveSession({
      live: config.live,
      signal: controller.signal,
    }),
  );
  const [platformResult, sessionResult] = await Promise.allSettled([
    platformPromise,
    sessionPromise,
  ]);
  options.signal.removeEventListener("abort", forwardAbort);
  if (
    platformResult.status === "rejected" ||
    sessionResult.status === "rejected"
  ) {
    const authoritativeError =
      firstError ??
      (platformResult.status === "rejected"
        ? platformResult.reason
        : sessionResult.status === "rejected"
          ? sessionResult.reason
          : new Error("game002 readiness failed."));
    if (platformResult.status === "fulfilled") {
      try {
        platformResult.value.destroy();
      } catch {
        // The first readiness failure remains authoritative.
      }
    }
    if (sessionResult.status === "fulfilled") {
      try {
        sessionResult.value.disconnect();
      } catch {
        // Best-effort cleanup continues without replacing the first failure.
      }
    }
    throw authoritativeError;
  }
  let destroyed = false;
  return Object.freeze({
    config,
    platformHandle: platformResult.value,
    liveSession: sessionResult.value,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      let cleanupError: unknown;
      try {
        platformResult.value.destroy();
      } catch (error) {
        cleanupError = error;
      }
      try {
        sessionResult.value.disconnect();
      } catch (error) {
        cleanupError ??= error;
      }
      if (cleanupError) throw cleanupError;
    },
  });
}
