import { LogicParseError } from "../errors";
import { cloneAndFreeze } from "../validation";
import type {
  SlotOperationOccurrence,
  SlotOperationPosition,
  SlotOperationSnapshot,
} from "./types";
import type {
  SlotOperationDefinitionV2,
  SlotOperationDraftV2,
  SlotOperationPlanV2,
  SlotOperationV2,
  SlotStateMutation,
} from "./v2-types";
import {
  assertPlainData,
  toSlotOperationKey,
  validateSlotOperationSnapshot,
} from "./validation";

export interface FinalizeSlotOperationPlanV2Options {
  readonly drafts: readonly SlotOperationDraftV2[];
  readonly definitions: readonly SlotOperationDefinitionV2[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
}

export function finalizeSlotOperationPlanV2(
  options: FinalizeSlotOperationPlanV2Options,
): SlotOperationPlanV2 {
  const dimensions = {
    symbolCodes: Object.freeze({ ...options.symbolCodes }),
    columns: requireSize(options.columns, "columns"),
    rows: requireSize(options.rows, "rows"),
  };
  const definitions = definitionMap(options.definitions);
  const ids = new Set<string>();
  let current: SlotOperationSnapshot | null = null;
  const operations: SlotOperationV2[] = [];

  for (const [operationIndex, draft] of options.drafts.entries()) {
    assertPlainData(draft, `drafts[${operationIndex}]`);
    const key = toSlotOperationKey(draft.kind, draft.version);
    const definition = definitions.get(key);
    if (!definition)
      throw new LogicParseError(
        `No V2 slot operation definition is registered for ${key}.`,
      );
    if (definition.effect !== draft.effect)
      throw new LogicParseError(
        `${key} definition effect ${definition.effect} does not match draft effect ${draft.effect}.`,
      );
    if (definition.requiresEstablishedScene === true && current === null)
      throw new LogicParseError(`${key} requires an established scene.`);
    validateSource(draft.source, operationIndex);
    const id = operationId(draft, operationIndex);
    if (ids.has(id))
      throw new LogicParseError(`Duplicate V2 operation id "${id}".`);
    ids.add(id);
    const envelope = {
      id,
      kind: draft.kind,
      version: draft.version,
      operationIndex,
      source: draft.source,
      payload: draft.payload,
      requiredCapabilities: Object.freeze([...definition.requiredCapabilities]),
      commit: "atomic" as const,
    };

    let operation: SlotOperationV2;
    switch (draft.effect) {
      case "scene-landing":
        validateSlotOperationSnapshot(draft.output, {
          ...dimensions,
          path: `drafts[${operationIndex}].output`,
        });
        operation = { ...envelope, effect: draft.effect, output: draft.output };
        current = draft.output;
        break;
      case "presentation":
        validateTargets(
          draft.targets,
          dimensions.columns,
          dimensions.rows,
          operationIndex,
        );
        operation = {
          ...envelope,
          effect: draft.effect,
          ...(draft.targets === undefined ? {} : { targets: draft.targets }),
        };
        break;
      case "state-mutation": {
        if (current === null)
          throw new LogicParseError(
            `${key} mutation has no established scene.`,
          );
        if (!snapshotsEqual(current, draft.input))
          throw new LogicParseError(
            `drafts[${operationIndex}].input is not continuous.`,
          );
        validateSlotOperationSnapshot(draft.input, {
          ...dimensions,
          path: `drafts[${operationIndex}].input`,
        });
        validateSlotOperationSnapshot(draft.output, {
          ...dimensions,
          path: `drafts[${operationIndex}].output`,
        });
        const reduced = definition.reduceMutations
          ? definition.reduceMutations({
              input: draft.input,
              mutations: draft.mutations,
              ...dimensions,
            })
          : applySlotStateMutations({
              input: draft.input,
              mutations: draft.mutations,
              ...dimensions,
            });
        if (!snapshotsEqual(reduced, draft.output))
          throw new LogicParseError(
            `drafts[${operationIndex}].mutations do not produce the declared output.`,
          );
        operation = {
          ...envelope,
          effect: draft.effect,
          input: draft.input,
          output: draft.output,
          mutations: draft.mutations,
        };
        current = draft.output;
        break;
      }
    }
    definition.validate?.(operation);
    operations.push(operation);
  }
  if (current === null)
    throw new LogicParseError("V2 slot operation plan must establish a scene.");
  const requiredCapabilities = Object.freeze([
    ...new Set(
      operations.flatMap((operation) => operation.requiredCapabilities),
    ),
  ]);
  const plan = {
    kind: "slot-operation-plan" as const,
    version: 2 as const,
    operations: Object.freeze(operations),
    final: current,
    requiredCapabilities,
  };
  assertPlainData(plan, "plan");
  return cloneAndFreeze(plan);
}

export function applySlotStateMutations(options: {
  readonly input: SlotOperationSnapshot;
  readonly mutations: readonly SlotStateMutation[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
}): SlotOperationSnapshot {
  if (!Array.isArray(options.mutations) || options.mutations.length === 0)
    throw new LogicParseError("state mutation list must not be empty.");
  const names = new Map(
    Object.entries(options.symbolCodes).map(([symbol, code]) => [code, symbol]),
  );
  const original = new Map(
    options.input.occurrences.map((item) => [positionKey(item.position), item]),
  );
  const output = new Map(original);
  const sources = new Set<string>();
  const targets = new Set<string>();
  const relocations: {
    readonly mutation: Extract<
      SlotStateMutation,
      { readonly kind: "relocate" }
    >;
    readonly occurrence: SlotOperationOccurrence;
  }[] = [];
  const insertions: Extract<SlotStateMutation, { readonly kind: "insert" }>[] =
    [];

  for (const [index, mutation] of options.mutations.entries()) {
    validatePosition(
      mutationPosition(mutation),
      options.columns,
      options.rows,
      `mutations[${index}]`,
    );
    switch (mutation.kind) {
      case "remove": {
        const key = positionKey(mutation.position);
        claim(sources, key, `mutations[${index}] source`);
        requireOccurrence(original, key, mutation.occurrenceId, index);
        output.delete(key);
        break;
      }
      case "relocate": {
        validatePosition(
          mutation.target,
          options.columns,
          options.rows,
          `mutations[${index}].target`,
        );
        const sourceKey = positionKey(mutation.source);
        const targetKey = positionKey(mutation.target);
        if (sourceKey === targetKey)
          throw new LogicParseError(
            `mutations[${index}] relocate must change position.`,
          );
        claim(sources, sourceKey, `mutations[${index}] source`);
        claim(targets, targetKey, `mutations[${index}] target`);
        const occurrence = requireOccurrence(
          original,
          sourceKey,
          mutation.occurrenceId,
          index,
        );
        relocations.push({ mutation, occurrence });
        break;
      }
      case "replace": {
        const key = positionKey(mutation.position);
        claim(sources, key, `mutations[${index}] source`);
        const occurrence = requireOccurrence(
          original,
          key,
          mutation.inputOccurrenceId,
          index,
        );
        const symbol = requireSymbol(names, mutation.outputCode, index);
        validateValue(mutation.outputValue, index);
        output.set(
          key,
          Object.freeze({
            ...occurrence,
            id: mutation.outputOccurrenceId ?? occurrence.id,
            code: mutation.outputCode,
            symbol,
            value: mutation.outputValue,
          }),
        );
        break;
      }
      case "value-update": {
        const key = positionKey(mutation.position);
        claim(sources, key, `mutations[${index}] source`);
        const occurrence = requireOccurrence(
          original,
          key,
          mutation.occurrenceId,
          index,
        );
        if (occurrence.value !== mutation.inputValue)
          throw new LogicParseError(
            `mutations[${index}] inputValue does not match occurrence.`,
          );
        validateValue(mutation.outputValue, index);
        if (mutation.inputValue === mutation.outputValue)
          throw new LogicParseError(
            `mutations[${index}] value-update is a no-op.`,
          );
        output.set(
          key,
          Object.freeze({ ...occurrence, value: mutation.outputValue }),
        );
        break;
      }
      case "insert": {
        const key = positionKey(mutation.position);
        claim(targets, key, `mutations[${index}] target`);
        requireSymbol(names, mutation.outputCode, index);
        validateValue(mutation.outputValue, index);
        insertions.push(mutation);
        break;
      }
      default:
        throw new LogicParseError(`mutations[${index}] has unknown kind.`);
    }
  }
  for (const { mutation } of relocations)
    output.delete(positionKey(mutation.source));
  for (const { mutation, occurrence } of relocations)
    output.set(
      positionKey(mutation.target),
      Object.freeze({ ...occurrence, position: mutation.target }),
    );
  for (const [index, mutation] of insertions.entries()) {
    const key = positionKey(mutation.position);
    if (output.has(key))
      throw new LogicParseError(`insert mutation target ${key} is not a hole.`);
    output.set(
      key,
      Object.freeze({
        id: mutation.occurrenceId,
        code: mutation.outputCode,
        symbol: requireSymbol(names, mutation.outputCode, index),
        value: mutation.outputValue,
        position: mutation.position,
      }),
    );
  }
  const occurrences = [...output.values()].sort(
    (left, right) =>
      left.position.x - right.position.x || left.position.y - right.position.y,
  );
  const snapshot = snapshotFromOccurrences(options.input, occurrences);
  validateSlotOperationSnapshot(snapshot, {
    ...options,
    path: "mutation.output",
  });
  return snapshot;
}

function definitionMap(values: readonly SlotOperationDefinitionV2[]) {
  const map = new Map<string, SlotOperationDefinitionV2>();
  for (const definition of values) {
    const key = toSlotOperationKey(definition.kind, definition.version);
    if (map.has(key))
      throw new LogicParseError(
        `Duplicate V2 slot operation definition ${key}.`,
      );
    if (!Array.isArray(definition.requiredCapabilities))
      throw new LogicParseError(
        `${key} requiredCapabilities must be an array.`,
      );
    map.set(key, definition);
  }
  return map;
}

function validateSource(
  source: SlotOperationDraftV2["source"],
  index: number,
): void {
  if (source.kind === "snapshot-authored") {
    if (source.suggestions.some((item) => item.status !== "exact"))
      throw new LogicParseError(
        `drafts[${index}] contains unresolved suggestions.`,
      );
    return;
  }
  if (source.kind !== "server-component")
    throw new LogicParseError(`drafts[${index}] source kind is unknown.`);
}

function operationId(draft: SlotOperationDraftV2, index: number): string {
  const suffix = draft.businessKey?.trim() || String(index);
  if (!suffix.trim())
    throw new LogicParseError(
      `drafts[${index}].businessKey must not be blank.`,
    );
  if (draft.businessKey?.startsWith(`${draft.kind}:`)) return draft.businessKey;
  return `${draft.kind}:${suffix}`;
}

function validateTargets(
  targets:
    | readonly {
        readonly position: SlotOperationPosition;
        readonly occurrenceId?: string;
        readonly role?: string;
      }[]
    | undefined,
  columns: number,
  rows: number,
  operationIndex: number,
): void {
  if (targets === undefined) return;
  if (!Array.isArray(targets))
    throw new LogicParseError(
      `drafts[${operationIndex}].targets must be an array.`,
    );
  const seen = new Set<string>();
  for (const [index, target] of targets.entries()) {
    validatePosition(
      target.position,
      columns,
      rows,
      `drafts[${operationIndex}].targets[${index}]`,
    );
    const key = `${positionKey(target.position)}:${target.occurrenceId ?? ""}:${target.role ?? ""}`;
    if (seen.has(key))
      throw new LogicParseError(
        `drafts[${operationIndex}].targets contains a duplicate.`,
      );
    seen.add(key);
  }
}

function requireSize(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new LogicParseError(`${path} must be a positive safe integer.`);
  return value;
}

function mutationPosition(mutation: SlotStateMutation): SlotOperationPosition {
  return mutation.kind === "relocate" ? mutation.source : mutation.position;
}

function validatePosition(
  position: SlotOperationPosition,
  columns: number,
  rows: number,
  path: string,
): void {
  if (
    !position ||
    !Number.isSafeInteger(position.x) ||
    !Number.isSafeInteger(position.y) ||
    position.x < 0 ||
    position.y < 0 ||
    position.x >= columns ||
    position.y >= rows
  )
    throw new LogicParseError(`${path} position is out of bounds.`);
}

function requireOccurrence(
  occurrences: ReadonlyMap<string, SlotOperationOccurrence>,
  key: string,
  occurrenceId: string,
  index: number,
): SlotOperationOccurrence {
  const occurrence = occurrences.get(key);
  if (!occurrence || occurrence.id !== occurrenceId)
    throw new LogicParseError(
      `mutations[${index}] occurrence evidence does not match input.`,
    );
  return occurrence;
}

function requireSymbol(
  names: ReadonlyMap<number, string>,
  code: number,
  index: number,
): string {
  const symbol = names.get(code);
  if (!symbol)
    throw new LogicParseError(`mutations[${index}] outputCode is unknown.`);
  return symbol;
}

function validateValue(value: unknown, index: number): void {
  if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 0))
    throw new LogicParseError(`mutations[${index}] output value is invalid.`);
}

function claim(set: Set<string>, key: string, path: string): void {
  if (set.has(key)) throw new LogicParseError(`${path} is duplicated.`);
  set.add(key);
}

function snapshotFromOccurrences(
  input: SlotOperationSnapshot,
  occurrences: readonly SlotOperationOccurrence[],
): SlotOperationSnapshot {
  const byPosition = new Map(
    occurrences.map((item) => [positionKey(item.position), item]),
  );
  return {
    scene: input.scene.map((column, x) =>
      column.map((_value, y) => byPosition.get(`${x},${y}`)?.code ?? -1),
    ),
    values: input.values.map((column, x) =>
      column.map((_value, y) => {
        const occurrence = byPosition.get(`${x},${y}`);
        return occurrence ? occurrence.value : -1;
      }),
    ),
    occurrences,
  };
}

function positionKey(position: SlotOperationPosition): string {
  return `${position.x},${position.y}`;
}

function snapshotsEqual(
  left: SlotOperationSnapshot,
  right: SlotOperationSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
