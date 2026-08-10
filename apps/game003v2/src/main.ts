import { createGameLoading } from "@slotclientengine/gameloading";
import { createSimpleGameLoadingUi } from "@slotclientengine/gameloading-ui-simple";
import {
  createSlotGameFramework,
  prepareSlotGameLiveSession,
  type SlotGameFramework,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import { createSceneLayoutFramePolicy } from "@slotclientengine/rendercore";
import { GAME003V2_CONFIG } from "./config.js";
import { parseGame003v2Launch } from "./launch.js";
import {
  createGame003v2LoadingResources,
  readMinecart2Manifest,
} from "./loading-resources.js";
import { formatGame003v2Amount } from "./money.js";
import { prepareGame003v2Resource } from "./resource.js";
import { createGame003v2RoundAdapter } from "./round-adapter.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root.");
const loadingHost = document.createElement("div");
loadingHost.className = "game003v2-loading";
const gameHost = document.createElement("div");
gameHost.className = "game003v2-game";
gameHost.hidden = true;
root.replaceChildren(loadingHost, gameHost);

let framework: SlotGameFramework | null = null;
const loading = createGameLoading({
  root: loadingHost,
  ui: createSimpleGameLoadingUi(),
  maxConcurrentResources: 4,
  resources: createGame003v2LoadingResources(document.baseURI),
  readiness: {
    start: async () => {
      const config = parseGame003v2Launch(window.location.search);
      const session = await prepareSlotGameLiveSession({ live: config.live });
      return Object.freeze({ config, session });
    },
    dispose: (readiness) => readiness.session.disconnect(),
  },
  onBeforeComplete: async ({ loadedResources, readinessResult, signal }) => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const resource = await prepareGame003v2Resource(
      new URL("layout.manifest.json", document.baseURI),
      readMinecart2Manifest(loadedResources),
      signal,
    );
    return Object.freeze({ ...readinessResult, resource });
  },
  onEnterGame: async ({ prepareResult }) => {
    gameHost.hidden = false;
    const manifest = prepareResult.resource.package.manifest;
    if (manifest.adaptation.mode !== "orientation-focus")
      throw new Error(
        "Minecart2 layout must use orientation-focus adaptation.",
      );
    framework = createSlotGameFramework({
      root: gameHost,
      gameAdapter: createGame003v2RoundAdapter(prepareResult.resource),
      live: prepareResult.config.live,
      liveSession: prepareResult.session,
      betOptions: prepareResult.config.betOptions,
      initialBetIndex: 0,
      designSize: manifest.adaptation.variants.portrait.artSize,
      framePolicy: createSceneLayoutFramePolicy(manifest),
      brandLabel: GAME003V2_CONFIG.brandLabel,
      locale: "en-US",
      formatMoney: formatGame003v2Amount,
      buildSpinRequest: () => prepareResult.config.spinRequest,
      onError: console.error,
    });
    await framework.connect();
  },
  onError: console.error,
});

void loading.start().catch(() => undefined);

window.addEventListener("beforeunload", () => {
  loading.destroy();
  framework?.destroy();
});
