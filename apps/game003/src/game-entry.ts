import {
  createSlotGameFramework,
  prepareSlotGameLiveSession,
  type SlotGameFramework,
  type SlotGameLiveSessionLike,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import { createGame003Adapter } from "./game-adapter.js";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
import {
  GAME003_REFERENCE_SIZE,
  createGame003FramePolicy,
} from "./game-layout.js";
import {
  parseGame003FrameworkConfigFromQuery,
  type Game003FrameworkConfig,
} from "./framework-config.js";
import { formatServerUsdAmount } from "./money.js";
import { getGame003SkinConfig, type Game003SkinConfig } from "./skin-config.js";
import "./styles.css";

export interface Game003PreparedLoadingState {
  readonly config: Game003FrameworkConfig;
  readonly skin: Game003SkinConfig;
  readonly liveSession: SlotGameLiveSessionLike;
}

export interface Game003EnteredGame {
  readonly framework: SlotGameFramework;
  destroy(): void;
}

export async function prepareGame003At99(options: {
  readonly search: string;
}): Promise<Game003PreparedLoadingState> {
  const config = parseGame003FrameworkConfigFromQuery(options.search);
  const skin = getGame003SkinConfig(config.skin);
  const liveSession = await prepareSlotGameLiveSession({ live: config.live });
  return Object.freeze({
    config,
    skin,
    liveSession,
  });
}

export async function enterGame003(options: {
  readonly root: HTMLElement;
  readonly prepared: Game003PreparedLoadingState;
}): Promise<Game003EnteredGame> {
  let framework: SlotGameFramework | null = null;
  let removeBeforeUnload: (() => void) | null = null;
  try {
    framework = createSlotGameFramework({
      root: options.root,
      gameAdapter: createGame003Adapter({ skin: options.prepared.skin }),
      live: options.prepared.config.live,
      liveSession: options.prepared.liveSession,
      betOptions: options.prepared.config.betOptions,
      initialBetIndex: options.prepared.config.initialBetIndex,
      designSize: GAME003_REFERENCE_SIZE,
      framePolicy: createGame003FramePolicy(),
      brandLabel: GAME003_STATIC_CONFIG.brandLabel,
      currency: "USD",
      locale: "en-US",
      formatMoney: formatServerUsdAmount,
      buildSpinRequest: () => options.prepared.config.spinRequest,
      onError: (error) => {
        console.error(error);
      },
    });
    await framework.connect();

    const handleBeforeUnload = () => {
      framework?.destroy();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    removeBeforeUnload = () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };

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
