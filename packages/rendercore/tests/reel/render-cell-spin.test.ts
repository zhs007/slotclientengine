import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createRenderCellSpin } from "../../src/reel/index.js";
import { createRenderNode } from "../../src/symbol/index.js";
import { createBasicRegistry, createBasicReels } from "./helpers.js";

describe("RenderCellSpin", () => {
  it("rolls different cells concurrently and resolves after exact landing", async () => {
    const spin = createSpin();
    const held = spin.getSymbol({ x: 1, y: 1 });
    const previousFirst = spin.getSymbol({ x: 0, y: 0 });
    const first = spin.roll(
      { x: 0, y: 0 },
      { code: 2 },
      { durationMs: 100, minimumSpinCycles: 1 },
    );
    const second = spin.roll(
      { x: 1, y: 0 },
      { code: 1, value: 7 },
      { durationMs: 150, minimumSpinCycles: 1 },
    );
    expect(() => spin.getSymbol({ x: 0, y: 0 })).toThrow(/before.*landed/);
    expect(() => previousFirst.setState("normal")).toThrow(/stale/);
    expect(() => spin.roll({ x: 0, y: 0 }, { code: 1 })).toThrow(/active spin/);

    spin.update(0.1);
    await first;
    expect(spin.getSymbol({ x: 0, y: 0 }).code).toBe(2);
    expect(spin.getSymbol({ x: 1, y: 1 })).toBeDefined();
    held.setState("normal");
    spin.update(0.05);
    await second;
    expect(spin.getSymbol({ x: 1, y: 0 }).getValue()).toBe(7);
  });

  it("starts targetless, settles explicitly, cancels, and supports cell nodes", async () => {
    const spin = createSpin();
    const view = new Container();
    const node = createRenderNode({ view, destroy: () => view.destroy() });
    const cell = spin.getCell({ x: 0, y: 1 });
    cell.add(node, 3);
    expect(view.parent).not.toBeNull();

    spin.start({ x: 0, y: 1 });
    spin.update(0.2);
    const settled = spin.settle(
      { x: 0, y: 1 },
      { code: 1, state: "normal" },
      { durationMs: 100, minimumSpinCycles: 1 },
    );
    spin.update(1);
    await settled;
    expect(spin.getSymbol({ x: 0, y: 1 }).code).toBe(1);
    expect(view.parent).not.toBeNull();
    cell.remove(node);

    spin.start({ x: 1, y: 1 });
    spin.update(0.1);
    spin.cancel({ x: 1, y: 1 });
    expect(spin.getSymbol({ x: 1, y: 1 })).toBeDefined();
  });

  it("rejects an aborted roll and leaves a settled occurrence", async () => {
    const spin = createSpin();
    const controller = new AbortController();
    const rolling = spin.roll(
      { x: 0, y: 0 },
      { code: 2 },
      { signal: controller.signal },
    );
    spin.update(0.05);
    controller.abort();
    await expect(rolling).rejects.toThrow(/cancelled/);
    expect(spin.getSymbol({ x: 0, y: 0 })).toBeDefined();
  });

  it("does not consume targetless rolling when settle input is already aborted", async () => {
    const spin = createSpin();
    spin.start({ x: 0, y: 0 });
    const controller = new AbortController();
    controller.abort();
    await expect(
      spin.settle({ x: 0, y: 0 }, { code: 2 }, { signal: controller.signal }),
    ).rejects.toThrow(/already aborted/);
    expect(() => spin.start({ x: 0, y: 0 })).toThrow(/active spin/);
    spin.cancel({ x: 0, y: 0 });
  });
});

function createSpin() {
  return createRenderCellSpin({
    reels: createBasicReels(),
    registry: createBasicRegistry(),
    initialScene: [
      [1, 0],
      [2, 1],
    ],
    cellWidth: 15,
    cellHeight: 12,
  });
}
