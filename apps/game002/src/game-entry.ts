import {
  createSlotGameFramework,
  type SlotGameFramework,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import { createLeoSlotGameUiFactory } from "@slotclientengine/game-ui-leo";
import "@slotclientengine/game-ui-leo/styles.css";
import type { SymbolValuePresentationResourceBundle } from "@slotclientengine/rendercore";
import { createGame002Adapter } from "./game-adapter.js";
import type { Game002ReadinessResult } from "./game002-bootstrap.js";
import {
  GAME002_REFERENCE_SIZE,
  createGame002FramePolicy,
} from "./game-layout.js";
import { formatServerUsdAmount } from "./money.js";
import { createGame002LeoUiLabels } from "./platform-ui.js";
import {
  prepareGame002SkinConfig,
  type Game002SkinConfig,
} from "./skin-config.js";
import "./styles.css";

export interface Game002PreparedLoadingState {
  readonly readiness: Game002ReadinessResult;
  readonly skin: Game002SkinConfig;
  readonly valuePresentationResourceBundle: SymbolValuePresentationResourceBundle;
}

export interface Game002EnteredGame {
  readonly framework: SlotGameFramework;
  destroy(): void;
}

export async function finalizeGame002At99(options: {
  readonly readinessResult: Game002ReadinessResult;
  readonly signal: AbortSignal;
}): Promise<Game002PreparedLoadingState> {
  try {
    if (options.signal.aborted) throw createAbortError();
    const skinResult = await prepareGame002SkinConfig(
      options.readinessResult.config.skin,
    );
    if (options.signal.aborted) {
      await skinResult.valuePresentationResourceBundle.destroy();
      throw createAbortError();
    }
    return Object.freeze({
      readiness: options.readinessResult,
      skin: skinResult.skin,
      valuePresentationResourceBundle:
        skinResult.valuePresentationResourceBundle,
    });
  } catch (error) {
    options.readinessResult.destroy();
    throw error;
  }
}

export async function enterGame002(options: {
  readonly root: HTMLElement;
  readonly prepared: Game002PreparedLoadingState;
}): Promise<Game002EnteredGame> {
  const { config, liveSession, platformHandle } = options.prepared.readiness;
  const { snapshot } = platformHandle;
  let framework: SlotGameFramework | null = null;
  let removeBeforeUnload: (() => void) | null = null;
  let destroyed = false;
  const destroyOwnedResources = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    removeBeforeUnload?.();
    removeBeforeUnload = null;
    let cleanupError: unknown;
    try {
      if (framework) framework.destroy();
      else liveSession.disconnect();
    } catch (error) {
      cleanupError = error;
    }
    try {
      platformHandle.destroy();
    } catch (error) {
      cleanupError ??= error;
    }
    try {
      await options.prepared.valuePresentationResourceBundle.destroy();
    } catch (error) {
      cleanupError ??= error;
    }
    framework = null;
    if (cleanupError) throw cleanupError;
  };
  try {
    framework = createSlotGameFramework({
      root: options.root,
      gameAdapter: createGame002Adapter({ skin: options.prepared.skin }),
      live: config.live,
      liveSession,
      betOptions: config.betOptions,
      initialBetIndex: config.initialBetIndex,
      initialMuted: snapshot.initialPreferences.muted,
      initialFastMode: snapshot.initialPreferences.fastMode,
      initialAutoMode: snapshot.initialPreferences.autoMode,
      designSize: GAME002_REFERENCE_SIZE,
      framePolicy: createGame002FramePolicy(options.prepared.skin.focusRegion),
      brandLabel: snapshot.presentation.brandLabel,
      currency: snapshot.presentation.currency,
      locale: snapshot.presentation.locale,
      formatMoney: formatServerUsdAmount,
      uiFactory: createLeoSlotGameUiFactory({
        labels: createGame002LeoUiLabels(snapshot.translations),
      }),
      buildSpinRequest: () => config.spinRequest,
      onError: (error) => console.error(error),
    });
    await framework.connect();

    const handleBeforeUnload = () => {
      void destroyOwnedResources();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    removeBeforeUnload = () =>
      window.removeEventListener("beforeunload", handleBeforeUnload);

    return Object.freeze({
      framework,
      destroy(): void {
        void destroyOwnedResources();
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
  return new DOMException("game002 finalization was aborted.", "AbortError");
}
