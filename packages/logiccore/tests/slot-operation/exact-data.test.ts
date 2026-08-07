import { describe, expect, it } from "vitest";
import {
  assertExactMatrixEqual,
  assertExactMatrixShape,
  assertExactPositionSet,
  optionalExactlyOneOtherScene,
  requireExactlyOneOtherScene,
  requireExactlyOneResult,
  requireExactlyOneScene,
  requireOccurrenceAt,
  requireSafeInteger,
  type ComponentSelection,
  type SlotOperationSnapshot,
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

  it("validates exact position sets and occurrence lookup", () => {
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
    const snapshot: SlotOperationSnapshot = Object.freeze({
      scene,
      values: Object.freeze([Object.freeze([null, null])]),
      occurrences: Object.freeze([
        Object.freeze({
          id: "a",
          code: 2,
          symbol: "B",
          value: null,
          position: Object.freeze({ x: 0, y: 1 }),
        }),
      ]),
    });
    expect(requireOccurrenceAt(snapshot, { x: 0, y: 1 }, "target").id).toBe(
      "a",
    );
    expect(() =>
      requireOccurrenceAt(snapshot, { x: 0, y: 0 }, "target"),
    ).toThrow(/got 0/);
    expect(() =>
      requireOccurrenceAt(snapshot, { x: 1, y: 0 }, "target"),
    ).toThrow(/out of range/);
    expect(() =>
      requireOccurrenceAt(snapshot, { x: -1, y: 0 }, "target"),
    ).toThrow(/out of range/);
    expect(() =>
      requireOccurrenceAt(snapshot, { x: 0, y: 2 }, "target"),
    ).toThrow(/out of range/);
    expect(() =>
      requireOccurrenceAt(snapshot, { x: 0.5, y: 0 }, "target"),
    ).toThrow(/out of range/);
    expect(() =>
      requireOccurrenceAt(
        {
          ...snapshot,
          occurrences: [...snapshot.occurrences, snapshot.occurrences[0]!],
        },
        { x: 0, y: 1 },
        "target",
      ),
    ).toThrow(/got 2/);
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
  });
});
