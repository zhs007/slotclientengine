import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import { createLogicListGameAdapter } from "../src/logic-list-game.js";
import { createViewerMockSpinResult } from "../src/mock-client.js";
import type { SlotGameStateSnapshot } from "@slotclientengine/gameframeworks";

describe("logic list game", () => {
  it("mounts and appends formatted spin records", () => {
    const frame = document.createElement("div");
    const gameLayer = document.createElement("div");
    const overlay = document.createElement("div");
    const state: SlotGameStateSnapshot = {
      connected: true,
      spinState: "presenting",
      balance: 100,
      win: 0,
      betIndex: 0,
      betOption: { bet: 1, lines: 10 },
      muted: false,
      fastMode: false,
      autoMode: false,
      error: null,
    };
    const adapter = createLogicListGameAdapter({
      componentNames: ["lineWin"],
    });
    adapter.mount({
      frame,
      gameLayer,
      overlay,
      getState: () => state,
    });
    adapter.applyInitialState({ userInfo: {}, balance: 100 });
    adapter.playSpin(
      createSlotGameLogicResult(
        createViewerMockSpinResult({
          totalwin: 5,
          results: 1,
          bet: 1,
          lines: 10,
        }),
        {
          bet: { bet: 1, lines: 10 },
          userInfo: {},
        },
      ).logic,
    );
    adapter.setFrameworkState(state);

    expect(gameLayer.querySelectorAll(".gfv-logic-item")).toHaveLength(1);
    expect(gameLayer.textContent).toContain("totalwin=5");
    expect(gameLayer.dataset.spinState).toBe("presenting");
    adapter.destroy();
    expect(gameLayer.children).toHaveLength(0);
  });
});
