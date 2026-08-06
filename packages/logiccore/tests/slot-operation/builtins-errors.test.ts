import { describe, expect, it } from "vitest";
import {
  compileSlotOperationPlan,
  createBuiltinSlotOperationDefinitions,
  finalizeAuthoredSlotOperationPlan,
  type GameLogic,
  type SlotOperationDraft,
  type SlotOperationSnapshot,
} from "../../src/index";

const codes = { A: 0, B: 1 } as const;

describe("slot operation built-in strict failures", () => {
  it("compiles output, no-change, remove and replacement identity variants", () => {
    expect(compile("slot:spin", { output: snapshot() }).final).toEqual(
      snapshot(),
    );
    expect(
      compile("slot:dropdown", { output: snapshot(), movements: [] })
        .operations[0]?.kind,
    ).toBe("slot:dropdown");
    expect(
      compile("slot:refill", { output: snapshot(), movements: [] })
        .operations[0]?.kind,
    ).toBe("slot:refill");
    expect(compile("slot:win", {}).final).toEqual(snapshot());
    expect(compile("slot:collect", {}).final).toEqual(snapshot());
    expect(
      compile("slot:remove", { positions: [{ x: 0, y: 0 }] }).final.scene,
    ).toEqual([[-1], [1]]);
    expect(
      compile("slot:replace-occurrences", {
        replacements: [
          {
            position: { x: 0, y: 0 },
            code: 1,
            value: null,
            identity: "replace",
          },
        ],
      }).final.occurrences[0]?.id,
    ).toBe("replace:test:0:0");
  });

  it.each([
    ["slot:spin", {}, /payload.output/],
    ["slot:remove", { positions: [] }, /must not be empty/],
    [
      "slot:remove",
      {
        positions: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      },
      /duplicate/,
    ],
    ["slot:update-values", { updates: [] }, /must not be empty/],
    ["slot:update-values", { updates: [null] }, /must be an object/],
    [
      "slot:update-values",
      { updates: [{ position: { x: 9, y: 0 }, value: 2 }] },
      /out of bounds/,
    ],
    [
      "slot:update-values",
      { updates: [{ position: { x: 0, y: 0 }, value: -1 }] },
      /non-negative/,
    ],
    [
      "slot:update-values",
      { updates: [{ position: { x: 0, y: 0 }, value: 1 }] },
      /no-op/,
    ],
    ["slot:replace-occurrences", { replacements: [] }, /must not be empty/],
    ["slot:replace-occurrences", { replacements: [null] }, /must be an object/],
    [
      "slot:replace-occurrences",
      {
        replacements: [
          {
            position: { x: 0, y: 0 },
            code: 9,
            value: null,
            identity: "preserve",
          },
        ],
      },
      /code is unknown/,
    ],
    [
      "slot:replace-occurrences",
      {
        replacements: [
          { position: { x: 0, y: 0 }, code: 1, value: null, identity: "bad" },
        ],
      },
      /identity is invalid/,
    ],
    ["slot:relocate-occurrences", { relocations: [] }, /must not be empty/],
    ["slot:relocate-occurrences", { relocations: [null] }, /must be an object/],
    [
      "slot:relocate-occurrences",
      {
        relocations: [
          {
            source: { x: 0, y: 0 },
            target: { x: 0, y: 0 },
            sourceReplacement: { code: 0, value: null },
          },
        ],
      },
      /must be disjoint/,
    ],
    [
      "slot:relocate-occurrences",
      {
        relocations: [
          {
            source: { x: 0, y: 0 },
            target: { x: 1, y: 0 },
            sourceReplacement: { code: 9, value: null },
          },
        ],
      },
      /code is unknown/,
    ],
  ])("rejects %s malformed payload", (kind, payload, message) => {
    expect(() => compile(kind, payload)).toThrow(message);
  });

  it("exercises the server program compiler contract", () => {
    const initial = snapshot();
    const plan = compileSlotOperationPlan({
      logic: {} as GameLogic,
      initial,
      compiler: {
        compile: () => [
          {
            id: "server-spin",
            kind: "slot:spin",
            version: 1,
            source: { kind: "server-component", stepIndex: 0, bindings: {} },
            payload: { output: initial },
          },
        ],
      },
      definitions: createBuiltinSlotOperationDefinitions(),
      symbolCodes: codes,
      columns: 2,
      rows: 1,
    });
    expect(plan.operations[0]?.source.kind).toBe("server-component");
    expect(() =>
      compileSlotOperationPlan({
        logic: {} as GameLogic,
        initial,
        compiler: {
          compile: () => null as unknown as readonly SlotOperationDraft[],
        },
        definitions: createBuiltinSlotOperationDefinitions(),
        symbolCodes: codes,
        columns: 2,
        rows: 1,
      }),
    ).toThrow(/must return an array/);
  });
});

function compile(kind: string, payload: unknown) {
  return finalizeAuthoredSlotOperationPlan({
    initial: snapshot(),
    drafts: [
      {
        id: "test",
        kind,
        version: 1,
        source: {
          kind: "snapshot-authored",
          inputSnapshotId: "before",
          outputSnapshotId: "after",
          suggestions: [
            {
              field: "effect",
              status: "exact",
              candidateCount: 1,
              diagnostics: [],
            },
          ],
          edits: [],
        },
        payload,
      },
    ],
    definitions: createBuiltinSlotOperationDefinitions(),
    symbolCodes: codes,
    columns: 2,
    rows: 1,
  });
}

function snapshot(): SlotOperationSnapshot {
  return Object.freeze({
    scene: Object.freeze([Object.freeze([0]), Object.freeze([1])]),
    values: Object.freeze([Object.freeze([1]), Object.freeze([2])]),
    occurrences: Object.freeze([
      Object.freeze({
        id: "a",
        code: 0,
        symbol: "A",
        value: 1,
        position: Object.freeze({ x: 0, y: 0 }),
      }),
      Object.freeze({
        id: "b",
        code: 1,
        symbol: "B",
        value: 2,
        position: Object.freeze({ x: 1, y: 0 }),
      }),
    ]),
  });
}
