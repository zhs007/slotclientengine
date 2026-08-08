import { describe, expect, it } from "vitest";
import {
  genChg,
  createSlotOperationSnapshot,
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
      output: { scene: [[0, 1]], values: [[null, 2]] },
      payload: { round: "base" },
    });
    const win = genWinOperation({
      kind: "game:win",
      source,
      payload: { groups: [] },
    });
    expect(spin.output).toEqual({ scene: [[0, 1]], values: [[null, 2]] });
    expect(win).not.toHaveProperty("input");
    expect(win.payload).toEqual({ groups: [] });
  });

  it("validates remove, dropdown and refill from positioned snapshots", () => {
    const spin = genSpinOperation({
      source,
      output: { scene: [[0, 1, 0]], values: [[null, 2, null]] },
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
    expect(dropdown.output).toEqual({
      scene: [[-1, 0, 0]],
      values: [[-1, null, null]],
    });
    expect(refill.output.scene).toEqual([[1, 0, 0]]);
  });

  it("builds keyed change, driven-change and transfer operations", () => {
    const input = genSpinOperation({
      source,
      output: { scene: [[0, 1, 0]], values: [[1, 2, 3]] },
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
    expect(driven).not.toHaveProperty("mutations");
    expect(driven).not.toHaveProperty("input");
    expect(transfer.payload).toEqual({
      type: "transfer",
      mainPos: [{ x: 0, y: 1 }],
      routes: [{ source: { x: 0, y: 0 }, target: { x: 0, y: 2 } }],
    });
    expect(transfer.output.values).toEqual([[3, 2, 4]]);
  });

  it("strictly validates positioned snapshots and symbol catalogs", () => {
    const create = (
      symbolCodes: Readonly<Record<string, number>>,
      scene: readonly (readonly number[])[] = [[0]],
      values: readonly (readonly (number | null | -1)[])[] = [[null]],
    ) => createSlotOperationSnapshot({ scene, values, symbolCodes });

    expect(() => create({})).toThrow(/symbolCodes is empty/);
    expect(() => create({ "": 0 })).toThrow(/invalid symbol code/);
    expect(() => create({ A: 0, B: 0 })).toThrow(/duplicate symbol code/);
    expect(() => create(symbols, [[2]])).toThrow(/unknown code 2/);
    expect(() => create(symbols, [[0]], [[-1]])).toThrow(/cannot use value -1/);
    expect(() => create(symbols, [[-1]], [[null]])).toThrow(
      /must use value -1/,
    );

    const held = create(symbols, [[0, 1]], [[null, 2]]);
    expect(() =>
      genDropdownOperation({
        kind: "game:dropdown",
        source,
        input: held,
        outputScene: [[-1, 1]],
        outputValues: [[-1, 3]],
        heldCodes: [1],
        payload: {},
      }),
    ).toThrow(/changed held cell/);
  });
});
