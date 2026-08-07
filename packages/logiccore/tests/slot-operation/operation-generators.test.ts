import { describe, expect, it } from "vitest";
import {
  genDropdownOperation,
  genRefillOperation,
  genRemoveOperation,
  genSpinOperation,
  genWinOperation,
} from "../../src/slot-operation/operation-generators.js";

const source = Object.freeze({
  kind: "server-component" as const,
  stepIndex: 0,
  bindings: Object.freeze({}),
});
const symbols = Object.freeze({ A: 0, B: 1 });

describe("atomic slot operation generators", () => {
  it("builds self-contained spin and win operations", () => {
    const spin = genSpinOperation({
      source,
      scene: [[0, 1]],
      values: [[null, 2]],
      symbolCodes: symbols,
      payload: { round: "base" },
    });
    const win = genWinOperation({
      kind: "game:win",
      source,
      payload: { groups: [] },
    });
    expect(spin.output.occurrences.map((item) => item.symbol)).toEqual([
      "A",
      "B",
    ]);
    expect(win).not.toHaveProperty("input");
    expect(win.payload).toEqual({ groups: [] });
  });

  it("preserves occurrence identity through remove, dropdown and refill", () => {
    const spin = genSpinOperation({
      source,
      scene: [[0, 1, 0]],
      values: [[null, 2, null]],
      symbolCodes: symbols,
      payload: {},
    });
    const removed = genRemoveOperation({
      kind: "game:remove",
      source,
      input: spin.output,
      outputScene: [[0, -1, 0]],
      outputValues: [[null, -1, null]],
      payload: {},
    });
    const dropdown = genDropdownOperation({
      kind: "game:dropdown",
      source,
      input: removed.output,
      outputScene: [[-1, 0, 0]],
      outputValues: [[-1, null, null]],
      payload: {},
    });
    const refill = genRefillOperation({
      kind: "game:refill",
      source,
      input: dropdown.output,
      outputScene: [[1, 0, 0]],
      outputValues: [[3, null, null]],
      positions: [{ x: 0, y: 0 }],
      symbolCodes: symbols,
      payload: {},
    });
    expect(dropdown.output.occurrences.map((item) => item.id)).toEqual([
      spin.output.occurrences[0]!.id,
      spin.output.occurrences[2]!.id,
    ]);
    expect(refill.output.occurrences[0]!.id).toContain("refill");
    expect(refill.output.scene).toEqual([[1, 0, 0]]);
  });
});
