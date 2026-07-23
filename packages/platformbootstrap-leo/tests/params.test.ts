import {
  DEFAULT_LEO_CONFIG_URL,
  parseLeoLauncherParameters,
} from "../src/index.js";

const valid = (overrides: Record<string, string> = {}) =>
  new URLSearchParams({
    jurisdiction: "MT",
    gameCode: "GAME",
    lang: "en",
    platformToken: "FAKE_TOKEN",
    businessCode: "business",
    ...overrides,
  });

describe("Leo launcher parameters", () => {
  it("normalizes canonical and compatibility aliases", () => {
    expect(parseLeoLauncherParameters(valid())).toMatchObject({
      configUrl: DEFAULT_LEO_CONFIG_URL,
      gameCode: "GAME",
      language: "en",
      credential: "FAKE_TOKEN",
      businessCode: "business",
      mode: "real",
    });
    expect(
      parseLeoLauncherParameters(
        valid({
          gamecode: "GAME",
          language: "en",
          token: "FAKE_TOKEN",
          businessid: "business",
        }),
      ),
    ).toMatchObject({
      gameCode: "GAME",
      language: "en",
      credential: "FAKE_TOKEN",
    });
  });

  it("preserves safe endpoint query without allowing request field overwrite", async () => {
    const { createLeoLauncherConfigRequestUrl } =
      await import("../src/index.js");
    const safe = parseLeoLauncherParameters(
      valid({ configUrl: "https://launcher.test/config?tenant=one" }),
    );
    expect(createLeoLauncherConfigRequestUrl(safe)).toContain("tenant=one");
    const collision = parseLeoLauncherParameters(
      valid({ configUrl: "https://launcher.test/config?lang=old" }),
    );
    expect(() => createLeoLauncherConfigRequestUrl(collision)).toThrow(
      /must not predefine/,
    );
  });

  it.each([
    ["gameCode", "gamecode"],
    ["lang", "language"],
    ["platformToken", "token"],
    ["businessCode", "businessid"],
  ])("accepts matching %s/%s and rejects conflicts", (canonical, alias) => {
    expect(() =>
      parseLeoLauncherParameters(
        valid({ [alias]: valid().get(canonical) ?? "business" }),
      ),
    ).not.toThrow();
    expect(() =>
      parseLeoLauncherParameters(valid({ [alias]: "DIFFERENT" })),
    ).toThrow(/conflict/);
  });

  it("rejects duplicates, empty values, unsafe config URLs, and hides credentials", () => {
    expect(() =>
      parseLeoLauncherParameters(`${valid()}&gameCode=OTHER`),
    ).toThrow(/more than once/);
    expect(() =>
      parseLeoLauncherParameters(valid({ jurisdiction: " " })),
    ).toThrow(/must not be empty/);
    expect(() =>
      parseLeoLauncherParameters(valid({ configUrl: "http://bad.test" })),
    ).toThrow(/HTTPS/);
    expect(() =>
      parseLeoLauncherParameters(
        valid({ configUrl: "https://user:pass@bad.test/config" }),
      ),
    ).toThrow(/HTTPS/);
    expect(() =>
      parseLeoLauncherParameters(valid({ currency: "NOT_A_CURRENCY" })),
    ).toThrow(/currency/);
    expect(
      parseLeoLauncherParameters(valid({ currency: "usd" })).currency,
    ).toBe("usd");
    try {
      parseLeoLauncherParameters(valid({ platformToken: "FAKE SECRET TOKEN" }));
    } catch (error) {
      expect(String(error)).not.toContain("FAKE SECRET TOKEN");
    }
  });

  it("normalizes real, fun and replay and rejects partial or ambiguous modes", () => {
    expect(parseLeoLauncherParameters(valid()).mode).toBe("real");
    expect(
      parseLeoLauncherParameters(
        valid({ businessCode: "guest", moneymode: "fun" }),
      ).mode,
    ).toBe("fun");
    expect(
      parseLeoLauncherParameters(
        valid({ replayurl: "https://replay.test/data", mode: "REPLAY" }),
      ).mode,
    ).toBe("replay");
    expect(() =>
      parseLeoLauncherParameters(
        valid({ replayurl: "https://replay.test/data" }),
      ),
    ).toThrow(/together/);
    expect(() => parseLeoLauncherParameters(valid({ mode: "replay" }))).toThrow(
      /recognized/,
    );
    expect(() =>
      parseLeoLauncherParameters(valid({ moneymode: "FUN" })),
    ).toThrow(/recognized/);
    expect(() =>
      parseLeoLauncherParameters(
        valid({
          businessCode: "guest",
          moneymode: "fun",
          replayurl: "https://replay.test/data",
          mode: "REPLAY",
        }),
      ),
    ).toThrow(/cannot/);
  });
});
