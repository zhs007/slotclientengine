import { prepareRenderObjectPositionMotion } from "../presentation/render-object-motion.js";
import { ReelError } from "./errors.js";
import type {
  VisibleOccurrenceMotion,
  VisibleOccurrencePoint,
} from "./types.js";

export interface PreparedVisibleOccurrenceMotion {
  readonly durationMs: number;
  readonly stacking: VisibleOccurrenceMotion["stacking"];
  sample(rawProgress: number): VisibleOccurrencePoint;
}

export function prepareVisibleOccurrenceMotion(
  motion: VisibleOccurrenceMotion,
  source: VisibleOccurrencePoint,
  target: VisibleOccurrencePoint,
): PreparedVisibleOccurrenceMotion {
  if (!Number.isFinite(motion.durationMs) || motion.durationMs <= 0)
    throw new ReelError(
      "Visible occurrence motion durationMs must be positive and finite.",
    );
  const stacking = normalizeStacking(motion.stacking);
  const prepared = prepareRenderObjectPositionMotion(
    motion.path,
    motion.easing,
    source,
    target,
    (message) =>
      new ReelError(message.replace("RenderObject", "Visible occurrence")),
  );
  return Object.freeze({
    durationMs: motion.durationMs,
    stacking,
    sample: prepared.sample,
  });
}

function normalizeStacking(
  stacking: VisibleOccurrenceMotion["stacking"],
): VisibleOccurrenceMotion["stacking"] {
  if (stacking.layer !== "above-symbols" && stacking.layer !== "above-effects")
    throw new ReelError(
      `Unknown visible occurrence stacking layer "${String(stacking.layer)}".`,
    );
  if (!Number.isSafeInteger(stacking.order) || stacking.order < 0)
    throw new ReelError(
      "Visible occurrence stacking order must be a non-negative safe integer.",
    );
  return Object.freeze({ ...stacking });
}
