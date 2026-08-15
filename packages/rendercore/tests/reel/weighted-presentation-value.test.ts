import { describe, expect, it, vi } from "vitest";
import { createWeightedGridCellPresentationValueResolver } from "../../src/reel/index.js";

const CONTEXT = Object.freeze({ x: 1, y: 2, symbolY: 7, code: 9 });

describe("weighted grid-cell presentation values", () => {
  it("samples table boundaries and keeps each occurrence stable", () => {
    const randomUint32 = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
    const resolver = createWeightedGridCellPresentationValueResolver({
      resolveTable: () => [
        { value: 10, weight: 2 },
        { value: 20, weight: 1 },
      ],
      randomUint32,
    });

    expect(resolver(CONTEXT)).toBe(10);
    expect(resolver(CONTEXT)).toBe(10);
    expect(resolver({ ...CONTEXT, symbolY: 8 })).toBe(20);
    expect(randomUint32).toHaveBeenCalledTimes(2);
  });

  it("rejects the modulo-bias tail and validates inputs strictly", () => {
    const randomUint32 = vi
      .fn()
      .mockReturnValueOnce(0xffff_ffff)
      .mockReturnValueOnce(0);
    const resolver = createWeightedGridCellPresentationValueResolver({
      resolveTable: () => [
        { value: 10, weight: 2 },
        { value: 20, weight: 1 },
      ],
      randomUint32,
    });
    expect(resolver(CONTEXT)).toBe(10);
    expect(randomUint32).toHaveBeenCalledTimes(2);

    expect(() =>
      createWeightedGridCellPresentationValueResolver({
        resolveTable: () => [{ value: 10, weight: 0 }],
        randomUint32: () => 0,
      })(CONTEXT),
    ).toThrow(/positive safe integer/);
    expect(() =>
      createWeightedGridCellPresentationValueResolver({
        resolveTable: () => [{ value: 10, weight: 1 }],
        randomUint32: () => 0.5,
      })(CONTEXT),
    ).toThrow(/uint32 integer/);
  });

  it("does not sample when the caller selects no table", () => {
    const randomUint32 = vi.fn(() => 0);
    const resolver = createWeightedGridCellPresentationValueResolver({
      resolveTable: () => null,
      randomUint32,
    });
    expect(resolver(CONTEXT)).toBeNull();
    expect(randomUint32).not.toHaveBeenCalled();
  });

  it("bounds random occurrence retention per cell without changing active values", () => {
    const randomUint32 = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(0);
    const resolver = createWeightedGridCellPresentationValueResolver({
      resolveTable: () => [
        { value: 10, weight: 1 },
        { value: 20, weight: 1 },
        { value: 30, weight: 1 },
      ],
      randomUint32,
      maxCachedValuesPerCell: 2,
    });

    expect(resolver({ ...CONTEXT, symbolY: 7 })).toBe(10);
    expect(resolver({ ...CONTEXT, symbolY: 8 })).toBe(20);
    expect(resolver({ ...CONTEXT, symbolY: 8 })).toBe(20);
    expect(resolver({ ...CONTEXT, symbolY: 9 })).toBe(30);
    expect(resolver({ ...CONTEXT, symbolY: 7 })).toBe(10);
    expect(randomUint32).toHaveBeenCalledTimes(4);
  });
});
