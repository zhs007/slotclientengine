import type {
  AwardCelebrationInput,
  AwardTierId,
  PopupManifest,
} from "./types.js";
import type { AwardCountStage } from "./award-sequence.js";

const INITIAL_RATE_FACTOR = 0.35;
const MIN_BOUNDARY_AVERAGE_FACTOR = 1.05;
const TERMINAL_BRAKE_CANONICAL_FRACTION = 0.08;
const TERMINAL_BRAKE_ACTUAL_FRACTION = 0.25;
const MIN_TERMINAL_BRAKE_DURATION_SECONDS = 0.3;
const MIN_VISIBLE_TERMINAL_BRAKE_DISTANCE_RAW = 3;

export interface AwardAmountMotionStage {
  readonly tierId: Exclude<AwardTierId, "base">;
  readonly fromAmountRaw: number;
  readonly toAmountRaw: number;
  readonly canonicalSpanRaw: number;
  readonly configuredDurationSeconds: number;
  readonly effectiveCanonicalDurationSeconds: number;
  readonly startRateRawPerSecond: number;
  readonly endRateRawPerSecond: number;
  readonly accelerationRawPerSecondSquared: number;
}

export interface AwardAmountTerminalBrake {
  readonly tierId: Exclude<AwardTierId, "base">;
  readonly startAmountRaw: number;
  readonly finalAmountRaw: number;
  readonly durationSeconds: number;
}

export interface AwardAmountMotionPlan {
  readonly stages: readonly AwardAmountMotionStage[];
  readonly terminalBrake: AwardAmountTerminalBrake;
  readonly finalTierId: AwardTierId;
}

