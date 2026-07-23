import {
  createDirectPlatformBootstrapProvider,
  type SlotPlatformBootstrapSnapshot,
} from "../src/index.js";

const input = (): SlotPlatformBootstrapSnapshot => ({
  platform: "direct",
  mode: "real",
  gameCode: "GAME",
  businessCode: "BUSINESS",
  language: "en",
  jurisdiction: "MT",
  presentation: { brandLabel: "Game", currency: "USD", locale: "en-US" },
  initialPreferences: { muted: false, fastMode: true, autoMode: false },
  translations: { spin: "Spin" },
  warnings: [{ code: "demo", message: "Demo warning" }],
});

describe("direct platform bootstrap provider", () => {
  it("copies and deeply freezes snapshots", async () => {
    const original = input();
    const provider = createDirectPlatformBootstrapProvider(original);
    (original.translations as Record<string, string>).spin = "Changed";
    const handle = await provider.prepare(new AbortController().signal);
    expect(handle.snapshot.translations.spin).toBe("Spin");
    expect(Object.isFrozen(handle.snapshot)).toBe(true);
    expect(Object.isFrozen(handle.snapshot.presentation)).toBe(true);
    expect(Object.isFrozen(handle.snapshot.initialPreferences)).toBe(true);
    expect(Object.isFrozen(handle.snapshot.translations)).toBe(true);
    expect(Object.isFrozen(handle.snapshot.warnings)).toBe(true);
    expect(Object.isFrozen(handle.snapshot.warnings[0])).toBe(true);
    expect(JSON.stringify(handle.snapshot)).not.toMatch(/token|serverUrl/);
    handle.destroy();
    handle.destroy();
  });

  it("rejects already-aborted and abort/resolve races", async () => {
    const provider = createDirectPlatformBootstrapProvider(input());
    const already = new AbortController();
    already.abort();
    await expect(provider.prepare(already.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    const racing = new AbortController();
    const pending = provider.prepare(racing.signal);
    racing.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("creates isolated handles", async () => {
    const provider = createDirectPlatformBootstrapProvider(input());
    const [first, second] = await Promise.all([
      provider.prepare(new AbortController().signal),
      provider.prepare(new AbortController().signal),
    ]);
    expect(first).not.toBe(second);
    expect(first.snapshot).not.toBe(second.snapshot);
    first.destroy();
    expect(second.snapshot.gameCode).toBe("GAME");
  });

  it("rejects invalid snapshot shapes", () => {
    const invalid = input();
    expect(() =>
      createDirectPlatformBootstrapProvider({
        ...invalid,
        mode: "invalid" as never,
      }),
    ).toThrow(/mode/);
    expect(() =>
      createDirectPlatformBootstrapProvider({
        ...invalid,
        initialPreferences: {
          ...invalid.initialPreferences,
          muted: "no" as never,
        },
      }),
    ).toThrow(/muted/);
    expect(() =>
      createDirectPlatformBootstrapProvider({
        ...invalid,
        translations: { nested: {} as never },
      }),
    ).toThrow(/values/);
    expect(() =>
      createDirectPlatformBootstrapProvider({
        ...invalid,
        warnings: "bad" as never,
      }),
    ).toThrow(/warnings/);
    expect(() =>
      createDirectPlatformBootstrapProvider({
        ...invalid,
        platform: "",
      }),
    ).toThrow(/platform/);
  });
});
