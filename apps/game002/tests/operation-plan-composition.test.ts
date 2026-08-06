import { describe, expect, it } from "vitest";
import type { SlotOperationPlanV2 } from "@slotclientengine/gameframeworks";
import { compileGame002OperationPlanV2 } from "../src/game-adapter.js";

const presentationOnlyPlan = Object.freeze({
  version: 2 as const,
  operations: Object.freeze([
    Object.freeze({
      id: "test:presentation:0",
      kind: "test:presentation",
      version: 2 as const,
      operationIndex: 0,
      effect: "presentation" as const,
      source: Object.freeze({
        kind: "authored" as const,
        businessKey: "test:presentation:0",
      }),
      payload: Object.freeze({}),
      requiredCapabilities: Object.freeze(["test:presentation"]),
      commit: "atomic" as const,
    }),
  ]),
}) satisfies SlotOperationPlanV2;

const freeGamePlan = Object.freeze({ triggerStepIndex: 0 }) as never;
const symbolCodes = Object.freeze({ AF: 1, CN: 2, CO: 3, BN: 4 });

describe("game002 V2 operation-plan composition", () => {
  it("rejects transform payloads that have no matching settled transform", () => {
    expect(() =>
      compileGame002OperationPlanV2({
        plan: presentationOnlyPlan,
        payloads: new Map([[0, {} as never]]),
        symbolCodes,
      }),
    ).toThrow(/payload count does not match/);
  });

  it.each([
    {
      betAmountRaw: undefined,
      winAmountRaw: 1,
      freeGameSymbolCodes: symbolCodes,
    },
    {
      betAmountRaw: 1,
      winAmountRaw: undefined,
      freeGameSymbolCodes: symbolCodes,
    },
    { betAmountRaw: 1, winAmountRaw: 1, freeGameSymbolCodes: undefined },
  ])("rejects incomplete FreeGame inputs", (input) => {
    expect(() =>
      compileGame002OperationPlanV2({
        plan: presentationOnlyPlan,
        payloads: new Map(),
        symbolCodes,
        freeGamePlan,
        ...input,
      }),
    ).toThrow(/inputs are incomplete/);
  });

  it("requires FreeGame composition to follow an established scene", () => {
    expect(() =>
      compileGame002OperationPlanV2({
        plan: presentationOnlyPlan,
        payloads: new Map(),
        symbolCodes,
        freeGamePlan,
        betAmountRaw: 1,
        winAmountRaw: 1,
        freeGameSymbolCodes: symbolCodes,
      }),
    ).toThrow(/requires an established scene/);
  });

  it("rejects a builtin kind that changes effect", () => {
    const conflictingPlan = Object.freeze({
      version: 2 as const,
      operations: Object.freeze([
        Object.freeze({
          id: "slot:win:0",
          kind: "slot:win",
          version: 2 as const,
          operationIndex: 0,
          effect: "scene-landing" as const,
          source: Object.freeze({
            kind: "authored" as const,
            businessKey: "slot:win:0",
          }),
          output: Object.freeze({
            scene: Object.freeze([]),
            values: Object.freeze([]),
          }),
          payload: Object.freeze({}),
          requiredCapabilities: Object.freeze(["slot:win"]),
          commit: "atomic" as const,
        }),
      ]),
    }) satisfies SlotOperationPlanV2;

    expect(() =>
      compileGame002OperationPlanV2({
        plan: conflictingPlan,
        payloads: new Map(),
        symbolCodes,
      }),
    ).toThrow(/changes effect/);
  });
});
