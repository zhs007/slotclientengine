import { createLeoGameLoadingUi } from "../src/index.js";

describe("Leo game loading UI", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestPreloadImage.instances.length = 0;
    TestPreloadImage.nextComplete = false;
    TestPreloadImage.nextNaturalWidth = 0;
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

  it("shows the GIF intro, then visibly replays queued progress before resolving", async () => {
    const root = createRoot();
    const ui = createLeoGameLoadingUi({
      introDurationMs: 20,
      gifLoadTimeoutMs: 50,
      progressRevealDurationMs: 1200,
    }).create({ root });
    let ready = false;
    void ui.readyToComplete?.then(() => {
      ready = true;
    });
    ui.update({ phase: "preparing", progress: 99, error: null });
    TestPreloadImage.instances[0].onload?.();
    expect(
      (root.querySelector(".sce-leo-loading__intro") as HTMLElement).dataset
        .visible,
    ).toBe("true");
    await vi.advanceTimersByTimeAsync(19);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ready).toBe(false);
    expect(
      (root.querySelector(".sce-leo-loading__radial") as HTMLElement).dataset
        .visible,
    ).toBe("true");
    expect(horizontalClipPath(root)).toBe("inset(0 70% 0 0)");

    await vi.advanceTimersByTimeAsync(608);
    expect(ready).toBe(false);
    expect(horizontalRightInset(root)).toBeCloseTo(50, 0);

    await vi.advanceTimersByTimeAsync(592);
    expect(ready).toBe(true);
    expect(horizontalClipPath(root)).toBe("inset(0 30.4% 0 0)");
  });

  it.each(["error", "timeout"] as const)(
    "uses the logo fallback and resolves after GIF %s",
    async (mode) => {
      const ui = createLeoGameLoadingUi({
        introDurationMs: 10,
        gifLoadTimeoutMs: 20,
        progressRevealDurationMs: 0,
      }).create({ root: createRoot() });
      ui.update({ phase: "preparing", progress: 99, error: null });
      if (mode === "error") {
        TestPreloadImage.instances[0].onerror?.();
        await vi.advanceTimersByTimeAsync(10);
      } else {
        await vi.advanceTimersByTimeAsync(30);
      }
      await expect(ui.readyToComplete).resolves.toBeUndefined();
    },
  );

  it.each([
    [1, true],
    [0, false],
  ] as const)(
    "handles an already-complete GIF with naturalWidth=%s as success=%s",
    async (naturalWidth, expectedSuccess) => {
      TestPreloadImage.nextComplete = true;
      TestPreloadImage.nextNaturalWidth = naturalWidth;
      const root = createRoot();
      const ui = createLeoGameLoadingUi({
        introDurationMs: 10,
        progressRevealDurationMs: 0,
      }).create({ root });
      ui.update({ phase: "preparing", progress: 99, error: null });
      expect(
        (root.querySelector(".sce-leo-loading__intro") as HTMLElement).dataset
          .visible === "true",
      ).toBe(expectedSuccess);
      await vi.advanceTimersByTimeAsync(10);
      await expect(ui.readyToComplete).resolves.toBeUndefined();
    },
  );

  it("updates visible progress art and exposes errors without exiting", async () => {
    const root = createRoot();
    const ui = createLeoGameLoadingUi({
      introDurationMs: 0,
      progressRevealDurationMs: 0,
    }).create({ root });
    TestPreloadImage.instances[0].onload?.();
    await vi.advanceTimersByTimeAsync(0);
    ui.update({ phase: "loading-resources", progress: 50, error: null });
    expect(
      (root.querySelector(".sce-leo-loading__horizontal") as HTMLElement).style
        .clipPath,
    ).toBe("inset(0 50% 0 0)");
    expect(
      (root.querySelector(".sce-leo-loading__radial") as HTMLElement).style
        .clipPath,
    ).toContain("50% 35%");
    expect(styleText(root)).toContain(
      "transition: opacity 500ms ease; will-change: clip-path, opacity",
    );
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
      createLeoGameLoadingUi({
        progressRevealDurationMs: Number.NEGATIVE_INFINITY,
      }),
    ).toThrow(/progressRevealDurationMs/);
    expect(() =>
      createLeoGameLoadingUi({ exitDurationMs: Number.POSITIVE_INFINITY }),
    ).toThrow(/exitDurationMs/);
  });
});

class TestPreloadImage {
  static readonly instances: TestPreloadImage[] = [];
  static nextComplete = false;
  static nextNaturalWidth = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  complete = TestPreloadImage.nextComplete;
  naturalWidth = TestPreloadImage.nextNaturalWidth;
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

function styleText(root: HTMLElement): string {
  const instanceId = root.querySelector<HTMLElement>("[data-sce-leo-loading]")
    ?.dataset.sceLeoLoading;
  return (
    document.head.querySelector<HTMLStyleElement>(
      `[data-sce-leo-loading-style="${instanceId}"]`,
    )?.textContent ?? ""
  );
}

function horizontalClipPath(root: HTMLElement): string {
  return (
    root.querySelector<HTMLElement>(".sce-leo-loading__horizontal")?.style
      .clipPath ?? ""
  );
}

function horizontalRightInset(root: HTMLElement): number {
  const match = /^inset\(0 ([\d.]+)% 0 0\)$/.exec(horizontalClipPath(root));
  if (!match) {
    throw new Error("Leo horizontal progress clip path is invalid.");
  }
  return Number(match[1]);
}
