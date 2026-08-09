import {
  prepareSlotGameLiveSession,
  type SlotGameLiveSessionLike,
} from "@slotclientengine/gameframeworks";
import type { SlotPlatformBootstrapHandle } from "@slotclientengine/platformbootstrap";
import { createLeoPlatformBootstrapProvider } from "@slotclientengine/platformbootstrap-leo";
import {
  GAME002V2_SERVER_URL,
  parseLaunchQuery,
  type Game002v2LaunchConfig,
} from "./launch.js";

export interface Game002v2Readiness {
  readonly config: Game002v2LaunchConfig;
  readonly platform: SlotPlatformBootstrapHandle;
  readonly session: SlotGameLiveSessionLike;
  destroy(): void;
}

export async function prepareReadiness(
  search: string,
  signal: AbortSignal,
): Promise<Game002v2Readiness> {
  const config = parseLaunchQuery(search);
  const provider = createLeoPlatformBootstrapProvider({
    params: config.platform,
    presentation: {
      brandLabel: "game002v2",
      defaultCurrency: "USD",
      defaultLocale: "en-US",
      localeByLanguage: Object.freeze({ en: "en-US", en_GB: "en-GB" }),
    },
    expectedGameServerUrl: GAME002V2_SERVER_URL,
  });
  const [platform, session] = await Promise.all([
    provider.prepare(signal),
    prepareSlotGameLiveSession({ live: config.live, signal }),
  ]);
  let destroyed = false;
  return Object.freeze({
    config,
    platform,
    session,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      session.disconnect();
      platform.destroy();
    },
  });
}
