import { describe, expect, it } from "vitest";
import { uniqueGame002v2Positions } from "../src/round-positions.js";

describe("game002v2 round positions", () => {
  it("keeps the first occurrence when a symbol participates in several wins", () => {
    expect(
      uniqueGame002v2Positions([
        { x: 0, y: 5 },
        { x: 1, y: 2 },
        { x: 0, y: 5 },
      ]),
    ).toEqual([
      { x: 0, y: 5 },
      { x: 1, y: 2 },
    ]);
  });
});
