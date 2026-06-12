import {
  VIEWER_SCENARIOS,
  getViewerRuntimeConfig,
  getViewerScenario
} from "../src/scenarios.js";

describe("viewer scenarios", () => {
  it("contains every planned scenario id", () => {
    expect(VIEWER_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      "default-portrait",
      "small-mobile",
      "landscape-letterbox",
      "long-numbers",
      "loading-and-disabled",
      "win-state",
      "toggles-off",
      "error-state",
      "auto-active"
    ]);
  });

  it("looks up scenarios and rejects unknown ids", () => {
    expect(getViewerScenario("long-numbers").balance).toBeGreaterThan(1_000_000);
    expect(() => getViewerScenario("missing")).toThrow(/Unknown/);
  });

  it("defaults to explicit mock mode without reading live env", () => {
    expect(
      getViewerRuntimeConfig({
        VITE_UIFRAMEWORKSVIEWER_SERVER_URL: ""
      }),
    ).toMatchObject({
      mode: "mock",
      live: { serverUrl: "ws://mock.uiframeworksviewer.local" }
    });
  });

  it("requires live env when live mode is enabled", () => {
    expect(() =>
      getViewerRuntimeConfig({
        VITE_UIFRAMEWORKSVIEWER_MODE: "live"
      }),
    ).toThrow(/SERVER_URL/);

    expect(
      getViewerRuntimeConfig({
        VITE_UIFRAMEWORKSVIEWER_MODE: "live",
        VITE_UIFRAMEWORKSVIEWER_SERVER_URL: "wss://example.test",
        VITE_UIFRAMEWORKSVIEWER_TOKEN: "token",
        VITE_UIFRAMEWORKSVIEWER_GAMECODE: "game",
        VITE_UIFRAMEWORKSVIEWER_LANGUAGE: "en"
      }),
    ).toMatchObject({
      mode: "live",
      live: {
        serverUrl: "wss://example.test",
        token: "token",
        gamecode: "game",
        language: "en"
      }
    });
  });
});
