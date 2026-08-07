import { LogicParseError } from "../errors";
import type {
  ComponentSelection,
  IndexedOtherSceneSelection,
  IndexedResultSelection,
  IndexedSceneSelection,
  SlotOperationOccurrence,
  SlotOperationPosition,
  SlotOperationSnapshot,
} from "./types";

export function requireExactlyOneScene(
  selection: ComponentSelection,
  label = `${selection.componentName}.scene`,
): IndexedSceneSelection {
  return requireExactlyOne(selection.scenes, label);
}

export function requireExactlyOneOtherScene(
  selection: ComponentSelection,
  label = `${selection.componentName}.otherScene`,
): IndexedOtherSceneSelection {
  return requireExactlyOne(selection.otherScenes, label);
}

export function optionalExactlyOneOtherScene(
  selection: ComponentSelection,
  label = `${selection.componentName}.otherScene`,
): IndexedOtherSceneSelection | null {
  if (selection.otherScenes.length === 0) return null;
  return requireExactlyOne(selection.otherScenes, label);
}

export function requireExactlyOneResult(
  selection: ComponentSelection,
  label = `${selection.componentName}.result`,
): IndexedResultSelection {
  return requireExactlyOne(selection.results, label);
}

export function assertExactMatrixShape<T>(
  matrix: readonly (readonly T[])[],
  expected: readonly (readonly unknown[])[],
  label: string,
): void {
  if (!Array.isArray(matrix) || matrix.length !== expected.length)
    throw new LogicParseError(`${label} width differs.`);
  for (let x = 0; x < expected.length; x += 1)
    if (!Array.isArray(matrix[x]) || matrix[x]!.length !== expected[x]!.length)
      throw new LogicParseError(`${label} column[${x}] height differs.`);
}

export function assertExactMatrixEqual<T>(
  actual: readonly (readonly T[])[],
  expected: readonly (readonly T[])[],
  label: string,
): void {
  assertExactMatrixShape(actual, expected, label);
  forEachMatrixCell(expected, (x, y, value) => {
    if (actual[x]![y] !== value)
      throw new LogicParseError(`${label} differs at (${x},${y}).`);
  });
}

export function forEachMatrixCell<T>(
  matrix: readonly (readonly T[])[],
  visit: (x: number, y: number, value: T) => void,
): void {
  for (let x = 0; x < matrix.length; x += 1)
    for (let y = 0; y < matrix[x]!.length; y += 1) visit(x, y, matrix[x]![y]!);
}

export function slotOperationPositionKey(
  position: SlotOperationPosition,
): string {
  return `${position.x},${position.y}`;
}

export function assertExactPositionSet(
  actual: readonly SlotOperationPosition[],
  expected: readonly SlotOperationPosition[],
  label: string,
  options: { readonly mismatchMessage?: string } = {},
): void {
  const actualKeys = uniquePositionKeys(actual, `${label} actual`);
  const expectedKeys = uniquePositionKeys(expected, `${label} expected`);
  if (
    actualKeys.size !== expectedKeys.size ||
    [...actualKeys].some((key) => !expectedKeys.has(key))
  )
    throw new LogicParseError(
      `${label} ${options.mismatchMessage ?? "position set differs"}.`,
    );
}

export function requireOccurrenceAt(
  snapshot: SlotOperationSnapshot,
  position: SlotOperationPosition,
  label: string,
): SlotOperationOccurrence {
  validatePositionInMatrix(position, snapshot.scene, label);
  const matches = snapshot.occurrences.filter(
    (occurrence) =>
      occurrence.position.x === position.x &&
      occurrence.position.y === position.y,
  );
  if (matches.length !== 1)
    throw new LogicParseError(
      `${label} expected exactly one occurrence at ${slotOperationPositionKey(position)}, got ${matches.length}.`,
    );
  return matches[0]!;
}

export function validatePositionInMatrix(
  position: SlotOperationPosition,
  matrix: readonly (readonly unknown[])[],
  label: string,
  options: { readonly rangeMessage?: string } = {},
): SlotOperationPosition {
  if (
    !Number.isSafeInteger(position.x) ||
    !Number.isSafeInteger(position.y) ||
    position.x < 0 ||
    position.y < 0 ||
    position.x >= matrix.length ||
    position.y >= (matrix[position.x]?.length ?? 0)
  )
    throw new LogicParseError(
      `${label} position ${slotOperationPositionKey(position)} ${options.rangeMessage ?? "is out of range"}.`,
    );
  return position;
}

export function decodePositionInMatrix(
  rawX: unknown,
  rawY: unknown,
  matrix: readonly (readonly unknown[])[],
  label: string,
  options: { readonly rangeMessage?: string } = {},
): SlotOperationPosition {
  return Object.freeze(
    validatePositionInMatrix(
      {
        x: requireSafeInteger(rawX, `${label}.x`, { minimum: 0 }),
        y: requireSafeInteger(rawY, `${label}.y`, { minimum: 0 }),
      },
      matrix,
      label,
      options,
    ),
  );
}

export function parseExactPositionPairs(
  raw: unknown,
  matrix: readonly (readonly unknown[])[],
  label: string,
  options: {
    readonly nonEmpty?: boolean;
    readonly rangeMessage?: string;
  } = {},
): readonly SlotOperationPosition[] {
  if (
    !Array.isArray(raw) ||
    raw.length % 2 !== 0 ||
    (options.nonEmpty === true && raw.length === 0)
  )
    throw new LogicParseError(
      `${label} must contain ${options.nonEmpty === true ? "non-empty " : ""}x/y pairs.`,
    );
  const positions = Array.from({ length: raw.length / 2 }, (_value, index) =>
    decodePositionInMatrix(
      raw[index * 2],
      raw[index * 2 + 1],
      matrix,
      `${label}[${index}]`,
      options,
    ),
  );
  uniquePositionKeys(positions, label);
  return Object.freeze(positions);
}

export function findMatrixValuePositions<T>(
  matrix: readonly (readonly T[])[],
  value: T,
): readonly SlotOperationPosition[] {
  const positions: SlotOperationPosition[] = [];
  forEachMatrixCell(matrix, (x, y, candidate) => {
    if (candidate === value) positions.push(Object.freeze({ x, y }));
  });
  return Object.freeze(positions);
}

export function requireSafeInteger(
  value: unknown,
  label: string,
  options: { readonly minimum?: number; readonly maximum?: number } = {},
): number {
  if (!Number.isSafeInteger(value))
    throw new LogicParseError(`${label} must be a safe integer.`);
  const result = value as number;
  if (options.minimum !== undefined && result < options.minimum)
    throw new LogicParseError(`${label} must be >= ${options.minimum}.`);
  if (options.maximum !== undefined && result > options.maximum)
    throw new LogicParseError(`${label} must be <= ${options.maximum}.`);
  return result;
}

function requireExactlyOne<T>(values: readonly T[], label: string): T {
  if (values.length !== 1)
    throw new LogicParseError(
      `${label} expected exactly one entry, got ${values.length}.`,
    );
  return values[0]!;
}

function uniquePositionKeys(
  positions: readonly SlotOperationPosition[],
  label: string,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const position of positions) {
    const key = slotOperationPositionKey(position);
    if (keys.has(key))
      throw new LogicParseError(`${label} contains duplicate ${key}.`);
    keys.add(key);
  }
  return keys;
}
