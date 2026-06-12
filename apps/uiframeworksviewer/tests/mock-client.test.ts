import { createSlotUiFramework } from "@slotclientengine/uiframeworks";
import {
  createViewerMockClient,
  createViewerMockSpinResult
} from "../src/mock-client.js";
import {
  VIEWER_BET_OPTIONS,
  getViewerRuntimeConfig,
  getViewerScenario
} from "../src/scenarios.js";

describe("viewer mock client", () => {
  it("returns a legal spin result through the real framework parser", async () => {
    const root = document.createElement("div");
    const runtime = getViewerRuntimeConfig({});
    const scenario = getViewerScenario("default-portrait");
    const received: number[] = [];
    const framework = createSlotUiFramework({
      root,
      gameAdapter: {
        mount: () => undefined,
        applySpinResult: (result) => {
          received.push(result.logic.getStepCount());
        }
      },
      live: runtime.live,
      betOptions: VIEWER_BET_OPTIONS,
      initialBalance: scenario.balance,
      clientFactory: (live) => createViewerMockClient({ scenario, live })
    });

    await framework.connect();
    const result = await framework.spin();
    expect(result.gmi).toBeTruthy();
    expect(received).toEqual([1]);
    framework.destroy();
  });

  it("simulates explicit connect errors", async () => {
    const root = document.createElement("div");
    const runtime = getViewerRuntimeConfig({});
    const scenario = getViewerScenario("error-state");
    const framework = createSlotUiFramework({
      root,
      gameAdapter: {
        mount: () => undefined,
        applySpinResult: () => undefined
      },
      live: runtime.live,
      betOptions: VIEWER_BET_OPTIONS,
      initialBalance: scenario.balance,
      clientFactory: (live) => createViewerMockClient({ scenario, live })
    });

    await expect(framework.connect()).rejects.toThrow(/mock connect error/);
    expect(framework.getState().error).toContain("mock connect error");
    framework.destroy();
  });

  it("builds spin result metadata without hiding bad caller values", () => {
    expect(
      createViewerMockSpinResult({ totalwin: 12, bet: 5, lines: 20 }),
    ).toMatchObject({ totalwin: 12, results: 1, bet: 5, lines: 20 });
  });
});
