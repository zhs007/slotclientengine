import type { GameConfigNumberWeightEntry } from "@slotclientengine/logiccore";
import { ReelError } from "./errors.js";
import type {
  GridCellSymbolPresentationValueContext,
  GridCellSymbolPresentationValueResolver,
} from "./types.js";

const UINT32_RANGE = 0x1_0000_0000;

export type ReelRandomUint32Source = () => number;

export function createWeightedGridCellPresentationValueResolver(options: {
  readonly resolveTable: (
    context: GridCellSymbolPresentationValueContext,
  ) => readonly GameConfigNumberWeightEntry[] | null;
  readonly randomUint32: ReelRandomUint32Source;
  readonly maxCachedValuesPerCell?: number;
}): GridCellSymbolPresentationValueResolver {
  if (typeof options.resolveTable !== "function")
    throw new ReelError("resolveTable must be a function.");
  if (typeof options.randomUint32 !== "function")
    throw new ReelError("randomUint32 must be a function.");

  const maxCachedValuesPerCell = normalizeCacheLimit(
    options.maxCachedValuesPerCell ?? 32,
  );
  const valuesByCell = new Map<string, Map<string, number>>();
  const totals = new WeakMap<readonly object[], number>();

  return (context) => {
    const table = options.resolveTable(context);
    if (table === null) return null;
    const cellKey = `${context.x}:${context.y}`;
    const key = `${context.symbolY}:${context.code}`;
    let values = valuesByCell.get(cellKey);
    if (!values) {
      values = new Map();
      valuesByCell.set(cellKey, values);
    }
    const existing = values.get(key);
    if (existing !== undefined) {
      values.delete(key);
      values.set(key, existing);
      return existing;
    }
    const value = sampleNumberWeightTable(table, options.randomUint32, totals);
    values.set(key, value);
    while (values.size > maxCachedValuesPerCell) {
      const oldest = values.keys().next().value;
      if (oldest === undefined) break;
      values.delete(oldest);
    }
    return value;
  };
}

function normalizeCacheLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ReelError(
      "maxCachedValuesPerCell must be a positive safe integer.",
    );
  }
  return value;
}

function sampleNumberWeightTable(
  table: readonly GameConfigNumberWeightEntry[],
  randomUint32: ReelRandomUint32Source,
  totals: WeakMap<readonly object[], number>,
): number {
  if (!Array.isArray(table) || table.length === 0)
    throw new ReelError("number weight table must not be empty.");
  let total = totals.get(table);
  if (total === undefined) {
    total = validateTable(table);
    totals.set(table, total);
  }
  const limit = Math.floor(UINT32_RANGE / total) * total;
  let sample: number;
  do {
    sample = randomUint32();
    if (!Number.isSafeInteger(sample) || sample < 0 || sample >= UINT32_RANGE)
      throw new ReelError("randomUint32 must return a uint32 integer.");
  } while (sample >= limit);

  let cursor = sample % total;
  for (const entry of table) {
    if (cursor < entry.weight) return entry.value;
    cursor -= entry.weight;
  }
  throw new ReelError("number weight table sampling overflowed.");
}

function validateTable(table: readonly GameConfigNumberWeightEntry[]): number {
  const values = new Set<number>();
  let total = 0;
  for (const [index, entry] of table.entries()) {
    if (!Number.isSafeInteger(entry.value) || entry.value <= 0)
      throw new ReelError(
        `number weight table[${index}].value must be a positive safe integer.`,
      );
    if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0)
      throw new ReelError(
        `number weight table[${index}].weight must be a positive safe integer.`,
      );
    if (values.has(entry.value))
      throw new ReelError(`number weight table value ${entry.value} repeats.`);
    values.add(entry.value);
    total += entry.weight;
    if (!Number.isSafeInteger(total) || total > UINT32_RANGE)
      throw new ReelError(
        `number weight table total weight must be within 1..${UINT32_RANGE}.`,
      );
  }
  return total;
}
