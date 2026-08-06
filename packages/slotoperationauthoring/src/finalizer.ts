import {
  createBuiltinSlotOperationDefinitionsV2,
  finalizeSlotOperationPlanV2,
  generateSceneLandingOperation,
  type SlotOperationDefinitionV2,
  type SlotOperationDraftV2,
  type SlotOperationPlanV2,
  type SlotOperationSnapshot,
} from "@slotclientengine/logiccore";
import type { SlotOperationAuthoringProjectV2 } from "./types.js";

export function finalizeSlotOperationAuthoringDraft(options: {
  readonly initial: SlotOperationSnapshot;
  readonly drafts: readonly SlotOperationDraftV2[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
  readonly definitions?: readonly SlotOperationDefinitionV2[];
}): SlotOperationPlanV2 {
  const source = {
    kind: "snapshot-authored" as const,
    inputSnapshotId: "initial",
    outputSnapshotId: "initial",
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
  const drafts =
    options.drafts[0]?.effect === "scene-landing"
      ? options.drafts
      : [
          generateSceneLandingOperation({
            source,
            output: options.initial,
            businessKey: "authoring-initial",
          }),
          ...options.drafts,
        ];
  return finalizeSlotOperationPlanV2({
    drafts,
    definitions:
      options.definitions ?? createBuiltinSlotOperationDefinitionsV2(),
    symbolCodes: options.symbolCodes,
    columns: options.columns,
    rows: options.rows,
  });
}

export function finalizeSlotOperationAuthoringProject(options: {
  readonly project: SlotOperationAuthoringProjectV2;
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
  readonly definitions?: readonly SlotOperationDefinitionV2[];
}): SlotOperationPlanV2 {
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
