import { describe, expect, it } from "vitest";
import {
  ReelError,
  assertLayoutMatchesReels,
  createReelLayout,
} from "../../src/reel/index.js";

describe("createReelLayout", () => {
  it("creates stable 5x5 cell coordinates with buffer rows", () => {
    const layout = createReelLayout({
      reelCount: 5,
      visibleRows: 5,
      cellWidth: 100,
      cellHeight: 80,
      columnGap: 12,
    });

    expect(layout.getReelX(0)).toBe(0);
    expect(layout.getReelX(4)).toBe(448);
    expect(layout.getCellY(3)).toBe(240);
    expect(layout.bufferRowsBefore).toBe(1);
    expect(layout.bufferRowsAfter).toBe(1);
    expect(() => layout.getReelX(5)).toThrow(ReelError);
  });

  it("rejects invalid dimensions and reel count mismatches", () => {
    expect(() =>
      createReelLayout({
        reelCount: 0,
        visibleRows: 5,
        cellWidth: 1,
        cellHeight: 1,
      }),
    ).toThrow(/reelCount/);
    expect(() =>
      createReelLayout({
        reelCount: 5,
        visibleRows: 0,
        cellWidth: 1,
        cellHeight: 1,
      }),
    ).toThrow(/visibleRows/);
    expect(() =>
      createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 0,
        cellHeight: 1,
      }),
    ).toThrow(/cellWidth/);
    expect(() =>
      createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 1,
        cellHeight: 1,
        columnGap: -1,
      }),
    ).toThrow(/columnGap/);
    expect(() =>
      assertLayoutMatchesReels(
        createReelLayout({
          reelCount: 5,
          visibleRows: 5,
          cellWidth: 1,
          cellHeight: 1,
        }),
        4,
      ),
    ).toThrow(/does not match/);
  });
});
