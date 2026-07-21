import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "pixi.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";

const state = vi.hoisted(() => ({
  runtime: null as any,
  variant: "default" as "default" | "portrait",
}));

vi.mock("../../src/scene-layout/runtime.js", () => ({
  createSceneLayoutRuntime: () => state.runtime,
}));

import { createSceneLayoutPackageRuntime } from "../../src/scene-layout/package-runtime.js";
import { transitionResourceKey } from "../../src/scene-layout/resource.js";

class FakeTransitionPlayer implements RendercoreSpinePlayer {
  readonly view = new Container();
  readonly plays: Array<{ animationName: string; loop: boolean }> = [];
  readonly results: Array<{
    completed: boolean;
    events: readonly { readonly name: string }[];
  }> = [];
  destroyed = false;

  init() {}
  play(options: { animationName: string; loop: boolean }) {
    this.plays.push(options);
  }
  update() {
    return this.results.shift() ?? { completed: false, events: [] };
  }
  reset() {
    this.results.length = 0;
  }
  destroy() {
    this.destroyed = true;
    this.view.parent?.removeChild(this.view);
  }
}

function packageResource(withEdge = true) {
  const transition = {
    from: "BaseGame",
    to: "FreeGame",
    overlay: {
      resource: {
        kind: "spine" as const,
        skeleton: "assets/transition.json",
        atlas: "assets/transition.atlas",
        textures: { "transition.png": "assets/transition.png" },
      },
      animation: "BG_FG",
      switchEvent: "SwitchScene",
      placements: {
        default: { x: 100, y: 200, scale: 1 },
        portrait: { x: 30, y: 40, scale: 0.5 },
      },
    },
  };
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
            nodeStates: {},
          },
          {
            id: "FreeGame",
            backgroundNodes: { default: "free-bg" },
            nodeStates: {},
          },
        ],
        transitions: withEdge ? [transition] : [],
      },
    },
    layout: {
      spineResources: {
        [transitionResourceKey("BaseGame", "FreeGame")]: {
          skeleton: {},
          atlasText: "atlas",
          textureUrls: {},
        },
      },
    },
    symbolPackage: null,
    symbolPackages: {},
    popupPackages: {},
    destroy: vi.fn(),
  };
}

function createRuntime(withEdge = true) {
  const players: FakeTransitionPlayer[] = [];
  const runtime = createSceneLayoutPackageRuntime({
    resource: packageResource(withEdge) as never,
    createTransitionPlayer: () => {
      const player = new FakeTransitionPlayer();
      players.push(player);
      return player;
    },
  });
  return { runtime, players };
}

describe("scene layout package event-driven game-mode transition", () => {
  beforeEach(() => {
    state.variant = "default";
    const container = new Container();
    state.runtime = {
      container,
      init: vi.fn(async () => undefined),
      applyViewport: vi.fn(() => snapshot()),
      update: vi.fn(),
      getSnapshot: vi.fn(() => snapshot()),
      getNode: vi.fn(),
      attachChild: vi.fn(),
      attachRelative: vi.fn(),
      getReelGrid: vi.fn(),
      getImageStringNodeNames: vi.fn(() => []),
      setImageStringText: vi.fn(),
      getImageStringText: vi.fn(),
      canRequestNodeState: vi.fn(),
      requestNodeState: vi.fn(),
      getNodeStateSnapshot: vi.fn(),
      setNodeActive: vi.fn(),
      destroy: vi.fn(),
    };
  });

  it("rejects a missing directed edge before visible mutation", async () => {
    const { runtime, players } = createRuntime(false);
    await runtime.init();
    state.runtime.setNodeActive.mockClear();
    await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
      /No direct scene transition/,
    );
    expect(players).toHaveLength(0);
    expect(state.runtime.setNodeActive).not.toHaveBeenCalled();
    runtime.destroy();
  });

  it("commits the complete lower scene at the event and settles at completion", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    runtime.applyViewport({ width: 800, height: 600 });
    state.runtime.setNodeActive.mockClear();
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    const player = players[0];
    expect(player.plays).toEqual([{ animationName: "BG_FG", loop: false }]);
    expect(player.view.position).toMatchObject({ x: 100, y: 200 });
    expect(runtime.container.children.at(-1)?.label).toBe(
      "scene-transition-overlay",
    );
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      targetMode: "FreeGame",
      transitionPhase: "before-switch",
    });
    state.variant = "portrait";
    runtime.applyViewport({ width: 600, height: 800 });
    expect(player.view.position).toMatchObject({ x: 30, y: 40 });
    expect(player.view.scale).toMatchObject({ x: 0.5, y: 0.5 });
    expect(player.plays).toHaveLength(1);
    player.results.push({
      completed: false,
      events: [{ name: "SwitchScene" }],
    });
    runtime.update(0.5);
    expect(state.runtime.setNodeActive.mock.calls).toEqual([
      ["base-bg", false],
      ["free-bg", true],
    ]);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "FreeGame",
      transitionPhase: "after-switch",
      activeBackgroundNodes: ["free-bg"],
    });
    expect(player.destroyed).toBe(false);
    player.results.push({ completed: true, events: [] });
    runtime.update(0.5);
    await pending;
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      displayedMode: "FreeGame",
      targetMode: null,
      transitionPhase: null,
    });
    expect(state.runtime.requestNodeState).not.toHaveBeenCalled();
    runtime.destroy();
  });

  it("processes event before completion in one large update", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    players[0].results.push({
      completed: true,
      events: [{ name: "SwitchScene" }],
    });
    runtime.update(10);
    await pending;
    expect(runtime.getGameModeSnapshot().stableMode).toBe("FreeGame");
    runtime.destroy();
  });

  it("rejects completion without the switch event and preserves the source", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    players[0].results.push({ completed: true, events: [] });
    runtime.update(1);
    await expect(pending).rejects.toThrow(/completed without switch event/);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      phase: "stable",
    });
    runtime.destroy();
  });

  it("rejects a pending request and destroys its overlay", async () => {
    const { runtime, players } = createRuntime();
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame");
    await Promise.resolve();
    runtime.destroy();
    await expect(pending).rejects.toThrow(/destroyed during/);
    expect(players[0].destroyed).toBe(true);
  });

  it("rejects a second request while the first target is still preparing", async () => {
    const { runtime } = createRuntime();
    await runtime.init();
    const pending = runtime.requestGameMode("FreeGame");
    await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
      /already in progress/,
    );
    runtime.destroy();
    await expect(pending).rejects.toThrow(/destroyed/);
  });
});

function snapshot() {
  return {
    variantId: state.variant,
    reels: {},
    artSize: { width: 1000, height: 1000 },
    artRect: { x: 0, y: 0, width: 1000, height: 1000 },
    viewportSize: { width: 800, height: 600 },
    worldOffset: { x: 0, y: 0 },
    scale: 1,
  };
}
