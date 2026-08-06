import type { GameLogic, SceneMatrix, WinResult } from "../types";

export type SlotOperationPresentationValue = number | null;
export type SlotOperationValueMatrix = readonly (readonly (
  | SlotOperationPresentationValue
  | -1
)[])[];

export interface SlotOperationPosition {
  readonly x: number;
  readonly y: number;
}

export interface SlotOperationOccurrence {
  readonly id: string;
  readonly code: number;
  readonly symbol: string;
  readonly value: SlotOperationPresentationValue;
  readonly position: SlotOperationPosition;
}

export interface SlotOperationSnapshot {
  readonly scene: SceneMatrix;
  readonly values: SlotOperationValueMatrix;
  readonly occurrences: readonly SlotOperationOccurrence[];
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

export interface SlotOperationBase<
  Kind extends string = string,
  Version extends number = number,
  Source extends SlotOperationSource = SlotOperationSource,
  Payload = unknown,
> {
  readonly id: string;
  readonly kind: Kind;
  readonly version: Version;
  readonly operationIndex: number;
  readonly source: Source;
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
  readonly payload: Payload;
  readonly requiredCapabilities: readonly string[];
  readonly commit: "atomic";
}

export interface SlotOperationPlanV1<
  Operation extends SlotOperationBase = SlotOperationBase,
> {
  readonly kind: "slot-operation-plan";
  readonly version: 1;
  readonly initial: SlotOperationSnapshot;
  readonly operations: readonly Operation[];
  readonly final: SlotOperationSnapshot;
  readonly requiredCapabilities: readonly string[];
}

export interface SlotOperationDraft<
  Kind extends string = string,
  Version extends number = number,
  Source extends SlotOperationSource = SlotOperationSource,
  Payload = unknown,
> {
  readonly id: string;
  readonly kind: Kind;
  readonly version: Version;
  readonly source: Source;
  readonly payload: Payload;
}

export interface SlotOperationCompileResult<Payload = unknown> {
  readonly output: SlotOperationSnapshot;
  readonly payload: Payload;
  readonly requiredCapabilities: readonly string[];
}

export interface SlotOperationCompileHelpers {
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
}

export interface SlotOperationDefinition<
  Draft extends SlotOperationDraft = SlotOperationDraft,
  Payload = unknown,
> {
  readonly kind: Draft["kind"];
  readonly version: Draft["version"];
  compile(context: {
    readonly logic: GameLogic | null;
    readonly input: SlotOperationSnapshot;
    readonly draft: Draft;
    readonly helpers: SlotOperationCompileHelpers;
  }): SlotOperationCompileResult<Payload>;
  validate?(operation: SlotOperationBase): void;
}

export interface SlotOperationProgramCompileContext {
  readonly logic: GameLogic;
  readonly initial: SlotOperationSnapshot;
  readonly helpers: SlotOperationCompileHelpers;
}

export interface SlotOperationProgramCompiler<
  Draft extends SlotOperationDraft = SlotOperationDraft,
> {
  compile(context: SlotOperationProgramCompileContext): readonly Draft[];
}
