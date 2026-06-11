import { describe, expect, it } from "vitest";
import { DEFAULT_GAME001_ENV_CONFIG, parseGame001Env } from "../src/env.js";

describe("game001 env", () => {
  it("uses the previous live defaults when env is absent", () => {
    expect(parseGame001Env({})).toEqual(DEFAULT_GAME001_ENV_CONFIG);
  });

  it("parses explicit live config over defaults", () => {
    expect(parseGame001Env(validEnv())).toMatchObject({
      serverUrl: "wss://example.test/game",
      token: "token-1",
      gamecode: "game001",
      businessid: "guest",
      clienttype: "web",
      jurisdiction: "MT",
      language: "en",
      bet: 10,
      lines: 25,
      times: 1,
      requestTimeoutMs: 30000,
    });
  });

  it("accepts ws and wss only", () => {
    expect(
      parseGame001Env({
        ...validEnv(),
        VITE_GAME001_SERVER_URL: "ws://localhost:8080",
      }).serverUrl,
    ).toBe("ws://localhost:8080");
    expect(() =>
      parseGame001Env({
        ...validEnv(),
        VITE_GAME001_SERVER_URL: "http://localhost/replay.json",
      }),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      parseGame001Env({
        ...validEnv(),
        VITE_GAME001_SERVER_URL: "https://localhost/replay.json",
      }),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      parseGame001Env({ ...validEnv(), VITE_GAME001_SERVER_URL: "not a url" }),
    ).toThrow(/valid ws:\/\/ or wss:\/\//);
  });

  it("rejects explicit empty fields and invalid numbers", () => {
    expect(() =>
      parseGame001Env({ ...validEnv(), VITE_GAME001_SERVER_URL: "" }),
    ).toThrow(/SERVER_URL/);
    expect(() =>
      parseGame001Env({ ...validEnv(), VITE_GAME001_TOKEN: "" }),
    ).toThrow(/TOKEN/);
    expect(() =>
      parseGame001Env({ ...validEnv(), VITE_GAME001_GAMECODE: "" }),
    ).toThrow(/GAMECODE/);
    expect(() =>
      parseGame001Env({ ...validEnv(), VITE_GAME001_BET: "0" }),
    ).toThrow(/BET/);
    expect(() =>
      parseGame001Env({ ...validEnv(), VITE_GAME001_LINES: "NaN" }),
    ).toThrow(/LINES/);
    expect(() =>
      parseGame001Env({ ...validEnv(), VITE_GAME001_TIMES: "-1" }),
    ).toThrow(/TIMES/);
  });

  it("parses explicit optional fields", () => {
    expect(
      parseGame001Env({
        ...validEnv(),
        VITE_GAME001_BUSINESSID: "biz",
        VITE_GAME001_CLIENTTYPE: "mobile",
        VITE_GAME001_JURISDICTION: "UK",
        VITE_GAME001_LANGUAGE: "fr",
        VITE_GAME001_TIMES: "3",
        VITE_GAME001_REQUEST_TIMEOUT_MS: "2500",
      }),
    ).toMatchObject({
      businessid: "biz",
      clienttype: "mobile",
      jurisdiction: "UK",
      language: "fr",
      times: 3,
      requestTimeoutMs: 2500,
    });
  });
});

function validEnv(): Record<string, unknown> {
  return {
    VITE_GAME001_SERVER_URL: "wss://example.test/game",
    VITE_GAME001_TOKEN: "token-1",
    VITE_GAME001_GAMECODE: "game001",
    VITE_GAME001_BET: "10",
    VITE_GAME001_LINES: "25",
  };
}
