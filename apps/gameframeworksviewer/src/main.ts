import {
  createSlotGameFramework,
  type SlotGameFramework,
} from "@slotclientengine/gameframeworks";
import "@slotclientengine/gameframeworks/styles.css";
import "./styles.css";

import { createLogicListGameAdapter } from "./logic-list-game.js";
import {
  createViewerMockClient,
  type ViewerMockClient,
} from "./mock-client.js";
import {
  VIEWER_BET_OPTIONS,
  VIEWER_SCENARIOS,
  getViewerRuntimeConfig,
  getViewerScenario,
  type ViewerRuntimeConfig,
  type ViewerScenario,
} from "./scenarios.js";
import { formatServerUsdAmount } from "./money.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root.");
}

try {
  const runtime = getViewerRuntimeConfig(import.meta.env);
  void bootstrapGameFrameworksViewer(app, runtime);
} catch (error) {
  renderFatalError(app, error);
}

export async function bootstrapGameFrameworksViewer(
  root: HTMLElement,
  runtime: ViewerRuntimeConfig,
): Promise<void> {
  let currentFramework: SlotGameFramework | null = null;
  let currentMockClient: ViewerMockClient | null = null;
  let currentScenario = VIEWER_SCENARIOS[0];
  let tick = 0;

  const shell = element("main", "gfv-shell");
  const toolbar = element("section", "gfv-toolbar");
  const title = textElement("h1", "gfv-title", "gameframeworksviewer");
  const modeBadge = textElement("span", "gfv-mode", runtime.mode);
  const scenarioSelect = document.createElement("select");
  scenarioSelect.className = "gfv-select";
  scenarioSelect.setAttribute("aria-label", "Scenario");
  for (const scenario of VIEWER_SCENARIOS) {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.label;
    scenarioSelect.append(option);
  }
  const reloadButton = document.createElement("button");
  reloadButton.type = "button";
  reloadButton.className = "gfv-command";
  reloadButton.textContent = "Reload";
  const status = textElement("div", "gfv-status", "Ready");
  const tickLabel = textElement("div", "gfv-tick", "tick 0");
  const stage = element("section", "gfv-stage");
  stage.setAttribute("aria-label", "Slot game framework stage");

  toolbar.append(
    title,
    modeBadge,
    scenarioSelect,
    status,
    reloadButton,
    tickLabel,
  );
  shell.append(toolbar, stage);
  root.replaceChildren(shell);

  const tickTimer = window.setInterval(() => {
    tick += 1;
    tickLabel.textContent = `tick ${tick}`;
  }, 250);
  root.dataset.tickTimer = String(tickTimer);

  async function runScenario(scenario: ViewerScenario): Promise<void> {
    currentScenario = scenario;
    currentFramework?.destroy();
    currentMockClient = null;
    stage.replaceChildren();
    status.textContent = "Loading";

    const adapter = createLogicListGameAdapter({
      componentNames: scenario.componentNames,
    });
    const framework = createSlotGameFramework({
      root: stage,
      gameAdapter: adapter,
      live: runtime.live,
      betOptions:
        runtime.mode === "live"
          ? [
              {
                bet: runtime.spin.bet,
                lines: runtime.spin.lines,
                times: runtime.spin.times,
                label: `${runtime.spin.bet} x ${runtime.spin.lines}`,
              },
            ]
          : VIEWER_BET_OPTIONS,
      initialBetIndex: runtime.mode === "live" ? 0 : scenario.betIndex,
      initialBalance: runtime.mode === "mock" ? scenario.balance : undefined,
      brandLabel: "SCE Facade",
      currency: "USD",
      formatMoney: runtime.mode === "live" ? formatServerUsdAmount : undefined,
      buildSpinRequest:
        runtime.mode === "live"
          ? () => ({
              bet: runtime.spin.bet,
              lines: runtime.spin.lines,
              times: runtime.spin.times,
              autonums: runtime.spin.autonums,
            })
          : undefined,
      clientFactory:
        runtime.mode === "mock"
          ? (live) => {
              currentMockClient = createViewerMockClient({ scenario, live });
              return currentMockClient;
            }
          : undefined,
      onStateChange: (state) => {
        status.textContent = formatRuntimeStatus(
          runtime,
          currentMockClient,
          scenario,
          state.spinState,
        );
      },
      onError: (error) => {
        status.textContent = formatError(error);
      },
    });
    currentFramework = framework;

    try {
      await framework.connect();
      status.textContent = formatRuntimeStatus(
        runtime,
        currentMockClient,
        scenario,
        "connected",
      );
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
  root.addEventListener("gfv:destroy", () => {
    window.clearInterval(tickTimer);
    currentFramework?.destroy();
  });

  await runScenario(currentScenario);
}

function renderFatalError(root: HTMLElement, error: unknown): void {
  const fatal = element("main", "gfv-fatal");
  fatal.textContent = formatError(error);
  root.replaceChildren(fatal);
}

function formatRuntimeStatus(
  runtime: ViewerRuntimeConfig,
  currentMockClient: ViewerMockClient | null,
  scenario: ViewerScenario,
  state: string,
): string {
  if (runtime.mode === "live") {
    return `${scenario.id} / ${state} / live`;
  }
  const collectCount = currentMockClient?.collectCalls.length ?? 0;
  return `${scenario.id} / ${state} / collect ${collectCount}`;
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
