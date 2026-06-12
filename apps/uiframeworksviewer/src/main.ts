import {
  createSlotUiFramework,
  type SlotUiFramework
} from "@slotclientengine/uiframeworks";
import "@slotclientengine/uiframeworks/styles.css";
import "./styles.css";

import { createDemoSlotGameAdapter } from "./demo-game.js";
import { createViewerMockClient } from "./mock-client.js";
import {
  VIEWER_BET_OPTIONS,
  VIEWER_SCENARIOS,
  getViewerRuntimeConfig,
  getViewerScenario,
  type ViewerRuntimeConfig,
  type ViewerScenario
} from "./scenarios.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root.");
}

try {
  const runtime = getViewerRuntimeConfig(import.meta.env);
  void bootstrap(app, runtime);
} catch (error) {
  renderFatalError(app, error);
}

async function bootstrap(
  root: HTMLElement,
  runtime: ViewerRuntimeConfig,
): Promise<void> {
  let currentFramework: SlotUiFramework | null = null;
  let currentScenario = VIEWER_SCENARIOS[0];

  const shell = element("main", "viewer-shell");
  const toolbar = element("section", "viewer-toolbar");
  const title = textElement("h1", "viewer-title", "uiframeworksviewer");
  const modeBadge = textElement("span", "viewer-mode", runtime.mode);
  const scenarioLabel = textElement("label", "viewer-label", "Scenario");
  const scenarioSelect = document.createElement("select");
  scenarioSelect.className = "viewer-select";
  scenarioSelect.setAttribute("aria-label", "Scenario");
  for (const scenario of VIEWER_SCENARIOS) {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.label;
    scenarioSelect.append(option);
  }
  const reloadButton = document.createElement("button");
  reloadButton.type = "button";
  reloadButton.className = "viewer-command";
  reloadButton.textContent = "Reload";
  const status = textElement("div", "viewer-status", "Ready");
  const stage = element("section", "viewer-stage");
  stage.setAttribute("aria-label", "Slot UI stage");

  toolbar.append(title, modeBadge, scenarioLabel, scenarioSelect, reloadButton, status);
  shell.append(toolbar, stage);
  root.replaceChildren(shell);

  async function runScenario(scenario: ViewerScenario): Promise<void> {
    currentScenario = scenario;
    currentFramework?.destroy();
    stage.replaceChildren();
    status.textContent = "Loading";

    const adapter = createDemoSlotGameAdapter();
    const framework = createSlotUiFramework({
      root: stage,
      gameAdapter: adapter,
      designSize: scenario.designSize,
      live: runtime.live,
      betOptions: VIEWER_BET_OPTIONS,
      initialBetIndex: scenario.betIndex,
      initialBalance:
        runtime.mode === "mock" && scenario.mockConnectMode !== "pending"
          ? scenario.balance
          : undefined,
      initialWin: scenario.win,
      initialMuted: scenario.muted,
      initialFastMode: scenario.fastMode,
      initialAutoMode: scenario.autoMode,
      currency: "USD",
      clientFactory:
        runtime.mode === "mock"
          ? (live) => createViewerMockClient({ scenario, live })
          : undefined
    });
    currentFramework = framework;

    if (scenario.mockConnectMode === "pending") {
      void framework.connect().catch((error) => {
        status.textContent = formatError(error);
      });
      status.textContent = "Connecting";
      return;
    }

    try {
      await framework.connect();
      if (scenario.id === "win-state") {
        await framework.spin();
      }
      status.textContent = scenario.id;
    } catch (error) {
      status.textContent = formatError(error);
    }
  }

  scenarioSelect.addEventListener("change", () => {
    void runScenario(getViewerScenario(scenarioSelect.value));
  });
  reloadButton.addEventListener("click", () => {
    void runScenario(currentScenario);
  });

  await runScenario(currentScenario);
}

function renderFatalError(root: HTMLElement, error: unknown): void {
  const fatal = element("main", "viewer-fatal");
  fatal.textContent = formatError(error);
  root.replaceChildren(fatal);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const item = element(tag, className);
  item.textContent = text;
  return item;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  item.className = className;
  return item;
}
