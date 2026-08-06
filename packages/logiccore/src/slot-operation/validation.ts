import { LogicParseError } from "../errors";
import { cloneAndFreeze, isRecord } from "../validation";
import type {
  SlotOperationBase,
  SlotOperationOccurrence,
  SlotOperationPlanV1,
  SlotOperationPosition,
  SlotOperationSnapshot,
} from "./types";

const KIND_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/u;

export function toSlotOperationKey(kind: string, version: number): string {
  validateSlotOperationKindVersion(kind, version, "operation");
  return `${kind}@${version}`;
}

export function validateSlotOperationKindVersion(
  kind: string,
  version: number,
  path: string,
): void {
  if (typeof kind !== "string" || !KIND_PATTERN.test(kind))
    throw new LogicParseError(
      `${path}.kind must be a namespaced kebab-case operation kind.`,
    );
  if (!Number.isSafeInteger(version) || version <= 0)
    throw new LogicParseError(
      `${path}.version must be a positive safe integer.`,
    );
}

export function validateSlotOperationSnapshot(
  snapshot: SlotOperationSnapshot,
  options: {
    readonly symbolCodes: Readonly<Record<string, number>>;
    readonly columns: number;
    readonly rows: number;
    readonly path: string;
  },
): void {
  assertPlainData(snapshot, options.path);
  const { columns, rows, path } = options;
  if (!Array.isArray(snapshot.scene) || snapshot.scene.length !== columns)
    throw new LogicParseError(`${path}.scene must contain ${columns} columns.`);
  if (!Array.isArray(snapshot.values) || snapshot.values.length !== columns)
    throw new LogicParseError(
      `${path}.values must contain ${columns} columns.`,
    );
  const symbolsByCode = new Map(
    Object.entries(options.symbolCodes).map(([symbol, code]) => [code, symbol]),
  );
  const occurrenceByPosition = new Map<string, SlotOperationOccurrence>();
  const occurrenceIds = new Set<string>();
  if (!Array.isArray(snapshot.occurrences))
    throw new LogicParseError(`${path}.occurrences must be an array.`);
  for (const [index, occurrence] of snapshot.occurrences.entries()) {
    const occurrencePath = `${path}.occurrences[${index}]`;
    if (!occurrence.id.trim())
      throw new LogicParseError(`${occurrencePath}.id must not be blank.`);
    if (occurrenceIds.has(occurrence.id))
      throw new LogicParseError(
        `${path} contains duplicate occurrence id "${occurrence.id}".`,
      );
    occurrenceIds.add(occurrence.id);
    validatePosition(
      occurrence.position,
      columns,
      rows,
      `${occurrencePath}.position`,
    );
    const key = positionKey(occurrence.position);
    if (occurrenceByPosition.has(key))
      throw new LogicParseError(
        `${path} contains duplicate occurrence position ${key}.`,
      );
    if (symbolsByCode.get(occurrence.code) !== occurrence.symbol)
      throw new LogicParseError(
        `${occurrencePath} code/symbol does not match symbolCodes.`,
      );
    validatePresentationValue(occurrence.value, `${occurrencePath}.value`);
    occurrenceByPosition.set(key, occurrence);
  }
  for (let x = 0; x < columns; x += 1) {
    const sceneColumn = snapshot.scene[x];
    const valueColumn = snapshot.values[x];
    if (!Array.isArray(sceneColumn) || sceneColumn.length !== rows)
      throw new LogicParseError(
        `${path}.scene[${x}] must contain ${rows} rows.`,
      );
    if (!Array.isArray(valueColumn) || valueColumn.length !== rows)
      throw new LogicParseError(
        `${path}.values[${x}] must contain ${rows} rows.`,
      );
    for (let y = 0; y < rows; y += 1) {
      const code = sceneColumn[y];
      const value = valueColumn[y];
      const occurrence = occurrenceByPosition.get(`${x},${y}`);
      if (code === -1) {
        if (value !== -1 || occurrence)
          throw new LogicParseError(
            `${path}[${x}][${y}] hole closure is invalid.`,
          );
        continue;
      }
      if (!Number.isSafeInteger(code) || !symbolsByCode.has(code))
        throw new LogicParseError(
          `${path}.scene[${x}][${y}] uses unknown code ${code}.`,
        );
      validatePresentationValue(value, `${path}.values[${x}][${y}]`);
      if (!occurrence || occurrence.code !== code || occurrence.value !== value)
        throw new LogicParseError(
          `${path}[${x}][${y}] occurrence closure is invalid.`,
        );
    }
  }
}

