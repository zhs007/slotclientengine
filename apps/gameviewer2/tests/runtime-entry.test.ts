import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  receive: vi.fn(),
  create: vi.fn(),
  play: vi.fn(),
  replay: vi.fn(),
  resize: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("../src/runtime/launch-channel.js", () => ({
  receiveRuntimePayload: mocks.receive,
}));
vi.mock("@slotclientengine/rendercore/scene-layout", () => ({
  createSceneOtherSceneFlowRuntime: mocks.create,
}));

import { startRuntimeWindow } from "../src/runtime/entry.js";

describe("runtime entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
      },
    );
  });

  it("owns the preview runtime and replay action", async () => {
    mocks.receive.mockResolvedValue({
      layoutZip: new ArrayBuffer(1),
      layoutSha256: "a".repeat(64),
      project: {},
    });
    mocks.create.mockResolvedValue({
      readiness: { layout: { layoutId: "layout", renderMode: "standard" } },
      applyViewport: mocks.resize,
      play: mocks.play,
      replay: mocks.replay,
      destroy: mocks.destroy,
    });
    const root = document.createElement("div");
    await startRuntimeWindow(root);
    expect(root.textContent).toContain("layout · standard");
    expect(mocks.play).toHaveBeenCalledOnce();
    root.querySelector<HTMLButtonElement>("[data-replay]")!.click();
    expect(mocks.replay).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("beforeunload"));
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it("renders launch failures", async () => {
    mocks.receive.mockRejectedValue(new Error("bad payload"));
    const root = document.createElement("div");
    await startRuntimeWindow(root);
    expect(root.textContent).toContain("bad payload");
    expect(root.querySelector(".error")).not.toBeNull();
  });
});
