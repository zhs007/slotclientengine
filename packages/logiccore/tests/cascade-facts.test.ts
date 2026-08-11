import { describe, expect, it } from "vitest";
import {
  compileSlotCascadeFacts,
  deriveSlotCascadeDropdownValues,
} from "../src";

describe("slot cascade facts", () => {
  it("compiles occurrence relations and value commits before rendering", () => {
    const sourceScene = [
      [8, -1, 0, -1],
      [2, -1, -1, 3],
    ] as const;
    const sourceValues = [
      [25, -1, null, -1],
      [null, -1, -1, null],
    ] as const;
    const dropdownScene = [
      [-1, -1, 0, 8],
      [-1, -1, 2, 3],
    ] as const;
    const dropdownValues = deriveSlotCascadeDropdownValues({
      sourceScene,
      sourceValues,
      dropdownScene,
      canDropOccurrence: ({ code }) => code !== 0,
    });
    const facts = compileSlotCascadeFacts({
      sourceScene,
      sourceValues,
      dropdownScene,
      dropdownValues,
      targetScene: [
        [4, 5, 0, 8],
        [6, 7, 2, 3],
      ],
      targetValues: [
        [null, null, null, 25],
        [null, null, null, null],
      ],
      refillPositions: [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      canDropOccurrence: ({ code }) => code !== 0,
    });

    expect(facts.dropdownMovements).toEqual([
      {
        kind: "existing",
        source: { x: 0, y: 0 },
        target: { x: 0, y: 3 },
      },
      {
        kind: "existing",
        source: { x: 1, y: 0 },
        target: { x: 1, y: 2 },
      },
    ]);
    expect(facts.refillMovements).toHaveLength(4);
    expect(facts.targetValueCommits).toHaveLength(8);
  });

  it("rejects logical occurrence drift in the producer", () => {
    expect(() =>
      deriveSlotCascadeDropdownValues({
        sourceScene: [[8, -1]],
        sourceValues: [[25, -1]],
        dropdownScene: [[7, -1]],
      }),
    ).toThrow(/relation is invalid/);
    expect(() =>
      deriveSlotCascadeDropdownValues({
        sourceScene: [[0, -1]],
        sourceValues: [[null, -1]],
        dropdownScene: [[-1, 0]],
        canDropOccurrence: () => false,
      }),
    ).toThrow(/fixed occurrence changed/);
  });
});