export function createAwardAmountMotionPlan(
  manifest: Extract<PopupManifest, { readonly type: "award-celebration" }>,
  input: AwardCelebrationInput,
  stages: readonly AwardCountStage[],
  amountDurationScale = 1,
): AwardAmountMotionPlan | null {
  validateAwardAmountInput(input);
  validateAwardAmountDurationScale(amountDurationScale);
  if (input.winAmountRaw <= input.betAmountRaw) return null;

  const countStages = stages.filter(
    (
      stage,
    ): stage is AwardCountStage & {
      readonly tierId: Exclude<AwardTierId, "base">;
    } => stage.tierId !== "base",
  );
  if (!countStages.length || countStages[0]!.tierId !== "standard")
    throw new Error("award amount motion requires a standard count stage.");

  const spec = manifest.awardCelebration;
  const thresholds = spec.celebrationTiers.map((tier) =>
    awardThresholdRaw(input.betAmountRaw, tier.thresholdMultiplier),
  );
  const canonicalSpans = new Map<Exclude<AwardTierId, "base">, number>([
    ["standard", thresholds[0]! - input.betAmountRaw],
    ["bigwin", thresholds[1]! - thresholds[0]!],
    ["superwin", thresholds[2]! - thresholds[1]!],
    ["megawin", thresholds[2]! - thresholds[1]!],
  ]);
  const configuredDurations = new Map<Exclude<AwardTierId, "base">, number>([
    ["standard", spec.standard.countDurationSeconds],
    ...spec.celebrationTiers.map(
      (tier) => [tier.id, tier.countDurationSeconds] as const,
    ),
  ]);

  let incomingRate = 0;
  const motionStages: AwardAmountMotionStage[] = [];
  for (const [index, stage] of countStages.entries()) {
    const canonicalSpanRaw = canonicalSpans.get(stage.tierId)!;
    const configuredDurationSeconds = configuredDurations.get(stage.tierId)!;
    if (!(canonicalSpanRaw > 0) || !Number.isSafeInteger(canonicalSpanRaw))
      throw new Error(
        `award amount motion canonical span is invalid for ${stage.tierId}.`,
      );

    if (configuredDurationSeconds === 0) {
      const startRate = incomingRate;
      const endRate =
        startRate > 0
          ? startRate * MIN_BOUNDARY_AVERAGE_FACTOR
          : canonicalSpanRaw;
      motionStages.push(
        freezeMotionStage({
          tierId: stage.tierId,
          fromAmountRaw: stage.fromAmountRaw,
          toAmountRaw: stage.toAmountRaw,
          canonicalSpanRaw,
          configuredDurationSeconds,
          effectiveCanonicalDurationSeconds: 0,
          startRateRawPerSecond: startRate,
          endRateRawPerSecond: endRate,
          accelerationRawPerSecondSquared: 0,
        }),
      );
      incomingRate = endRate;
      continue;
    }

    const nominalAverageRate = canonicalSpanRaw / configuredDurationSeconds;
    const startRate =
      index === 0 ? nominalAverageRate * INITIAL_RATE_FACTOR : incomingRate;
    const effectiveAverageRate =
      index === 0
        ? nominalAverageRate
        : Math.max(nominalAverageRate, startRate * MIN_BOUNDARY_AVERAGE_FACTOR);
    const effectiveCanonicalDurationSeconds =
      canonicalSpanRaw / effectiveAverageRate;
    const endRate = 2 * effectiveAverageRate - startRate;
    const acceleration =
      (endRate - startRate) / effectiveCanonicalDurationSeconds;
    if (
      !Number.isFinite(startRate) ||
      !Number.isFinite(endRate) ||
      !Number.isFinite(acceleration) ||
      startRate < 0 ||
      endRate <= startRate ||
      acceleration <= 0
    )
      throw new Error(
        `award amount motion curve is invalid for ${stage.tierId}.`,
      );
    motionStages.push(
      freezeMotionStage({
        tierId: stage.tierId,
        fromAmountRaw: stage.fromAmountRaw,
        toAmountRaw: stage.toAmountRaw,
        canonicalSpanRaw,
        configuredDurationSeconds,
        effectiveCanonicalDurationSeconds,
        startRateRawPerSecond: startRate,
        endRateRawPerSecond: endRate,
        accelerationRawPerSecondSquared: acceleration,
      }),
    );
    incomingRate = endRate;
  }

  const brakingStage = [...motionStages]
    .reverse()
    .find((stage) => stage.toAmountRaw > stage.fromAmountRaw);
  if (!brakingStage)
    throw new Error("award amount motion requires a positive count range.");
  const actualDistance = input.winAmountRaw - brakingStage.fromAmountRaw;
  const preferredBrakeDistance = Math.max(
    MIN_VISIBLE_TERMINAL_BRAKE_DISTANCE_RAW,
    Math.floor(
      brakingStage.canonicalSpanRaw * TERMINAL_BRAKE_CANONICAL_FRACTION,
    ),
  );
  const maxActualBrakeDistance = Math.max(
    1,
    Math.floor(actualDistance * TERMINAL_BRAKE_ACTUAL_FRACTION),
  );
  const brakeDistance = Math.min(
    actualDistance,
    preferredBrakeDistance,
    maxActualBrakeDistance,
  );
  const brakeStartAmountRaw = input.winAmountRaw - brakeDistance;
  const entryElapsed = awardAmountMotionElapsedForAmount(
    brakingStage,
    brakeStartAmountRaw,
  );
  const entryRate =
    brakingStage.startRateRawPerSecond +
    brakingStage.accelerationRawPerSecondSquared * entryElapsed;
  const naturalBrakeDuration =
    entryRate > 0 ? (3 * brakeDistance) / entryRate : 0;
  const durationSeconds =
    brakeDistance < MIN_VISIBLE_TERMINAL_BRAKE_DISTANCE_RAW
      ? 0
      : Math.max(MIN_TERMINAL_BRAKE_DURATION_SECONDS, naturalBrakeDuration);
  const terminalBrake = Object.freeze({
    tierId: brakingStage.tierId,
    startAmountRaw: brakeStartAmountRaw,
    finalAmountRaw: input.winAmountRaw,
    durationSeconds,
  });

  const plan = Object.freeze({
    stages: Object.freeze(motionStages),
    terminalBrake,
    finalTierId: stages.at(-1)!.tierId,
  });
  return scaleAwardAmountMotionPlan(plan, amountDurationScale);
}

export function awardAmountMotionElapsedForAmount(
  stage: AwardAmountMotionStage,
  amountRaw: number,
): number {
  const distance = clamp(
    amountRaw - stage.fromAmountRaw,
    0,
    Math.max(0, stage.toAmountRaw - stage.fromAmountRaw),
  );
  if (distance === 0 || stage.effectiveCanonicalDurationSeconds === 0) return 0;
  const { startRateRawPerSecond: startRate } = stage;
  const acceleration = stage.accelerationRawPerSecondSquared;
  if (acceleration === 0) return distance / startRate;
  return (
    (Math.sqrt(startRate * startRate + 2 * acceleration * distance) -
      startRate) /
    acceleration
  );
}

