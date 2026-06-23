// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

const playerMock = vi.hoisted(() => {
  const instances: MockVNIPlayer[] = [];

  class MockVNIPlayer {
    readonly destroy = vi.fn();
    readonly init = vi.fn(async () => Promise.resolve());
    readonly isPlaying = vi.fn(() => false);
    readonly play = vi.fn();
    readonly pause = vi.fn();
    readonly restart = vi.fn();
    readonly setLoop = vi.fn();
    readonly getLoop = vi.fn(() => true);
    readonly getTime = vi.fn(() => 0);
    readonly seek = vi.fn();
    readonly requestSegmentedPlaybackEnd = vi.fn();
    readonly getPlaybackState = vi.fn(() => ({
      mode: "timeline",
      phase: "idle",
      currentTime: 0,
      isPlaying: false,
      isDrainingParticles: false,
      liveParticleCount: 0,
      loopIndex: 0,
      keepParticlesAlive: true,
    }));

    constructor(readonly options: unknown) {
      instances.push(this);
    }
  }

  return { instances, MockVNIPlayer };
});

vi.mock("@slotclientengine/vnicore/pixi", () => ({
  VNIPlayer: playerMock.MockVNIPlayer,
}));

afterEach(() => {
  vi.resetModules();
  document.body.innerHTML = "";
  playerMock.instances.length = 0;
});

describe("anieditorv5viewer main", () => {
  it("initializes VNIPlayer and destroys the old player on project switch", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    expect(playerMock.instances).toHaveLength(1);
    expect(playerMock.instances[0].init).toHaveBeenCalledTimes(1);

    const select = document.querySelector<HTMLSelectElement>(
      'select[aria-label="V5G project"]',
    );
    expect(select).not.toBeNull();
    if (!select) throw new Error("Missing project select.");

    select.value = "bigwin-runtime-50";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(playerMock.instances).toHaveLength(2);
    expect(playerMock.instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(playerMock.instances[1].init).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("wires segmented playback controls to VNIPlayer", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    const player = playerMock.instances[0];
    const loopStart = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop start seconds"]',
    );
    const loopEnd = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop end seconds"]',
    );
    const keepParticles = document.querySelector<HTMLInputElement>(
      'input[aria-label="维持粒子活动"]',
    );
    const startButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "开始",
    );
    const endButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "结束",
    );

    expect(loopStart).not.toBeNull();
    expect(loopEnd).not.toBeNull();
    expect(keepParticles?.checked).toBe(true);
    expect(startButton).toBeDefined();
    expect(endButton).toBeDefined();
    if (
      !loopStart ||
      !loopEnd ||
      !keepParticles ||
      !startButton ||
      !endButton
    ) {
      throw new Error("Missing advanced playback controls.");
    }

    loopStart.value = "2.5";
    loopStart.dispatchEvent(new Event("input", { bubbles: true }));
    loopEnd.value = "3";
    loopEnd.dispatchEvent(new Event("input", { bubbles: true }));
    keepParticles.checked = false;
    keepParticles.dispatchEvent(new Event("change", { bubbles: true }));
    startButton.click();

    expect(player.play).toHaveBeenCalledWith({
      mode: "segmented",
      loopStart: { unit: "time", at: 2.5 },
      loopEnd: { unit: "time", at: 3 },
      keepParticlesAlive: false,
    });

    player.getPlaybackState.mockReturnValue({
      mode: "segmented",
      phase: "loop",
      currentTime: 3,
      isPlaying: true,
      isDrainingParticles: false,
      liveParticleCount: 12,
      loopIndex: 0,
      keepParticlesAlive: false,
    });
    startButton.click();
    expect(endButton.disabled).toBe(false);
    endButton.click();
    expect(player.requestSegmentedPlaybackEnd).toHaveBeenCalledTimes(1);
  });

  it("blocks invalid segmented times before calling runtime", async () => {
    document.body.innerHTML = '<div id="app"></div>';

    await import("../src/main");
    await Promise.resolve();
    await Promise.resolve();

    const player = playerMock.instances[0];
    const loopStart = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop start seconds"]',
    );
    const loopEnd = document.querySelector<HTMLInputElement>(
      'input[aria-label="segmented loop end seconds"]',
    );
    const startButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "开始",
    );
    const error = document.querySelector(".advanced-error");

    if (!loopStart || !loopEnd || !startButton || !error) {
      throw new Error("Missing advanced playback controls.");
    }

    loopStart.value = "4";
    loopStart.dispatchEvent(new Event("input", { bubbles: true }));
    loopEnd.value = "3";
    loopEnd.dispatchEvent(new Event("input", { bubbles: true }));
    startButton.click();

    expect(startButton.disabled).toBe(true);
    expect(error.textContent).toContain("loopStart");
    expect(player.play).not.toHaveBeenCalled();
  });
});
