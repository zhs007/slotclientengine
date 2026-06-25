import { describe, expect, it } from "vitest";
import { createGridCellOrder } from "../../src/reel/index.js";

describe("createGridCellOrder", () => {
  it("creates top-down-left-right order for a 6 x 9 grid", () => {
    const order = createGridCellOrder({
      columns: 6,
      rows: 9,
      mode: "top-down-left-right",
    });

    expect(order).toHaveLength(54);
    expect(order.slice(0, 10)).toEqual([
      { x: 0, y: 0, orderIndex: 0 },
      { x: 0, y: 1, orderIndex: 1 },
      { x: 0, y: 2, orderIndex: 2 },
      { x: 0, y: 3, orderIndex: 3 },
      { x: 0, y: 4, orderIndex: 4 },
      { x: 0, y: 5, orderIndex: 5 },
      { x: 0, y: 6, orderIndex: 6 },
      { x: 0, y: 7, orderIndex: 7 },
      { x: 0, y: 8, orderIndex: 8 },
      { x: 1, y: 0, orderIndex: 9 },
    ]);
    expect(order[53]).toEqual({ x: 5, y: 8, orderIndex: 53 });
  });

  it("rejects invalid dimensions and unknown modes", () => {
    expect(() =>
      createGridCellOrder({
        columns: 0,
        rows: 9,
        mode: "top-down-left-right",
      }),
    ).toThrow(/columns/);
    expect(() =>
      createGridCellOrder({
        columns: 6,
        rows: 0,
        mode: "top-down-left-right",
      }),
    ).toThrow(/rows/);
    expect(() =>
      createGridCellOrder({
        columns: 6,
        rows: 9,
        mode: "diagonal" as "top-down-left-right",
      }),
    ).toThrow(/mode/);
  });
});
