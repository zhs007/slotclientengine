import { createViewerMockClient } from "../src/mock-client.js";
import { getViewerRuntimeConfig, getViewerScenario } from "../src/scenarios.js";

describe("mock client", () => {
  it("returns valid GMI, tracks collect, and supports delayed spin", async () => {
    vi.useFakeTimers();
    const live = getViewerRuntimeConfig({}).live;
    const delayed = createViewerMockClient({
      scenario: getViewerScenario("delayed-win"),
      live,
    });
    await delayed.connect("token");
    await delayed.enterGame("game");
    const spinPromise = delayed.spin({ bet: 1, lines: 10 });
    let settled = false;
    void spinPromise.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const spin = (await spinPromise) as Record<string, unknown>;
    expect(spin.totalwin).toBe(38);
    expect(spin.results).toBe(1);
    await delayed.collect();
    expect(delayed.collectCalls).toEqual([-1]);
    vi.useRealTimers();
  });
});
