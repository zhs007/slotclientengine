import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { RenderReelSet } from "../../src/reel/index.js";
import { createRenderNode } from "../../src/symbol/index.js";
import {
  createBasicLayout,
  createBasicRegistry,
  createBasicReels,
} from "../reel/helpers.js";

describe("SymbolRender", () => {
  it("directly changes state, mounts stable nodes, clones, and enforces ownership", () => {
    const area = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    area.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const symbol = area.getSymbol({ x: 0, y: 0 });
    symbol.setState("win", "immediate");
    expect(area.getVisibleSymbolStateSnapshot(0, 0).requestedState).toBe("win");

    const view = new Container();
    const node = createRenderNode({ view, destroy: () => view.destroy() });
    symbol.add(node, { layer: "overlay", order: 2 });
    expect(view.parent).not.toBeNull();
    symbol.setState("normal", "immediate");
    expect(view.parent).not.toBeNull();
    symbol.remove(node);
    expect(view.parent).toBeNull();

    const clone = symbol.clone();
    expect(clone).not.toBe(symbol);
    expect(clone.code).toBe(symbol.code);
    symbol.add(clone);
    symbol.remove(clone);
    clone.destroy();
    expect(() => clone.setState("normal")).toThrow(/destroyed|stale/);
    expect(() => symbol.destroy()).toThrow(/Borrowed/);
    expect(area.getSymbol({ x: 0, y: 0 }).code).toBe(1);
  });

  it("does not rebind a stale facade to a replacement at the same position", () => {
    const area = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    area.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const old = area.getSymbol({ x: 0, y: 0 });
    area
      .prepareVisibleOccurrenceReplacement({
        x: 0,
        y: 0,
        outputCode: 2,
        outputPresentationValue: null,
      })
      .commit();
    expect(area.getSymbol({ x: 0, y: 0 }).code).toBe(2);
    expect(() => old.setState("normal")).toThrow(/stale/);
  });

  it("detaches but does not destroy borrowed attachments with the host", () => {
    const area = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    area.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const view = new Container();
    const node = createRenderNode({ view, destroy: () => view.destroy() });
    area.getSymbol({ x: 0, y: 0 }).add(node);

    area.destroy({ children: true });

    expect(view.parent).toBeNull();
    expect(view.destroyed).toBe(false);
    node.destroy();
    expect(view.destroyed).toBe(true);
  });
});
