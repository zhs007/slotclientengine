import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { RenderReelSet, createRenderNode } from "../../src/index.js";
import {
  createBasicLayout,
  createBasicRegistry,
  createBasicReels,
} from "./helpers.js";

describe("RenderReelSet ReelSpin", () => {
  it("rolls columns concurrently and resolves after exact landing", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const stale = spin.getSymbol({ x: 0, y: 0 });
    const first = spin.roll(
      0,
      { symbols: [2, 1, 2], values: [7, null, null] },
      { durationMs: 100, minimumSpinCycles: 1 },
    );
    const second = spin.roll(
      1,
      { symbols: [1, 2, 1] },
      { durationMs: 150, minimumSpinCycles: 1 },
    );
    expect(() => spin.getSymbol({ x: 0, y: 0 })).toThrow(/before.*landed/);
    expect(() => stale.setState("normal")).toThrow(/stale/);
    expect(() => spin.roll(0, { symbols: [1, 1, 1] })).toThrow(/active spin/);

    spin.update(0.1);
    await first;
    expect(spin.getSymbol({ x: 0, y: 0 }).code).toBe(2);
    expect(spin.getSymbol({ x: 0, y: 0 }).getValue()).toBe(7);
    expect(() => spin.getSymbol({ x: 1, y: 0 })).toThrow(/before.*landed/);
    spin.update(0.05);
    await second;
    expect(spin.getVisibleScene()).toEqual([
      [2, 1, 2],
      [1, 2, 1],
    ]);
  });

  it("starts targetless, settles explicitly, cancels, and mounts reel nodes", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const view = new Container();
    const node = createRenderNode({ view, destroy: () => view.destroy() });
    const reel = spin.getReel(0);
    reel.add(node, 3);
    expect(view.parent).not.toBeNull();

    spin.start(0);
    spin.update(0.2);
    const settled = spin.settle(
      0,
      { symbols: [2, 2, 1] },
      { durationMs: 100, minimumSpinCycles: 1 },
    );
    spin.update(1);
    await settled;
    expect(spin.getVisibleScene()[0]).toEqual([2, 2, 1]);
    reel.remove(node);

    spin.start(1);
    spin.update(0.1);
    spin.cancel(1);
    expect(spin.getSymbol({ x: 1, y: 0 })).toBeDefined();
  });

  it("validates targets and rejects aborted targeted motion", async () => {
    const spin = createSpin();
    expect(() => spin.roll(0, { symbols: [1] })).toThrow(/length must be 3/);
    spin.start(0);
    await expect(spin.settle(1, { symbols: [1, 2, 1] })).rejects.toThrow(
      /without targetless rolling/,
    );
    spin.cancel(0);

    const controller = new AbortController();
    const rolling = spin.roll(
      0,
      { symbols: [2, 1, 2] },
      { signal: controller.signal },
    );
    spin.update(0.05);
    controller.abort();
    await expect(rolling).rejects.toThrow(/cancelled/);
    expect(spin.getSymbol({ x: 0, y: 0 })).toBeDefined();
  });

  it("rejects pending targeted motion when destroyed", async () => {
    const spin = createSpin();
    const rolling = spin.roll(0, { symbols: [2, 1, 2] });
    spin.destroy({ children: true });
    await expect(rolling).rejects.toThrow(/destroyed/);
  });

  it("owns area layers, symbol positions, and interrupts presentation before spin", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();
    expect(area.getSymbol({ x: 1, y: 2 }).getPosition()).toEqual({
      x: 24.5,
      y: 30,
    });
    const view = new Container();
    const node = createRenderNode({ view, destroy: () => view.destroy() });
    area.getLayer("win").add(node);
    let continued = false;
    const presentation = area.present(async (context) => {
      await context.delay(1);
      continued = true;
    });

    area.spin.start();
    await presentation;
    expect(continued).toBe(false);
    expect(view.parent).toBeNull();
    area.getLayer("win").remove(node);
    node.destroy();
    area.spin.cancel();
  });

  it("interrupts awaitable symbol playback when area spin takes priority", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();
    let continued = false;
    const presentation = area.present(async () => {
      await area.getSymbol({ x: 0, y: 0 }).playState("win", {
        completion: "once-complete",
        transitionMode: "immediate",
      });
      continued = true;
    });

    area.spin.start();
    await presentation;
    expect(continued).toBe(false);
    area.spin.cancel();
  });
});

function createSpin(): RenderReelSet {
  return new RenderReelSet({
    reels: createBasicReels(),
    registry: createBasicRegistry(),
    layout: createBasicLayout(),
    reelSpin: {
      direction: "backward",
      durationMs: 100,
      speedSymbolsPerSecond: 100,
      minimumSpinCycles: 1,
    },
  });
}
