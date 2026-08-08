import type { SceneMatrix, WinResult } from "../types";

export type SlotOperationPresentationValue = number | null;
export type SlotOperationValueMatrix = readonly (readonly (
  | SlotOperationPresentationValue
  | -1
)[])[];

export interface SlotOperationPosition {
  readonly x: number;
  readonly y: number;
}

export interface SlotOperationSnapshot {
  readonly scene: SceneMatrix;
  readonly values: SlotOperationValueMatrix;
}

export interface IndexedSceneSelection {
  readonly index: number;
  readonly value: SceneMatrix;
}

export interface IndexedOtherSceneSelection {
  readonly index: number;
  readonly value: SceneMatrix;
}

export interface IndexedResultSelection {
  readonly index: number;
  readonly value: WinResult;
}

export interface ComponentSelection {
  readonly componentName: string;
  readonly componentIndex?: number;
  readonly scenes: readonly IndexedSceneSelection[];
  readonly otherScenes: readonly IndexedOtherSceneSelection[];
  readonly results: readonly IndexedResultSelection[];
  readonly positions: readonly SlotOperationPosition[];
}

export interface ServerComponentOperationSource {
  readonly kind: "server-component";
  readonly stepIndex: number;
  readonly bindings: Readonly<Record<string, ComponentSelection>>;
}

export interface AuthoringSuggestionEvidence {
  readonly field: string;
  readonly status: "exact" | "ambiguous" | "unresolved";
  readonly candidateCount: number;
  readonly diagnostics: readonly string[];
}

export interface AuthoringEditEvidence {
  readonly field: string;
  readonly action: "accept" | "select" | "replace" | "insert" | "remove";
  readonly reason?: string;
}

export interface SnapshotAuthoredOperationSource {
  readonly kind: "snapshot-authored";
  readonly inputSnapshotId: string;
  readonly outputSnapshotId: string;
  readonly suggestions: readonly AuthoringSuggestionEvidence[];
  readonly edits: readonly AuthoringEditEvidence[];
}

export type SlotOperationSource =
  | ServerComponentOperationSource
  | SnapshotAuthoredOperationSource;
