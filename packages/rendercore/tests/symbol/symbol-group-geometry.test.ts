import { describe, expect, it } from "vitest";
import {
  createSymbolGroup,
  type SymbolRender,
} from "../../src/symbol/index.js";

function symbol(
  x: number,
  y: number,
  assertUsable = () => undefined,
): SymbolRender {
  return {
    getPosition: () => {
      assertUsable();
      return { x, y };
    },
  } as unknown as SymbolRender;
}

describe("SymbolGroup stable geometry", () => {
  it("uses input order for odd middle and separates member/bounds centers", () => {
    const symbols = [symbol(100, 10), symbol(20, 30), symbol(60, 50)];
    const rects = [
      { x: 90, y: 0, width: 20, height: 20 },
      { x: 10, y: 20, width: 20, height: 20 },
      { x: 50, y: 40, width: 20, height: 20 },
    ];
    const group = createSymbolGroup(symbols, {
      getCellRect: (index) => rects[index]!,
    });
    expect(group.getMiddleSymbol()).toBe(symbols[1]);
    expect(group.getCenter()).toEqual({ x: 60, y: 30 });
    expect(group.getCellBounds()).toEqual({
      x: 10,
      y: 0,
      width: 100,
      height: 60,
    });
    expect(group.getCenter({ mode: "bounds" })).toEqual({ x: 60, y: 30 });
  });

  it("fails even middle, missing geometry and stale groups strictly", () => {
    expect(
      createSymbolGroup([symbol(0, 0), symbol(1, 1)]).getMiddleSymbol,
    ).toBeDefined();
    expect(() =>
      createSymbolGroup([symbol(0, 0), symbol(1, 1)]).getMiddleSymbol(),
    ).toThrow(/odd/);
    expect(() => createSymbolGroup([symbol(0, 0)]).getCellBounds()).toThrow(
      /unavailable/,
    );
    let stale = false;
    const group = createSymbolGroup(
      [
        symbol(0, 0, () => {
          if (stale) throw new Error("stale");
        }),
      ],
      {
        getCellRect: () => ({ x: 0, y: 0, width: 10, height: 10 }),
      },
    );
    stale = true;
    expect(() => group.getCellBounds()).toThrow(/stale/);
  });
});
