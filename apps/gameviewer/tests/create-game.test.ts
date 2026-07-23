import { describe, expect, it, vi } from "vitest";

const { createSceneLayoutSlotGameTemplate } = vi.hoisted(() => ({
  createSceneLayoutSlotGameTemplate: vi.fn(),
}));
vi.mock(
  "@slotclientengine/gameframeworks/scene-layout-template",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@slotclientengine/gameframeworks/scene-layout-template")
    >()),
    createSceneLayoutSlotGameTemplate,
  }),
);

import { createRuntimeGame } from "../src/runtime/create-game.js";

const payload = {
  layoutZipBytes: new Uint8Array([1]),
  layoutSha256: "a".repeat(64),
  config: {},
  credential: { token: "session" },
} as never;

describe("runtime game facade", () => {
  it("calls the single framework factory and returns idempotent cleanup", async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const destroy = vi.fn();
    createSceneLayoutSlotGameTemplate.mockResolvedValue({ connect, destroy });
    const root = document.createElement("div");

    const cleanup = await createRuntimeGame(root, payload);
    expect(createSceneLayoutSlotGameTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        root,
        expectedLayoutSha256: "a".repeat(64),
        credential: { token: "session" },
      }),
    );
    cleanup();
    cleanup();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("destroys the framework when connect fails", async () => {
    const destroy = vi.fn();
    createSceneLayoutSlotGameTemplate.mockResolvedValue({
      connect: vi.fn().mockRejectedValue(new Error("connect failed")),
      destroy,
    });
    await expect(
      createRuntimeGame(document.createElement("div"), payload),
    ).rejects.toThrow(/connect failed/);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
