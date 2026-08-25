import { createGameLoading } from "@slotclientengine/gameloading";
import { createLeoGameLoadingUi } from "@slotclientengine/gameloading-ui-leo";
import {
  createSlotGameFramework,
  type SlotGameFramework,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import { createLeoSlotGameUiFactory } from "@slotclientengine/game-ui-leo";
import "@slotclientengine/game-ui-leo/styles.css";
import { createSceneLayoutFramePolicy } from "@slotclientengine/rendercore/scene-layout/data";
import type { SlotPlatformBootstrapHandle } from "@slotclientengine/platformbootstrap";
import { createCraveLoadingResources, createCraveResource } from "./crave.js";
import type { Game002v2LaunchConfig } from "./launch.js";
import { prepareReadiness, type Game002v2Readiness } from "./readiness.js";
import { createGame002v2RoundAdapter } from "./round-adapter.js";
import { createGame002v2PerformanceTrace } from "./performance-trace.js";
import { prepareGame002v2ReelPresentation } from "./reel-presentation.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root.");
const loadingHost = document.createElement("div");
loadingHost.className = "game002v2-loading";
const gameHost = document.createElement("div");
gameHost.className = "game002v2-game";
gameHost.hidden = true;
root.replaceChildren(loadingHost, gameHost);

interface PreparedGame {
  readonly config: Game002v2LaunchConfig;
  readonly platform: SlotPlatformBootstrapHandle;
  readonly session: Game002v2Readiness["session"];
  readonly resource: Awaited<ReturnType<typeof createCraveResource>>;
  readonly reelPresentation: Awaited<
    ReturnType<typeof prepareGame002v2ReelPresentation>
  >;
}

let framework: SlotGameFramework | null = null;
let platform: SlotPlatformBootstrapHandle | null = null;
const performanceTrace = createGame002v2PerformanceTrace();

const loading = createGameLoading<PreparedGame, Game002v2Readiness>({
  root: loadingHost,
  ui: createLeoGameLoadingUi(),
  maxConcurrentResources: 8,
  resources: createCraveLoadingResources(),
  readiness: {
    start: ({ signal }) => prepareReadiness(window.location.search, signal),
    dispose: (readiness) => readiness.destroy(),
  },
  onBeforeComplete: async ({ loadedResources, readinessResult, signal }) => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const resource = await createCraveResource(loadedResources, signal);
    try {
      const reelPresentation = await prepareGame002v2ReelPresentation(resource);
      return Object.freeze({
        config: readinessResult.config,
        platform: readinessResult.platform,
        session: readinessResult.session,
        resource,
        reelPresentation,
      });
    } catch (error) {
      await resource.destroy();
      throw error;
    }
  },
  onEnterGame: async ({ prepareResult }) => {
    performanceTrace.markStartup("entering-game");
    const snapshot = prepareResult.platform.snapshot;
    platform = prepareResult.platform;
    gameHost.hidden = false;
    framework = createSlotGameFramework({
      root: gameHost,
      gameAdapter: createGame002v2RoundAdapter(
        prepareResult.resource,
        prepareResult.reelPresentation,
        performanceTrace,
      ),
      live: prepareResult.config.live,
      liveSession: prepareResult.session,
      betOptions: prepareResult.config.betOptions,
      initialBetIndex: 0,
      initialMuted: snapshot.initialPreferences.muted,
      initialFastMode: snapshot.initialPreferences.fastMode,
      initialAutoMode: snapshot.initialPreferences.autoMode,
      designSize: { width: 1125, height: 2000 },
      framePolicy: createSceneLayoutFramePolicy(
        prepareResult.resource.manifest,
      ),
      brandLabel: snapshot.presentation.brandLabel,
      currency: snapshot.presentation.currency,
      locale: snapshot.presentation.locale,
      formatMoney: createMoneyFormatter(
        snapshot.presentation.locale,
        snapshot.presentation.currency,
      ),
      uiFactory: createLeoSlotGameUiFactory(),
      buildSpinRequest: () => prepareResult.config.spinRequest,
      rngConsole: { target: window, log: console.info },
      onError: console.error,
      performanceObserver: performanceTrace.observer,
    });
    await framework.connect();
  },
  onError: console.error,
});

void loading.start().catch(() => undefined);

window.addEventListener("beforeunload", () => {
  loading.destroy();
  framework?.destroy();
  platform?.destroy();
});

function createMoneyFormatter(locale: string, currency: string) {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (amount: number): string => formatter.format(amount / 100);
}
