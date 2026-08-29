import { describe, expect, it } from "vitest";
import { BOARD, BUBBLES } from "../src/config.js";
import {
  createBubblePlacements,
  createSymbolPlacements,
} from "../src/layout.js";

describe("underwater scene layout", () => {
  it("creates a deterministic complete symbol grid", () => {
    const first = createSymbolPlacements(12345);
    expect(first).toEqual(createSymbolPlacements(12345));
    expect(first).toHaveLength(BOARD.columns * BOARD.rows);
    expect(
      new Set(first.map(({ column, row }) => `${column}:${row}`)).size,
    ).toBe(BOARD.columns * BOARD.rows);
  });

  it("keeps bubble seeds inside the declared water volume", () => {
    const bubbles = createBubblePlacements(9876, 400);
    expect(bubbles).toHaveLength(400);
    expect(
      bubbles.every(
        ({ x, y, z, radius, speed }) =>
          x >= BUBBLES.minX &&
          x <= BUBBLES.maxX &&
          y >= BUBBLES.minY &&
          y <= BUBBLES.maxY &&
          z >= BUBBLES.minZ &&
          z <= BUBBLES.maxZ &&
          radius > 0 &&
          speed > 0,
      ),
    ).toBe(true);
  });
});
