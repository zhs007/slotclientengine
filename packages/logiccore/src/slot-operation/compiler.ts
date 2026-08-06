import { LogicParseError } from "../errors";
import type { GameLogic } from "../types";
import type {
  SlotOperationBase,
  SlotOperationDefinition,
  SlotOperationDraft,
  SlotOperationPlanV1,
  SlotOperationProgramCompiler,
  SlotOperationSnapshot,
} from "./types";
import {
  freezeSlotOperationPlan,
  toSlotOperationKey,
  validateSlotOperationPlan,
  validateSlotOperationSnapshot,
} from "./validation";

export function compileSlotOperationPlan(options: {
  readonly logic: GameLogic;
  readonly initial: SlotOperationSnapshot;
  readonly compiler: SlotOperationProgramCompiler;
  readonly definitions: readonly SlotOperationDefinition[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
}): SlotOperationPlanV1 {
  const helpers = Object.freeze({
    symbolCodes: Object.freeze({ ...options.symbolCodes }),
    columns: requirePositiveSize(options.columns, "columns"),
    rows: requirePositiveSize(options.rows, "rows"),
  });
  validateSlotOperationSnapshot(options.initial, {
    ...helpers,
    path: "initial",
  });
  const definitions = createDefinitionMap(options.definitions);
  const drafts = options.compiler.compile({
    logic: options.logic,
    initial: options.initial,
    helpers,
  });
  if (!Array.isArray(drafts))
    throw new LogicParseError(
      "slot operation program compiler must return an array.",
    );
  let current = options.initial;
  const operations: SlotOperationBase[] = [];
  for (const [operationIndex, draft] of drafts.entries()) {
    const definition = definitions.get(
      toSlotOperationKey(draft.kind, draft.version),
    );
    if (!definition)
      throw new LogicParseError(
        `No slot operation definition is registered for ${draft.kind}@${draft.version}.`,
      );
    const result = definition.compile({
      logic: options.logic,
      input: current,
      draft,
      helpers,
    });
    const operation: SlotOperationBase = {
      id: draft.id,
      kind: draft.kind,
      version: draft.version,
      operationIndex,
      source: draft.source,
      input: current,
      output: result.output,
      payload: result.payload,
      requiredCapabilities: [...result.requiredCapabilities],
      commit: "atomic",
    };
    definition.validate?.(operation);
    operations.push(operation);
    current = result.output;
  }
  const requiredCapabilities = [
    ...new Set(
      operations.flatMap((operation) => operation.requiredCapabilities),
    ),
  ];
  const plan = freezeSlotOperationPlan({
    kind: "slot-operation-plan" as const,
    version: 1 as const,
    initial: options.initial,
    operations,
    final: current,
    requiredCapabilities,
  });
  validateSlotOperationPlan(plan, helpers);
  return plan;
}

export function finalizeAuthoredSlotOperationPlan(options: {
  readonly initial: SlotOperationSnapshot;
  readonly drafts: readonly SlotOperationDraft[];
  readonly definitions: readonly SlotOperationDefinition[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
}): SlotOperationPlanV1 {
  const noServerLogic = null;
  const helpers = Object.freeze({
    symbolCodes: Object.freeze({ ...options.symbolCodes }),
    columns: requirePositiveSize(options.columns, "columns"),
    rows: requirePositiveSize(options.rows, "rows"),
  });
  validateSlotOperationSnapshot(options.initial, {
    ...helpers,
    path: "initial",
  });
  const definitions = createDefinitionMap(options.definitions);
  let current = options.initial;
  const operations = options.drafts.map((draft, operationIndex) => {
    if (draft.source.kind !== "snapshot-authored")
      throw new LogicParseError(
        `authored draft[${operationIndex}] must use snapshot-authored source.`,
      );
    if (draft.source.suggestions.some((item) => item.status !== "exact"))
      throw new LogicParseError(
        `authored draft[${operationIndex}] contains unresolved suggestions.`,
      );
    const definition = definitions.get(
      toSlotOperationKey(draft.kind, draft.version),
    );
    if (!definition)
      throw new LogicParseError(
        `No authored definition for ${draft.kind}@${draft.version}.`,
      );
    const result = definition.compile({
      logic: noServerLogic,
      input: current,
      draft,
      helpers,
    });
    const operation: SlotOperationBase = {
      id: draft.id,
      kind: draft.kind,
      version: draft.version,
      operationIndex,
      source: draft.source,
      input: current,
      output: result.output,
      payload: result.payload,
      requiredCapabilities: [...result.requiredCapabilities],
      commit: "atomic",
    };
    definition.validate?.(operation);
    current = result.output;
    return operation;
  });
  const plan = freezeSlotOperationPlan({
    kind: "slot-operation-plan" as const,
    version: 1 as const,
    initial: options.initial,
    operations,
    final: current,
    requiredCapabilities: [
      ...new Set(
        operations.flatMap((operation) => operation.requiredCapabilities),
      ),
    ],
  });
  validateSlotOperationPlan(plan, helpers);
  return plan;
}

function createDefinitionMap(
  values: readonly SlotOperationDefinition[],
): ReadonlyMap<string, SlotOperationDefinition> {
  const definitions = new Map<string, SlotOperationDefinition>();
  for (const definition of values) {
    const key = toSlotOperationKey(definition.kind, definition.version);
    if (definitions.has(key))
      throw new LogicParseError(`Duplicate slot operation definition ${key}.`);
    definitions.set(key, definition);
  }
  return definitions;
}

function requirePositiveSize(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new LogicParseError(`${path} must be a positive safe integer.`);
  return value;
}
