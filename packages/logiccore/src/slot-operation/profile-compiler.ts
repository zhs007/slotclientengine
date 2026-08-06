import {
  compileSlotRoundProfileTrace,
  type SlotRoundCompileContext,
  type SlotRoundProfileStepTrace,
} from "../slot-round-plan";
import type { SlotRoundFlowProfileV1 } from "../slot-round-flow";
import type { GameLogic } from "../types";
import type { ServerComponentOperationSource } from "./types";
import type { SlotOperationSnapshot } from "./types";
import type { SlotOperationDraftV2, SlotOperationPlanV2 } from "./v2-types";
import {
  createBuiltinSlotOperationDefinitionsV2,
  generateCompletionPresentation,
  generateSpinOperation,
} from "./effect-generators";
import { deriveSlotStateMutations } from "./mutation-derivation";
import { finalizeSlotOperationPlanV2 } from "./v2-finalizer";

export interface SlotRoundOperationCompileOptions {
  readonly includeCompletion?: boolean;
  readonly resolveSource?: (
    step: { readonly kind: string; readonly stepIndex: number } | null,
  ) => ServerComponentOperationSource;
}

/**
 * Compiles a configured server round directly into the public operation IR.
 * The fixed profile trace remains a private compiler implementation detail.
 */
export function compileConfiguredSlotRoundOperationPlanV2(
  profile: SlotRoundFlowProfileV1,
  round: GameLogic,
  context: SlotRoundCompileContext & {
    readonly columns: number;
    readonly rows: number;
  },
  options: SlotRoundOperationCompileOptions = {},
): SlotOperationPlanV2 {
  const trace = compileSlotRoundProfileTrace(profile, round, context);
  const initial = canonicalOperationSnapshot(trace.initial);
  const drafts: SlotOperationDraftV2[] = [];
  const source = (step: SlotRoundProfileStepTrace | null) =>
    options.resolveSource?.(step) ??
    Object.freeze({
      kind: "server-component" as const,
      stepIndex: step?.stepIndex ?? 0,
      bindings: Object.freeze({}),
    });
  drafts.push(
    generateSpinOperation({
      source: source(null),
      output: initial,
      payload: Object.freeze({ snapshot: initial }),
      businessKey: "initial",
    }),
  );
  for (const step of trace.steps) {
    const input = canonicalOperationSnapshot(step.input);
    const output = canonicalOperationSnapshot(step.output);
    const unchanged = snapshotsEqual(input, output);
    const kind = profileOperationKind(step, unchanged);
    const common = {
      kind,
      version: 2 as const,
      source: source(step),
      payload: Object.freeze({ step }),
      businessKey: String(step.index),
    };
    if (unchanged) drafts.push({ ...common, effect: "presentation" });
    else
      drafts.push({
        ...common,
        effect: "state-mutation",
        input,
        output,
        mutations: deriveSlotStateMutations(input, output),
      });
  }
  if (options.includeCompletion !== false)
    drafts.push(
      generateCompletionPresentation({
        source: source(null),
        businessKey: "final",
      }),
    );
  return finalizeSlotOperationPlanV2({
    drafts,
    definitions: createBuiltinSlotOperationDefinitionsV2(),
    symbolCodes: context.symbolCodes,
    columns: context.columns,
    rows: context.rows,
  });
}

function canonicalOperationSnapshot(
  snapshot: SlotOperationSnapshot,
): SlotOperationSnapshot {
  return Object.freeze({
    scene: snapshot.scene,
    values: Object.freeze(
      snapshot.values.map((column, x) =>
        Object.freeze(
          column.map((value, y) =>
            snapshot.scene[x]![y] === -1 ? -1 : value === -1 ? null : value,
          ),
        ),
      ),
    ),
    occurrences: snapshot.occurrences,
  });
}

function profileOperationKind(
  step: SlotRoundProfileStepTrace,
  unchanged: boolean,
): string {
  switch (step.kind) {
    case "win":
      return unchanged ? "slot:win" : "slot:win-remove";
    case "dropdown":
      return unchanged ? "slot:dropdown-presentation" : "slot:dropdown";
    case "refill":
      return unchanged ? "slot:refill-presentation" : "slot:refill";
    case "settled-transform":
      return unchanged ? "slot:settled-presentation" : "slot:state-mutation";
  }
}

function snapshotsEqual(
  left: SlotRoundProfileStepTrace["input"],
  right: SlotRoundProfileStepTrace["output"],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
