import { describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  receiveRuntimeLaunchPayload: vi.fn(),
  createRuntimeGame: vi.fn(),
}));
vi.mock("../src/runtime/launch-channel.js", () => ({
  receiveRuntimeLaunchPayload: runtime.receiveRuntimeLaunchPayload,
}));
vi.mock("../src/runtime/create-game.js", () => ({
  createRuntimeGame: runtime.createRuntimeGame,
}));

import { startRuntimeWindow } from "../src/runtime/entry.js";

describe("runtime window entry", () => {
  it("boots the framework and installs pagehide cleanup", async () => {
    const cleanup = vi.fn();
    runtime.receiveRuntimeLaunchPayload.mockResolvedValue({ payload: true });
    runtime.createRuntimeGame.mockResolvedValue(cleanup);
    const root = document.createElement("div");
    const add = vi.spyOn(window, "addEventListener");

    await startRuntimeWindow(root);
    expect(runtime.createRuntimeGame).toHaveBeenCalledWith(root, {
      payload: true,
    });
    expect(add).toHaveBeenCalledWith("pagehide", cleanup, { once: true });
    add.mockRestore();
  });

  it("renders escaped boot failures without leaking payload data", async () => {
    runtime.receiveRuntimeLaunchPayload.mockRejectedValue(
      new Error("<secret> failed"),
    );
    const root = document.createElement("div");
    await startRuntimeWindow(root);
    expect(root.textContent).toContain("<secret> failed");
    expect(root.innerHTML).toContain("&lt;secret&gt;");
    expect(root.textContent).toContain("不会写入");
  });
});
