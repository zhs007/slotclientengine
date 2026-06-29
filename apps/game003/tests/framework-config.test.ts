import { describe, expect, it } from "vitest";
import {
  GAME003_GAMECODE,
  parseGame003FrameworkConfigFromQuery,
  parseGame003QueryConfig,
} from "../src/env.js";

describe("game003 runtime query config", () => {
  it("parses a complete query string and maps it to framework contracts", () => {
    expect(parseGame003QueryConfig(validQuery())).toEqual({
      skin: "1",
      serverUrl: "wss://example.test/game",
      token: "TOKEN",
      gamecode: GAME003_GAMECODE,
      businessid: "guest",
      clienttype: "web",
      jurisdiction: "MT",
      language: "en",
      bet: 5,
      lines: 10,
      times: 1,
      autonums: -1,
      requestTimeoutMs: 30000,
    });

    expect(parseGame003FrameworkConfigFromQuery(validQuery())).toEqual({
      skin: "1",
      live: {
        serverUrl: "wss://example.test/game",
        token: "TOKEN",
        gamecode: GAME003_GAMECODE,
        businessid: "guest",
        clienttype: "web",
        jurisdiction: "MT",
        language: "en",
        requestTimeoutMs: 30000,
      },
      betOptions: [{ bet: 5, lines: 10, times: 1 }],
      initialBetIndex: 0,
      spinRequest: { bet: 5, lines: 10, times: 1, autonums: -1 },
    });
  });

  it("requires every runtime query parameter exactly once", () => {
    for (const name of REQUIRED_PARAMS) {
      const params = validParams();
      params.delete(name);

      expect(
        () => parseGame003QueryConfig(params),
        `${name} should be required`,
      ).toThrow(new RegExp(`${name} query parameter is required`));
    }

    expect(() =>
      parseGame003QueryConfig(`${validQuery()}&token=SECOND_TOKEN`),
    ).toThrow(/token query parameter must not be provided more than once/);
    expect(() => parseGame003QueryConfig(`${validQuery()}&skin=1`)).toThrow(
      /skin query parameter must not be provided more than once/,
    );
  });

  it("accepts only skin 1 and the fixed game003 gamecode", () => {
    expect(parseGame003QueryConfig(validQuery({ skin: "1" })).skin).toBe("1");
    for (const skin of ["01", "2", "game003"]) {
      expect(() => parseGame003QueryConfig(validQuery({ skin }))).toThrow(
        /skin query parameter must be "1"/,
      );
    }

    expect(() =>
      parseGame003QueryConfig(validQuery({ gamecode: "OTHER" })),
    ).toThrow(
      new RegExp(`gamecode query parameter must be ${GAME003_GAMECODE}`),
    );
  });

  it("rejects invalid URLs, unsafe ws on https, whitespace and invalid numbers", () => {
    expect(
      parseGame003QueryConfig(validQuery({ serverUrl: "ws://127.0.0.1:9/" }), {
        pageProtocol: "http:",
      }).serverUrl,
    ).toBe("ws://127.0.0.1:9/");
    expect(() =>
      parseGame003QueryConfig(validQuery({ serverUrl: "https://example/" })),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      parseGame003QueryConfig(validQuery({ serverUrl: "ws://127.0.0.1:9/" }), {
        pageProtocol: "https:",
      }),
    ).toThrow(/must use wss:\/\//);
    expect(() => parseGame003QueryConfig(validQuery({ bet: "0" }))).toThrow(
      /bet query parameter/,
    );
    expect(() =>
      parseGame003QueryConfig(validQuery({ lines: "30" })),
    ).not.toThrow();
    expect(() =>
      parseGame003QueryConfig(validQuery({ autonums: "1.5" })),
    ).toThrow(/autonums query parameter must be an integer/);
  });

  it("round trips encoded token characters but rejects naked plus whitespace", () => {
    expect(
      parseGame003QueryConfig(
        validQuery({ token: "TOKEN+WITH&RESERVED=CHARS" }),
      ).token,
    ).toBe("TOKEN+WITH&RESERVED=CHARS");

    const query = validQuery().replace("token=TOKEN", "token=SECRET+TOKEN");
    expect(() => parseGame003QueryConfig(query)).toThrow(
      /token query parameter must be URL encoded/,
    );
    try {
      parseGame003QueryConfig(query);
    } catch (error) {
      expect(
        error instanceof Error ? error.message : String(error),
      ).not.toMatch(/SECRET/);
    }
  });
});

const REQUIRED_PARAMS = Object.freeze([
  "skin",
  "serverUrl",
  "gamecode",
  "token",
  "businessid",
  "clienttype",
  "jurisdiction",
  "language",
  "bet",
  "lines",
  "times",
  "autonums",
  "requestTimeoutMs",
] as const);

function validQuery(overrides: Record<string, string> = {}): string {
  return `?${validParams(overrides).toString()}`;
}

function validParams(overrides: Record<string, string> = {}): URLSearchParams {
  const params = new URLSearchParams({
    skin: "1",
    serverUrl: "wss://example.test/game",
    gamecode: GAME003_GAMECODE,
    token: "TOKEN",
    businessid: "guest",
    clienttype: "web",
    jurisdiction: "MT",
    language: "en",
    bet: "5",
    lines: "10",
    times: "1",
    autonums: "-1",
    requestTimeoutMs: "30000",
  });
  for (const [key, value] of Object.entries(overrides)) {
    params.set(key, value);
  }
  return params;
}
