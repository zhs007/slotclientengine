import { LogicParseError } from "../errors";
import { cloneAndFreeze } from "../validation";
import type { SlotOperationPosition, SlotOperationSnapshot } from "./types";
import type {
  SlotOperationDefinitionV2,
  SlotOperationDraftV2,
  SlotOperationPlanV2,
  SlotOperationV2,
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
    validateDraftFields(draft, operationIndex);
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
        validateSlotOperationSnapshot(draft.output, {
          ...dimensions,
          path: `drafts[${operationIndex}].output`,
        });
        operation = {
          ...envelope,
          effect: draft.effect,
          output: draft.output,
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
  const plan = {
    kind: "slot-operation-plan" as const,
    version: 2 as const,
    operations: Object.freeze(operations),
    final: current,
  };
  assertPlainData(plan, "plan");
  return cloneAndFreeze(plan);
}

function validateDraftFields(draft: SlotOperationDraftV2, index: number): void {
  const allowed = new Set([
    "effect",
    "kind",
    "version",
    "source",
    "payload",
    "businessKey",
    ...(draft.effect === "presentation" ? ["targets"] : ["output"]),
  ]);
  const unknown = Object.keys(draft).find((field) => !allowed.has(field));
  if (unknown)
    throw new LogicParseError(`drafts[${index}].${unknown} is not supported.`);
}

function definitionMap(values: readonly SlotOperationDefinitionV2[]) {
  const map = new Map<string, SlotOperationDefinitionV2>();
  for (const definition of values) {
    const key = toSlotOperationKey(definition.kind, definition.version);
    if (map.has(key))
      throw new LogicParseError(
        `Duplicate V2 slot operation definition ${key}.`,
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
    const key = `${positionKey(target.position)}:${target.role ?? ""}`;
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

function positionKey(position: SlotOperationPosition): string {
  return `${position.x},${position.y}`;
}
