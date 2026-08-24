import { describe, expect, it } from "vitest";
import { BOARD } from "../src/config.js";
import {
  SYMBOL_TYPES,
  createSymbolPlacements,
  sampleSymbolEntrance,
  sampleSymbolExit,
} from "../src/symbols.js";

describe("castle symbol layout", () => {
  it("is deterministic and fills unique cells", () => {
    const first = createSymbolPlacements(123456);
    const second = createSymbolPlacements(123456);
    expect(first).toEqual(second);
    expect(first).toHaveLength(BOARD.columns * BOARD.rows);
    expect(
      new Set(first.map(({ column, row }) => `${column}:${row}`)).size,
    ).toBe(first.length);
  });

  it("balances every medieval symbol without orthogonal matches", () => {
    const placements = createSymbolPlacements(987654);
    const counts = SYMBOL_TYPES.map(
      (type) =>
        placements.filter((placement) => placement.type === type).length,
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    const typeAt = new Map(
      placements.map((placement) => [
        `${placement.column}:${placement.row}`,
        placement.type,
      ]),
    );
    for (const placement of placements) {
      expect(typeAt.get(`${placement.column + 1}:${placement.row}`)).not.toBe(
        placement.type,
      );
      expect(typeAt.get(`${placement.column}:${placement.row + 1}`)).not.toBe(
        placement.type,
      );
    }
  });

  it("rejects counts outside board capacity", () => {
    expect(() => createSymbolPlacements(1, -1)).toThrow(RangeError);
    expect(() =>
      createSymbolPlacements(1, BOARD.columns * BOARD.rows + 1),
    ).toThrow(RangeError);
  });
});

describe("castle symbol transition", () => {
  it("pops into place and exits upward", () => {
    expect(sampleSymbolEntrance(0)).toEqual({ scale: 0, yOffset: -0.2 });
    expect(sampleSymbolEntrance(0.5).scale).toBeGreaterThan(0.5);
    expect(sampleSymbolEntrance(1).scale).toBeCloseTo(1);
    expect(sampleSymbolExit(0)).toEqual({ scale: 1, yOffset: 0 });
    expect(sampleSymbolExit(0.5).yOffset).toBeGreaterThan(0);
    expect(sampleSymbolExit(1).scale).toBe(0);
  });
});
