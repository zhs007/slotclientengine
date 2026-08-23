import { describe, expect, it } from "vitest";
import { BOARD } from "../src/config.js";
import { SYMBOL_TYPES, createSymbolPlacements } from "../src/symbols.js";

describe("game symbol placement", () => {
  it("is deterministic and uses unique board cells", () => {
    const first = createSymbolPlacements(123456, 14);
    const second = createSymbolPlacements(123456, 14);
    expect(first).toEqual(second);
    expect(
      new Set(first.map(({ column, row }) => `${column}:${row}`)).size,
    ).toBe(14);
  });

  it("includes every requested symbol and stays on the board", () => {
    const placements = createSymbolPlacements(987654, 12);
    expect(new Set(placements.map(({ type }) => type))).toEqual(
      new Set(SYMBOL_TYPES),
    );
    expect(
      placements.every(
        ({ column, row }) =>
          column >= 0 && column < BOARD.columns && row >= 0 && row < BOARD.rows,
      ),
    ).toBe(true);
  });

  it("rejects impossible counts", () => {
    expect(() =>
      createSymbolPlacements(1, BOARD.columns * BOARD.rows + 1),
    ).toThrow(RangeError);
  });

  it("can fill every board cell exactly once", () => {
    const placements = createSymbolPlacements(
      424242,
      BOARD.columns * BOARD.rows,
    );
    expect(placements).toHaveLength(BOARD.columns * BOARD.rows);
    expect(
      new Set(placements.map(({ column, row }) => `${column}:${row}`)).size,
    ).toBe(BOARD.columns * BOARD.rows);
  });
});
