import { ReelError } from "./errors.js";
import type { GridCellReelSpinTiming } from "./types.js";

export type GridCellEffectId = "normal" | "anticipation";
export type GridCellSweepOrder = "left-right-bottom-up";
export type GridCellSelectiveSpinOrder = "left-right-top-down";

export interface ReelCellEffectManifest {
  readonly skeleton: string;
  readonly atlas: string;
  readonly texture: string;
  readonly animation: string;
  readonly loopCount: 1;
  readonly finishBeforeStopMs: number;
  readonly transform: Readonly<{ x: number; y: number; scale: number }>;
}

export interface ReelSpinMotionManifest {
  readonly bounceStrength: number;
  readonly dimmingAlpha: number;
  readonly timing: GridCellReelSpinTiming;
  readonly cellEffects: Readonly<
    Record<GridCellEffectId, ReelCellEffectManifest>
  >;
  readonly anticipation: Readonly<{
    triggerLandedCount: number;
    firstFollowingStopDelayMs: number;
    stopStepMs: number;
  }>;
}

export interface ParsedReelManifest {
  readonly version: 1;
  readonly spin: ReelSpinMotionManifest;
  readonly cascade: Readonly<{
    anticipationRefill: Readonly<{
      sweep: Readonly<{
        effect: GridCellEffectId;
        loopCount: 1;
        startStepMs: number;
        order: GridCellSweepOrder;
      }>;
      spin: GridCellReelSpinTiming &
        Readonly<{ order: GridCellSelectiveSpinOrder }>;
    }>;
  }>;
}

export function parseReelManifest(value: unknown): ParsedReelManifest {
  const record = assertRecord(value, "reel manifest");
  assertOnlyKnownKeys(record, "reel manifest", ["version", "spin", "cascade"]);
  if (record.version !== 1)
    throw new ReelError("Reel manifest version must be 1.");

  const spin = assertRecord(record.spin, "reel manifest spin");
  assertOnlyKnownKeys(spin, "reel manifest spin", [
    "bounceStrength",
    "dimmingAlpha",
    "timing",
    "cellEffects",
    "anticipation",
  ]);
  const bounceStrength = assertNonNegativeFinite(
    spin.bounceStrength,
    "reel manifest spin.bounceStrength",
  );
  const dimmingAlpha = assertNonNegativeFinite(
    spin.dimmingAlpha,
    "reel manifest spin.dimmingAlpha",
  );
  if (dimmingAlpha > 1) {
    throw new ReelError(
      "reel manifest spin.dimmingAlpha must be between 0 and 1.",
    );
  }
  const timing = parseTiming(spin.timing, "reel manifest spin.timing");
  const cellEffectsRecord = assertRecord(
    spin.cellEffects,
    "reel manifest spin.cellEffects",
  );
  assertOnlyKnownKeys(cellEffectsRecord, "reel manifest spin.cellEffects", [
    "normal",
    "anticipation",
  ]);
  const cellEffects = Object.freeze({
    normal: parseCellEffect(
      cellEffectsRecord.normal,
      "reel manifest spin.cellEffects.normal",
    ),
    anticipation: parseCellEffect(
      cellEffectsRecord.anticipation,
      "reel manifest spin.cellEffects.anticipation",
    ),
  });

  const anticipationRecord = assertRecord(
    spin.anticipation,
    "reel manifest spin.anticipation",
  );
  assertOnlyKnownKeys(anticipationRecord, "reel manifest spin.anticipation", [
    "triggerLandedCount",
    "firstFollowingStopDelayMs",
    "stopStepMs",
  ]);
  const anticipation = Object.freeze({
    triggerLandedCount: assertPositiveSafeInteger(
      anticipationRecord.triggerLandedCount,
      "reel manifest spin.anticipation.triggerLandedCount",
    ),
    firstFollowingStopDelayMs: assertNonNegativeFinite(
      anticipationRecord.firstFollowingStopDelayMs,
      "reel manifest spin.anticipation.firstFollowingStopDelayMs",
    ),
    stopStepMs: assertNonNegativeFinite(
      anticipationRecord.stopStepMs,
      "reel manifest spin.anticipation.stopStepMs",
    ),
  });

  const cascade = assertRecord(record.cascade, "reel manifest cascade");
  assertOnlyKnownKeys(cascade, "reel manifest cascade", ["anticipationRefill"]);
  const refill = assertRecord(
    cascade.anticipationRefill,
    "reel manifest cascade.anticipationRefill",
  );
  assertOnlyKnownKeys(refill, "reel manifest cascade.anticipationRefill", [
    "sweep",
    "spin",
  ]);
  const sweepRecord = assertRecord(
    refill.sweep,
    "reel manifest cascade.anticipationRefill.sweep",
  );
  assertOnlyKnownKeys(
    sweepRecord,
    "reel manifest cascade.anticipationRefill.sweep",
    ["effect", "loopCount", "startStepMs", "order"],
  );
  if (
    sweepRecord.effect !== "normal" &&
    sweepRecord.effect !== "anticipation"
  ) {
    throw new ReelError(
      'reel manifest cascade.anticipationRefill.sweep.effect must reference "normal" or "anticipation".',
    );
  }
  assertLoopCount(
    sweepRecord.loopCount,
    "reel manifest cascade.anticipationRefill.sweep.loopCount",
  );
  if (sweepRecord.order !== "left-right-bottom-up") {
    throw new ReelError(
      'reel manifest cascade.anticipationRefill.sweep.order must be "left-right-bottom-up".',
    );
  }
  const refillSpinRecord = assertRecord(
    refill.spin,
    "reel manifest cascade.anticipationRefill.spin",
  );
  assertOnlyKnownKeys(
    refillSpinRecord,
    "reel manifest cascade.anticipationRefill.spin",
    [
      "order",
      "startStepMs",
      "stopStepMs",
      "settleAfterLastStartMs",
      "minimumSpinCycles",
      "speedSymbolsPerSecond",
    ],
  );
  if (refillSpinRecord.order !== "left-right-top-down") {
    throw new ReelError(
      'reel manifest cascade.anticipationRefill.spin.order must be "left-right-top-down".',
    );
  }
  const refillTiming = parseTiming(
    refillSpinRecord,
    "reel manifest cascade.anticipationRefill.spin",
    ["order"],
  );

  return Object.freeze({
    version: 1,
    spin: Object.freeze({
      bounceStrength,
      dimmingAlpha,
      timing,
      cellEffects,
      anticipation,
    }),
    cascade: Object.freeze({
      anticipationRefill: Object.freeze({
        sweep: Object.freeze({
          effect: sweepRecord.effect,
          loopCount: 1,
          startStepMs: assertNonNegativeFinite(
            sweepRecord.startStepMs,
            "reel manifest cascade.anticipationRefill.sweep.startStepMs",
          ),
          order: "left-right-bottom-up",
        }),
        spin: Object.freeze({
          order: "left-right-top-down",
          ...refillTiming,
        }),
      }),
    }),
  });
}

