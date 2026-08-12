import { describe, expect, it } from "vitest";
import {
  RenderGridCellReelSet,
  RenderReelSet,
  createGridCellOrder,
} from "../../src/reel/index.js";
import {
  createBasicLayout,
  createBasicRegistry,
  createBasicReels,
} from "./helpers.js";

describe("SymbolArea", () => {
  it("uses the same strict getSymbol contract for standard and grid-cell areas", () => {
    const standard = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    standard.resetToVisibleScene([
      [1, 2, 1],
      [2, 1, 2],
    ]);
    expect(standard.getSymbol({ x: 1, y: 1 }).code).toBe(1);
    expect(() => standard.getSymbol({ x: 2, y: 0 })).toThrow(/out of range/);

    const grid = new RenderGridCellReelSet({
      reels: createBasicReels(),
      registry: createBasicRegistry(),
      columns: 2,
      rows: 3,
      cellWidth: 15,
      cellHeight: 12,
      order: createGridCellOrder({
        columns: 2,
        rows: 3,
        mode: "top-down-left-right",
      }),
    });
    grid.resetToScene(
      [
        [1, 0, 2],
        [2, 1, 0],
      ],
      [0, 0],
    );
    expect(grid.getSymbol({ x: 1, y: 1 }).code).toBe(1);
    grid.resetToScene(
      [
        [1, -1, 2],
        [2, 1, 0],
      ],
      [0, 0],
    );
    expect(grid.getSymbol({ x: 0, y: 1 })).toMatchObject({
      code: -1,
      kind: "empty",
    });
  });
});
