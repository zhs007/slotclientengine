import type {
  AuthoringEditEvidence,
  AuthoringSuggestionEvidence,
  SlotOperationDraft,
  SlotOperationPosition,
  SlotOperationSnapshot,
} from "@slotclientengine/logiccore";

export interface AuthoringSuggestion<Value> {
  readonly status: "exact" | "ambiguous" | "unresolved";
  readonly candidates: readonly Value[];
  readonly inspectedPositions: readonly SlotOperationPosition[];
  readonly diagnostics: readonly string[];
}

export interface SceneCellChange {
  readonly position: SlotOperationPosition;
  readonly inputCode: number;
  readonly outputCode: number;
}

export interface OccurrenceValueUpdate {
  readonly position: SlotOperationPosition;
  readonly inputValue: number | null;
  readonly outputValue: number | null;
}

export interface SymbolReplacement {
  readonly position: SlotOperationPosition;
  readonly inputCode: number;
  readonly outputCode: number;
  readonly outputValue: number | null;
}

export interface OccurrenceMovement {
  readonly occurrenceId: string;
  readonly source: SlotOperationPosition;
  readonly target: SlotOperationPosition;
}

export interface DropdownDerivation {
  readonly movements: readonly OccurrenceMovement[];
  readonly heldOccurrenceIds: readonly string[];
}

export interface RelocationDerivation {
  readonly movements: readonly OccurrenceMovement[];
}

export interface AuthoredOperationProof<Value> {
  readonly kind: "snapshot-authored";
  readonly value: Value;
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
  readonly suggestions: readonly AuthoringSuggestionEvidence[];
  readonly edits: readonly AuthoringEditEvidence[];
}

export interface SlotOperationAuthoringSnapshot {
  readonly id: string;
  readonly snapshot: SlotOperationSnapshot;
}

export interface SlotOperationAuthoringEdge {
  readonly inputSnapshotId: string;
  readonly outputSnapshotId: string;
  readonly drafts: readonly SlotOperationDraft[];
  readonly review: "required" | "complete";
}

export interface SlotOperationAuthoringProjectV1 {
  readonly kind: "slot-operation-authoring-project";
  readonly version: 1;
  readonly snapshots: readonly [
    SlotOperationAuthoringSnapshot,
    SlotOperationAuthoringSnapshot,
    ...SlotOperationAuthoringSnapshot[],
  ];
  readonly edges: readonly SlotOperationAuthoringEdge[];
}
