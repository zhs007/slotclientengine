import type {
  SlotOperationPosition,
  SlotOperationSnapshot,
  SlotOperationSource,
} from "./types";

export type SlotOperationEffect =
  | "scene-landing"
  | "presentation"
  | "state-mutation";

export interface SlotOperationEnvelopeV2<
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
  readonly payload: Payload;
}

export interface SlotPresentationTarget {
  readonly position: SlotOperationPosition;
  readonly role?: string;
}

export interface SlotSceneLandingOperation<
  Kind extends string = string,
  Version extends number = number,
  Payload = unknown,
> extends SlotOperationEnvelopeV2<Kind, Version, SlotOperationSource, Payload> {
  readonly effect: "scene-landing";
  readonly output: SlotOperationSnapshot;
}

export interface SlotPresentationOperation<
  Kind extends string = string,
  Version extends number = number,
  Payload = unknown,
> extends SlotOperationEnvelopeV2<Kind, Version, SlotOperationSource, Payload> {
  readonly effect: "presentation";
  readonly targets?: readonly SlotPresentationTarget[];
}

export interface SlotChgPositionPayload {
  readonly type: "change";
  readonly pos: readonly SlotOperationPosition[];
}

export interface SlotChgDrivenPayload {
  readonly type: "driven-change";
  readonly mainPos: readonly SlotOperationPosition[];
  readonly pos: readonly SlotOperationPosition[];
}

export interface SlotChgRoute {
  readonly source: SlotOperationPosition;
  readonly target: SlotOperationPosition;
}

export interface SlotChgTransferPayload {
  readonly type: "transfer";
  readonly mainPos: readonly SlotOperationPosition[];
  readonly routes: readonly SlotChgRoute[];
}

/**
 * Generic coordinate relationships for a change operation. The operation key
 * selects the presentation; this payload only describes affected positions.
 */
export type SlotChgPayload =
  | SlotChgPositionPayload
  | SlotChgDrivenPayload
  | SlotChgTransferPayload;

export interface SlotStateMutationOperation<
  Kind extends string = string,
  Version extends number = number,
  Payload = unknown,
> extends SlotOperationEnvelopeV2<Kind, Version, SlotOperationSource, Payload> {
  readonly effect: "state-mutation";
  readonly output: SlotOperationSnapshot;
}

export type SlotChgOperation<Kind extends string = string> =
  SlotStateMutationOperation<Kind, 2, SlotChgPayload>;

export type SlotOperationV2 =
  | SlotSceneLandingOperation
  | SlotPresentationOperation
  | SlotStateMutationOperation;

export interface SlotOperationPlanV2<
  Operation extends SlotOperationV2 = SlotOperationV2,
> {
  readonly kind: "slot-operation-plan";
  readonly version: 2;
  readonly operations: readonly Operation[];
  readonly final: SlotOperationSnapshot;
}

interface SlotOperationDraftEnvelopeV2<
  Effect extends SlotOperationEffect,
  Kind extends string = string,
  Version extends number = number,
  Payload = unknown,
> {
  readonly effect: Effect;
  readonly kind: Kind;
  readonly version: Version;
  readonly source: SlotOperationSource;
  readonly payload: Payload;
  readonly businessKey?: string;
}

export interface SlotSceneLandingDraftV2<
  Kind extends string = string,
  Version extends number = number,
  Payload = unknown,
> extends SlotOperationDraftEnvelopeV2<
  "scene-landing",
  Kind,
  Version,
  Payload
> {
  readonly output: SlotOperationSnapshot;
}

export interface SlotPresentationDraftV2<
  Kind extends string = string,
  Version extends number = number,
  Payload = unknown,
> extends SlotOperationDraftEnvelopeV2<"presentation", Kind, Version, Payload> {
  readonly targets?: readonly SlotPresentationTarget[];
}

export interface SlotStateMutationDraftV2<
  Kind extends string = string,
  Version extends number = number,
  Payload = unknown,
> extends SlotOperationDraftEnvelopeV2<
  "state-mutation",
  Kind,
  Version,
  Payload
> {
  readonly output: SlotOperationSnapshot;
}

export type SlotChgDraftV2<Kind extends string = string> =
  SlotStateMutationDraftV2<Kind, 2, SlotChgPayload>;

export type SlotOperationDraftV2 =
  | SlotSceneLandingDraftV2
  | SlotPresentationDraftV2
  | SlotStateMutationDraftV2;

export interface SlotOperationDefinitionV2<
  Operation extends SlotOperationV2 = SlotOperationV2,
> {
  readonly kind: Operation["kind"];
  readonly version: Operation["version"];
  readonly effect: Operation["effect"];
  readonly requiresEstablishedScene?: boolean;
  validate?(operation: Operation): void;
}
