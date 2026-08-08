import type {
  AuthoringEditEvidence,
  AuthoringSuggestionEvidence,
  SlotOperationDraftV2,
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

export interface CellValueUpdate {
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

export interface PositionMovement {
  readonly source: SlotOperationPosition;
  readonly target: SlotOperationPosition;
}

export interface DropdownDerivation {
  readonly movements: readonly PositionMovement[];
  readonly heldPositions: readonly SlotOperationPosition[];
}

export interface RelocationDerivation {
  readonly movements: readonly PositionMovement[];
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
  readonly drafts: readonly SlotOperationDraftV2[];
  readonly review: "required" | "complete";
}

export interface SlotOperationAuthoringProjectV2 {
  readonly kind: "slot-operation-authoring-project";
  readonly version: 2;
  readonly snapshots: readonly [
    SlotOperationAuthoringSnapshot,
    SlotOperationAuthoringSnapshot,
    ...SlotOperationAuthoringSnapshot[],
  ];
  readonly edges: readonly SlotOperationAuthoringEdge[];
}
