import { describe, expect, it, vi } from "vitest";
import type { RenderObjectLayer } from "../../src/presentation/index.js";
import { resolveSceneLayoutRenderLayerRef } from "../../src/scene-layout/render-layer-ref.js";

describe("scene layout render layer refs", () => {
  it("routes stable, area, canonical node, placement and legacy node refs", () => {
    const layer = {} as RenderObjectLayer;
    const stable = vi.fn(() => layer);
    const area = vi.fn(() => layer);
    const node = vi.fn(() => layer);
    const resolve = (ref: string) =>
      resolveSceneLayoutRenderLayerRef(ref, { stable, area, node });

    expect(resolve("reel")).toBe(layer);
    expect(stable).toHaveBeenLastCalledWith("reel");
    expect(resolve("main.top")).toBe(layer);
    expect(area).toHaveBeenLastCalledWith("main", "top");
    expect(resolve("background")).toBe(layer);
    expect(node).toHaveBeenLastCalledWith("background", "child");
    expect(resolve("background.after")).toBe(layer);
    expect(node).toHaveBeenLastCalledWith("background", "after");
    expect(resolve("node:legacy.node:before")).toBe(layer);
    expect(node).toHaveBeenLastCalledWith("legacy.node", "before");
  });

  it("rejects malformed and ambiguous refs without fallback", () => {
    const resolvers = {
      stable: vi.fn(() => ({}) as RenderObjectLayer),
      area: vi.fn(() => ({}) as RenderObjectLayer),
      node: vi.fn(() => ({}) as RenderObjectLayer),
    };
    for (const ref of [
      "",
      "legacy.node",
      "node:",
      "node:bg:middle",
      "bg.unknown",
    ])
      expect(() => resolveSceneLayoutRenderLayerRef(ref, resolvers)).toThrow();
  });
});
