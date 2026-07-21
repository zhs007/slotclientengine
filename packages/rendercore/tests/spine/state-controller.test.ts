import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import { SpineStateController } from "../../src/spine/state-controller.js";

const spec = {
  initialState: "BG",
  states: { BG: { animation: "BG" }, FG: { animation: "FG" } },
  transitions: [{ from: "BG", to: "FG", animation: "BG_FG" }],
};

function fakePlayer(play = vi.fn()): RendercoreSpinePlayer {
  return {
    view: new Container(),
    init: vi.fn(),
    play,
    update: vi.fn(() => ({ completed: false, events: [] })),
    reset: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("SpineStateController", () => {
  it("fails invalid lifecycle, unknown state and missing direct transitions", async () => {
    const player = fakePlayer();
    const controller = new SpineStateController({
      player,
      spec,
      createError: (message) => new Error(`controlled: ${message}`),
    });
    expect(() => controller.snapshot()).toThrow(/has not started/);
    expect(() => controller.request("FG")).toThrow(/has not started/);
    controller.start();
    expect(() => controller.start()).toThrow(/already started/);
    expect(() => controller.request("missing")).toThrow(/Unknown/);
    const pending = controller.request("FG");
    controller.updateCompleted(false);
    expect(controller.snapshot().phase).toBe("transitioning");
    expect(() => controller.request("BG")).toThrow(/already in progress/);
    controller.updateCompleted(true);
    await expect(pending).resolves.toBeUndefined();
    expect(controller.snapshot()).toEqual({
      stableState: "FG",
      targetState: null,
      phase: "stable",
    });
    expect(() => controller.request("BG")).toThrow(/No direct/);
    controller.destroy();
    controller.destroy();
    expect(() => controller.snapshot()).toThrow(/destroyed/);
  });

  it("rejects a pending request on destroy and propagates target-loop playback failure", async () => {
    const player = fakePlayer();
    const controller = new SpineStateController({
      player,
      spec,
      createError: (message) => new Error(message),
    });
    controller.start();
    const destroyed = controller.request("FG");
    controller.destroy("owner disposed");
    await expect(destroyed).rejects.toThrow(/owner disposed/);

    const play = vi.fn(
      ({ animationName }: { animationName: string; loop: boolean }) => {
        if (animationName === "FG") throw new Error("target loop failed");
      },
    );
    const failing = new SpineStateController({
      player: fakePlayer(play),
      spec,
      createError: (message) => new Error(message),
    });
    failing.start();
    const pending = failing.request("FG");
    expect(() => failing.updateCompleted(true)).toThrow(/target loop failed/);
    await expect(pending).rejects.toThrow(/target loop failed/);
    expect(failing.snapshot()).toEqual({
      stableState: "BG",
      targetState: null,
      phase: "stable",
    });
  });
});
