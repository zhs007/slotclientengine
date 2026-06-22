import {
  VIEWER_PREVIOUS_LIVE_DEFAULTS,
  VIEWER_BET_OPTIONS,
  getViewerRuntimeConfig,
  getViewerScenario,
} from "../src/scenarios.js";

describe("scenarios", () => {
  it("provides default mock runtime and scenarios", () => {
    expect(VIEWER_BET_OPTIONS).toHaveLength(3);
    expect(getViewerScenario("default-win").totalwin).toBeGreaterThan(0);
    expect(getViewerRuntimeConfig({})).toEqual({
      mode: "mock",
      live: {
        serverUrl: "ws://mock.gameframeworksviewer.local",
        token: "mock-token",
        gamecode: "mock-game",
      },
      spin: {
        bet: 2,
        lines: 20,
        times: 2,
        autonums: -1,
      },
    });
  });

  it("uses previous live defaults only when live mode is explicit", () => {
    expect(
      getViewerRuntimeConfig({ VITE_GAMEFRAMEWORKSVIEWER_MODE: "live" }),
    ).toMatchObject({
      mode: "live",
      live: {
        serverUrl: VIEWER_PREVIOUS_LIVE_DEFAULTS.serverUrl,
        token: VIEWER_PREVIOUS_LIVE_DEFAULTS.token,
        gamecode: VIEWER_PREVIOUS_LIVE_DEFAULTS.gamecode,
        businessid: VIEWER_PREVIOUS_LIVE_DEFAULTS.businessid,
        clienttype: VIEWER_PREVIOUS_LIVE_DEFAULTS.clienttype,
        jurisdiction: VIEWER_PREVIOUS_LIVE_DEFAULTS.jurisdiction,
        language: VIEWER_PREVIOUS_LIVE_DEFAULTS.language,
        requestTimeoutMs: VIEWER_PREVIOUS_LIVE_DEFAULTS.requestTimeoutMs,
      },
      spin: {
        bet: VIEWER_PREVIOUS_LIVE_DEFAULTS.bet,
        lines: VIEWER_PREVIOUS_LIVE_DEFAULTS.lines,
        times: VIEWER_PREVIOUS_LIVE_DEFAULTS.times,
        autonums: VIEWER_PREVIOUS_LIVE_DEFAULTS.autonums,
      },
    });
  });

  it("parses explicit live env overrides", () => {
    const config = getViewerRuntimeConfig({
      VITE_GAMEFRAMEWORKSVIEWER_MODE: "live",
      VITE_GAMEFRAMEWORKSVIEWER_SERVER_URL: "wss://game",
      VITE_GAMEFRAMEWORKSVIEWER_TOKEN: "token",
      VITE_GAMEFRAMEWORKSVIEWER_GAMECODE: "game",
      VITE_GAMEFRAMEWORKSVIEWER_BUSINESSID: "biz",
      VITE_GAMEFRAMEWORKSVIEWER_CLIENTTYPE: "mobile",
      VITE_GAMEFRAMEWORKSVIEWER_JURISDICTION: "UK",
      VITE_GAMEFRAMEWORKSVIEWER_LANGUAGE: "fr",
      VITE_GAMEFRAMEWORKSVIEWER_REQUEST_TIMEOUT_MS: "2500",
      VITE_GAMEFRAMEWORKSVIEWER_BET: "7",
      VITE_GAMEFRAMEWORKSVIEWER_LINES: "25",
      VITE_GAMEFRAMEWORKSVIEWER_TIMES: "3",
      VITE_GAMEFRAMEWORKSVIEWER_AUTONUMS: "5",
    });

    expect(config).toMatchObject({
      mode: "live",
      live: {
        serverUrl: "wss://game",
        token: "token",
        gamecode: "game",
        businessid: "biz",
        clienttype: "mobile",
        jurisdiction: "UK",
        language: "fr",
        requestTimeoutMs: 2500,
      },
      spin: { bet: 7, lines: 25, times: 3, autonums: 5 },
    });
  });

  it("rejects malformed live overrides", () => {
    expect(() =>
      getViewerRuntimeConfig({
        VITE_GAMEFRAMEWORKSVIEWER_MODE: "live",
        VITE_GAMEFRAMEWORKSVIEWER_TOKEN: "",
      }),
    ).toThrow(/TOKEN/);
    expect(() =>
      getViewerRuntimeConfig({
        VITE_GAMEFRAMEWORKSVIEWER_MODE: "live",
        VITE_GAMEFRAMEWORKSVIEWER_LINES: "1.5",
      }),
    ).toThrow(/LINES/);
    expect(() => getViewerScenario("missing")).toThrow(/Unknown/);
  });
});
