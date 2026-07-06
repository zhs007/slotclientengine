import { createDemoSlotGameAdapter } from "../src/demo-game.js";
import type {
  SlotGameMountContext,
  SlotUiSpinResult,
  SlotUiStateSnapshot,
} from "@slotclientengine/uiframeworks";

describe("demo game adapter", () => {
  it("mounts DOM reels and updates from initial state and spin result", () => {
    const root = document.createElement("div");
    const adapter = createDemoSlotGameAdapter();
    adapter.mount(root, createContext());
    expect(root.querySelector(".ui-viewer-game")).toBeTruthy();
    adapter.applyInitialState({
      userInfo: {},
      balance: 88,
      defaultScene: [
        [9, 8, 7],
        [6, 5, 4],
      ],
    });
    expect(root.textContent).toContain("Balance 88.00");
    adapter.applySpinResult(createSpinResult());
    expect(root.textContent).toContain("Win 12.00");
    adapter.setUiState(createState({ spinState: "spinning" }));
    expect(root.dataset.viewerSpinState).toBe("spinning");
    adapter.setUiState(createState({ spinState: "error", error: "bad" }));
    expect(root.textContent).toContain("bad");
    adapter.destroy();
    expect(root.childElementCount).toBe(0);
  });
});

function createContext(): SlotGameMountContext {
  const frame = document.createElement("div");
  const gameLayer = document.createElement("div");
  const overlay = document.createElement("div");
  return {
    designSize: { width: 941, height: 1672 },
    frame,
    gameLayer,
    overlay,
    getState: () => createState(),
    getViewport: () => ({
      pageSize: { width: 941, height: 1672 },
      frameDesignSize: { width: 941, height: 1672 },
      scale: 1,
      cssSize: { width: 941, height: 1672 },
      offsetX: 0,
      offsetY: 0,
    }),
    onViewportChange: () => () => undefined,
  };
}

function createState(
  overrides: Partial<SlotUiStateSnapshot> = {},
): SlotUiStateSnapshot {
  return {
    designSize: { width: 941, height: 1672 },
    connected: true,
    spinState: "idle",
    balance: 1,
    win: 0,
    betIndex: 0,
    betOption: { bet: 1, lines: 10 },
    muted: false,
    fastMode: false,
    autoMode: false,
    error: null,
    ...overrides,
  };
}

function createSpinResult(): SlotUiSpinResult {
  return {
    rawResult: {},
    gmi: {},
    totalwin: 12,
    results: 1,
    userInfo: {},
    logic: {
      getDefaultScene: () => [
        [1, 1, 1],
        [2, 2, 2],
      ],
    } as unknown as SlotUiSpinResult["logic"],
  };
}
