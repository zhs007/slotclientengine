import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { RenderReelSet } from "../../src/reel/index.js";
import { createRenderObject } from "../../src/presentation/index.js";
import {
  createBasicLayout,
  createBasicRegistry,
  createBasicReels,
} from "../reel/helpers.js";

describe("SymbolHandle", () => {
  it("drives an owned clone state only while it is mounted to an area layer", async () => {
    const area = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    area.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const clone = area.getSymbol({ x: 0, y: 0 }).clone();
    const top = area.getLayer("top");
    const playback = clone.playState("appear", {
      transitionMode: "immediate",
      completion: "once-complete",
    });
    let completed = false;
    void playback.then(() => {
      completed = true;
    });

    area.update(1);
    await Promise.resolve();
    expect(completed).toBe(false);
    top.add(clone);
    area.update(0.2);
    top.remove(clone);
    area.update(1);
    await Promise.resolve();
    expect(completed).toBe(false);
    top.add(clone);
    area.update(0.22);
    await expect(playback).resolves.toBeUndefined();

    top.remove(clone);
    clone.destroy();
    area.destroy({ children: true });
  });

  it("does not double-update a borrowed reel symbol moved to an area layer", async () => {
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
    const moved = area.getLayer("top").moveHere(symbol);
    const playback = symbol.playState("appear", {
      transitionMode: "immediate",
      completion: "once-complete",
    });
    let completed = false;
    void playback.then(() => {
      completed = true;
    });

    area.update(0.21);
    await Promise.resolve();
    expect(completed).toBe(false);
    area.update(0.21);
    await expect(playback).resolves.toBeUndefined();

    moved.restore();
    area.destroy({ children: true });
  });

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
    const node = createRenderObject({ view, destroy: () => view.destroy() });
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
    area.replaceSymbol({ x: 0, y: 0 }, { code: 2, value: null });
    expect(area.getSymbol({ x: 0, y: 0 }).code).toBe(2);
    expect(() => old.setState("normal")).toThrow(/stale/);
  });

  it("does not partially replace a standard-reel batch when preflight fails", () => {
    const area = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    area.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const before = area.getVisibleScene();
    expect(() =>
      area.replaceSymbols([
        { position: { x: 0, y: 0 }, target: { code: 2 } },
        { position: { x: 1, y: 0 }, target: { code: 999 } },
      ]),
    ).toThrow();
    expect(area.getVisibleScene()).toEqual(before);
  });

  it("returns a lightweight empty SymbolHandle for -1", () => {
    const area = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    area.resetToVisibleScene([
      [-1, 2, 1],
      [2, 1, 2],
    ]);
    const empty = area.getSymbol({ x: 0, y: 0 });
    const positionBefore = empty.getPosition();
    expect(empty).toMatchObject({
      code: -1,
      symbol: "__empty__",
      kind: "empty",
    });
    expect(empty.getValue()).toBeNull();
    empty.setValue(null);
    expect(() => empty.setValue(1)).toThrow(/must be null/);
    expect(() => empty.setState("normal")).toThrow(/does not support/);
    empty.setPosition({ x: 123, y: 456 });
    empty.setVisible(false);
    expect(empty.getPosition()).toEqual(positionBefore);
    expect(area.getVisibleSymbolGeometrySnapshot(0, 0)).toMatchObject({
      centerX: positionBefore.x,
      centerY: positionBefore.y,
    });

    const view = new Container();
    const node = createRenderObject({ view, destroy: () => view.destroy() });
    empty.add(node);
    expect(view.parent).not.toBeNull();
    empty.remove(node);
    expect(view.parent).toBeNull();

    area.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    expect(() => empty.getPosition()).toThrow(/stale/);
  });

  it("replaces between a real and empty SymbolHandle", () => {
    const area = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    area.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const real = area.getSymbol({ x: 0, y: 0 });
    const empty = area.replaceSymbol({ x: 0, y: 0 }, { code: -1 });
    expect(empty).toMatchObject({ code: -1, kind: "empty" });
    expect(() => real.getValue()).toThrow(/stale/);
    expect(() =>
      area.replaceSymbol({ x: 0, y: 0 }, { code: -1, value: 2 }),
    ).toThrow(/must have a null/);
    expect(
      area.replaceSymbol({ x: 0, y: 0 }, { code: 2, value: 7 }),
    ).toMatchObject({ code: 2, kind: "symbol" });
    expect(() => empty.getPosition()).toThrow(/stale/);
    expect(area.getSymbol({ x: 0, y: 0 }).getValue()).toBe(7);
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
    const node = createRenderObject({ view, destroy: () => view.destroy() });
    area.getSymbol({ x: 0, y: 0 }).add(node);

    area.destroy({ children: true });

    expect(view.parent).toBeNull();
    expect(view.destroyed).toBe(false);
    node.destroy();
    expect(view.destroyed).toBe(true);
  });
});
