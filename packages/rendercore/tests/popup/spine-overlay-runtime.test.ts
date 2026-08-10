import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { createSpinePopupOverlayRuntime } from "../../src/popup/spine-overlay-runtime.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";

describe("spine popup overlay runtime", () => {
  it("renders image segments with authored transform and rotation", async () => {
    const runtime = createSpinePopupOverlayRuntime({
      popupId: "free-game",
      layer: {
        id: "shade",
        kind: "image",
        order: 3,
        resource: "shade",
        transform: { x: 10, y: 20, scale: 0.5, rotation: 90 },
        anchor: { x: 0.5, y: 1 },
        visibleSegments: ["start", "loop"],
      },
      resource: { kind: "image", texture: Texture.EMPTY },
    });
    await runtime.init();
    expect(runtime.container).toMatchObject({ x: 10, y: 20, zIndex: 3 });
    expect(runtime.container.rotation).toBeCloseTo(Math.PI / 2);
    runtime.start();
    expect(runtime.container.visible).toBe(true);
    runtime.update(0.1);
    runtime.applySegment("loop");
    expect(runtime.container.visible).toBe(true);
    runtime.applySegment("end");
    expect(runtime.container.visible).toBe(false);
    runtime.destroy();
  });

  it("rejects kind mismatches and unsupported resources", () => {
    expect(() =>
      createSpinePopupOverlayRuntime({
        popupId: "free-game",
        layer: {
          id: "shade",
          kind: "image",
          order: 0,
          resource: "shade",
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          anchor: { x: 0.5, y: 0.5 },
          visibleSegments: ["loop"],
        },
        resource: { kind: "font", family: "font" },
      }),
    ).toThrow(/mismatch/);
    expect(() =>
      createSpinePopupOverlayRuntime({
        popupId: "free-game",
        layer: systemTextOverlay(),
        resource: { kind: "image", texture: Texture.EMPTY },
      }),
    ).toThrow(/mismatch/);
  });

  it("renders v2 system-font text without a prepared resource", async () => {
    const runtime = createSpinePopupOverlayRuntime({
      popupId: "free-game",
      layer: systemTextOverlay(),
    });
    expect(runtime.container.alpha).toBe(0.6);
    expect(runtime.stringNode).toMatchObject({
      kind: "text",
      name: "heading",
      defaultText: "READY",
    });
    await runtime.init();
    runtime.start();
    expect(runtime.container.visible).toBe(true);
    runtime.stringNode!.setText("GO");
    runtime.applySegment("loop");
    expect(runtime.container.visible).toBe(true);
    runtime.applySegment("end");
    expect(runtime.container.visible).toBe(false);
    runtime.update(0.1);
    runtime.destroy();
  });

  it("runs authored Spine start, loop, and end animations", async () => {
    const play = vi.fn();
    const init = vi.fn();
    const destroy = vi.fn();
    const update = vi
      .fn<RendercoreSpinePlayer["update"]>()
      .mockReturnValueOnce({ completed: true, events: [] })
      .mockReturnValue({ completed: false, events: [] });
    const player: RendercoreSpinePlayer = {
      view: new Container(),
      init,
      play,
      update,
      reset: vi.fn(),
      destroy,
    };
    const runtime = createSpinePopupOverlayRuntime({
      popupId: "free-game",
      layer: {
        id: "sparkles",
        kind: "spine",
        order: 2,
        resource: "sparkles",
        transform: { x: 1, y: 2, scale: 1.5, rotation: 0 },
        playback: {
          mode: "segmented-animations",
          startAnimation: "start",
          loopAnimation: "loop",
          endAnimation: "end",
        },
      },
      resource: {
        kind: "spine",
        resource: {
          skeleton: { skeleton: { spine: "4.2.0" } },
          atlasText: "",
          textureUrls: {},
        },
      },
      spinePlayerFactory: () => player,
    });

    await runtime.init();
    runtime.start();
    expect(init).toHaveBeenCalledOnce();
    expect(runtime.container.visible).toBe(true);
    expect(play).toHaveBeenLastCalledWith({
      animationName: "start",
      loop: false,
    });

    runtime.update(0.25);
    expect(play).toHaveBeenLastCalledWith({
      animationName: "loop",
      loop: true,
    });
    runtime.applySegment("loop");
    expect(play).toHaveBeenCalledTimes(2);
    runtime.applySegment("end");
    runtime.applySegment("end");
    expect(play).toHaveBeenLastCalledWith({
      animationName: "end",
      loop: false,
    });
    expect(play).toHaveBeenCalledTimes(3);
    runtime.update(0.1);
    runtime.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("runs segmented VNI overlays and requests their authored end", async () => {
    const display = new Container();
    const player = {
      init: vi.fn(),
      getDisplayObject: vi.fn(() => display),
      play: vi.fn(),
      setLoop: vi.fn(),
      requestSegmentedPlaybackEnd: vi.fn(),
      update: vi.fn(),
      destroy: vi.fn(),
    };
    const runtime = createSpinePopupOverlayRuntime({
      popupId: "free-game",
      layer: {
        id: "glow",
        kind: "vni",
        order: 1,
        resource: "glow",
        transform: { x: 4, y: 5, scale: 1, rotation: -10 },
        playback: {
          mode: "segmented",
          loopStartTime: 1,
          loopEndTime: 2,
          keepParticlesAlive: true,
        },
      },
      resource: {
        kind: "vni",
        project: { stage: { width: 200, height: 100 } },
        assetUrls: {},
      } as never,
      vniPlayerFactory: () => player as never,
    });

    await runtime.init();
    expect(display.pivot).toMatchObject({ x: 100, y: 50 });
    runtime.start();
    expect(player.play).toHaveBeenCalledWith({
      mode: "segmented",
      loopStart: { unit: "time", at: 1 },
      loopEnd: { unit: "time", at: 2 },
      keepParticlesAlive: true,
    });
    runtime.update(0.2);
    expect(player.update).toHaveBeenCalledWith(0.2);
    runtime.applySegment("loop");
    expect(player.requestSegmentedPlaybackEnd).not.toHaveBeenCalled();
    runtime.applySegment("end");
    expect(player.requestSegmentedPlaybackEnd).toHaveBeenCalledOnce();
    runtime.destroy();
    expect(player.destroy).toHaveBeenCalledOnce();
  });
});

function systemTextOverlay() {
  return {
    id: "heading",
    kind: "text" as const,
    name: "heading",
    defaultText: "READY",
    order: 4,
    alpha: 0.6,
    transform: { x: 0, y: -100, scale: 1, rotation: 0 },
    anchor: { x: 0.5, y: 0.5 },
    style: {
      fontSize: 48,
      letterSpacing: 0,
      fill: { kind: "solid" as const, color: "#ffffff" },
      arcDegrees: 0,
    },
    visibleSegments: ["start", "loop"] as const,
  };
}