export function validateSlotOperationPlan(
  plan: SlotOperationPlanV1,
  options: {
    readonly symbolCodes: Readonly<Record<string, number>>;
    readonly columns: number;
    readonly rows: number;
  },
): void {
  if (plan.kind !== "slot-operation-plan" || plan.version !== 1)
    throw new LogicParseError("slot operation plan must be V1.");
  validateSlotOperationSnapshot(plan.initial, {
    ...options,
    path: "plan.initial",
  });
  const ids = new Set<string>();
  let current = plan.initial;
  const required = new Set<string>();
  for (const [index, operation] of plan.operations.entries()) {
    validateSlotOperation(operation, index, options);
    if (operation.operationIndex !== index)
      throw new LogicParseError(
        `plan.operations[${index}].operationIndex must be ${index}.`,
      );
    if (ids.has(operation.id))
      throw new LogicParseError(
        `plan contains duplicate operation id "${operation.id}".`,
      );
    ids.add(operation.id);
    if (!snapshotsEqual(current, operation.input))
      throw new LogicParseError(
        `plan.operations[${index}].input is not continuous.`,
      );
    current = operation.output;
    for (const capability of operation.requiredCapabilities)
      required.add(capability);
  }
  if (!snapshotsEqual(current, plan.final))
    throw new LogicParseError(
      "plan.final does not match the final operation output.",
    );
  if (
    !stringArraysEqual(
      [...required].sort(),
      [...plan.requiredCapabilities].sort(),
    )
  )
    throw new LogicParseError(
      "plan.requiredCapabilities does not match operations.",
    );
}

export function freezeSlotOperationPlan<T extends SlotOperationPlanV1>(
  plan: T,
): T {
  assertPlainData(plan, "plan");
  return cloneAndFreeze(plan);
}

export function assertPlainData(value: unknown, path: string): void {
  const active = new Set<object>();
  const visit = (candidate: unknown, candidatePath: string): void => {
    if (
      candidate === null ||
      typeof candidate === "string" ||
      typeof candidate === "number" ||
      typeof candidate === "boolean"
    )
      return;
    if (
      typeof candidate === "function" ||
      typeof candidate === "symbol" ||
      typeof candidate === "bigint"
    )
      throw new LogicParseError(
        `${candidatePath} must contain plain serializable data.`,
      );
    if (typeof candidate !== "object")
      throw new LogicParseError(`${candidatePath} contains unsupported data.`);
    if (active.has(candidate))
      throw new LogicParseError(
        `${candidatePath} contains a circular reference.`,
      );
    if (!Array.isArray(candidate) && !isRecord(candidate))
      throw new LogicParseError(
        `${candidatePath} must contain plain objects and arrays.`,
      );
    active.add(candidate);
    if (Array.isArray(candidate))
      candidate.forEach((item, index) =>
        visit(item, `${candidatePath}[${index}]`),
      );
    else
      for (const [key, item] of Object.entries(candidate))
        visit(item, `${candidatePath}.${key}`);
    active.delete(candidate);
  };
  visit(value, path);
}

function validateSlotOperation(
  operation: SlotOperationBase,
  index: number,
  options: {
    readonly symbolCodes: Readonly<Record<string, number>>;
    readonly columns: number;
    readonly rows: number;
  },
): void {
  const path = `plan.operations[${index}]`;
  validateSlotOperationKindVersion(operation.kind, operation.version, path);
  if (typeof operation.id !== "string" || !operation.id.trim())
    throw new LogicParseError(`${path}.id must not be blank.`);
  if (operation.commit !== "atomic")
    throw new LogicParseError(`${path}.commit must be "atomic".`);
  validateCapabilities(
    operation.requiredCapabilities,
    `${path}.requiredCapabilities`,
  );
  validateSlotOperationSnapshot(operation.input, {
    ...options,
    path: `${path}.input`,
  });
  validateSlotOperationSnapshot(operation.output, {
    ...options,
    path: `${path}.output`,
  });
  assertPlainData(operation.source, `${path}.source`);
  assertPlainData(operation.payload, `${path}.payload`);
}

function validateCapabilities(values: readonly string[], path: string): void {
  if (!Array.isArray(values))
    throw new LogicParseError(`${path} must be an array.`);
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string" || !KIND_PATTERN.test(value))
      throw new LogicParseError(
        `${path}[${index}] must be namespaced kebab-case.`,
      );
    if (seen.has(value))
      throw new LogicParseError(`${path} contains duplicate "${value}".`);
    seen.add(value);
  }
}

function validatePosition(
  value: SlotOperationPosition,
  columns: number,
  rows: number,
  path: string,
): void {
  if (
    !value ||
    !Number.isSafeInteger(value.x) ||
    !Number.isSafeInteger(value.y) ||
    value.x < 0 ||
    value.y < 0 ||
    value.x >= columns ||
    value.y >= rows
  )
    throw new LogicParseError(`${path} is out of bounds.`);
}

function validatePresentationValue(value: unknown, path: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 0))
    throw new LogicParseError(
      `${path} must be null or a non-negative safe integer.`,
    );
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

function stringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
