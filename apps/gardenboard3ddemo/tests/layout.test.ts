import { BOARD, boardDepth, boardWidth } from "../src/config.js";
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

  it("can constrain a grass layer to the far side of the board", () => {
    const placements = createPerimeterPlacements({
      count: 250,
      seed: 2468,
      boardClearance: 0.5,
      edgeInset: 0.1,
      areaWidth: 20,
      zRange: [-24, -7],
      scaleRange: [0.4, 0.9],
      paletteSize: 4,
    });
    expect(placements).toHaveLength(250);
    expect(placements.every(({ z }) => z >= -24 && z <= -7)).toBe(true);
  });

  it("can keep sparse accents inside a one-cell board margin", () => {
    const placements = createPerimeterPlacements({
      count: 150,
      seed: 13579,
      boardClearance: 0.14,
      edgeInset: 0.04,
      areaWidth: boardWidth + BOARD.cellSize * 2,
      areaDepth: boardDepth + BOARD.cellSize * 2,
      scaleRange: [0.36, 0.72],
      paletteSize: 8,
    });
    expect(placements).toHaveLength(150);
    expect(
      placements.every(
        ({ x, z }) =>
          Math.abs(x) <= boardWidth / 2 + BOARD.cellSize &&
          Math.abs(z) <= boardDepth / 2 + BOARD.cellSize,
      ),
    ).toBe(true);
  });
});
