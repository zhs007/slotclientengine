import type { SymbolSequenceStep } from "@slotclientengine/rendercore";

export const VIEWER_STATE_ORDER = Object.freeze([
  "normal",
  "appear",
  "win",
  "remove",
  "dropdown",
  "spinBlur",
  "disabled",
]);

export const DEFAULT_VIEWER_SEQUENCE: readonly SymbolSequenceStep[] =
  Object.freeze([
    Object.freeze({ state: "normal", holdSeconds: 0.8 }),
    Object.freeze({ state: "appear" }),
    Object.freeze({ state: "win" }),
    Object.freeze({ state: "remove" }),
    Object.freeze({ state: "dropdown", holdSeconds: 0.6 }),
    Object.freeze({ state: "spinBlur", holdSeconds: 0.7 }),
    Object.freeze({ state: "disabled", holdSeconds: 0.7 }),
  ]);

export function replaceSequenceStep(
  steps: readonly SymbolSequenceStep[],
  index: number,
  step: SymbolSequenceStep,
): readonly SymbolSequenceStep[] {
  assertIndex(index, steps.length);
  return Object.freeze(
    steps.map((current, currentIndex) =>
      currentIndex === index ? step : current,
    ),
  );
}

export function removeSequenceStep(
  steps: readonly SymbolSequenceStep[],
  index: number,
): readonly SymbolSequenceStep[] {
  assertIndex(index, steps.length);
  if (steps.length === 1) {
    throw new Error("Cannot remove the last sequence step.");
  }
  return Object.freeze(
    steps.filter((_step, currentIndex) => currentIndex !== index),
  );
}

export function moveSequenceStep(
  steps: readonly SymbolSequenceStep[],
  fromIndex: number,
  toIndex: number,
): readonly SymbolSequenceStep[] {
  assertIndex(fromIndex, steps.length);
  assertIndex(toIndex, steps.length);
  const nextSteps = [...steps];
  const [step] = nextSteps.splice(fromIndex, 1);
  nextSteps.splice(toIndex, 0, step);
  return Object.freeze(nextSteps);
}

function assertIndex(index: number, length: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(`Sequence index ${index} is out of range.`);
  }
}
