import { describe, expect, it } from "vitest";
import {
  suggestPositionRelocations,
  suggestSymbolReplacements,
  suggestValueUpdates,
} from "../src/index.js";
import type { SlotOperationSnapshot } from "@slotclientengine/logiccore";

describe("slot operation authoring suggestions", () => {
  it("derives exact replacement and value update effects", () => {
    const input = snapshot([0, 1], [1, 2]);
    const output = snapshot([0, 2], [3, 2]);

    expect(suggestValueUpdates({ input, output })).toMatchObject({
      status: "exact",
      candidates: [
        [{ position: { x: 0, y: 0 }, inputValue: 1, outputValue: 3 }],
      ],
    });
    expect(suggestSymbolReplacements({ input, output })).toMatchObject({
      status: "exact",
      candidates: [[{ position: { x: 1, y: 0 }, inputCode: 1, outputCode: 2 }]],
    });
  });

  it("preserves every valid relocation candidate instead of choosing the first", () => {
    const input = snapshot([0, 0, 1], [5, 5, null]);
    const output: SlotOperationSnapshot = Object.freeze({
      scene: Object.freeze([
        Object.freeze([-1]),
        Object.freeze([-1]),
        Object.freeze([0]),
      ]),
      values: Object.freeze([
        Object.freeze([-1]),
        Object.freeze([-1]),
        Object.freeze([5]),
      ]),
    });

    const suggestion = suggestPositionRelocations({ input, output });

    expect(suggestion.status).toBe("ambiguous");
    expect(suggestion.candidates).toHaveLength(2);
    expect(
      suggestion.candidates.map((candidate) => candidate.movements[0]?.source),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });
});

function snapshot(
  codes: readonly number[],
  values: readonly (number | null)[],
): SlotOperationSnapshot {
  return Object.freeze({
    scene: Object.freeze(codes.map((code) => Object.freeze([code]))),
    values: Object.freeze(values.map((value) => Object.freeze([value]))),
  });
}
