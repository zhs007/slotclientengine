import { describe, expect, it } from "vitest";
import {
  GAME002_LINES,
  GAME002_LIVE_SERVER_URL,
  parseGame002LaunchQuery,
} from "../src/env.js";

describe("game002 strict launch query", () => {
  it("normalizes legacy compatibility names into one platform/live config", () => {
    const config = parseGame002LaunchQuery(validQuery());
    expect(config.platform).toMatchObject({
      gameCode: "GAME_CODE",
      credential: "FAKE_TOKEN",
      businessCode: "guest",
      language: "en",
      jurisdiction: "MT",
      mode: "real",
    });
    expect(config).toMatchObject({
      skin: "1",
      live: {
        serverUrl: GAME002_LIVE_SERVER_URL,
        token: "FAKE_TOKEN",
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

  it("produces the same normalized config from canonical names", () => {
    const legacy = parseGame002LaunchQuery(validQuery());
    const canonical = parseGame002LaunchQuery(
      validQuery({
        token: undefined,
        gamecode: undefined,
        businessid: undefined,
        language: undefined,
        platformToken: "FAKE_TOKEN",
        gameCode: "GAME_CODE",
        businessCode: "guest",
        lang: "en",
      }),
    );
    expect(canonical).toEqual(legacy);
  });

  it("enforces alias equality, uniqueness, and required app fields", () => {
    expect(() =>
      parseGame002LaunchQuery(
        `${validQuery()}&gameCode=DIFFERENT&platformToken=FAKE_TOKEN`,
      ),
    ).toThrow(/gameCode and gamecode.*conflict/);
    expect(() =>
      parseGame002LaunchQuery(`${validQuery()}&clienttype=mobile`),
    ).toThrow(/clienttype.*more than once/);
    expect(() =>
      parseGame002LaunchQuery(validQuery({ clienttype: undefined })),
    ).toThrow(/clienttype query parameter is required/);
  });

  it("keeps the fixed server, lines and spin payload contract", () => {
    expect(GAME002_LINES).toBe(30);
    expect(parseGame002LaunchQuery(validQuery()).live.serverUrl).toBe(
      GAME002_LIVE_SERVER_URL,
    );
    expect(() => parseGame002LaunchQuery(validQuery({ lines: "10" }))).toThrow(
      /exactly 30/,
    );
    expect(() =>
      parseGame002LaunchQuery(
        `${validQuery()}&serverUrl=wss%3A%2F%2Fold.test%2F`,
      ),
    ).toThrow(/serverUrl query parameter is not supported/);
  });

  it("validates skin and numeric app parameters without leaking credentials", () => {
    expect(() => parseGame002LaunchQuery(validQuery({ skin: "5" }))).toThrow(
      /skin query parameter must be exactly "1"/,
    );
    expect(() => parseGame002LaunchQuery(validQuery({ bet: "0" }))).toThrow(
      /bet query parameter/,
    );
    expect(() =>
      parseGame002LaunchQuery(validQuery({ autonums: "1.2" })),
    ).toThrow(/autonums query parameter must be an integer/);
    try {
      parseGame002LaunchQuery(validQuery({ skin: "5", token: "FAKE_SECRET" }));
    } catch (error) {
      expect(String(error)).not.toContain("FAKE_SECRET");
    }
  });

  it("parses fun and replay modes without changing the live transport", () => {
    expect(
      parseGame002LaunchQuery(
        validQuery({ businessid: "guest", moneymode: "fun" }),
      ).platform.mode,
    ).toBe("fun");
    expect(
      parseGame002LaunchQuery(
        validQuery({
          replayurl: "https://replay.test/data",
          mode: "REPLAY",
        }),
      ).platform.mode,
    ).toBe("replay");
  });
});

function validQuery(
  overrides: Record<string, string | undefined> = {},
): string {
  const values: Record<string, string> = {
    skin: "1",
    token: "FAKE_TOKEN",
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
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete values[key];
    else values[key] = value;
  }
  return `?${new URLSearchParams(values).toString()}`;
}
