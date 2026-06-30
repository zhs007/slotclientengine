import { describe, expect, it } from "vitest";
import { LogicParseError } from "../src";
import { parseScene } from "../src/scene";

describe("parseScene", () => {
  it("keeps scene data in x-first order and preserves uneven column heights", () => {
    const scene = parseScene({
      values: [{ values: [1, 2, 3] }, { values: [4] }, { values: [5, 6] }],
      indexes: [],
      validRow: [],
    });

    expect(scene).toEqual([[1, 2, 3], [4], [5, 6]]);
    expect(scene[0]).toEqual([1, 2, 3]);
    expect(scene[2]).toEqual([5, 6]);
  });

  it("throws on invalid scene structure instead of returning an empty scene", () => {
    expect(() => parseScene(null)).toThrow(LogicParseError);
    expect(() => parseScene({ values: "bad" })).toThrow(LogicParseError);
    expect(() => parseScene({ values: ["bad-column"] })).toThrow(
      LogicParseError,
    );
    expect(() => parseScene({ values: [{ values: "bad" }] })).toThrow(
      LogicParseError,
    );
    expect(() => parseScene({ values: [{ values: [1.5] }] })).toThrow(
      LogicParseError,
    );
  });
});
