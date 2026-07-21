import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const pending = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  const canRequestNodeState = vi.fn((_nodeId: string, _target: string) => true);
  const requestNodeState = vi.fn(
    (nodeId: string, target: string) =>
      new Promise<void>((resolve, reject) => {
        pending.set(`${nodeId}:${target}`, { resolve, reject });
      }),
  );
  const runtime = {
    container: {},
    init: vi.fn(async () => undefined),
    applyViewport: vi.fn(),
    update: vi.fn(),
    getSnapshot: vi.fn(),
    getNode: vi.fn(),
    attachChild: vi.fn(),
    attachRelative: vi.fn(),
    getReelGrid: vi.fn(),
    getImageStringNodeNames: vi.fn(() => []),
    setImageStringText: vi.fn(),
    getImageStringText: vi.fn(),
    canRequestNodeState,
    requestNodeState,
    getNodeStateSnapshot: vi.fn(),
    setNodeActive: vi.fn(),
    destroy: vi.fn(() => {
      for (const deferred of pending.values())
        deferred.reject(new Error("layout destroyed"));
      pending.clear();
    }),
  };
  return { runtime, pending, canRequestNodeState, requestNodeState };
});

vi.mock("../../src/scene-layout/runtime.js", () => ({
  createSceneLayoutRuntime: () => state.runtime,
}));

import { createSceneLayoutPackageRuntime } from "../../src/scene-layout/package-runtime.js";

function resource() {
  return {
    manifest: {
      nodes: [],
      reels: {},
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          { id: "BaseGame", nodeStates: { bg: "BG", panel: "Closed" } },
          { id: "FreeGame", nodeStates: { bg: "FG", panel: "Open" } },
        ],
      },
    },
    layout: {},
    symbolPackage: null,
    popupPackages: {},
    destroy: vi.fn(),
  };
}

function differentBackgroundResource() {
  return {
    manifest: {
      nodes: [],
      reels: {},
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            backgroundNodes: { default: "base-bg" },
            nodeStates: { panel: "Closed" },
          },
          {
            id: "FreeGame",
            backgroundNodes: { default: "free-bg" },
            nodeStates: { panel: "Open" },
          },
        ],
      },
    },
    layout: {},
    symbolPackage: null,
    symbolPackages: {},
    popupPackages: {},
    destroy: vi.fn(),
  };
}

describe("scene layout package game-mode orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.pending.clear();
    state.canRequestNodeState.mockReturnValue(true);
  });

  it("preflights every node before starting any transition", async () => {
    state.canRequestNodeState.mockImplementation(
      (nodeId: string) => nodeId !== "panel",
    );
    const runtime = createSceneLayoutPackageRuntime({
      resource: resource() as never,
    });
    await runtime.init();
    await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
      /panel.*cannot transition/,
    );
    expect(state.canRequestNodeState).toHaveBeenCalledTimes(2);
    expect(state.requestNodeState).not.toHaveBeenCalled();
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      phase: "stable",
    });
    runtime.destroy();
  });

  it("starts node transitions together and commits only after all settle", async () => {
    const runtime = createSceneLayoutPackageRuntime({
      resource: resource() as never,
    });
    await runtime.init();
    const transition = runtime.requestGameMode("FreeGame");
    expect(state.requestNodeState.mock.calls).toEqual([
      ["bg", "FG"],
      ["panel", "Open"],
    ]);
    expect(runtime.getGameModeSnapshot()).toEqual({
      stableMode: "BaseGame",
      targetMode: "FreeGame",
      phase: "transitioning",
      stableSymbolPackage: null,
      targetSymbolPackage: null,
      activeBackgroundNodes: [],
    });
    await expect(runtime.requestGameMode("BaseGame")).rejects.toThrow(
      /already in progress/,
    );
    state.pending.get("bg:FG")!.resolve();
    await Promise.resolve();
    expect(runtime.getGameModeSnapshot().stableMode).toBe("BaseGame");
    state.pending.get("panel:Open")!.resolve();
    await transition;
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      targetMode: null,
    });
    runtime.destroy();
  });

  it("rejects an unfinished mode request when destroyed", async () => {
    const runtime = createSceneLayoutPackageRuntime({
      resource: resource() as never,
    });
    await runtime.init();
    const transition = runtime.requestGameMode("FreeGame");
    runtime.destroy();
    await expect(transition).rejects.toThrow(/layout destroyed/);
  });

  it("keeps the source background active until the atomic commit boundary", async () => {
    const runtime = createSceneLayoutPackageRuntime({
      resource: differentBackgroundResource() as never,
    });
    await runtime.init();
    expect(state.runtime.setNodeActive.mock.calls).toEqual([
      ["base-bg", true],
      ["free-bg", false],
    ]);
    state.runtime.setNodeActive.mockClear();

    const transition = runtime.requestGameMode("FreeGame");
    expect(state.requestNodeState).toHaveBeenCalledWith("panel", "Open");
    expect(state.runtime.setNodeActive).not.toHaveBeenCalled();
    expect(runtime.getGameModeSnapshot().activeBackgroundNodes).toEqual([
      "base-bg",
    ]);

    state.pending.get("panel:Open")!.resolve();
    await transition;
    expect(state.runtime.setNodeActive.mock.calls).toEqual([
      ["base-bg", false],
      ["free-bg", true],
    ]);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      activeBackgroundNodes: ["free-bg"],
    });
    runtime.destroy();
  });
});
