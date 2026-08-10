import { describe, expect, it } from "vitest";
import { GAME003V2_CONFIG } from "../src/config.js";
import { parseGame003v2Launch } from "../src/launch.js";

const valid =
  "?skin=2&token=t&businessid=b&clienttype=web&jurisdiction=demo&language=en&bet=5&lines=10&times=1&autonums=0&requestTimeoutMs=5000";

describe("game003v2 launch", () => {
  it("keeps the live endpoint and spin request static", () => {
    const config = parseGame003v2Launch(valid);
    expect(config.live.serverUrl).toBe(GAME003V2_CONFIG.live.serverUrl);
    expect(config.live.gamecode).toBe(GAME003V2_CONFIG.live.gamecode);
    expect(config.spinRequest).toEqual({
      bet: 5,
      lines: 10,
      times: 1,
      autonums: 0,
    });
  });

  it("rejects endpoint, skin and gamecode overrides", () => {
    expect(() => parseGame003v2Launch(`${valid}&serverUrl=wss://bad`)).toThrow(
      /serverUrl/,
    );
    expect(() =>
      parseGame003v2Launch(valid.replace("skin=2", "skin=1")),
    ).toThrow(/skin/);
    expect(() => parseGame003v2Launch(`${valid}&gamecode=bad`)).toThrow(
      /gamecode/,
    );
  });
});
