import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import {
  createSpinePopupPlayer,
  type PopupPackageResource,
  type SpinePopupManifestV1,
} from "../../src/popup/index.js";

describe("spine popup player", () => {
  it("latches an early click and exits only on the next loop boundary", async () => {
    const leaf = new FakeSpinePlayer();
    const player = createSpinePopupPlayer({
      resource: spineResource(),
      playerFactory: () => leaf,
    });
    await player.init();
    player.start();
    player.requestDismiss();
    expect(leaf.plays).toEqual([{ animationName: "start", loop: false }]);
    leaf.results.push({ completed: true, events: [] });
    expect(player.update(0.1)).toEqual({
      phase: "loop",
      dismissRequested: true,
    });
    expect(leaf.plays.at(-1)).toEqual({ animationName: "loop", loop: true });
    leaf.results.push({ completed: false, events: [] });
    expect(player.update(0.1).phase).toBe("loop");
    leaf.results.push({ completed: false, loopCompleted: true, events: [] });
    expect(player.update(0.1).phase).toBe("end");
    expect(leaf.plays.at(-1)).toEqual({ animationName: "end", loop: false });
    leaf.results.push({ completed: true, events: [] });
    expect(player.update(0.1).phase).toBe("complete");
    expect(player.container.visible).toBe(false);
  });

  it("keeps repeated dismiss idempotent and rejects concurrent start", async () => {
    const leaf = new FakeSpinePlayer();
    const player = createSpinePopupPlayer({
      resource: spineResource(),
      playerFactory: () => leaf,
    });
    await player.init();
    player.start();
    expect(() => player.start()).toThrow(/already playing/);
    player.requestDismiss();
    player.requestDismiss();
    expect(player.getSnapshot().dismissRequested).toBe(true);
    player.dismissImmediately();
    expect(player.getSnapshot().phase).toBe("complete");
    expect(leaf.resetCount).toBe(1);
    player.destroy();
    player.destroy();
    expect(leaf.destroyCount).toBe(1);
  });

  it("fails strictly for wrong packages and invalid lifecycle calls", async () => {
    expect(() =>
      createSpinePopupPlayer({
        resource: {
          manifest: { type: "award-celebration" } as never,
          resources: {},
          destroy() {},
        },
      }),
    ).toThrow(/requires a spine popup/);
    const missing = spineResource();
    expect(() =>
      createSpinePopupPlayer({
        resource: { ...missing, resources: {} },
      }),
    ).toThrow(/prepared resource mismatch/);
    expect(() => createSpinePopupPlayer({ resource: spineResource() })).toThrow(
      /Spine skeleton/,
    );

    const leaf = new FakeSpinePlayer();
    const player = createSpinePopupPlayer({
      resource: spineResource(),
      playerFactory: () => leaf,
    });
    expect(() => player.start()).toThrow(/init/);
    await player.init();
    await player.init();
    player.requestDismiss();
    player.dismissImmediately();
    expect(player.update(0).phase).toBe("idle");
    expect(() => player.update(-1)).toThrow(/non-negative/);
    expect(() => player.update(Number.NaN)).toThrow(/non-negative/);
    player.destroy();
    expect(() => player.getSnapshot()).toThrow(/destroyed/);
  });
});

class FakeSpinePlayer implements RendercoreSpinePlayer {
  readonly view = new Container();
  readonly plays: Array<{ animationName: string; loop: boolean }> = [];
  readonly results: Array<ReturnType<RendercoreSpinePlayer["update"]>> = [];
  resetCount = 0;
  destroyCount = 0;
  init(): void {}
  play(options: { animationName: string; loop: boolean }): void {
    this.plays.push({ ...options });
  }
  update(): ReturnType<RendercoreSpinePlayer["update"]> {
    return this.results.shift() ?? { completed: false, events: [] };
  }
  reset(): void {
    this.resetCount += 1;
  }
  destroy(): void {
    this.destroyCount += 1;
  }
}

function spineResource(): PopupPackageResource<SpinePopupManifestV1> {
  const manifest: SpinePopupManifestV1 = {
    version: 1,
    kind: "popup",
    id: "free-game",
    type: "spine",
    designViewport: { width: 1080, height: 1920 },
    resources: {
      effect: {
        kind: "spine",
        skeleton: "assets/a.json",
        atlas: "assets/b.atlas",
        textures: { "effect.png": "assets/c.png" },
      },
    },
    spine: {
      resource: "effect",
      transform: { x: 12, y: 34, scale: 0.5 },
      playback: {
        mode: "segmented-animations",
        startAnimation: "start",
        loopAnimation: "loop",
        endAnimation: "end",
      },
    },
  };
  return {
    manifest,
    resources: {
      effect: {
        kind: "spine",
        resource: { skeleton: {}, atlasText: "", textureUrls: {} },
      },
    },
    destroy() {},
  };
}
