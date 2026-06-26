import { describe, expect, it } from "vitest";
import {
  parseGame002FrameworkConfigFromQuery,
  parseGame002QueryConfig,
} from "../src/env.js";

describe("game002 runtime query config", () => {
  it("parses a complete query string", () => {
    expect(parseGame002QueryConfig(validQuery())).toEqual({
      skin: "2",
      serverUrl: "wss://example.test/game",
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
    expect(parseGame002FrameworkConfigFromQuery(validQuery())).toEqual({
      skin: "2",
      live: {
        serverUrl: "wss://example.test/game",
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
    expect(
      parseGame002FrameworkConfigFromQuery(validQuery({ skin: "3" })),
    ).toMatchObject({
      skin: "3",
      live: {
        gamecode: "GAME_CODE",
        token: "TOKEN",
      },
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

  it("accepts only WebSocket server URLs", () => {
    expect(
      parseGame002QueryConfig(validQuery({ serverUrl: "ws://127.0.0.1:9/" }), {
        pageProtocol: "http:",
      }).serverUrl,
    ).toBe("ws://127.0.0.1:9/");

    expect(() =>
      parseGame002QueryConfig(
        validQuery({ serverUrl: "http://example.test/" }),
      ),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      parseGame002QueryConfig(
        validQuery({ serverUrl: "https://example.test/" }),
      ),
    ).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() =>
      parseGame002QueryConfig(validQuery({ serverUrl: "not-a-url" })),
    ).toThrow(/valid ws:\/\/ or wss:\/\//);
  });

  it("accepts only explicit skin ids 2 and 3", () => {
    expect(parseGame002QueryConfig(validQuery({ skin: "2" })).skin).toBe("2");
    expect(parseGame002QueryConfig(validQuery({ skin: "3" })).skin).toBe("3");

    for (const skin of ["02", "game002", "game003", "1", "4"]) {
      expect(
        () => parseGame002QueryConfig(validQuery({ skin })),
        `${skin} should be rejected`,
      ).toThrow(/skin query parameter must be either "2" or "3"/);
    }
  });

  it("does not leak tokens in skin validation errors", () => {
    try {
      parseGame002QueryConfig(validQuery({ skin: "4", token: "SECRET" }));
    } catch (error) {
      expect(
        error instanceof Error ? error.message : String(error),
      ).not.toMatch(/SECRET/);
    }
  });

  it("rejects ws server URLs from https pages before the browser blocks them", () => {
    expect(() =>
      parseGame002QueryConfig(validQuery({ serverUrl: "ws://127.0.0.1:9/" }), {
        pageProtocol: "https:",
      }),
    ).toThrow(/must use wss:\/\/ when the page is served over https:/);
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
    skin: "2",
    serverUrl: "wss://example.test/game",
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
