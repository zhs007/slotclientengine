import { createGameLoading } from "@slotclientengine/gameloading";
import { createLeoGameLoadingUi } from "@slotclientengine/gameloading-ui-leo";
import type { Game002ReadinessResult } from "./game002-bootstrap.js";
import {
  createGame002LoadingResources,
  readGame002RuntimeModule,
  type Game002EnteredGameLike,
  type Game002PreparedLoadingSessionLike,
  type Game002RuntimeModule,
} from "./loading-resources.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root.");

const loadingHost = document.createElement("div");
loadingHost.className = "game002-loading-host";
const gameHost = document.createElement("div");
gameHost.className = "game002-game-host";
gameHost.hidden = true;
root.replaceChildren(loadingHost, gameHost);

let enteredGame: Game002EnteredGameLike | null = null;

const loading = createGameLoading<
  {
    readonly runtimeModule: Game002RuntimeModule;
    readonly prepared: Game002PreparedLoadingSessionLike;
  },
  Game002ReadinessResult
>({
  root: loadingHost,
  ui: createLeoGameLoadingUi(),
  maxConcurrentResources: 4,
  resources: createGame002LoadingResources(),
  readiness: {
    start: async ({ signal }) => {
      const bootstrap = await import("./game002-bootstrap.js");
      return bootstrap.startGame002Readiness({
        search: window.location.search,
        signal,
      });
    },
    dispose: (result) => result.destroy(),
  },
  onBeforeComplete: async ({ loadedResources, readinessResult, signal }) => {
    const runtimeModule = readGame002RuntimeModule(loadedResources);
    const prepared = await runtimeModule.finalizeGame002At99({
      readinessResult,
      signal,
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
    } catch (error) {
      gameHost.hidden = true;
      gameHost.replaceChildren();
      throw error;
    }
  },
  onError: (error) => console.error(error),
});

void loading.start().catch(() => undefined);

window.addEventListener("beforeunload", () => {
  loading.destroy();
  void enteredGame?.destroy().catch((error: unknown) => console.error(error));
});
