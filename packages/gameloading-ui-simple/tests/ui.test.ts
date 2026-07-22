import { createSimpleGameLoadingUi } from "../src/index.js";

describe("simple game loading UI", () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.head
      .querySelectorAll("[data-sce-simple-loading-style]")
      .forEach((node) => node.remove());
  });

  it("renders its initial DOM and updates progress, status, and accessible errors", () => {
    const root = createRoot();
    const ui = createSimpleGameLoadingUi().create({ root });
    const progress = root.querySelector(".sce-simple-loading__progress");
    const status = root.querySelector(".sce-simple-loading__status");
    const error = root.querySelector('[role="alert"]');

    expect(root.querySelector(".sce-simple-loading")).not.toBeNull();
    expect(error?.getAttribute("aria-live")).toBe("polite");
    ui.update({ phase: "loading-resources", progress: 49.6, error: null });
    expect(progress?.textContent).toBe("50%");
    expect(status?.textContent).toBe("Loading");
    ui.update({ phase: "preparing", progress: 120, error: null });
    expect(progress?.textContent).toBe("100%");
    expect(status?.textContent).toBe("Preparing");
    ui.update({ phase: "entering-game", progress: Number.NaN, error: null });
    expect(progress?.textContent).toBe("0%");
    expect(status?.textContent).toBe("Ready");
    ui.update({ phase: "error", progress: -10, error: "live failed" });
    expect(status?.textContent).toBe("Error");
    expect(error?.textContent).toBe("live failed");
  });

  it("destroys idempotently and ignores later updates", () => {
    const root = createRoot();
    const ui = createSimpleGameLoadingUi().create({ root });
    const style = document.head.querySelector(
      "[data-sce-simple-loading-style]",
    );
    ui.destroy();
    ui.destroy();
    ui.update({ phase: "error", progress: 99, error: "ignored" });
    expect(root.childElementCount).toBe(0);
    expect(style?.isConnected).toBe(false);
  });

  it("isolates the DOM and style of multiple instances", () => {
    const firstRoot = createRoot();
    const secondRoot = createRoot();
    const first = createSimpleGameLoadingUi().create({ root: firstRoot });
    const second = createSimpleGameLoadingUi().create({ root: secondRoot });
    const ids = [...document.querySelectorAll("[data-sce-simple-loading]")].map(
      (node) => (node as HTMLElement).dataset.sceSimpleLoading,
    );
    expect(new Set(ids).size).toBe(2);
    expect(
      document.head.querySelectorAll("[data-sce-simple-loading-style]"),
    ).toHaveLength(2);
    first.destroy();
    expect(secondRoot.childElementCount).toBe(1);
    second.destroy();
  });
});

function createRoot(): HTMLDivElement {
  const root = document.createElement("div");
  document.body.append(root);
  return root;
}
