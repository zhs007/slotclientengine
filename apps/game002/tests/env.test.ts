import { describe, expect, it } from "vitest";
import {
  GAME002_LINES,
  GAME002_LIVE_SERVER_URL,
  parseGame002FrameworkConfigFromQuery,
  parseGame002QueryConfig,
} from "../src/env.js";

describe("game002 runtime query config", () => {
  it("parses a complete query string", () => {
    expect(parseGame002QueryConfig(validQuery())).toEqual({
      skin: "1",
      token: "TOKEN",
      gamecode: "GAME_CODE",
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
  });

  it("maps query config into the framework live and spin contracts", () => {
    expect(GAME002_LINES).toBe(30);
    expect(parseGame002FrameworkConfigFromQuery(validQuery())).toEqual({
      skin: "1",
      live: {
        serverUrl: GAME002_LIVE_SERVER_URL,
        token: "TOKEN",
        gamecode: "GAME_CODE",
        businessid: "guest",
        clienttype: "web",
        jurisdiction: "MT",
        language: "en",
        requestTimeoutMs: 30000,
      },
      betOptions: [{ bet: 5, lines: 30, times: 1 }],
      initialBetIndex: 0,
      spinRequest: { bet: 5, lines: 30, times: 1, autonums: -1 },
    });
  });

  it("requires every supported runtime query parameter exactly once", () => {
    for (const name of REQUIRED_PARAMS) {
      const params = validParams();
      params.delete(name);

      expect(
        () => parseGame002QueryConfig(params),
        `${name} should be required`,
      ).toThrow(new RegExp(`${name} query parameter is required`));
    }

    expect(() =>
      parseGame002QueryConfig(`${validQuery()}&token=SECOND_TOKEN`),
    ).toThrow(/token query parameter must not be provided more than once/);
    expect(() => parseGame002QueryConfig(`${validQuery()}&skin=3`)).toThrow(
      /skin query parameter must not be provided more than once/,
    );
  });

  it("rejects empty or whitespace-only parameters", () => {
    for (const name of REQUIRED_PARAMS) {
      expect(
        () => parseGame002QueryConfig(validQuery({ [name]: "   " })),
        `${name} should reject whitespace`,
      ).toThrow(new RegExp(`${name} query parameter must not be empty`));
    }
  });

  it("uses a fixed live server and rejects the old serverUrl query parameter", () => {
    expect(
      parseGame002FrameworkConfigFromQuery(validQuery()).live.serverUrl,
    ).toBe(GAME002_LIVE_SERVER_URL);
    expect(() =>
      parseGame002QueryConfig(
        `${validQuery()}&serverUrl=wss%3A%2F%2Fold.test%2F`,
      ),
    ).toThrow(/serverUrl query parameter is not supported/);
  });

  it("accepts only explicit skin id 1", () => {
    expect(parseGame002QueryConfig(validQuery({ skin: "1" })).skin).toBe("1");

    for (const skin of ["01", "2", "3", "4", "5", "game002-s3", "6"]) {
      expect(
        () => parseGame002QueryConfig(validQuery({ skin })),
        `${skin} should be rejected`,
      ).toThrow(/skin query parameter must be exactly "1"/);
    }
  });

  it("does not leak tokens in skin validation errors", () => {
    try {
      parseGame002QueryConfig(validQuery({ skin: "6", token: "SECRET" }));
    } catch (error) {
      expect(
        error instanceof Error ? error.message : String(error),
      ).not.toMatch(/SECRET/);
    }
  });

  it("round trips URL-encoded token special characters", () => {
    expect(
      parseGame002QueryConfig(
        validQuery({ token: "TOKEN+WITH&RESERVED=CHARS" }),
      ).token,
    ).toBe("TOKEN+WITH&RESERVED=CHARS");
  });

  it("does not silently repair an unencoded plus in the token", () => {
    const query = validQuery().replace("token=TOKEN", "token=SECRET+TOKEN");

    expect(() => parseGame002QueryConfig(query)).toThrow(
      /token query parameter must be URL encoded/,
    );
    try {
      parseGame002QueryConfig(query);
    } catch (error) {
      expect(
        error instanceof Error ? error.message : String(error),
      ).not.toMatch(/SECRET/);
    }
  });

  it("rejects invalid numeric parameters", () => {
    expect(() => parseGame002QueryConfig(validQuery({ bet: "0" }))).toThrow(
      /bet query parameter/,
    );
    expect(() => parseGame002QueryConfig(validQuery({ lines: "NaN" }))).toThrow(
      /lines query parameter/,
    );
    expect(() => parseGame002QueryConfig(validQuery({ times: "-1" }))).toThrow(
      /times query parameter/,
    );
    expect(() =>
      parseGame002QueryConfig(validQuery({ requestTimeoutMs: "0" })),
    ).toThrow(/requestTimeoutMs query parameter/);
    expect(() =>
      parseGame002QueryConfig(validQuery({ autonums: "1.2" })),
    ).toThrow(/autonums query parameter must be an integer/);
  });

  it("rejects a non-30 lines value instead of sending a wrong spin request", () => {
    expect(() => parseGame002QueryConfig(validQuery({ lines: "10" }))).toThrow(
      /lines query parameter must be exactly 30 for game002/,
    );
    expect(() =>
      parseGame002FrameworkConfigFromQuery(validQuery({ lines: "10" })),
    ).toThrow(/lines query parameter must be exactly 30 for game002/);
  });
});

const REQUIRED_PARAMS = Object.freeze([
  "skin",
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
    token: "TOKEN",
    gamecode: "GAME_CODE",
    businessid: "guest",
    clienttype: "web",
    jurisdiction: "MT",
    language: "en",
    bet: "5",
    lines: "30",
    times: "1",
    autonums: "-1",
    requestTimeoutMs: "30000",
    ...overrides,
  });
  return params;
}
