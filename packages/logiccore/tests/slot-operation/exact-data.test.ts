import { describe, expect, it } from "vitest";
import {
  assertExactMatrixEqual,
  assertExactMatrixShape,
  assertExactPositionSet,
  optionalExactlyOneOtherScene,
  parseTransferRoutes,
  requireExactlyOneOtherScene,
  requireExactlyOneResult,
  requireExactlyOneScene,
  requireSafeInteger,
  requireSafeIntegerArray,
  type ComponentSelection,
} from "../../src/index";

describe("slot operation exact data", () => {
  const scene = Object.freeze([Object.freeze([1, 2])]);
  const selection = Object.freeze({
    componentName: "bg-test",
    scenes: Object.freeze([Object.freeze({ index: 3, value: scene })]),
    otherScenes: Object.freeze([Object.freeze({ index: 4, value: scene })]),
    results: Object.freeze([
      Object.freeze({ index: 5, value: Object.freeze({ pos: [] }) }),
    ]),
    positions: Object.freeze([]),
  }) satisfies ComponentSelection;

  it("requires exact component entry cardinality", () => {
    expect(requireExactlyOneScene(selection).index).toBe(3);
    expect(requireExactlyOneOtherScene(selection).index).toBe(4);
    expect(optionalExactlyOneOtherScene(selection)?.index).toBe(4);
    expect(requireExactlyOneResult(selection).index).toBe(5);
    expect(
      optionalExactlyOneOtherScene({ ...selection, otherScenes: [] }),
    ).toBeNull();
    expect(() => requireExactlyOneScene({ ...selection, scenes: [] })).toThrow(
      /exactly one entry/,
    );
    expect(() =>
      requireExactlyOneOtherScene({
        ...selection,
        otherScenes: [...selection.otherScenes, selection.otherScenes[0]!],
      }),
    ).toThrow(/got 2/);
  });

  it("validates matrix shape and equality", () => {
    expect(() =>
      assertExactMatrixShape([[1, 2]], scene, "matrix"),
    ).not.toThrow();
    expect(() => assertExactMatrixShape([[1]], scene, "matrix")).toThrow(
      /height differs/,
    );
    expect(() => assertExactMatrixEqual([[1, 9]], scene, "matrix")).toThrow(
      /\(0,1\)/,
    );
    expect(() => assertExactMatrixShape([], scene, "matrix")).toThrow(
      /width differs/,
    );
    expect(() =>
      assertExactMatrixShape([null as never], scene, "matrix"),
    ).toThrow(/height differs/);
    expect(() =>
      assertExactMatrixEqual([[1, 2]], scene, "matrix"),
    ).not.toThrow();
  });

  it("validates exact position sets", () => {
    expect(() =>
      assertExactPositionSet(
        [
          { x: 1, y: 0 },
          { x: 0, y: 0 },
        ],
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        "positions",
      ),
    ).not.toThrow();
    expect(() =>
      assertExactPositionSet([{ x: 0, y: 0 }], [{ x: 1, y: 0 }], "positions"),
    ).toThrow(/set differs/);
    expect(() =>
      assertExactPositionSet(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        [{ x: 0, y: 0 }],
        "positions",
      ),
    ).toThrow(/duplicate/);
  });

  it("requires bounded safe integers", () => {
    expect(requireSafeInteger(3, "value", { minimum: 1, maximum: 4 })).toBe(3);
    expect(() => requireSafeInteger(0, "value", { minimum: 1 })).toThrow(
      />= 1/,
    );
    expect(() => requireSafeInteger(1.5, "value")).toThrow(/safe integer/);
    expect(() => requireSafeInteger(5, "value", { maximum: 4 })).toThrow(
      /<= 4/,
    );
    expect(requireSafeIntegerArray([0, 2], "values", { minimum: 0 })).toEqual([
      0, 2,
    ]);
    expect(() => requireSafeIntegerArray("bad", "values")).toThrow(
      /must be an array/,
    );
    expect(() =>
      requireSafeIntegerArray([1, -1], "values", { minimum: 0 }),
    ).toThrow(/values\[1\].*>= 0/);
  });

  it("parses separator-delimited transfer routes", () => {
    expect(parseTransferRoutes([0, 0, 0, 1, -1], scene, "routes")).toEqual([
      { source: { x: 0, y: 0 }, target: { x: 0, y: 1 } },
    ]);
    expect(() => parseTransferRoutes([0, 0, 0], scene, "routes")).toThrow(
      /coordinate quadruples/,
    );
    expect(() => parseTransferRoutes([0, 0, 0, 2], scene, "routes")).toThrow(
      /out of range/,
    );
  });
});
