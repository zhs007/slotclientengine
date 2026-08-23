import { describe, expect, it } from "vitest";
import { BOARD } from "../src/config.js";
import {
  SYMBOL_TYPES,
  createSymbolPlacements,
  sampleSymbolEntrance,
  sampleSymbolExit,
} from "../src/symbols.js";

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

  it("balances a full board without orthogonally adjacent matches", () => {
    for (let seed = 0; seed < 24; seed += 1) {
      const placements = createSymbolPlacements(
        seed,
        BOARD.columns * BOARD.rows,
      );
      for (const type of SYMBOL_TYPES) {
        expect(
          placements.filter((placement) => placement.type === type),
        ).toHaveLength(12);
      }
      const typeAt = new Map(
        placements.map((placement) => [
          `${placement.column}:${placement.row}`,
          placement.type,
        ]),
      );
      for (const placement of placements) {
        const right = typeAt.get(`${placement.column + 1}:${placement.row}`);
        const below = typeAt.get(`${placement.column}:${placement.row + 1}`);
        if (right) expect(right).not.toBe(placement.type);
        if (below) expect(below).not.toBe(placement.type);
      }
    }
  });

  it("staggers a full board from top to bottom, then left to right", () => {
    const placements = createSymbolPlacements(
      515151,
      BOARD.columns * BOARD.rows,
    );
    const delayAt = (column: number, row: number) =>
      placements.find(
        (placement) => placement.column === column && placement.row === row,
      )!.delay;
    expect(delayAt(0, 0)).toBe(0);
    expect(delayAt(0, 1)).toBeGreaterThan(delayAt(0, 0));
    expect(delayAt(0, BOARD.rows - 1)).toBeLessThan(delayAt(1, 0));
    expect(delayAt(BOARD.columns - 1, BOARD.rows - 1)).toBeGreaterThan(
      delayAt(BOARD.columns - 1, BOARD.rows - 2),
    );
    expect(delayAt(BOARD.columns - 1, BOARD.rows - 1)).toBeLessThan(0.9);
  });
});

describe("game symbol transition motion", () => {
  it("pops upward while growing into place", () => {
    expect(sampleSymbolEntrance(0)).toEqual({ scale: 0, yOffset: -0.2 });
    expect(sampleSymbolEntrance(0.5).scale).toBeGreaterThan(0.5);
    expect(sampleSymbolEntrance(0.5).yOffset).toBeGreaterThan(0);
    expect(sampleSymbolEntrance(1).scale).toBeCloseTo(1);
    expect(sampleSymbolEntrance(1).yOffset).toBeCloseTo(0);
  });

  it("jumps upward while shrinking out", () => {
    expect(sampleSymbolExit(0)).toEqual({ scale: 1, yOffset: 0 });
    expect(sampleSymbolExit(0.5).scale).toBeLessThan(1);
    expect(sampleSymbolExit(0.5).yOffset).toBeGreaterThan(0);
    expect(sampleSymbolExit(1).scale).toBe(0);
    expect(sampleSymbolExit(1).yOffset).toBeCloseTo(0.12);
  });
});
