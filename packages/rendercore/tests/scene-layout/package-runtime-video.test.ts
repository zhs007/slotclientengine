import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "pixi.js";
import { SceneLayoutError } from "../../src/scene-layout/errors.js";
import type { SceneLayoutTransitionVideoPlayer } from "../../src/scene-layout/video-transition-player.js";

const state = vi.hoisted(() => ({ runtime: null as any }));

vi.mock("../../src/scene-layout/runtime.js", () => ({
  createSceneLayoutRuntime: () => state.runtime,
}));

import { createSceneLayoutPackageRuntime } from "../../src/scene-layout/package-runtime.js";

class FakeVideoPlayer implements SceneLayoutTransitionVideoPlayer {
  readonly view = new Container();
  durationSeconds = 4;
  width = 1280;
  height = 720;
  currentTimeSeconds = 0;
  ended = false;
  fatalError: SceneLayoutError | null = null;
  prepared = false;
  playCalls = 0;
  destroyed = false;
  rejectPlay = false;
  throwPlay = false;

  async prepare() {
    this.prepared = true;
  }
  play() {
    this.playCalls += 1;
    if (this.throwPlay) throw new Error("gesture threw synchronously");
    return this.rejectPlay
      ? Promise.reject(new Error("gesture denied"))
      : Promise.resolve();
  }
  applyViewport(size: { width: number; height: number }) {
    this.view.position.set(size.width / 2, size.height / 2);
    this.view.scale.set(
      Math.min(size.width / this.width, size.height / this.height),
    );
  }
  destroy() {
    this.destroyed = true;
    this.view.parent?.removeChild(this.view);
  }
}

function snapshot() {
  return {
    variantId: "default",
    worldOffset: { x: 0, y: 0 },
    reels: {},
  };
}

function createRuntime(player: FakeVideoPlayer) {
  const hash = "b".repeat(64);
  return createSceneLayoutPackageRuntime({
    resource: {
      manifest: {
        nodes: [],
        reels: {},
        gameModes: {
          initialMode: "BaseGame",
          modes: [
            {
              id: "BaseGame",
              backgroundNodes: { default: "base" },
              nodeStates: {},
            },
            {
              id: "FreeGame",
              backgroundNodes: { default: "free" },
              nodeStates: {},
            },
          ],
          transitions: [
            {
              from: "BaseGame",
              to: "FreeGame",
              overlay: {
                resource: {
                  kind: "video",
                  path: `assets/${hash}.mp4`,
                  mimeType: "video/mp4",
                },
                fit: "contain",
                fadeOutSeconds: 0.5,
              },
            },
          ],
        },
      },
      layout: {
        spineResources: {},
        videoUrls: { [`assets/${hash}.mp4`]: "blob:video" },
      },
      symbolPackage: null,
      symbolPackages: {},
      popupPackages: {},
      destroy: vi.fn(),
    } as never,
    createVideoTransitionPlayer: () => player,
  });
}

