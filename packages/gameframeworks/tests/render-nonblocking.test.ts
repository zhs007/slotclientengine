import { createSlotGameFramework } from "../src/index.js";
import {
  BET_OPTIONS,
  MockAdapter,
  MockClient,
  createSpinResult,
} from "./test-helpers.js";

describe("render nonblocking behavior", () => {
  it("renders shell synchronously and updates spinning before pending network resolves", async () => {
    const root = document.createElement("div");
    const client = new MockClient();
    let resolveSpin: (value: unknown) => void = () => undefined;
    client.spinPromise = new Promise((resolve) => {
      resolveSpin = resolve;
    });
    const framework = createSlotGameFramework({
      root,
      gameAdapter: new MockAdapter(),
      live: { serverUrl: "ws://localhost" },
      betOptions: BET_OPTIONS,
      clientFactory: () => client,
    });

    expect(root.querySelector(".slot-ui-frame")).toBeTruthy();
    await framework.connect();
    const spinPromise = framework.spin();
    expect(framework.getState().spinState).toBe("spinning");
    expect(
      root
        .querySelector(".slot-ui-frame")
        ?.getAttribute("data-slot-spin-state"),
    ).toBe("spinning");

    resolveSpin(createSpinResult({ totalwin: 0 }));
    await spinPromise;
  });
});