function parseCellEffect(
  value: unknown,
  label: string,
): ReelCellEffectManifest {
  const record = assertRecord(value, label);
  assertOnlyKnownKeys(record, label, [
    "skeleton",
    "atlas",
    "texture",
    "animation",
    "loopCount",
    "finishBeforeStopMs",
    "transform",
  ]);
  const transform = assertRecord(record.transform, `${label}.transform`);
  assertOnlyKnownKeys(transform, `${label}.transform`, ["x", "y", "scale"]);
  assertLoopCount(record.loopCount, `${label}.loopCount`);
  return Object.freeze({
    skeleton: assertLocalResourcePath(record.skeleton, `${label}.skeleton`),
    atlas: assertLocalResourcePath(record.atlas, `${label}.atlas`),
    texture: assertLocalResourcePath(record.texture, `${label}.texture`),
    animation: assertNonEmptyString(record.animation, `${label}.animation`),
    loopCount: 1,
    finishBeforeStopMs: assertNonNegativeFinite(
      record.finishBeforeStopMs,
      `${label}.finishBeforeStopMs`,
    ),
    transform: Object.freeze({
      x: assertFinite(transform.x, `${label}.transform.x`),
      y: assertFinite(transform.y, `${label}.transform.y`),
      scale: assertPositiveFinite(transform.scale, `${label}.transform.scale`),
    }),
  });
}

function parseTiming(
  value: unknown,
  label: string,
  additionalKeys: readonly string[] = [],
): GridCellReelSpinTiming {
  const record = assertRecord(value, label);
  assertOnlyKnownKeys(record, label, [
    "startStepMs",
    "stopStepMs",
    "settleAfterLastStartMs",
    "minimumSpinCycles",
    "speedSymbolsPerSecond",
    ...additionalKeys,
  ]);
  return Object.freeze({
    startStepMs: assertNonNegativeFinite(
      record.startStepMs,
      `${label}.startStepMs`,
    ),
    stopStepMs: assertNonNegativeFinite(
      record.stopStepMs,
      `${label}.stopStepMs`,
    ),
    settleAfterLastStartMs: assertNonNegativeFinite(
      record.settleAfterLastStartMs,
      `${label}.settleAfterLastStartMs`,
    ),
    minimumSpinCycles: assertPositiveSafeInteger(
      record.minimumSpinCycles,
      `${label}.minimumSpinCycles`,
    ),
    speedSymbolsPerSecond: assertPositiveFinite(
      record.speedSymbolsPerSecond,
      `${label}.speedSymbolsPerSecond`,
    ),
  });
}

function assertLocalResourcePath(value: unknown, label: string): string {
  const path = assertNonEmptyString(value, label);
  if (
    !path.startsWith("./") ||
    path.includes("..") ||
    path.includes("://") ||
    path.startsWith("/")
  ) {
    throw new ReelError(
      `${label} must be a local ./ relative path without '..'.`,
    );
  }
  return path;
}

function assertLoopCount(value: unknown, label: string): asserts value is 1 {
  if (value !== 1) throw new ReelError(`${label} must be exactly 1.`);
}

function assertRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReelError(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  label: string,
  knownKeys: readonly string[],
): void {
  const known = new Set(knownKeys);
  for (const key of Object.keys(record)) {
    if (!known.has(key))
      throw new ReelError(`${label} contains unknown field "${key}".`);
  }
  for (const key of knownKeys) {
    if (!(key in record))
      throw new ReelError(`${label} is missing required field "${key}".`);
  }
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ReelError(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ReelError(`${label} must be a finite number.`);
  }
  return value;
}

function assertNonNegativeFinite(value: unknown, label: string): number {
  const parsed = assertFinite(value, label);
  if (parsed < 0) throw new ReelError(`${label} must be non-negative.`);
  return parsed;
}

function assertPositiveFinite(value: unknown, label: string): number {
  const parsed = assertFinite(value, label);
  if (parsed <= 0) throw new ReelError(`${label} must be positive.`);
  return parsed;
}

function assertPositiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive safe integer.`);
  }
  return value as number;
}
