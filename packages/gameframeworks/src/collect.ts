import { SlotGameRuntimeError } from "./errors.js";

export function shouldCollectFinalResult(
  totalwin: number,
  results: number,
): boolean {
  assertFiniteNumber(totalwin, "totalwin");
  assertNonNegativeInteger(results, "results");
  return (totalwin > 0 && results >= 1) || (totalwin === 0 && results > 1);
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new SlotGameRuntimeError(`${label} must be a finite number.`);
  }
  return value as number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new SlotGameRuntimeError(`${label} must be a non-negative integer.`);
  }
  return value as number;
}
