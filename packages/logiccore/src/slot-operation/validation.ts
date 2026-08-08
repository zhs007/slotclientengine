import { LogicParseError } from "../errors";
import { isRecord } from "../validation";
import type { SlotOperationSnapshot } from "./types";

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
  const unknownField = Object.keys(snapshot).find(
    (field) => field !== "scene" && field !== "values",
  );
  if (unknownField)
    throw new LogicParseError(`${path}.${unknownField} is not supported.`);
  if (!Array.isArray(snapshot.scene) || snapshot.scene.length !== columns)
    throw new LogicParseError(`${path}.scene must contain ${columns} columns.`);
  if (!Array.isArray(snapshot.values) || snapshot.values.length !== columns)
    throw new LogicParseError(
      `${path}.values must contain ${columns} columns.`,
    );
  const symbolsByCode = new Map(
    Object.entries(options.symbolCodes).map(([symbol, code]) => [code, symbol]),
  );
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
      if (code === -1) {
        if (value !== -1)
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
    }
  }
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

function validatePresentationValue(value: unknown, path: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 0))
    throw new LogicParseError(
      `${path} must be null or a non-negative safe integer.`,
    );
}
