import {
  createBuiltinSlotOperationDefinitions,
  finalizeAuthoredSlotOperationPlan,
  type SlotOperationDefinition,
  type SlotOperationDraft,
  type SlotOperationPlanV1,
  type SlotOperationSnapshot,
} from "@slotclientengine/logiccore";
import type { SlotOperationAuthoringProjectV1 } from "./types.js";

export function finalizeSlotOperationAuthoringDraft(options: {
  readonly initial: SlotOperationSnapshot;
  readonly drafts: readonly SlotOperationDraft[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
  readonly definitions?: readonly SlotOperationDefinition[];
}): SlotOperationPlanV1 {
  return finalizeAuthoredSlotOperationPlan({
    initial: options.initial,
    drafts: options.drafts,
    definitions: options.definitions ?? createBuiltinSlotOperationDefinitions(),
    symbolCodes: options.symbolCodes,
    columns: options.columns,
    rows: options.rows,
  });
}

export function finalizeSlotOperationAuthoringProject(options: {
  readonly project: SlotOperationAuthoringProjectV1;
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
  readonly definitions?: readonly SlotOperationDefinition[];
}): SlotOperationPlanV1 {
  const pending = options.project.edges.findIndex(
    (edge) => edge.review !== "complete",
  );
  if (pending >= 0)
    throw new Error(
      `Authoring edge ${pending} still requires review and cannot be finalized.`,
    );
  const plan = finalizeSlotOperationAuthoringDraft({
    initial: options.project.snapshots[0].snapshot,
    drafts: options.project.edges.flatMap((edge) => edge.drafts),
    symbolCodes: options.symbolCodes,
    columns: options.columns,
    rows: options.rows,
    definitions: options.definitions,
  });
  const expected = options.project.snapshots.at(-1)!.snapshot;
  if (JSON.stringify(plan.final) !== JSON.stringify(expected))
    throw new Error("Authoring project final snapshot does not close exactly.");
  return plan;
}
