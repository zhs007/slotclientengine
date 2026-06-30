import { describe, expect, it } from "vitest";
import {
  GAME003_GAMECODE,
  GAME003_LIVE_SERVER_URL,
  parseGame003FrameworkConfigFromQuery,
  parseGame003QueryConfig,
} from "../src/env.js";

describe("game003 runtime query config", () => {
  it("parses runtime query without gamecode and maps fixed static live config", () => {
    const query = validQuery({}, { includeGamecode: false });

    expect(parseGame003QueryConfig(query)).toEqual({
      skin: "1",
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

    expect(parseGame003FrameworkConfigFromQuery(query)).toEqual({
      skin: "1",
      live: {
        serverUrl: GAME003_LIVE_SERVER_URL,
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

  it("accepts only skin 1 and rejects mismatched legacy gamecode", () => {
    expect(parseGame003QueryConfig(validQuery({ skin: "1" })).skin).toBe("1");
    for (const skin of ["01", "2", "game003"]) {
      expect(() => parseGame003QueryConfig(validQuery({ skin }))).toThrow(
        /skin query parameter must be one of: 1/,
      );
    }

    expect(
      parseGame003QueryConfig(validQuery({ gamecode: GAME003_GAMECODE }))
        .gamecode,
    ).toBe(GAME003_GAMECODE);
    expect(() =>
      parseGame003QueryConfig(validQuery({ gamecode: "OTHER" })),
    ).toThrow(
      new RegExp(`gamecode query parameter must be ${GAME003_GAMECODE}`),
    );
  });

  it("uses a fixed live server and rejects the old serverUrl query parameter", () => {
    expect(
      parseGame003FrameworkConfigFromQuery(validQuery()).live.serverUrl,
    ).toBe(GAME003_LIVE_SERVER_URL);
    expect(() =>
      parseGame003QueryConfig(
        `${validQuery()}&serverUrl=wss%3A%2F%2Fold.test%2F`,
      ),
    ).toThrow(/serverUrl query parameter is not supported/);
  });

  it("rejects whitespace and invalid numbers", () => {
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

function validQuery(
  overrides: Record<string, string> = {},
  options: { readonly includeGamecode?: boolean } = {},
): string {
  return `?${validParams(overrides, options).toString()}`;
}

function validParams(
  overrides: Record<string, string> = {},
  options: { readonly includeGamecode?: boolean } = {},
): URLSearchParams {
  const params = new URLSearchParams({
    skin: "1",
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
  if (options.includeGamecode !== false) {
    params.set("gamecode", GAME003_GAMECODE);
  }
  for (const [key, value] of Object.entries(overrides)) {
    params.set(key, value);
  }
  return params;
}
