import { createLeoGameLoadingUi } from "../src/index.js";

describe("Leo game loading UI", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestPreloadImage.instances.length = 0;
    vi.stubGlobal("Image", TestPreloadImage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
    document.head
      .querySelectorAll("[data-sce-leo-loading-style]")
      .forEach((node) => node.remove());
  });

  it("synchronously renders a black shell and logo before GIF preload", () => {
    const root = createRoot();
    createLeoGameLoadingUi({ introDurationMs: 10 }).create({ root });
    const logo = root.querySelector(
      ".sce-leo-loading__logo",
    ) as HTMLImageElement;
    const style = document.head.querySelector("[data-sce-leo-loading-style]");
    expect(root.querySelector(".sce-leo-loading")).not.toBeNull();
    expect(logo.dataset.visible).toBe("true");
    expect(logo.src).toContain("logo_1.webp");
    expect(style?.textContent).toContain("background: #000");
    expect(TestPreloadImage.instances).toHaveLength(1);
  });

  it("shows the GIF intro after load and resolves after the intro duration", async () => {
    const root = createRoot();
    const ui = createLeoGameLoadingUi({
      introDurationMs: 20,
      gifLoadTimeoutMs: 50,
    }).create({ root });
    let ready = false;
    void ui.readyToComplete?.then(() => {
      ready = true;
    });
    TestPreloadImage.instances[0].onload?.();
    expect(
      (root.querySelector(".sce-leo-loading__intro") as HTMLElement).dataset
        .visible,
    ).toBe("true");
    await vi.advanceTimersByTimeAsync(19);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ready).toBe(true);
    expect(
      (root.querySelector(".sce-leo-loading__radial") as HTMLElement).dataset
        .visible,
    ).toBe("true");
  });

  it.each(["error", "timeout"] as const)(
    "uses the logo fallback and resolves after GIF %s",
    async (mode) => {
      const ui = createLeoGameLoadingUi({
        introDurationMs: 10,
        gifLoadTimeoutMs: 20,
      }).create({ root: createRoot() });
      if (mode === "error") {
        TestPreloadImage.instances[0].onerror?.();
        await vi.advanceTimersByTimeAsync(10);
      } else {
        await vi.advanceTimersByTimeAsync(30);
      }
      await expect(ui.readyToComplete).resolves.toBeUndefined();
    },
  );

  it("updates progress art and exposes errors without exiting", () => {
    const root = createRoot();
    const ui = createLeoGameLoadingUi().create({ root });
    ui.update({ phase: "loading-resources", progress: 50, error: null });
    expect(
      (root.querySelector(".sce-leo-loading__horizontal") as HTMLElement).style
        .clipPath,
    ).toBe("inset(0 50% 0 0)");
    ui.update({ phase: "error", progress: 99, error: "live failed" });
    expect(root.querySelector('[role="alert"]')?.textContent).toBe(
      "live failed",
    );
    expect(root.querySelector(".sce-leo-loading--exiting")).toBeNull();
  });

  it("plays exit for the configured duration", async () => {
    const root = createRoot();
    const ui = createLeoGameLoadingUi({ exitDurationMs: 25 }).create({ root });
    let exited = false;
    void ui.playExit?.().then(() => {
      exited = true;
    });
    expect(root.querySelector(".sce-leo-loading--exiting")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(24);
    expect(exited).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(exited).toBe(true);
  });

  it("cleans timers, listeners, style and DOM idempotently", async () => {
    const root = createRoot();
    const ui = createLeoGameLoadingUi().create({ root });
    const preload = TestPreloadImage.instances[0];
    const ready = ui.readyToComplete;
    ui.destroy();
    ui.destroy();
    ui.update({ phase: "error", progress: 1, error: "ignored" });
    expect(preload.onload).toBeNull();
    expect(preload.onerror).toBeNull();
    expect(root.childElementCount).toBe(0);
    expect(
      document.head.querySelector("[data-sce-leo-loading-style]"),
    ).toBeNull();
    await expect(ready).resolves.toBeUndefined();
    await expect(ui.playExit?.()).resolves.toBeUndefined();
  });

  it("keeps multiple instances isolated and validates durations", () => {
    const firstRoot = createRoot();
    const secondRoot = createRoot();
    const first = createLeoGameLoadingUi().create({ root: firstRoot });
    const second = createLeoGameLoadingUi().create({ root: secondRoot });
    const ids = [...document.querySelectorAll("[data-sce-leo-loading]")].map(
      (node) => (node as HTMLElement).dataset.sceLeoLoading,
    );
    expect(new Set(ids).size).toBe(2);
    first.destroy();
    expect(secondRoot.childElementCount).toBe(1);
    second.destroy();
    expect(() => createLeoGameLoadingUi({ introDurationMs: -1 })).toThrow(
      /introDurationMs/,
    );
    expect(() =>
      createLeoGameLoadingUi({ gifLoadTimeoutMs: Number.NaN }),
    ).toThrow(/gifLoadTimeoutMs/);
    expect(() =>
      createLeoGameLoadingUi({ exitDurationMs: Number.POSITIVE_INFINITY }),
    ).toThrow(/exitDurationMs/);
  });
});

class TestPreloadImage {
  static readonly instances: TestPreloadImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = false;
  src = "";

  constructor() {
    TestPreloadImage.instances.push(this);
  }
}

function createRoot(): HTMLDivElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}
