import { createGameLoading } from "@slotclientengine/gameloading";
import { createSimpleGameLoadingUi } from "@slotclientengine/gameloading-ui-simple";
import {
  createGame003LoadingResources,
  readGame003RuntimeModule,
  type Game003EnteredGameLike,
  type Game003PreparedLoadingSessionLike,
  type Game003RuntimeModule,
} from "./loading-resources.js";
import "./styles.css";

const GAME003_LOADING_MAX_CONCURRENT_RESOURCES = 4;

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root.");
}

const loadingHost = document.createElement("div");
loadingHost.className = "game003-loading-host";
const gameHost = document.createElement("div");
gameHost.className = "game003-game-host";
gameHost.hidden = true;
root.replaceChildren(loadingHost, gameHost);

let enteredGame: Game003EnteredGameLike | null = null;

const loading = createGameLoading<{
  readonly runtimeModule: Game003RuntimeModule;
  readonly prepared: Game003PreparedLoadingSessionLike;
}>({
  root: loadingHost,
  ui: createSimpleGameLoadingUi(),
  maxConcurrentResources: GAME003_LOADING_MAX_CONCURRENT_RESOURCES,
  resources: createGame003LoadingResources(),
  onBeforeComplete: async ({ loadedResources }) => {
    const runtimeModule = readGame003RuntimeModule(loadedResources);
    const prepared = await runtimeModule.prepareGame003At99({
      search: window.location.search,
    });
    return Object.freeze({ runtimeModule, prepared });
  },
  onEnterGame: async ({ prepareResult }) => {
    gameHost.hidden = false;
    gameHost.replaceChildren();
    try {
      enteredGame = await prepareResult.runtimeModule.enterGame003({
        root: gameHost,
        prepared: prepareResult.prepared,
      });
    } catch (error) {
      gameHost.hidden = true;
      gameHost.replaceChildren();
      throw error;
    }
  },
  onError: (error) => {
    console.error(error);
  },
});

void loading.start().catch(() => undefined);

window.addEventListener("beforeunload", () => {
  loading.destroy();
  enteredGame?.destroy();
});
