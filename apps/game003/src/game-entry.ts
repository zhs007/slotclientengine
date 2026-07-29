import {
  createSlotGameFramework,
  prepareSlotGameLiveSession,
  type SlotGameFramework,
  type SlotGameLiveSessionLike,
} from "@slotclientengine/gameframeworks";
import { createSceneLayoutFramePolicy } from "@slotclientengine/rendercore";
import "@slotclientengine/gameframeworks/styles.css";
import { createGame003Adapter } from "./game-adapter.js";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
import {
  GAME003_REFERENCE_SIZE,
  GAME003_SKIN1_PORTRAIT_ART_SIZE,
  createGame003FramePolicy,
} from "./game-layout.js";
import {
  parseGame003FrameworkConfigFromQuery,
  type Game003FrameworkConfig,
} from "./framework-config.js";
import { formatServerAmount } from "./money.js";
import {
  prepareGame003SkinConfig,
  type Game003SkinConfig,
  type Game003SkinResourceOwner,
} from "./skin-config.js";
import { readGame003Minecart2PackageFiles } from "./loading-resources.js";
import "./styles.css";

export interface Game003PreparedLoadingState {
  readonly config: Game003FrameworkConfig;
  readonly skin: Game003SkinConfig;
  readonly skinResourceOwner: Game003SkinResourceOwner;
  readonly liveSession: SlotGameLiveSessionLike;
}

export interface Game003EnteredGame {
  readonly framework: SlotGameFramework;
  destroy(): Promise<void>;
}

export async function prepareGame003At99(options: {
  readonly search: string;
  readonly loadedResources?: ReadonlyMap<string, unknown>;
  readonly signal?: AbortSignal;
}): Promise<Game003PreparedLoadingState> {
  const config = parseGame003FrameworkConfigFromQuery(options.search);
  const signal = options.signal;
  if (signal?.aborted) throw createAbortError();
  const liveSessionPromise = prepareSlotGameLiveSession({ live: config.live });
  let skinResult: Awaited<ReturnType<typeof prepareGame003SkinConfig>> | null =
    null;
  let liveSession: SlotGameLiveSessionLike | null = null;
  try {
    [skinResult, liveSession] = await Promise.all([
      prepareGame003SkinConfig(
        config.skin,
        config.skin === "2"
          ? {
              minecart2Files: readGame003Minecart2PackageFiles(
                options.loadedResources ?? new Map(),
              ),
            }
          : {},
      ),
      liveSessionPromise,
    ]);
    if (signal?.aborted) throw createAbortError();
    return Object.freeze({
      config,
      skin: skinResult.skin,
      skinResourceOwner: skinResult.resourceOwner,
      liveSession,
    });
  } catch (error) {
    liveSession?.disconnect();
    if (!liveSession) {
      void liveSessionPromise.then(
        (lateSession) => lateSession.disconnect(),
        () => undefined,
      );
    }
    await skinResult?.resourceOwner.destroy();
    throw error;
  }
}

export async function enterGame003(options: {
  readonly root: HTMLElement;
  readonly prepared: Game003PreparedLoadingState;
}): Promise<Game003EnteredGame> {
  let framework: SlotGameFramework | null = null;
  let removeBeforeUnload: (() => void) | null = null;
  let destroyPromise: Promise<void> | null = null;
  const destroyOwnedResources = (): Promise<void> => {
    if (destroyPromise) return destroyPromise;
    destroyPromise = (async () => {
      removeBeforeUnload?.();
      removeBeforeUnload = null;
      let cleanupError: unknown;
      try {
        if (framework) framework.destroy();
        else options.prepared.liveSession.disconnect();
      } catch (error) {
        cleanupError = error;
      }
      try {
        await options.prepared.skinResourceOwner.destroy();
      } catch (error) {
        cleanupError ??= error;
      }
      framework = null;
      if (cleanupError) throw cleanupError;
    })();
    return destroyPromise;
  };
  try {
    const sceneManifest =
      options.prepared.skin.id === "2"
        ? options.prepared.skin.resource.manifest
        : null;
    const scenePortraitSize =
      sceneManifest?.adaptation.mode === "orientation-focus"
        ? sceneManifest.adaptation.variants.portrait.artSize
        : null;
    framework = createSlotGameFramework({
      root: options.root,
      gameAdapter: createGame003Adapter({ skin: options.prepared.skin }),
      live: options.prepared.config.live,
      liveSession: options.prepared.liveSession,
      betOptions: options.prepared.config.betOptions,
      initialBetIndex: options.prepared.config.initialBetIndex,
      designSize:
        scenePortraitSize ??
        GAME003_SKIN1_PORTRAIT_ART_SIZE ??
        GAME003_REFERENCE_SIZE,
      framePolicy: sceneManifest
        ? createSceneLayoutFramePolicy(sceneManifest)
        : createGame003FramePolicy(),
      brandLabel: GAME003_STATIC_CONFIG.brandLabel,
      locale: "en-US",
      formatMoney: formatServerAmount,
      buildSpinRequest: () => options.prepared.config.spinRequest,
      onError: (error) => {
        console.error(error);
      },
    });
    await framework.connect();

    const handleBeforeUnload = () => {
      void destroyOwnedResources().catch((error: unknown) =>
        console.error(error),
      );
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    removeBeforeUnload = () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };

    return Object.freeze({
      framework,
      destroy(): Promise<void> {
        return destroyOwnedResources();
      },
    });
  } catch (error) {
    try {
      await destroyOwnedResources();
    } catch {
      // The enter failure remains authoritative after best-effort cleanup.
    }
    throw error;
  }
}

function createAbortError(): DOMException {
  return new DOMException("game003 preparation was aborted.", "AbortError");
}
