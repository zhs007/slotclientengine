import { createSlotGameFramework } from "@slotclientengine/gameframeworks";
import { createLogicListGameAdapter } from "../src/logic-list-game.js";
import { createViewerMockClient } from "../src/mock-client.js";
import {
  VIEWER_BET_OPTIONS,
  getViewerRuntimeConfig,
  getViewerScenario,
} from "../src/scenarios.js";

describe("viewer flow", () => {
  it("clicks spin, appends a list item, and collects after play", async () => {
    const root = document.createElement("div");
    const live = getViewerRuntimeConfig({}).live;
    const scenario = getViewerScenario("default-win");
    const client = createViewerMockClient({ scenario, live });
    const adapter = createLogicListGameAdapter({
      componentNames: scenario.componentNames,
    });
    const framework = createSlotGameFramework({
      root,
      gameAdapter: adapter,
      live,
      betOptions: VIEWER_BET_OPTIONS,
      initialBalance: scenario.balance,
      clientFactory: () => client,
    });

    await framework.connect();
    const spinButton = root.querySelector(
      ".slot-ui-spin-button",
    ) as HTMLButtonElement;
    spinButton.click();
    await waitForIdle(framework.getState.bind(framework));

    expect(root.querySelectorAll(".gfv-logic-item")).toHaveLength(1);
    expect(root.textContent).toContain("totalwin=44");
    expect(client.collectCalls).toEqual([-1]);
  });

  it("does not collect no-win single-result spins", async () => {
    const root = document.createElement("div");
    const live = getViewerRuntimeConfig({}).live;
    const scenario = getViewerScenario("no-win");
    const client = createViewerMockClient({ scenario, live });
    const framework = createSlotGameFramework({
      root,
      gameAdapter: createLogicListGameAdapter({
        componentNames: scenario.componentNames,
      }),
      live,
      betOptions: VIEWER_BET_OPTIONS,
      initialBalance: scenario.balance,
      clientFactory: () => client,
    });
    await framework.connect();
    await framework.spin();
    expect(client.collectCalls).toEqual([]);
  });
});

async function waitForIdle(
  getState: () => { readonly spinState: string },
): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
    if (getState().spinState === "idle") {
      return;
    }
  }
  throw new Error(`framework did not return idle: ${getState().spinState}`);
}
