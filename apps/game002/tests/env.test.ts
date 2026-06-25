import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAME002_ENV_CONFIG,
  parseGame002Env,
  parseGame002FrameworkConfig,
} from "../src/env.js";

describe("game002 env", () => {
  it("uses the task 49 live defaults when env is absent", () => {
    expect(parseGame002Env({})).toEqual(DEFAULT_GAME002_ENV_CONFIG);
    expect(parseGame002FrameworkConfig({})).toEqual({
      live: {
        serverUrl: DEFAULT_GAME002_ENV_CONFIG.serverUrl,
        token: DEFAULT_GAME002_ENV_CONFIG.token,
        gamecode: DEFAULT_GAME002_ENV_CONFIG.gamecode,
        businessid: DEFAULT_GAME002_ENV_CONFIG.businessid,
        clienttype: DEFAULT_GAME002_ENV_CONFIG.clienttype,
        jurisdiction: DEFAULT_GAME002_ENV_CONFIG.jurisdiction,
        language: DEFAULT_GAME002_ENV_CONFIG.language,
        requestTimeoutMs: DEFAULT_GAME002_ENV_CONFIG.requestTimeoutMs,
      },
      betOptions: [
        {
          bet: DEFAULT_GAME002_ENV_CONFIG.bet,
          lines: DEFAULT_GAME002_ENV_CONFIG.lines,
          times: DEFAULT_GAME002_ENV_CONFIG.times,
        },
      ],
      initialBetIndex: 0,
      spinRequest: {
        bet: DEFAULT_GAME002_ENV_CONFIG.bet,
        lines: DEFAULT_GAME002_ENV_CONFIG.lines,
        times: DEFAULT_GAME002_ENV_CONFIG.times,
        autonums: DEFAULT_GAME002_ENV_CONFIG.autonums,
      },
    });
  });

  it("parses explicit live config over defaults", () => {
    expect(parseGame002Env(validEnv())).toMatchObject({
      serverUrl: "wss://example.test/game",
      token: "token-2",
      gamecode: "game002",
      businessid: "guest",
      clienttype: "web",
      jurisdiction: "MT",
      language: "en",
      bet: 5,
      lines: 30,
      times: 1,
      autonums: -1,
      requestTimeoutMs: 30000,
    });
    expect(parseGame002FrameworkConfig(validEnv())).toMatchObject({
      live: {
        serverUrl: "wss://example.test/game",
        token: "token-2",
        gamecode: "game002",
      },
      betOptions: [{ bet: 5, lines: 30, times: 1 }],
      initialBetIndex: 0,
      spinRequest: { bet: 5, lines: 30, times: 1, autonums: -1 },
    });
  });

  it("accepts ws and wss only", () => {
    expect(
      parseGame002Env({
        ...validEnv(),
        VITE_GAME002_SERVER_URL: "ws://localhost:8080",
      }).serverUrl,
    ).toBe("ws://localhost:8080");
    expect(() =>
      parseGame002Env({
        ...validEnv(),
        VITE_GAME002_SERVER_URL: "http://localhost/replay.json",
      }),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      parseGame002Env({
        ...validEnv(),
        VITE_GAME002_SERVER_URL: "https://localhost/replay.json",
      }),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      parseGame002Env({ ...validEnv(), VITE_GAME002_SERVER_URL: "not a url" }),
    ).toThrow(/valid ws:\/\/ or wss:\/\//);
  });

  it("rejects explicit empty fields and invalid numbers", () => {
    expect(() =>
      parseGame002Env({ ...validEnv(), VITE_GAME002_SERVER_URL: "" }),
    ).toThrow(/SERVER_URL/);
    expect(() =>
      parseGame002Env({ ...validEnv(), VITE_GAME002_TOKEN: "" }),
    ).toThrow(/TOKEN/);
    expect(() =>
      parseGame002Env({ ...validEnv(), VITE_GAME002_GAMECODE: "" }),
    ).toThrow(/GAMECODE/);
    expect(() =>
      parseGame002Env({ ...validEnv(), VITE_GAME002_BET: "0" }),
    ).toThrow(/BET/);
    expect(() =>
      parseGame002Env({ ...validEnv(), VITE_GAME002_LINES: "NaN" }),
    ).toThrow(/LINES/);
    expect(() =>
      parseGame002Env({ ...validEnv(), VITE_GAME002_TIMES: "-1" }),
    ).toThrow(/TIMES/);
    expect(() =>
      parseGame002Env({
        ...validEnv(),
        VITE_GAME002_REQUEST_TIMEOUT_MS: "0",
      }),
    ).toThrow(/REQUEST_TIMEOUT/);
    expect(() =>
      parseGame002Env({ ...validEnv(), VITE_GAME002_AUTONUMS: "1.2" }),
    ).toThrow(/AUTONUMS/);
  });

  it("parses explicit optional fields", () => {
    expect(
      parseGame002Env({
        ...validEnv(),
        VITE_GAME002_BUSINESSID: "biz",
        VITE_GAME002_CLIENTTYPE: "mobile",
        VITE_GAME002_JURISDICTION: "UK",
        VITE_GAME002_LANGUAGE: "fr",
        VITE_GAME002_TIMES: "3",
        VITE_GAME002_AUTONUMS: "5",
        VITE_GAME002_REQUEST_TIMEOUT_MS: "2500",
      }),
    ).toMatchObject({
      businessid: "biz",
      clienttype: "mobile",
      jurisdiction: "UK",
      language: "fr",
      times: 3,
      autonums: 5,
      requestTimeoutMs: 2500,
    });
  });
});

function validEnv(): Record<string, unknown> {
  return {
    VITE_GAME002_SERVER_URL: "wss://example.test/game",
    VITE_GAME002_TOKEN: "token-2",
    VITE_GAME002_GAMECODE: "game002",
    VITE_GAME002_BET: "5",
    VITE_GAME002_LINES: "30",
  };
}
