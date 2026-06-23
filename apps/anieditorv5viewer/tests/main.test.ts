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
});
