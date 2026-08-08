import type {
  SlotOperationDefinitionV2,
  SlotOperationDraftV2,
  SlotPresentationDraftV2,
  SlotPresentationTarget,
  SlotSceneLandingDraftV2,
  SlotStateMutationDraftV2,
} from "./v2-types";
import type { SlotOperationSnapshot, SlotOperationSource } from "./types";
import type { StrictComponentSelection } from "./server-view";

export function createBuiltinSlotOperationDefinitionsV2(): readonly SlotOperationDefinitionV2[] {
  return Object.freeze([
    definition("slot:spin", "scene-landing"),
    definition("slot:scene-landing", "scene-landing"),
    definition("slot:win", "presentation", true),
    definition("slot:win-remove", "state-mutation", true),
    definition("slot:completion", "presentation", true),
    definition("slot:settled-presentation", "presentation", true),
    definition("slot:dropdown-presentation", "presentation", true),
    definition("slot:refill-presentation", "presentation", true),
    definition("slot:dropdown", "state-mutation", true),
    definition("slot:refill", "state-mutation", true),
    definition("slot:state-mutation", "state-mutation", true),
  ]);
}

export function generateSpinOperation(options: {
  readonly source: SlotOperationSource;
  readonly output: SlotOperationSnapshot;
  readonly payload?: unknown;
  readonly businessKey?: string;
}): SlotSceneLandingDraftV2<"slot:spin", 2> {
  return landing("slot:spin", options);
}

export function generateSceneLandingOperation(options: {
  readonly source: SlotOperationSource;
  readonly output: SlotOperationSnapshot;
  readonly payload?: unknown;
  readonly businessKey?: string;
}): SlotSceneLandingDraftV2<"slot:scene-landing", 2> {
  return landing("slot:scene-landing", options);
}

export function generateWinPresentation(
  selection: StrictComponentSelection,
  options: {
    readonly targets?: readonly SlotPresentationTarget[];
    readonly payload?: unknown;
    readonly businessKey?: string;
  } = {},
): SlotPresentationDraftV2<"slot:win", 2> | null {
  if (selection.presence === "absent") return null;
  return presentation("slot:win", {
    source: selection.source,
    targets:
      options.targets ??
      selection.positions().map((position) => ({ position })),
    payload: options.payload,
    businessKey: options.businessKey,
  });
}

export function generateCompletionPresentation(options: {
  readonly source: SlotOperationSource;
  readonly payload?: unknown;
  readonly businessKey?: string;
}): SlotPresentationDraftV2<"slot:completion", 2> {
  return presentation("slot:completion", options);
}

export function generateDropdownOperation(options: {
  readonly source: SlotOperationSource;
  readonly output: SlotOperationSnapshot;
  readonly payload?: unknown;
  readonly businessKey?: string;
}): SlotStateMutationDraftV2<"slot:dropdown", 2> {
  return stateOperation("slot:dropdown", options);
}

export function generateRefillOperation(options: {
  readonly source: SlotOperationSource;
  readonly output: SlotOperationSnapshot;
  readonly payload?: unknown;
  readonly businessKey?: string;
}): SlotStateMutationDraftV2<"slot:refill", 2> {
  return stateOperation("slot:refill", options);
}

export function compactOperations(
  values: readonly (SlotOperationDraftV2 | null)[],
): readonly SlotOperationDraftV2[] {
  return Object.freeze(
    values.filter((value): value is SlotOperationDraftV2 => value !== null),
  );
}

function definition(
  kind: string,
  effect: "scene-landing" | "presentation" | "state-mutation",
  requiresEstablishedScene = false,
): SlotOperationDefinitionV2 {
  return Object.freeze({
    kind,
    version: 2,
    effect,
    ...(effect === "presentation" || effect === "state-mutation"
      ? { requiresEstablishedScene }
      : {}),
  });
}

function landing<Kind extends string>(
  kind: Kind,
  options: {
    readonly source: SlotOperationSource;
    readonly output: SlotOperationSnapshot;
    readonly payload?: unknown;
    readonly businessKey?: string;
  },
): SlotSceneLandingDraftV2<Kind, 2> {
  return Object.freeze({
    effect: "scene-landing" as const,
    kind,
    version: 2 as const,
    source: options.source,
    output: options.output,
    payload: options.payload ?? Object.freeze({}),
    ...(options.businessKey === undefined
      ? {}
      : { businessKey: options.businessKey }),
  });
}

function presentation<Kind extends string>(
  kind: Kind,
  options: {
    readonly source: SlotOperationSource;
    readonly targets?: readonly SlotPresentationTarget[];
    readonly payload?: unknown;
    readonly businessKey?: string;
  },
): SlotPresentationDraftV2<Kind, 2> {
  return Object.freeze({
    effect: "presentation" as const,
    kind,
    version: 2 as const,
    source: options.source,
    payload: options.payload ?? Object.freeze({}),
    ...(options.targets === undefined ? {} : { targets: options.targets }),
    ...(options.businessKey === undefined
      ? {}
      : { businessKey: options.businessKey }),
  });
}

function stateOperation<Kind extends string>(
  kind: Kind,
  options: {
    readonly source: SlotOperationSource;
    readonly output: SlotOperationSnapshot;
    readonly payload?: unknown;
    readonly businessKey?: string;
  },
): SlotStateMutationDraftV2<Kind, 2> {
  return Object.freeze({
    effect: "state-mutation" as const,
    kind,
    version: 2 as const,
    source: options.source,
    output: options.output,
    payload: options.payload ?? Object.freeze({}),
    ...(options.businessKey === undefined
      ? {}
      : { businessKey: options.businessKey }),
  });
}
