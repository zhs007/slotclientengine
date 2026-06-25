import { createSlotGameFramework } from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import { createGame002Adapter } from "./game-adapter.js";
import { GAME002_STAGE_SIZE } from "./game-layout.js";
import { parseGame002FrameworkConfig } from "./framework-config.js";
import { formatServerUsdAmount } from "./money.js";
import "./styles.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Missing #app root.");
}

try {
  const config = parseGame002FrameworkConfig(import.meta.env);
  const framework = createSlotGameFramework({
    root,
    gameAdapter: createGame002Adapter(),
    live: config.live,
    betOptions: config.betOptions,
    initialBetIndex: config.initialBetIndex,
    designSize: GAME002_STAGE_SIZE,
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
