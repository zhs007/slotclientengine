import { createSlotGameFramework } from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import { createGame003Adapter } from "./game-adapter.js";
import {
  GAME003_REFERENCE_SIZE,
  createGame003FramePolicy,
} from "./game-layout.js";
import { parseGame003FrameworkConfigFromQuery } from "./framework-config.js";
import { formatServerUsdAmount } from "./money.js";
import { getGame003SkinConfig } from "./skin-config.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root.");
}

try {
  const config = parseGame003FrameworkConfigFromQuery(window.location.search, {
    pageProtocol: window.location.protocol,
  });
  const skin = getGame003SkinConfig(config.skin);
  const framework = createSlotGameFramework({
    root,
    gameAdapter: createGame003Adapter({ skin }),
    live: config.live,
    betOptions: config.betOptions,
    initialBetIndex: config.initialBetIndex,
    designSize: GAME003_REFERENCE_SIZE,
    framePolicy: createGame003FramePolicy(),
    brandLabel: "game003",
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
