import { createGameLoading } from "@slotclientengine/gameloading";
import {
  createGame002LoadingResources,
  readGame002RuntimeModule,
  type Game002EnteredGameLike,
  type Game002PreparedLoadingSessionLike,
  type Game002RuntimeModule,
} from "./loading-resources.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root.");
}

const loadingHost = document.createElement("div");
loadingHost.className = "game002-loading-host";
const gameHost = document.createElement("div");
gameHost.className = "game002-game-host";
gameHost.hidden = true;
root.replaceChildren(loadingHost, gameHost);

let enteredGame: Game002EnteredGameLike | null = null;

const loading = createGameLoading<{
  readonly runtimeModule: Game002RuntimeModule;
  readonly prepared: Game002PreparedLoadingSessionLike;
}>({
  root: loadingHost,
  maxConcurrentResources: 4,
  resources: createGame002LoadingResources(),
  onBeforeComplete: async ({ loadedResources }) => {
    const runtimeModule = readGame002RuntimeModule(loadedResources);
    const prepared = await runtimeModule.prepareGame002At99({
      search: window.location.search,
    });
    return Object.freeze({ runtimeModule, prepared });
  },
  onEnterGame: async ({ prepareResult }) => {
    gameHost.hidden = false;
    gameHost.replaceChildren();
    try {
      enteredGame = await prepareResult.runtimeModule.enterGame002({
        root: gameHost,
        prepared: prepareResult.prepared,
      });
      loading.destroy();
      loadingHost.remove();
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

void loading.start();

window.addEventListener("beforeunload", () => {
  enteredGame?.destroy();
});
