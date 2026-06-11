import { ReelError } from "./errors.js";
import type {
  ReelAxisSpinPlan,
  ReelSpinDirection,
  ReelSpinPlan,
  ReelSpinPlanOptions
} from "./types.js";

export function createReelSpinPlan(options: ReelSpinPlanOptions): ReelSpinPlan {
  const reelCount = options.reels.getReelCount();
  const visibleRows = assertPositiveInteger(options.visibleRows, "visibleRows");
  const minimumSpinCycles = assertMinimumSpinCycles(options.minimumSpinCycles ?? 10);
  const baseDurationMs = assertPositiveNumber(options.baseDurationMs, "baseDurationMs");
  const speedSymbolsPerSecond = assertPositiveNumber(
    options.speedSymbolsPerSecond,
    "speedSymbolsPerSecond"
  );
  const startDelayStepMs = assertNonNegativeNumber(options.startDelayMs, "startDelayMs");
  const stopDelayStepMs = assertNonNegativeNumber(options.stopDelayMs, "stopDelayMs");
  const finalYs = parseFinalYs(options.finalYs, reelCount);
  const extraTravelSymbolsPerReel = parseExtraTravel(options.extraTravelSymbolsPerReel, reelCount);
  const direction = parseDirection(options.direction);
  const minimumTravel = minimumSpinCycles * visibleRows;

  const axes = finalYs.map((finalY, x): ReelAxisSpinPlan => {
    const startDelayMs = x * startDelayStepMs;
    const durationMs = baseDurationMs + x * stopDelayStepMs;
    const durationTravel = Math.ceil((durationMs / 1000) * speedSymbolsPerSecond);
    const travelSymbols =
      Math.max(minimumTravel, durationTravel) + x * visibleRows + extraTravelSymbolsPerReel[x];
    const startY =
      direction === "forward"
        ? options.reels.normalizeY(x, finalY - travelSymbols)
        : options.reels.normalizeY(x, finalY + travelSymbols);

    return Object.freeze({
      x,
      finalY: options.reels.normalizeY(x, finalY),
      startY,
      direction,
      travelSymbols,
      startDelayMs,
      durationMs,
      stopAtMs: startDelayMs + durationMs
    });
  });

  return Object.freeze({
    direction,
    axes: Object.freeze(axes),
    totalDurationMs: Math.max(...axes.map((axis) => axis.stopAtMs))
  });
}

function parseFinalYs(value: readonly number[], reelCount: number): readonly number[] {
  if (!Array.isArray(value) || value.length !== reelCount) {
    throw new ReelError(`finalYs length ${value.length} does not match reels reel count ${reelCount}.`);
  }
  return Object.freeze(value.map((finalY, x) => assertInteger(finalY, `finalYs[${x}]`)));
}

function parseExtraTravel(
  value: readonly number[] | undefined,
  reelCount: number
): readonly number[] {
  if (value === undefined) {
    return Object.freeze(Array.from({ length: reelCount }, () => 0));
  }
  if (!Array.isArray(value) || value.length !== reelCount) {
    throw new ReelError(
      `extraTravelSymbolsPerReel length ${value.length} does not match reels reel count ${reelCount}.`
    );
  }
  return Object.freeze(
    value.map((extra, x) => assertNonNegativeInteger(extra, `extraTravelSymbolsPerReel[${x}]`))
  );
}

function parseDirection(value: ReelSpinDirection | undefined): ReelSpinDirection {
  if (value === undefined) {
    return "forward";
  }
  if (value === "forward" || value === "backward") {
    return value;
  }
  throw new ReelError('direction must be "forward" or "backward".');
}

function assertMinimumSpinCycles(value: unknown): number {
  const parsed = assertPositiveInteger(value, "minimumSpinCycles");
  if (parsed < 1) {
    throw new ReelError("minimumSpinCycles must be at least 1.");
  }
  return parsed;
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive integer.`);
  }
  return value as number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ReelError(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function assertInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value)) {
    throw new ReelError(`${label} must be an integer.`);
  }
  return value as number;
}

function assertPositiveNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) <= 0) {
    throw new ReelError(`${label} must be a positive number.`);
  }
  return value as number;
}

function assertNonNegativeNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value) || (value as number) < 0) {
    throw new ReelError(`${label} must be a non-negative number.`);
  }
  return value as number;
}
