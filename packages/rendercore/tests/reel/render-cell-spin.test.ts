import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  RenderReel,
  createCellSpinSessionController,
  createRenderCellSpin,
} from "../../src/reel/index.js";
import { createRenderObject } from "../../src/presentation/index.js";
import { createBasicRegistry, createBasicReels } from "./helpers.js";
import { observeSpinLifecycle } from "../../src/reel/spin-lifecycle.js";

describe("RenderCellSpin", () => {
  it("uses only -1 as a hole marker", () => {
    const spin = createRenderCellSpin({
      reels: createBasicReels(),
      registry: createBasicRegistry(),
      initialScene: [
        [-1, 1],
        [2, 1],
      ],
      cellWidth: 15,
      cellHeight: 12,
    });
    expect(spin.getSymbol({ x: 0, y: 0 })).toMatchObject({
      code: -1,
      symbol: "__empty__",
      kind: "empty",
    });
    expect(() =>
      createRenderCellSpin({
        reels: createBasicReels(),
        registry: createBasicRegistry(),
        initialScene: [
          [-2, 1],
          [2, 1],
        ],
        cellWidth: 15,
        cellHeight: 12,
      }),
    ).toThrow(/must be -1 or/);
  });

  it("replaces a landed cell and supports an active cell session", async () => {
    const spin = createSpin();
    const previous = spin.getSymbol({ x: 0, y: 0 });
    expect(
      spin.replaceSymbol({ x: 0, y: 0 }, { code: 2, value: 7 }).getValue(),
    ).toBe(7);
    expect(() => previous.getValue()).toThrow(/stale/);

    const controller = createCellSpinSessionController(spin);
    const session = controller.start([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    const landed = session
      .getCell({ x: 0, y: 0 })
      .land({ code: 1 }, { durationMs: 100, minimumSpinCycles: 1 });
    spin.update(0.1);
    expect((await landed).code).toBe(1);
    expect(session.getPendingCells()).toHaveLength(1);
    session.cancel();
    expect(controller.getActive()).toBeNull();
  });

  it("uses the CellSpin start phase without changing the visible occurrence", () => {
    const spin = createSpin();
    const visibleBeforeSpin = spin.getSymbol({ x: 0, y: 0 }).code;

    spin.start({ x: 0, y: 0 }, { speedSymbolsPerSecond: 10, localPhaseY: 2 });
    spin.update(0);
    spin.cancel({ x: 0, y: 0 });

    expect(spin.getSymbol({ x: 0, y: 0 }).code).toBe(visibleBeforeSpin);
    expect(() => spin.start({ x: 0, y: 0 }, { localPhaseY: 0.5 })).toThrow(
      /localPhaseY.*safe integer/,
    );
  });

  it("replaces between a real and empty cell symbol", () => {
    const spin = createSpin();
    expect(spin.replaceSymbol({ x: 0, y: 0 }, { code: -1 })).toMatchObject({
      code: -1,
      kind: "empty",
    });
    expect(
      spin.replaceSymbol({ x: 0, y: 0 }, { code: 2, value: 5 }),
    ).toMatchObject({ code: 2, kind: "symbol" });
    expect(spin.getSymbol({ x: 0, y: 0 }).getValue()).toBe(5);
  });

  it("dims selected settled positions through the shared symbol-area contract", () => {
    const brightness = vi.spyOn(RenderReel.prototype, "setSlotBrightness");
    const reset = vi.spyOn(RenderReel.prototype, "resetSlotBrightness");
    const spin = createSpin();

    spin.setSymbolDimming(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      0.75,
    );
    expect(brightness.mock.calls.map(([, value]) => value)).toEqual([
      0.25, 0.25,
    ]);
    spin.replaceSymbol({ x: 1, y: 0 }, { code: -1 });
    spin.setSymbolDimming([{ x: 1, y: 0 }], 0.7);
    const emptyDimmingCalls = brightness.mock.calls.slice(-1);
    expect(emptyDimmingCalls[0]?.[1]).toBeCloseTo(0.3, 10);
    spin.clearSymbolDimming();
    expect(reset).toHaveBeenCalledTimes(4);
    expect(() => spin.setSymbolDimming([], 0.5)).toThrow(/must not be empty/);
    expect(() =>
      spin.setSymbolDimming(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        0.5,
      ),
    ).toThrow(/duplicate/);

    spin.start({ x: 0, y: 0 });
    expect(() => spin.setSymbolDimming([{ x: 1, y: 0 }], 0.5)).toThrow(
      /cells are active/,
    );
    spin.cancel({ x: 0, y: 0 });
    brightness.mockRestore();
    reset.mockRestore();
  });

  it("does not partially replace a batch when preflight fails", () => {
    const spin = createSpin();
    const before = [
      spin.getSymbol({ x: 0, y: 0 }).code,
      spin.getSymbol({ x: 1, y: 0 }).code,
    ];
    expect(() =>
      spin.replaceSymbols([
        { position: { x: 0, y: 0 }, target: { code: 2 } },
        { position: { x: 1, y: 0 }, target: { code: 999 } },
      ]),
    ).toThrow();
    expect([
      spin.getSymbol({ x: 0, y: 0 }).code,
      spin.getSymbol({ x: 1, y: 0 }).code,
    ]).toEqual(before);
  });

  it("transfers and drops occurrences with direct await APIs", async () => {
    const spin = createSpin();
    const previousTarget = spin.getSymbol({ x: 1, y: 0 });
    const transfer = spin.transferSymbols({
      transfers: [
        {
          source: { x: 0, y: 0 },
          target: { x: 1, y: 0 },
          sourceReplacement: { code: 2 },
        },
      ],
      durationMs: 100,
    });
    spin.update(0.1);
    await transfer;
    expect(spin.getSymbol({ x: 1, y: 0 }).code).toBe(1);
    expect(spin.getSymbol({ x: 0, y: 0 }).code).toBe(2);
    expect(() => previousTarget.getValue()).toThrow(/stale/);

    const holeSpin = createRenderCellSpin({
      reels: createBasicReels(),
      registry: createBasicRegistry(),
      initialScene: [
        [1, -1],
        [2, 1],
      ],
      cellWidth: 15,
      cellHeight: 12,
    });
    const drop = holeSpin.dropOccurrences({
      movements: [
        {
          kind: "existing",
          source: { x: 0, y: 0 },
          target: { x: 0, y: 1 },
          durationSeconds: 0.1,
        },
      ],
      values: [{ position: { x: 0, y: 1 }, value: 7 }],
    });
    holeSpin.update(0.1);
    await drop;
    expect(holeSpin.getSymbol({ x: 0, y: 0 })).toMatchObject({
      code: -1,
      kind: "empty",
    });
    expect(holeSpin.getSymbol({ x: 0, y: 1 }).code).toBe(1);
    expect(holeSpin.getSymbol({ x: 0, y: 1 }).getValue()).toBe(7);
  });

  it("rolls back CellSpin occurrence motion when aborted", async () => {
    const spin = createSpin();
    const controller = new AbortController();
    const transfer = spin.transferSymbols({
      transfers: [
        {
          source: { x: 0, y: 0 },
          target: { x: 1, y: 0 },
          sourceReplacement: null,
        },
      ],
      durationMs: 100,
      signal: controller.signal,
    });
    spin.update(0.05);
    controller.abort();
    await expect(transfer).rejects.toThrow(/aborted/);
    expect(spin.getSymbol({ x: 0, y: 0 }).code).toBe(1);
    expect(spin.getSymbol({ x: 1, y: 0 }).code).toBe(2);
  });
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

  it("groups concurrent CellSpin landings into one all-stopped event", async () => {
    const spin = createSpin();
    const events: string[] = [];
    const dispose = observeSpinLifecycle(spin, (event) => {
      events.push(
        event.lifecycle === "spin-started"
          ? event.lifecycle
          : event.lifecycle === "all-stopped" ||
              event.lifecycle === "spin-ended"
            ? `${event.lifecycle}:${event.unitCount}`
            : `${event.lifecycle}:${event.unit.x},${event.unit.y}`,
      );
    });
    const first = spin.roll(
      { x: 0, y: 0 },
      { code: 2 },
      { durationMs: 100, minimumSpinCycles: 1 },
    );
    const second = spin.roll(
      { x: 1, y: 0 },
      { code: 1 },
      { durationMs: 150, minimumSpinCycles: 1 },
    );

    spin.update(0.1);
    await first;
    expect(events).not.toContain("all-stopped:2");
    spin.update(0.05);
    await second;
    expect(events).toEqual([
      "spin-started",
      "started:0,0",
      "started:1,0",
      "stopped:0,0",
      "stopped:1,0",
      "all-stopped:2",
      "spin-ended:2",
    ]);

    events.length = 0;
    spin.start({ x: 0, y: 1 });
    spin.cancel({ x: 0, y: 1 });
    expect(events).toEqual(["spin-started", "started:0,1"]);
    dispose();
  });

  it("lands CellSpin on the shared empty symbol", async () => {
    const spin = createSpin();
    const landing = spin.roll(
      { x: 0, y: 0 },
      { code: -1 },
      { durationMs: 100, minimumSpinCycles: 1 },
    );
    spin.update(0.1);
    await landing;
    expect(spin.getSymbol({ x: 0, y: 0 })).toMatchObject({
      code: -1,
      kind: "empty",
    });
    await expect(
      spin.roll({ x: 0, y: 0 }, { code: -1, value: 2 }, { durationMs: 100 }),
    ).rejects.toThrow(/must have a null/);
  });

  it("starts targetless, settles explicitly, cancels, and supports cell nodes", async () => {
    const spin = createSpin();
    const view = new Container();
    const node = createRenderObject({ view, destroy: () => view.destroy() });
    const cell = spin.getCell({ x: 0, y: 1 });
    const stableCell = spin.getCellAnchor({ x: 0, y: 1 });
    expect(spin.resolveAnchor(stableCell)).toEqual({ x: 7.5, y: 18 });
    cell.add(node, 3);
    expect(view.parent).not.toBeNull();

    spin.start({ x: 0, y: 1 });
    spin.update(0.2);
    expect(spin.resolveAnchor(stableCell)).toEqual({ x: 7.5, y: 18 });
    expect(() => spin.getSymbol({ x: 0, y: 1 })).toThrow(/before.*landed/);
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
