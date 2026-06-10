import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli";
import {
  DEFAULT_AUTONUMS,
  DEFAULT_BET,
  DEFAULT_LINES,
  DEFAULT_PROGRESS_INTERVAL,
  DEFAULT_TIMES,
} from "../src/config";

describe("parseCliArgs", () => {
  it("requires --spins", () => {
    expect(() => parseCliArgs([])).toThrow("--spins");
  });

  it.each([["0"], ["-1"], ["1.5"], ["abc"]])(
    "rejects invalid --spins value %s",
    (value) => {
      expect(() => parseCliArgs(["--spins", value])).toThrow("正整数");
    },
  );

  it("uses default spin macros", () => {
    const config = parseCliArgs(["--spins", "3"]);

    expect(config.spins).toBe(3);
    expect(config.spin).toEqual({
      bet: DEFAULT_BET,
      lines: DEFAULT_LINES,
      times: DEFAULT_TIMES,
      autonums: DEFAULT_AUTONUMS,
    });
    expect(config.progressInterval).toBe(DEFAULT_PROGRESS_INTERVAL);
  });

  it("accepts the pnpm script argument separator", () => {
    const config = parseCliArgs(["--", "--spins", "3"]);

    expect(config.spins).toBe(3);
  });

  it("validates and records explicit overrides", () => {
    const config = parseCliArgs([
      "--spins",
      "2",
      "--url",
      "wss://example.test/",
      "--gamecode",
      "game-a",
      "--token",
      "token-a",
      "--bet",
      "12.5",
      "--lines",
      "20",
      "--times",
      "3",
      "--request-timeout-ms",
      "1000",
      "--progress-interval",
      "100",
      "--verbose",
    ]);

    expect(config.url).toBe("wss://example.test/");
    expect(config.gamecode).toBe("game-a");
    expect(config.token).toBe("token-a");
    expect(config.spin.bet).toBe(12.5);
    expect(config.spin.lines).toBe(20);
    expect(config.spin.times).toBe(3);
    expect(config.requestTimeoutMs).toBe(1000);
    expect(config.progressInterval).toBe(100);
    expect(config.verbose).toBe(true);
    expect(config.overrides).toContain("token=token-a");
    expect(config.overrides).toContain("progress-interval=100");
  });

  it.each([
    ["--bet", "0"],
    ["--lines", "1.5"],
    ["--times", "-1"],
    ["--request-timeout-ms", "abc"],
    ["--progress-interval", "0"],
    ["--progress-interval", "-1"],
    ["--progress-interval", "1.5"],
    ["--progress-interval", "abc"],
  ])("rejects invalid override %s %s", (option, value) => {
    expect(() => parseCliArgs(["--spins", "1", option, value])).toThrow();
  });

  it.each(["http://example.test", "not-a-url"])(
    "rejects invalid websocket url %s",
    (url) => {
      expect(() => parseCliArgs(["--spins", "1", "--url", url])).toThrow();
    },
  );
});
