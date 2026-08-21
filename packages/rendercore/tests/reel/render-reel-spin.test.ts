import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  RenderReelSet,
  createAreaSpinFunction,
  createReelSpinSessionController,
  createRenderObject,
} from "../../src/index.js";
import {
  createBasicLayout,
  createBasicRegistry,
  createBasicReels,
} from "./helpers.js";

describe("RenderReelSet ReelSpin", () => {
  it("replaces settled symbols and preflights mapped group values", () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const previous = spin.getSymbol({ x: 0, y: 0 });
    const replaced = spin.replaceSymbol({ x: 0, y: 0 }, { code: 2, value: 7 });
    expect(replaced.code).toBe(2);
    expect(replaced.getValue()).toBe(7);
    expect(() => previous.getValue()).toThrow(/stale/);

    const group = spin.getSymbols([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(() => group.setValues([9, 0])).toThrow(/positive safe integer/);
    expect(group.symbols.map((symbol) => symbol.getValue())).toEqual([7, null]);
    group.setValues([9, 11]);
    expect(group.symbols.map((symbol) => symbol.getValue())).toEqual([9, 11]);
  });

  it("exposes an additive active reel session that lands to SymbolGroups", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const controller = createReelSpinSessionController({
      reels: spin,
      columns: 2,
      rows: 3,
    });
    const session = controller.start();
    expect(session.getPendingReels().map((reel) => reel.x)).toEqual([0, 1]);
    const first = session
      .getReel(0)
      .land({ symbols: [2, 2, 1] }, { durationMs: 100, minimumSpinCycles: 1 });
    spin.update(0.1);
    expect((await first).symbols.map((symbol) => symbol.code)).toEqual([
      2, 2, 1,
    ]);
    expect(session.getPendingReels().map((reel) => reel.x)).toEqual([1]);
    const second = session
      .getReel(1)
      .land({ symbols: [1, 1, 2] }, { durationMs: 100, minimumSpinCycles: 1 });
    spin.update(0.1);
    await second;
    expect(controller.getActive()).toBeNull();
    expect(() => session.getReel(1)).toThrow(/not pending/);
  });
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

  it("lands ReelSpin on the shared empty symbol", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const landing = spin.roll(
      0,
      { symbols: [-1, 1, 2], values: [null, null, null] },
      { durationMs: 100, minimumSpinCycles: 1 },
    );
    spin.update(0.1);
    await landing;
    expect(spin.getSymbol({ x: 0, y: 0 })).toMatchObject({
      code: -1,
      kind: "empty",
    });
    await expect(
      spin.roll(
        0,
        { symbols: [-1, 1, 2], values: [2, null, null] },
        { durationMs: 100 },
      ),
    ).rejects.toThrow(/must have a null/);
    await expect(
      spin.roll(
        0,
        { symbols: [-1, 1, 2], states: ["normal", "normal", "normal"] },
        { durationMs: 100 },
      ),
    ).rejects.toThrow(/cannot have a landing state/);
  });

  it("starts targetless, settles explicitly, cancels, and mounts reel nodes", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const view = new Container();
    const node = createRenderObject({ view, destroy: () => view.destroy() });
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
    const node = createRenderObject({ view, destroy: () => view.destroy() });
    area.getLayer("win").addAt(node, {
      anchor: area.getLayer("top").getAnchor({ x: 12, y: 14 }),
      offset: { x: 3, y: -4 },
    });
    expect(area.getLayer("win").resolveAnchor(node.getAnchor())).toEqual({
      x: 15,
      y: 10,
    });
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

  it("resolves a repeating presentation after its first cycle and keeps it active", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();
    let cycles = 0;
    const firstCycle = area.present(
      async (context) => {
        cycles += 1;
        await context.delay(0.1);
      },
      { repeat: true },
    );

    spin.update(0.1);
    await firstCycle;
    expect(cycles).toBe(2);
    spin.update(0.1);
    await Promise.resolve();
    await Promise.resolve();
    expect(cycles).toBe(3);

    area.spin.start();
    area.spin.cancel();
  });

  it("fails explicitly when a repeating presentation fails after its first cycle", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    let cycles = 0;
    const firstCycle = spin.getArea().present(
      async (context) => {
        cycles += 1;
        await context.delay(0.1);
        if (cycles === 2) throw new Error("repeat failed");
      },
      { repeat: true },
    );

    spin.update(0.1);
    await firstCycle;
    spin.update(0.1);
    await Promise.resolve();
    await Promise.resolve();
    expect(() => spin.update(0)).toThrow("repeat failed");
  });

  it("owns scoped nodes, resolves group anchors, and moves with the reel clock", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();
    const group = area.getSymbols([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
    ]);
    const view = new Container();
    let destroys = 0;
    const node = createRenderObject({
      view,
      destroy: () => {
        destroys += 1;
        view.destroy();
      },
    });
    const presentation = area.present(async (context) => {
      await context.withNode(
        area.getLayer("win"),
        node,
        {
          anchor: group.getAnchor({ align: "center" }),
          ownership: "destroy",
        },
        async () => {
          expect(view.position.x).toBeCloseTo(16);
          expect(view.position.y).toBeCloseTo(18);
          const motion = context.move(node, {
            to: area.getAnchor({ x: 30, y: 40 }),
            durationSeconds: 0.1,
          });
          spin.update(0.1);
          await motion;
          expect(view.position.x).toBeCloseTo(30);
          expect(view.position.y).toBeCloseTo(40);
          const properties = context.animate(node, {
            opacity: 0.25,
            scale: { x: 1.5, y: -0.5 },
            rotationDegrees: 180,
            durationSeconds: 0.1,
          });
          spin.update(0.1);
          await properties;
          expect(view.alpha).toBe(0.25);
          expect(view.scale.x).toBe(1.5);
          expect(view.scale.y).toBe(-0.5);
          expect(view.angle).toBeCloseTo(180);
        },
      );
    });

    await presentation;
    expect(view.parent).toBeNull();
    expect(destroys).toBe(1);
  });

  it("rejects transferring a borrowed RenderObject before mounting it", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();
    const view = new Container();
    const borrowed = createRenderObject({
      view,
      owned: false,
      destroy: () => undefined,
    });

    await expect(
      area.present((context) =>
        context.transfer(area.getLayer("win"), borrowed, {
          ownership: "detach",
          from: area.getAnchor({ x: 0, y: 0 }),
          to: area.getAnchor({ x: 1, y: 1 }),
          durationSeconds: 0.1,
        }),
      ),
    ).rejects.toThrow(/Only an owned RenderObject/);
    expect(view.parent).toBeNull();
  });

  it("resolves symbol, group, and area anchors into area-local points", () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();

    expect(
      area.resolveAnchor(area.getSymbol({ x: 1, y: 2 }).getAnchor()),
    ).toEqual({ x: 24.5, y: 30 });
    expect(
      area.resolveAnchor(
        area
          .getSymbols([
            { x: 0, y: 0 },
            { x: 1, y: 2 },
          ])
          .getAnchor({ align: "center" }),
      ),
    ).toEqual({ x: 16, y: 18 });
    expect(area.resolveAnchor(area.getAnchor({ x: 30, y: 40 }))).toEqual({
      x: 30,
      y: 40,
    });
    const stableCell = area.getCellAnchor({ x: 1, y: 2 });
    expect(area.resolveAnchor(stableCell)).toEqual({ x: 24.5, y: 30 });
    spin.start(1);
    expect(area.resolveAnchor(stableCell)).toEqual({ x: 24.5, y: 30 });
    expect(() => area.getSymbol({ x: 1, y: 2 })).toThrow(/before.*landed/);
    spin.cancel(1);

    const staleAnchor = area.getSymbol({ x: 0, y: 0 }).getAnchor();
    spin.replaceSymbol({ x: 0, y: 0 }, { code: 2 });
    expect(() => area.resolveAnchor(staleAnchor)).toThrow(/stale/);
    expect(() =>
      area.resolveAnchor(Object.freeze({ kind: "render-anchor" })),
    ).toThrow(/active RenderCore runtime/);

    spin.destroy();
    expect(() => area.resolveAnchor(area.getAnchor({ x: 0, y: 0 }))).toThrow(
      /destroyed/,
    );
  });

  it("temporarily moves a settled Symbol to a public layer and restores it before spin", () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();
    const symbol = area.getSymbol({ x: 0, y: 0 });
    const movement = area.getLayer("win").moveHere(symbol, { order: 7 });
    expect(area.getLayer("win").resolveAnchor(symbol.getAnchor())).toEqual({
      x: 7.5,
      y: 6,
    });

    spin.start(0);
    expect(() => symbol.getValue()).toThrow(/stale/);
    movement.restore();
    spin.cancel(0);
  });

  it("preflights a SymbolGroup before mutating any member", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();
    expect(() =>
      area.getSymbols([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toThrow(/Duplicate/);
    const group = area.getSymbols([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(() => group.setState("missing")).toThrow();
    expect(spin.getVisibleSymbolStateSnapshot(0, 0).requestedState).toBe(
      "normal",
    );
    expect(spin.getVisibleSymbolStateSnapshot(1, 0).requestedState).toBe(
      "normal",
    );
    expect(() =>
      group.playState("win", {
        completion: "next-loop-complete",
      }),
    ).toThrow(/expected "loop"/);
    expect(spin.getVisibleSymbolStateSnapshot(0, 0).requestedState).toBe(
      "normal",
    );
    expect(spin.getVisibleSymbolStateSnapshot(1, 0).requestedState).toBe(
      "normal",
    );
  });

  it("cleans scoped nodes when spin interrupts presentation", async () => {
    const spin = createSpin();
    spin.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    const area = spin.getArea();
    const view = new Container();
    let destroys = 0;
    const node = createRenderObject({
      view,
      destroy: () => {
        destroys += 1;
        view.destroy();
      },
    });
    const presentation = area.present(async (context) => {
      await context.withNode(
        area.getLayer("win"),
        node,
        { ownership: "destroy" },
        () => context.delay(1),
      );
    });

    area.spin.start();
    await presentation;
    expect(view.parent).toBeNull();
    expect(destroys).toBe(1);
    area.spin.cancel();
  });

  it("creates a reusable staggered landing function", async () => {
    const delays: number[] = [];
    const calls: string[] = [];
    const fn = createAreaSpinFunction({
      landOrder: "right-to-left",
      landStaggerSeconds: 0.12,
    });
    await fn.land(
      {
        reels: {
          start: () => undefined,
          cancel: () => undefined,
          roll: async (x) => {
            calls.push(`roll:${x}`);
          },
          settle: async (x) => {
            calls.push(`settle:${x}`);
          },
          getReel: () => ({ add: () => undefined, remove: () => undefined }),
          getSymbol: () => {
            throw new Error("unused");
          },
          getSymbols: () => {
            throw new Error("unused");
          },
          getCellAnchor: () => {
            throw new Error("unused");
          },
          resolveAnchor: () => {
            throw new Error("unused");
          },
        },
        columns: 3,
        wasStarted: true,
        delay: async (seconds) => {
          delays.push(seconds);
        },
      },
      { scene: [[1], [2], [3]] },
    );
    expect(calls).toEqual(["settle:2", "settle:1", "settle:0"]);
    expect(delays).toEqual([0.12, 0.12]);
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
