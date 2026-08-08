import { describe, expect, it } from "vitest";
import {
  genChg,
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

  it("builds keyed change, driven-change and transfer operations", () => {
    const input = genSpinOperation({
      source,
      scene: [[0, 1, 0]],
      values: [[1, 2, 3]],
      symbolCodes: symbols,
      payload: {},
    }).output;
    const change = genChg({
      kind: "game:value-change",
      type: "change",
      source,
      input,
      changes: [{ position: { x: 0, y: 0 }, outputCode: 0, outputValue: 4 }],
      symbolCodes: symbols,
    });
    const driven = genChg({
      kind: "game:driven-change",
      type: "driven-change",
      source,
      input: change.output,
      mainPos: [{ x: 0, y: 1 }],
      changes: [],
      symbolCodes: symbols,
    });
    const transfer = genChg({
      kind: "game:transfer",
      type: "transfer",
      source,
      input: driven.output,
      mainPos: [{ x: 0, y: 1 }],
      routes: [{ source: { x: 0, y: 0 }, target: { x: 0, y: 2 } }],
      changes: [
        { position: { x: 0, y: 0 }, outputCode: 0, outputValue: 3 },
        { position: { x: 0, y: 2 }, outputCode: 0, outputValue: 4 },
      ],
      symbolCodes: symbols,
    });

    expect(change.payload).toEqual({
      type: "change",
      pos: [{ x: 0, y: 0 }],
    });
    expect(driven.payload).toEqual({
      type: "driven-change",
      mainPos: [{ x: 0, y: 1 }],
      pos: [],
    });
    expect(driven.mutations).toEqual([]);
    expect(transfer.payload).toEqual({
      type: "transfer",
      mainPos: [{ x: 0, y: 1 }],
      routes: [{ source: { x: 0, y: 0 }, target: { x: 0, y: 2 } }],
    });
    expect(transfer.output.values).toEqual([[3, 2, 4]]);
  });
});
