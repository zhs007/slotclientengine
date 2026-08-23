import { boardDepth, boardWidth } from "../src/config.js";
import { describe, expect, it } from "vitest";
import { createPerimeterPlacements, isOutsideBoard } from "../src/layout.js";

describe("garden perimeter layout", () => {
  it("is deterministic for a fixed seed", () => {
    const options = {
      count: 80,
      seed: 12345,
      boardClearance: 0.2,
      edgeInset: 0.1,
      scaleRange: [0.7, 1.2] as const,
      paletteSize: 4,
    };
    expect(createPerimeterPlacements(options)).toEqual(
      createPerimeterPlacements(options),
    );
  });

  it("keeps every generated plant out of the playable board", () => {
    const clearance = 0.18;
    const placements = createPerimeterPlacements({
      count: 500,
      seed: 9876,
      boardClearance: clearance,
      edgeInset: 0.1,
      scaleRange: [0.5, 1.4],
      paletteSize: 5,
    });
    expect(placements).toHaveLength(500);
    expect(
      placements.every(({ x, z }) => isOutsideBoard(x, z, clearance)),
    ).toBe(true);
    expect(boardWidth).toBeGreaterThan(6);
    expect(boardDepth).toBeGreaterThan(10);
  });
});
