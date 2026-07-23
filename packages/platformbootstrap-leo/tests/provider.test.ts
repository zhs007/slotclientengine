import {
  createLeoLauncherConfigRequestUrl,
  createLeoPlatformBootstrapProvider,
  createLeoSettingRequestUrl,
  parseLeoLauncherParameters,
  type LeoSettingsStore,
} from "../src/index.js";

const params = (extra: Record<string, string> = {}) =>
  parseLeoLauncherParameters(
    new URLSearchParams({
      jurisdiction: "MT",
      license: "license-value",
      gameCode: "GAME&ONE",
      lang: "en",
      platformToken: "FAKE_TOKEN+&=",
      businessCode: "business",
      ...extra,
    }),
  );

const config = (extra: Record<string, unknown> = {}) => ({
  commonTranslationJsonUrl: "https://cdn.test/common.json",
  gameTranslationJsonUrl: "https://cdn.test/game.json",
  quickStop: true,
  gameServerConfig: {
    gameServerApi: "wss://gameserv.rgstest.slammerstudios.com/",
    settingApi: "https://settings.test/api/v1/game/settings?tenant=one",
  },
  ...extra,
});

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("Leo platform bootstrap provider", () => {
  it("binds the browser default fetch to its global receiver", async () => {
    const originalFetch = globalThis.fetch;
    const browserFetch = vi.fn(function (
      this: typeof globalThis,
      input: RequestInfo | URL,
    ) {
      if (this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      const url = String(input);
      if (url.includes("gameclient/config")) {
        return Promise.resolve(response(config()));
      }
      if (url.includes("common.json")) {
        return Promise.resolve(response({ spin: "Spin" }));
      }
      if (url.includes("game.json")) {
        return Promise.resolve(response({}));
      }
      if (url.includes("/v2/")) {
        return Promise.resolve(
          response({ fastplays: false, sound: 100, music: 100 }),
        );
      }
      return Promise.reject(new Error("unexpected request"));
    }) as typeof globalThis.fetch;
    globalThis.fetch = browserFetch;
    try {
      const handle = await createLeoPlatformBootstrapProvider({
        params: params(),
        presentation: {
          brandLabel: "game002",
          defaultCurrency: "USD",
          defaultLocale: "en-US",
          localeByLanguage: { en: "en-US" },
        },
      }).prepare(new AbortController().signal);
      expect(browserFetch).toHaveBeenCalled();
      expect(handle.snapshot.translations).toMatchObject({ spin: "Spin" });
      handle.destroy();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("builds exact encoded URLs and returns a credential-free frozen snapshot", async () => {
    const requests: string[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url.includes("gameclient/config")) return response(config());
      if (url.includes("common.json"))
        return response({ spin: "Common", balance: "Balance" });
      if (url.includes("game.json")) return response({ spin: "Game" });
      if (url.includes("/v2/"))
        return response({ fastplays: true, sound: 0, music: 0 });
      throw new Error("unexpected request");
    }) as typeof globalThis.fetch;
    const provider = createLeoPlatformBootstrapProvider({
      params: params(),
      presentation: {
        brandLabel: "game002",
        defaultCurrency: "USD",
        defaultLocale: "en-US",
        localeByLanguage: { en: "en-US" },
      },
      fetch,
      expectedGameServerUrl: "wss://gameserv.rgstest.slammerstudios.com/",
    });
    const handle = await provider.prepare(new AbortController().signal);
    expect(requests[0]).toContain("jurisdiction=MT");
    expect(requests[0]).toContain("license=license-value");
    expect(requests[0]).toContain("gameCode=GAME%26ONE");
    expect(requests[0]).not.toContain("FAKE_TOKEN");
    const settingRequest = requests.find((url) => url.includes("/v2/"));
    expect(settingRequest).toContain("tenant=one");
    expect(handle.snapshot).toMatchObject({
      platform: "leo",
      presentation: { brandLabel: "game002", currency: "USD", locale: "en-US" },
      initialPreferences: { muted: true, fastMode: true, autoMode: false },
      translations: { spin: "Game", balance: "Balance" },
      warnings: [],
    });
    expect(JSON.stringify(handle.snapshot)).not.toContain("FAKE_TOKEN");
    expect(Object.isFrozen(handle.snapshot.translations)).toBe(true);
    handle.destroy();
    handle.destroy();
  });

  it("degrades optional game translation and settings but keeps common translation", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("gameclient/config"))
        return response(
          config({
            gameServerConfig: {
              gameServerApi: "wss://different.test/",
              settingApi: "https://settings.test/v1/settings",
            },
          }),
        );
      if (url.includes("common.json")) return response({ spin: "Common" });
      throw new Error("unavailable");
    }) as typeof globalThis.fetch;
    const handle = await createLeoPlatformBootstrapProvider({
      params: params(),
      presentation: {
        brandLabel: "game002",
        defaultCurrency: "USD",
        defaultLocale: "en-US",
        localeByLanguage: { en: "en-US" },
      },
      fetch,
      expectedGameServerUrl: "wss://gameserv.rgstest.slammerstudios.com/",
    }).prepare(new AbortController().signal);
    expect(handle.snapshot.translations).toEqual({ spin: "Common" });
    expect(handle.snapshot.warnings.map((warning) => warning.code)).toEqual([
      "leo-game-translation-unavailable",
      "leo-setting-unavailable",
      "leo-game-server-mismatch",
    ]);
    expect(handle.snapshot.initialPreferences).toEqual({
      muted: false,
      fastMode: false,
      autoMode: false,
    });
  });

  it("uses isolated fun stores and closes each handle store", async () => {
    const stores: Array<
      LeoSettingsStore & { destroy: ReturnType<typeof vi.fn> }
    > = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("gameclient/config"))
        return response(config({ gameTranslationJsonUrl: undefined }));
      return response({ spin: "Spin" });
    }) as typeof globalThis.fetch;
    const provider = createLeoPlatformBootstrapProvider({
      params: params({ businessCode: "guest", moneymode: "fun" }),
      presentation: {
        brandLabel: "game002",
        defaultCurrency: "USD",
        defaultLocale: "en-US",
        localeByLanguage: { en: "en-US" },
      },
      fetch,
      settingsStoreFactory: () => {
        const store = {
          load: vi.fn(async () => ({ fastplays: true, sound: 25, music: 0 })),
          destroy: vi.fn(),
        };
        stores.push(store);
        return store;
      },
    });
    const [first, second] = await Promise.all([
      provider.prepare(new AbortController().signal),
      provider.prepare(new AbortController().signal),
    ]);
    expect(stores).toHaveLength(2);
    first.destroy();
    expect(stores[0]?.destroy).toHaveBeenCalledOnce();
    expect(stores[1]?.destroy).not.toHaveBeenCalled();
    second.destroy();
  });

  it("treats config/common failures and abort as fatal without credential leakage", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.signal?.aborted)
          throw new DOMException("aborted", "AbortError");
        if (url.includes("gameclient/config")) return response(config());
        if (url.includes("common.json")) throw new Error("common failed");
        return response({});
      },
    ) as typeof globalThis.fetch;
    const provider = createLeoPlatformBootstrapProvider({
      params: params(),
      presentation: {
        brandLabel: "game002",
        defaultCurrency: "USD",
        defaultLocale: "en-US",
      },
      fetch,
    });
    await expect(
      provider.prepare(new AbortController().signal),
    ).rejects.toThrow(/common translation request failed/);
    const aborted = new AbortController();
    aborted.abort();
    await expect(provider.prepare(aborted.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("Leo URL helpers", () => {
  it("preserves endpoint query and replaces one exact v1 path segment", () => {
    const launcher = createLeoLauncherConfigRequestUrl(params());
    expect(launcher).not.toContain("FAKE_TOKEN");
    const setting = createLeoSettingRequestUrl(
      "https://setting.test/api/v1/value?tenant=x",
      "FAKE_TOKEN+&=",
      "GAME&ONE",
    );
    expect(setting).toContain("/api/v2/value");
    expect(setting).toContain("tenant=x");
    expect(setting).toContain("token=FAKE_TOKEN%2B%26%3D");
    expect(() =>
      createLeoSettingRequestUrl("https://setting.test/api/value", "x", "g"),
    ).toThrow(/v1 segment/);
    expect(() =>
      createLeoSettingRequestUrl(
        "https://setting.test/api/v1/value?token=existing",
        "x",
        "g",
      ),
    ).toThrow(/must not predefine/);
  });

  it("does not expose fetch error URLs or credentials", async () => {
    const secret = "FAKE_TOKEN+&=";
    const provider = createLeoPlatformBootstrapProvider({
      params: params(),
      presentation: {
        brandLabel: "game002",
        defaultCurrency: "USD",
        defaultLocale: "en-US",
      },
      fetch: vi.fn(async () => {
        throw new Error(`request failed at https://bad.test/?token=${secret}`);
      }) as typeof globalThis.fetch,
    });
    try {
      await provider.prepare(new AbortController().signal);
    } catch (error) {
      expect(String(error)).toBe("Error: Leo launcher config request failed.");
      expect(String(error)).not.toContain(secret);
    }
  });

  it("validates consumed launcher projection fields", async () => {
    const { parseLeoLauncherConfig } = await import("../src/index.js");
    expect(
      parseLeoLauncherConfig(config({ disableSpacebar: true })),
    ).toMatchObject({ quickStop: true, disableSpacebar: true });
    expect(() => parseLeoLauncherConfig([])).toThrow(/plain object/);
    expect(() => parseLeoLauncherConfig(config({ quickStop: "yes" }))).toThrow(
      /quickStop/,
    );
    expect(() =>
      parseLeoLauncherConfig(
        config({ commonTranslationJsonUrl: "http://bad.test" }),
      ),
    ).toThrow(/HTTPS/);
    expect(() =>
      parseLeoLauncherConfig(
        config({
          gameServerConfig: {
            gameServerApi: "https://not-websocket.test",
            settingApi: "https://settings.test/v1/settings",
          },
        }),
      ),
    ).toThrow(/WSS/);
  });
});
