import { describe, expect, it, vi } from "vitest";
import type { Texture } from "pixi.js";
import { VNIPlayerLoadedResources } from "../../src/pixi/vni-player-loaded-resources";

describe("VNIPlayerLoadedResources", () => {
  it("destroys owned textures only after the final retained reference", () => {
    const destroy = vi.fn();
    const texture = { destroy } as unknown as Texture;
    const resources = new VNIPlayerLoadedResources(
      new Map([["asset", texture]]),
      new Set([texture]),
    );

    resources.retain();
    resources.retain();
    resources.release();
    resources.release();
    expect(destroy).not.toHaveBeenCalled();
    resources.release();
    expect(destroy).toHaveBeenCalledWith(true);
    resources.release();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(() => resources.retain()).toThrow("released");
  });
});
