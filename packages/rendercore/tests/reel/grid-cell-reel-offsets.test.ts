import { describe, expect, it } from "vitest";
import { LogicReelsModel } from "@slotclientengine/logiccore";
import { createShuffledGridCellReelOffsetMatrix } from "../../src/reel/index.js";
import { createBasicReels } from "./helpers.js";

describe("createShuffledGridCellReelOffsetMatrix", () => {
  it("partially shuffles unique effective phases within every column", () => {
    const reels = createBasicReels();
    const values = [0.9, 0, 0.5, 0.25, 0.75, 0.1];
    let index = 0;
    const offsets = createShuffledGridCellReelOffsetMatrix({
      reels,
      columns: 2,
      rows: 3,
      random: () => values[index++]!,
    });

    expect(offsets).toEqual([
      [7, 0, 3],
      [2, 5, -2],
    ]);
    expect(index).toBe(6);
    expect(
      offsets.map((column, x) =>
        column.map((offset, y) => reels.normalizeY(x, y + offset)),
      ),
    ).toEqual([
      [7, 1, 5],
      [2, 6, 0],
    ]);
  });

  it("rejects impossible geometry and invalid random sources", () => {
    const reels = createBasicReels();
    expect(() =>
      createShuffledGridCellReelOffsetMatrix({
        reels,
        columns: 1,
        rows: 3,
        random: () => 0,
      }),
    ).toThrow(/reel count/);
    expect(() =>
      createShuffledGridCellReelOffsetMatrix({
        reels: new LogicReelsModel("short", [
          [1, 2],
          [2, 1],
        ]),
        columns: 2,
        rows: 3,
        random: () => 0,
      }),
    ).toThrow(/unique/);
    expect(() =>
      createShuffledGridCellReelOffsetMatrix({
        reels,
        columns: 2,
        rows: 3,
        random: null as never,
      }),
    ).toThrow(/must be a function/);
    expect(() =>
      createShuffledGridCellReelOffsetMatrix({
        reels,
        columns: 2,
        rows: 3,
        random: () => 1,
      }),
    ).toThrow(/\[0, 1\)/);
  });
});
