import { describe, expect, it } from "vitest";
import {
  compileSlotOperationPlan,
  createBuiltinSlotOperationDefinitions,
  finalizeAuthoredSlotOperationPlan,
  type GameLogic,
  type SlotOperationDraft,
  type SlotOperationSnapshot,
} from "../../src/index";

const SYMBOL_CODES = Object.freeze({ A: 0, B: 1, BN: 2 });

describe("slot operation compiler", () => {
  it("compiles deterministic deeply frozen authored operations with continuous snapshots", () => {
    const drafts = createDrafts("exact");
    const compile = () =>
      finalizeAuthoredSlotOperationPlan({
        initial: createInitial(),
        drafts,
        definitions: createBuiltinSlotOperationDefinitions(),
        symbolCodes: SYMBOL_CODES,
        columns: 2,
        rows: 1,
      });

    const first = compile();
    const second = compile();

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.operations.map((operation) => operation.kind)).toEqual([
      "slot:update-values",
      "slot:replace-occurrences",
      "slot:relocate-occurrences",
    ]);
    expect(first.operations[0]?.output).toEqual(first.operations[1]?.input);
    expect(first.operations[1]?.output).toEqual(first.operations[2]?.input);
    expect(first.final.scene).toEqual([[1], [2]]);
    expect(first.final.values).toEqual([[4], [null]]);
    expect(
      first.final.occurrences.find((item) => item.position.x === 0)?.id,
    ).toBe("occurrence-b");
  });

  it("rejects unresolved authored evidence before finalization", () => {
    expect(() =>
      finalizeAuthoredSlotOperationPlan({
        initial: createInitial(),
        drafts: createDrafts("ambiguous"),
        definitions: createBuiltinSlotOperationDefinitions(),
        symbolCodes: SYMBOL_CODES,
        columns: 2,
        rows: 1,
      }),
    ).toThrow(/unresolved suggestions/);
  });

  it("rejects duplicate definitions before invoking the program compiler", () => {
    const builtins = createBuiltinSlotOperationDefinitions();
    expect(() =>
      compileSlotOperationPlan({
        logic: {} as GameLogic,
        initial: createInitial(),
        compiler: { compile: () => [] },
        definitions: [builtins[0]!, builtins[0]!],
        symbolCodes: SYMBOL_CODES,
        columns: 2,
        rows: 1,
      }),
    ).toThrow(/Duplicate slot operation definition/);
  });
});

function createDrafts(
  status: "exact" | "ambiguous",
): readonly SlotOperationDraft[] {
  const source = (inputSnapshotId: string, outputSnapshotId: string) => ({
    kind: "snapshot-authored" as const,
    inputSnapshotId,
    outputSnapshotId,
    suggestions: Object.freeze([
      Object.freeze({
        field: "effect",
        status,
        candidateCount: status === "exact" ? 1 : 2,
        diagnostics: Object.freeze([]),
      }),
    ]),
    edits: Object.freeze([]),
  });
  return Object.freeze([
    Object.freeze({
      id: "value",
      kind: "slot:update-values",
      version: 1,
      source: source("initial", "value"),
      payload: Object.freeze({
        updates: Object.freeze([
          Object.freeze({ position: Object.freeze({ x: 0, y: 0 }), value: 7 }),
        ]),
      }),
    }),
    Object.freeze({
      id: "replace",
      kind: "slot:replace-occurrences",
      version: 1,
      source: source("value", "replace"),
      payload: Object.freeze({
        replacements: Object.freeze([
          Object.freeze({
            position: Object.freeze({ x: 1, y: 0 }),
            code: 1,
            value: 4,
            identity: "preserve",
          }),
        ]),
      }),
    }),
    Object.freeze({
      id: "relocate",
      kind: "slot:relocate-occurrences",
      version: 1,
      source: source("replace", "final"),
      payload: Object.freeze({
        relocations: Object.freeze([
          Object.freeze({
            source: Object.freeze({ x: 1, y: 0 }),
            target: Object.freeze({ x: 0, y: 0 }),
            sourceReplacement: Object.freeze({ code: 2, value: null }),
          }),
        ]),
      }),
    }),
  ]);
}

function createInitial(): SlotOperationSnapshot {
  return Object.freeze({
    scene: Object.freeze([Object.freeze([0]), Object.freeze([1])]),
    values: Object.freeze([Object.freeze([1]), Object.freeze([2])]),
    occurrences: Object.freeze([
      Object.freeze({
        id: "occurrence-a",
        code: 0,
        symbol: "A",
        value: 1,
        position: Object.freeze({ x: 0, y: 0 }),
      }),
      Object.freeze({
        id: "occurrence-b",
        code: 1,
        symbol: "B",
        value: 2,
        position: Object.freeze({ x: 1, y: 0 }),
      }),
    ]),
  });
}
