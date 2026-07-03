import { Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  RenderSymbol,
  createDefaultSymbolStatePreset,
  createSymbolDefinitionFromPreset,
} from "../../src/symbol/index.js";
import { RenderSymbolPoolModel } from "../../src/reel/index.js";
import { createTestSymbolAnimationResolver } from "./helpers.js";

describe("RenderSymbolPool", () => {
  it("reuses symbols only within the same code bucket", () => {
    const pool = new RenderSymbolPoolModel({
      targetIdlePerCode: 2,
      maxIdlePerCode: 4,
      maxIdleTotal: 10,
    });
    const first = createSymbol(1, "A");
    const second = createSymbol(2, "B");

    pool.release(1, first);
    pool.release(2, second);

    expect(pool.acquire(1, () => createSymbol(1, "A"))).toBe(first);
    expect(pool.acquire(2, () => createSymbol(2, "B"))).toBe(second);
  });

  it("trims a code bucket from maxIdlePerCode back to targetIdlePerCode", () => {
    const pool = new RenderSymbolPoolModel({
      targetIdlePerCode: 2,
      maxIdlePerCode: 3,
      maxIdleTotal: 10,
    });
    const symbols = Array.from({ length: 4 }, () => createSymbol(1, "A"));
    const destroySpies = symbols.map((symbol) => vi.spyOn(symbol, "destroy"));

    for (const symbol of symbols) {
      pool.release(1, symbol);
    }

    expect(pool.getStats()).toEqual({
      totalIdle: 2,
      idlePerCode: { 1: 2 },
    });
    expect(destroySpies[0]).toHaveBeenCalledTimes(1);
    expect(destroySpies[1]).toHaveBeenCalledTimes(1);
    expect(destroySpies[2]).not.toHaveBeenCalled();
    expect(destroySpies[3]).not.toHaveBeenCalled();
  });

  it("trims the global idle pool by oldest release first", () => {
    const pool = new RenderSymbolPoolModel({
      targetIdlePerCode: 10,
      maxIdlePerCode: 10,
      maxIdleTotal: 3,
    });
    const symbols = [
      createSymbol(1, "A"),
      createSymbol(2, "B"),
      createSymbol(3, "C"),
      createSymbol(4, "D"),
    ];
    const destroySpies = symbols.map((symbol) => vi.spyOn(symbol, "destroy"));

    symbols.forEach((symbol, index) => pool.release(index + 1, symbol));

    expect(pool.getStats()).toEqual({
      totalIdle: 3,
      idlePerCode: { 2: 1, 3: 1, 4: 1 },
    });
    expect(destroySpies[0]).toHaveBeenCalledTimes(1);
    expect(destroySpies[1]).not.toHaveBeenCalled();
    expect(destroySpies[2]).not.toHaveBeenCalled();
    expect(destroySpies[3]).not.toHaveBeenCalled();
  });

  it("cleans display, state and animation residue before reuse", () => {
    const pool = new RenderSymbolPoolModel({
      targetIdlePerCode: 2,
      maxIdlePerCode: 4,
      maxIdleTotal: 10,
    });
    const symbol = createSymbol(1, "A");
    symbol.position.set(12, 34);
    symbol.scale.set(0.75);
    symbol.init();
    symbol.alpha = 0.2;
    symbol.visible = false;
    symbol.mask = new Sprite(Texture.WHITE);
    symbol.filters = [];
    symbol.requestState("win");
    symbol.update(0.2);
    expect(symbol.overlayLayer.children.length).toBeGreaterThan(0);

    pool.release(1, symbol);
    const reused = pool.acquire(1, () => createSymbol(1, "A"));

    expect(reused).toBe(symbol);
    reused?.init();
    expect(reused?.position).toMatchObject({ x: 0, y: 0 });
    expect(reused?.scale).toMatchObject({ x: 0.75, y: 0.75 });
    expect(reused?.alpha).toBe(1);
    expect(reused?.visible).toBe(true);
    expect(reused?.mask ?? null).toBeNull();
    expect(reused?.filters ?? null).toBeNull();
    expect(reused?.overlayLayer.children).toHaveLength(0);
    expect(reused?.getStateSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
      pendingState: null,
    });
  });

  it("destroys all idle symbols when the pool is destroyed", () => {
    const pool = new RenderSymbolPoolModel();
    const first = createSymbol(1, "A");
    const second = createSymbol(2, "B");
    const firstDestroy = vi.spyOn(first, "destroy");
    const secondDestroy = vi.spyOn(second, "destroy");

    pool.release(1, first);
    pool.release(2, second);
    pool.destroy();
    pool.destroy();

    expect(firstDestroy).toHaveBeenCalledTimes(1);
    expect(secondDestroy).toHaveBeenCalledTimes(1);
    expect(pool.getStats()).toEqual({ totalIdle: 0, idlePerCode: {} });
  });

  it("validates pool watermarks explicitly", () => {
    expect(() => new RenderSymbolPoolModel({ targetIdlePerCode: -1 })).toThrow(
      /targetIdlePerCode/,
    );
    expect(
      () =>
        new RenderSymbolPoolModel({
          targetIdlePerCode: 3,
          maxIdlePerCode: 2,
        }),
    ).toThrow(/maxIdlePerCode/);
    expect(() => new RenderSymbolPoolModel({ maxIdleTotal: -1 })).toThrow(
      /maxIdleTotal/,
    );
  });
});

function createSymbol(code: number, symbol: string): RenderSymbol {
  const renderSymbol = new RenderSymbol({
    definition: createSymbolDefinitionFromPreset({
      code,
      symbol,
      pays: [0],
      preset: createDefaultSymbolStatePreset(),
    }),
    texture: Texture.WHITE,
    animationResolver: createTestSymbolAnimationResolver(),
  });
  renderSymbol.init();
  return renderSymbol;
}
