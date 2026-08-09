import { describe, expect, it } from "vitest";
import { parseLaunchQuery } from "../src/launch.js";

const valid =
  "?token=t&gamecode=g&businessid=b&clienttype=web&jurisdiction=MT&language=en&bet=1&lines=30&times=1&autonums=0&requestTimeoutMs=5000";

describe("game002v2 launch", () => {
  it("uses the fixed live endpoint and the game002 line count", () => {
    const config = parseLaunchQuery(valid);
    expect(config.live.serverUrl).toBe(
      "wss://gameserv.rgstest.slammerstudios.com/",
    );
    expect(config.spinRequest.lines).toBe(30);
  });

  it("rejects app-owned asset/server variants", () => {
    expect(() => parseLaunchQuery(`${valid}&skin=x`)).toThrow();
    expect(() => parseLaunchQuery(`${valid}&serverUrl=wss://x`)).toThrow();
  });
});
