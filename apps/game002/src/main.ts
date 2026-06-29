import { createSlotGameFramework } from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import { createGame002Adapter } from "./game-adapter.js";
import {
  GAME002_REFERENCE_SIZE,
  createGame002FramePolicy,
} from "./game-layout.js";
import { parseGame002FrameworkConfigFromQuery } from "./framework-config.js";
import { formatServerUsdAmount } from "./money.js";
import { getGame002SkinConfig } from "./skin-config.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root.");
}

try {
  const config = parseGame002FrameworkConfigFromQuery(window.location.search, {
    pageProtocol: window.location.protocol,
  });
  const skin = getGame002SkinConfig(config.skin);
  const framework = createSlotGameFramework({
    root,
    gameAdapter: createGame002Adapter({ skin }),
    live: config.live,
    betOptions: config.betOptions,
    initialBetIndex: config.initialBetIndex,
    designSize: GAME002_REFERENCE_SIZE,
    framePolicy: createGame002FramePolicy(skin.focusRegion),
    brandLabel: "game002",
    currency: "USD",
    locale: "en-US",
    formatMoney: formatServerUsdAmount,
    buildSpinRequest: () => config.spinRequest,
    onError: (error) => {
      console.error(error);
    },
  });

  void framework.connect().catch((error) => {
    console.error(error);
  });

  window.addEventListener("beforeunload", () => {
    framework.destroy();
  });
} catch (error) {
  root.textContent = formatError(error);
  throw error;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