export function awardAmountMotionAmountAtElapsed(
  stage: AwardAmountMotionStage,
  elapsedSeconds: number,
  targetAmountRaw = stage.toAmountRaw,
): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0)
    throw new Error("award amount motion elapsedSeconds must be non-negative.");
  const target = clamp(targetAmountRaw, stage.fromAmountRaw, stage.toAmountRaw);
  if (stage.effectiveCanonicalDurationSeconds === 0) return target;
  const distance =
    stage.startRateRawPerSecond * elapsedSeconds +
    0.5 *
      stage.accelerationRawPerSecondSquared *
      elapsedSeconds *
      elapsedSeconds;
  return Math.min(target, stage.fromAmountRaw + distance);
}

export function awardAmountTerminalBrakeElapsedForAmount(
  brake: AwardAmountTerminalBrake,
  amountRaw: number,
): number {
  if (brake.durationSeconds === 0) return 0;
  const distance = brake.finalAmountRaw - brake.startAmountRaw;
  if (distance <= 0) return brake.durationSeconds;
  const amountProgress = clamp(
    (amountRaw - brake.startAmountRaw) / distance,
    0,
    1,
  );
  const timeProgress = 1 - Math.cbrt(1 - amountProgress);
  return brake.durationSeconds * timeProgress;
}

export function awardAmountTerminalBrakeAmountAtElapsed(
  brake: AwardAmountTerminalBrake,
  elapsedSeconds: number,
): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0)
    throw new Error(
      "award amount braking elapsedSeconds must be non-negative.",
    );
  if (brake.durationSeconds === 0) return brake.finalAmountRaw;
  const progress = clamp(elapsedSeconds / brake.durationSeconds, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);
  return (
    brake.startAmountRaw + (brake.finalAmountRaw - brake.startAmountRaw) * eased
  );
}

export function awardThresholdRaw(
  betAmountRaw: number,
  multiplier: number,
): number {
  const value = BigInt(betAmountRaw) * BigInt(multiplier);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("reached popup threshold exceeds safe integer range.");
  return Number(value);
}

export function compareAwardThreshold(
  winRaw: number,
  betRaw: number,
  multiplier: number,
): -1 | 0 | 1 {
  const left = BigInt(winRaw);
  const right = BigInt(betRaw) * BigInt(multiplier);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validateAwardAmountInput(input: AwardCelebrationInput): void {
  if (!Number.isSafeInteger(input.betAmountRaw) || input.betAmountRaw <= 0)
    throw new Error("betAmountRaw must be a positive safe integer.");
  if (!Number.isSafeInteger(input.winAmountRaw) || input.winAmountRaw < 0)
    throw new Error("winAmountRaw must be a non-negative safe integer.");
}

export function validateAwardAmountDurationScale(scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0)
    throw new Error(
      "award amountDurationScale must be finite and greater than zero.",
    );
}

function scaleAwardAmountMotionPlan(
  plan: AwardAmountMotionPlan,
  scale: number,
): AwardAmountMotionPlan {
  if (scale === 1) return plan;
  const stages = plan.stages.map((stage) => {
    const scaled = {
      ...stage,
      configuredDurationSeconds: stage.configuredDurationSeconds * scale,
      effectiveCanonicalDurationSeconds:
        stage.effectiveCanonicalDurationSeconds * scale,
      startRateRawPerSecond: stage.startRateRawPerSecond / scale,
      endRateRawPerSecond: stage.endRateRawPerSecond / scale,
      accelerationRawPerSecondSquared:
        stage.accelerationRawPerSecondSquared / (scale * scale),
    };
    if (
      !Number.isFinite(scaled.configuredDurationSeconds) ||
      !Number.isFinite(scaled.effectiveCanonicalDurationSeconds) ||
      !Number.isFinite(scaled.startRateRawPerSecond) ||
      !Number.isFinite(scaled.endRateRawPerSecond) ||
      !Number.isFinite(scaled.accelerationRawPerSecondSquared)
    )
      throw new Error(
        `award amountDurationScale produces a non-finite ${stage.tierId} motion.`,
      );
    return freezeMotionStage(scaled);
  });
  const terminalBrake = Object.freeze({
    ...plan.terminalBrake,
    durationSeconds: plan.terminalBrake.durationSeconds * scale,
  });
  if (!Number.isFinite(terminalBrake.durationSeconds))
    throw new Error(
      "award amountDurationScale produces a non-finite terminal brake.",
    );
  return Object.freeze({
    stages: Object.freeze(stages),
    terminalBrake,
    finalTierId: plan.finalTierId,
  });
}

function freezeMotionStage(
  stage: AwardAmountMotionStage,
): AwardAmountMotionStage {
  return Object.freeze(stage);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