describe("scene layout package video-blackout transition", () => {
  beforeEach(() => {
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

  it("prepares invisibly, starts play synchronously and fades from media time", async () => {
    const player = new FakeVideoPlayer();
    const runtime = createRuntime(player);
    await runtime.init();
    runtime.applyViewport({ width: 600, height: 800 });
    await runtime.prepareGameModeTransition("FreeGame");
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      preparedTargetMode: "FreeGame",
      transitionKind: "video",
      mediaDurationSeconds: 4,
    });
    expect(runtime.container.children.at(-1)?.visible).toBe(false);

    const pending = runtime.requestGameMode("FreeGame");
    expect(player.playCalls).toBe(1);
    await Promise.resolve();
    expect(runtime.container.children.at(-1)?.visible).toBe(true);
    expect(player.view.position).toMatchObject({ x: 300, y: 400 });
    expect(player.view.scale.x).toBeCloseTo(600 / 1280);
    runtime.applyViewport({ width: 800, height: 600 });
    expect(player.view.position).toMatchObject({ x: 400, y: 300 });
    expect(player.view.scale.x).toBeCloseTo(800 / 1280);
    expect(player.playCalls).toBe(1);
    expect(() => runtime.cancelPreparedGameModeTransition()).toThrow(
      /after it started/,
    );

    player.currentTimeSeconds = 3.49;
    runtime.update(1);
    expect(runtime.getGameModeSnapshot().displayedMode).toBe("BaseGame");
    player.currentTimeSeconds = 3.5;
    runtime.update(100);
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      displayedMode: "FreeGame",
      transitionPhase: "after-switch",
      fadeProgress: 0,
    });
    player.currentTimeSeconds = 3.75;
    runtime.update(0);
    expect(runtime.getGameModeSnapshot().fadeProgress).toBeCloseTo(0.5);
    expect(player.view.alpha).toBeCloseTo(0.5);
    player.currentTimeSeconds = 4;
    player.ended = true;
    runtime.update(0);
    await pending;
    expect(runtime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      displayedMode: "FreeGame",
      transitionKind: null,
      mediaTimeSeconds: null,
    });
    expect(player.destroyed).toBe(true);
    expect(runtime.container.children.at(-1)?.visible).toBe(false);
    runtime.destroy();
  });

  it("cancels prepared ownership and preserves source when play rejects", async () => {
    const first = new FakeVideoPlayer();
    const runtime = createRuntime(first);
    await runtime.init();
    runtime.applyViewport({ width: 800, height: 600 });
    await runtime.prepareGameModeTransition("FreeGame");
    runtime.cancelPreparedGameModeTransition();
    expect(first.destroyed).toBe(true);
    await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
      /prepared/,
    );
    const second = new FakeVideoPlayer();
    second.rejectPlay = true;
    runtime.destroy();

    const rejectedRuntime = createRuntime(second);
    await rejectedRuntime.init();
    rejectedRuntime.applyViewport({ width: 800, height: 600 });
    await rejectedRuntime.prepareGameModeTransition("FreeGame");
    await expect(rejectedRuntime.requestGameMode("FreeGame")).rejects.toThrow(
      /gesture denied/,
    );
    expect(rejectedRuntime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      targetMode: null,
    });
    expect(second.destroyed).toBe(true);
    rejectedRuntime.destroy();

    const throwing = new FakeVideoPlayer();
    throwing.throwPlay = true;
    const throwingRuntime = createRuntime(throwing);
    await throwingRuntime.init();
    throwingRuntime.applyViewport({ width: 800, height: 600 });
    await throwingRuntime.prepareGameModeTransition("FreeGame");
    await expect(throwingRuntime.requestGameMode("FreeGame")).rejects.toThrow(
      /synchronously/,
    );
    expect(throwing.destroyed).toBe(true);
    expect(throwingRuntime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      preparedTargetMode: null,
    });
    throwingRuntime.destroy();
  });

  it("rolls back before fadeStart and settles the target after a post-switch media error", async () => {
    const before = new FakeVideoPlayer();
    const sourceRuntime = createRuntime(before);
    await sourceRuntime.init();
    sourceRuntime.applyViewport({ width: 800, height: 600 });
    await sourceRuntime.prepareGameModeTransition("FreeGame");
    const sourcePending = sourceRuntime.requestGameMode("FreeGame");
    await Promise.resolve();
    before.fatalError = new SceneLayoutError("media abort before switch");
    sourceRuntime.update(0);
    await expect(sourcePending).rejects.toThrow(/before switch/);
    expect(sourceRuntime.getGameModeSnapshot()).toMatchObject({
      stableMode: "BaseGame",
      displayedMode: "BaseGame",
      targetMode: null,
      phase: "stable",
    });
    sourceRuntime.destroy();

    const after = new FakeVideoPlayer();
    const targetRuntime = createRuntime(after);
    await targetRuntime.init();
    targetRuntime.applyViewport({ width: 800, height: 600 });
    await targetRuntime.prepareGameModeTransition("FreeGame");
    const targetPending = targetRuntime.requestGameMode("FreeGame");
    await Promise.resolve();
    after.currentTimeSeconds = 3.9;
    targetRuntime.update(0);
    after.fatalError = new SceneLayoutError("media abort after switch");
    targetRuntime.update(0);
    await expect(targetPending).rejects.toThrow(/after switch/);
    expect(targetRuntime.getGameModeSnapshot()).toMatchObject({
      stableMode: "FreeGame",
      displayedMode: "FreeGame",
      targetMode: null,
      phase: "stable",
    });
    targetRuntime.destroy();
  });
});
