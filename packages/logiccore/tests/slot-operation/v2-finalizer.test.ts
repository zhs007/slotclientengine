import { describe, expect, it } from "vitest";
import {
  applySlotStateMutations,
  createBuiltinSlotOperationDefinitionsV2,
  finalizeSlotOperationPlanV2,
  generateCompletionPresentation,
  generateSceneLandingOperation,
  generateWinPresentation,
  type SlotOperationDraftV2,
  type SlotOperationSnapshot,
} from "../../src/index";

const SYMBOL_CODES = Object.freeze({ A: 0, B: 1 });

describe("SlotOperationPlanV2 finalizer", () => {
  it("keeps presentation snapshot-free and validates mutation closure", () => {
    const initial = snapshot(0, 1, "a");
    const output = snapshot(0, 2, "a");
    const source = authored("initial", "final");
    const plan = finalizeSlotOperationPlanV2({
      drafts: [
        generateSceneLandingOperation({ source, output: initial }),
        {
          effect: "presentation",
          kind: "slot:win",
          version: 2,
          source,
          payload: {},
          targets: [{ position: { x: 0, y: 0 }, occurrenceId: "a" }],
        },
        {
          effect: "state-mutation",
          kind: "slot:dropdown",
          version: 2,
          source,
          payload: {},
          input: initial,
          output,
          mutations: [
            {
              kind: "value-update",
              position: { x: 0, y: 0 },
              occurrenceId: "a",
              inputValue: 1,
              outputValue: 2,
            },
          ],
        },
        generateCompletionPresentation({ source }),
      ],
      definitions: createBuiltinSlotOperationDefinitionsV2(),
      symbolCodes: SYMBOL_CODES,
      columns: 1,
      rows: 1,
    });

    expect(plan.version).toBe(2);
    expect(plan.operations.map((operation) => operation.effect)).toEqual([
      "scene-landing",
      "presentation",
      "state-mutation",
      "presentation",
    ]);
    expect("input" in plan.operations[1]!).toBe(false);
    expect("output" in plan.operations[1]!).toBe(false);
    expect(plan.final).toEqual(output);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  it("rejects presentation before an established scene", () => {
    const selection = {
      presence: "present" as const,
      role: "win",
      stepIndex: 0,
      componentName: "bg-win",
      source: serverSource(),
      selection: {} as never,
      scene: () => {
        throw new Error("unused");
      },
      otherScene: () => {
        throw new Error("unused");
      },
      results: () => [],
      positions: () => [{ x: 0, y: 0 }],
    };
    expect(() =>
      finalizeSlotOperationPlanV2({
        drafts: [generateWinPresentation(selection)!],
        definitions: createBuiltinSlotOperationDefinitionsV2(),
        symbolCodes: SYMBOL_CODES,
        columns: 1,
        rows: 1,
      }),
    ).toThrow(/requires an established scene/);
  });

  it("supports strict insertion into a hole", () => {
    const input: SlotOperationSnapshot = {
      scene: [[-1]],
      values: [[-1]],
      occurrences: [],
    };
    expect(
      applySlotStateMutations({
        input,
        mutations: [
          {
            kind: "insert",
            position: { x: 0, y: 0 },
            occurrenceId: "inserted",
            outputCode: 1,
            outputValue: 3,
          },
        ],
        symbolCodes: SYMBOL_CODES,
        columns: 1,
        rows: 1,
      }),
    ).toEqual(snapshot(1, 3, "inserted"));
  });

  it("rejects malformed V2 envelopes, evidence and targets", () => {
    const source = authored("a", "b");
    const landing = generateSceneLandingOperation({
      source,
      output: snapshot(0, 1, "a"),
      businessKey: "same",
    });
    const definitions = createBuiltinSlotOperationDefinitionsV2();
    const finalize = (
      drafts: readonly unknown[],
      overrides: Record<string, unknown> = {},
    ) =>
      finalizeSlotOperationPlanV2({
        drafts: drafts as readonly SlotOperationDraftV2[],
        definitions,
        symbolCodes: SYMBOL_CODES,
        columns: 1,
        rows: 1,
        ...overrides,
      });
    expect(() => finalize([landing], { columns: 0 })).toThrow(/positive/);
    expect(() =>
      finalize([landing], { definitions: [definitions[0], definitions[0]] }),
    ).toThrow(/Duplicate/);
    expect(() => finalize([{ ...landing, kind: "slot:unknown" }])).toThrow(
      /No V2/,
    );
    expect(() => finalize([{ ...landing, effect: "presentation" }])).toThrow(
      /does not match/,
    );
    expect(() => finalize([])).toThrow(/must establish a scene/);
    expect(() =>
      finalize([landing, { ...landing, businessKey: "same" }]),
    ).toThrow(/Duplicate V2 operation id/);
    expect(() =>
      finalize([
        {
          ...landing,
          source: {
            ...source,
            suggestions: [{ ...source.suggestions[0], status: "unresolved" }],
          },
        },
      ]),
    ).toThrow(/unresolved suggestions/);
    expect(() =>
      finalize([
        landing,
        {
          effect: "presentation",
          kind: "slot:win",
          version: 2,
          source,
          payload: {},
          targets: [{ position: { x: 0, y: 0 } }, { position: { x: 0, y: 0 } }],
        },
      ]),
    ).toThrow(/duplicate/);
  });
});

function snapshot(
  code: number,
  value: number,
  id: string,
): SlotOperationSnapshot {
  return {
    scene: [[code]],
    values: [[value]],
    occurrences: [
      {
        id,
        code,
        symbol: code === 0 ? "A" : "B",
        value,
        position: { x: 0, y: 0 },
      },
    ],
  };
}

function authored(inputSnapshotId: string, outputSnapshotId: string) {
  return {
    kind: "snapshot-authored" as const,
    inputSnapshotId,
    outputSnapshotId,
    suggestions: [
      {
        field: "effect",
        status: "exact" as const,
        candidateCount: 1,
        diagnostics: [],
      },
    ],
    edits: [],
  };
}

function serverSource() {
  return {
    kind: "server-component" as const,
    stepIndex: 0,
    bindings: {},
  };
}
