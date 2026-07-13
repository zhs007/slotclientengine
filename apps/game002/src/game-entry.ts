import {
  createSlotGameFramework,
  prepareSlotGameLiveSession,
  type SlotGameFramework,
  type SlotGameLiveSessionLike,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import { createGame002Adapter } from "./game-adapter.js";
import {
  GAME002_REFERENCE_SIZE,
  createGame002FramePolicy,
} from "./game-layout.js";
import {
  parseGame002FrameworkConfigFromQuery,
  type Game002FrameworkConfig,
} from "./framework-config.js";
import { formatServerUsdAmount } from "./money.js";
import { getGame002SkinConfig, type Game002SkinConfig } from "./skin-config.js";
import "./styles.css";

export interface Game002PreparedLoadingState {
  readonly config: Game002FrameworkConfig;
  readonly skin: Game002SkinConfig;
  readonly liveSession: SlotGameLiveSessionLike;
}

export interface Game002EnteredGame {
  readonly framework: SlotGameFramework;
  destroy(): void;
}

export async function prepareGame002At99(options: {
  readonly search: string;
}): Promise<Game002PreparedLoadingState> {
  const config = parseGame002FrameworkConfigFromQuery(options.search);
  const skin = getGame002SkinConfig(config.skin);
  const liveSession = await prepareSlotGameLiveSession({ live: config.live });
  return Object.freeze({ config, skin, liveSession });
}

export async function enterGame002(options: {
  readonly root: HTMLElement;
  readonly prepared: Game002PreparedLoadingState;
}): Promise<Game002EnteredGame> {
  let framework: SlotGameFramework | null = null;
  let removeBeforeUnload: (() => void) | null = null;
  try {
    framework = createSlotGameFramework({
      root: options.root,
      gameAdapter: createGame002Adapter({ skin: options.prepared.skin }),
      live: options.prepared.config.live,
      liveSession: options.prepared.liveSession,
      betOptions: options.prepared.config.betOptions,
      initialBetIndex: options.prepared.config.initialBetIndex,
      designSize: GAME002_REFERENCE_SIZE,
      framePolicy: createGame002FramePolicy(options.prepared.skin.focusRegion),
      brandLabel: "game002",
      currency: "USD",
      locale: "en-US",
      formatMoney: formatServerUsdAmount,
      buildSpinRequest: () => options.prepared.config.spinRequest,
      onError: (error) => console.error(error),
    });
    await framework.connect();

    const handleBeforeUnload = () => framework?.destroy();
    window.addEventListener("beforeunload", handleBeforeUnload);
    removeBeforeUnload = () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);

    return Object.freeze({
      framework,
      destroy(): void {
        removeBeforeUnload?.();
        removeBeforeUnload = null;
        framework?.destroy();
        framework = null;
      },
    });
  } catch (error) {
    if (framework) {
      framework.destroy();
    } else {
      options.prepared.liveSession.disconnect();
    }
    throw error;
  }
}
