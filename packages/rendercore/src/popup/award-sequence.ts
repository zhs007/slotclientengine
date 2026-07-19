import type {
  AwardCelebrationInput,
  AwardTierId,
  PopupManifestV1,
} from "./types.js";

export interface AwardCountStage {
  readonly tierId: AwardTierId;
  readonly fromAmountRaw: number;
  readonly toAmountRaw: number;
  readonly durationSeconds: number;
}

export function createAwardCountStages(
  manifest: PopupManifestV1,
  input: AwardCelebrationInput,
): readonly AwardCountStage[] {
  validateAwardInput(input);
  if (input.winAmountRaw === 0) return Object.freeze([]);
  const spec = manifest.awardCelebration;
  const stages: AwardCountStage[] = [];
  const baseTarget =
    input.winAmountRaw <= input.betAmountRaw
      ? input.winAmountRaw
      : input.betAmountRaw;
  stages.push({
    tierId: "base",
    fromAmountRaw: 0,
    toAmountRaw: baseTarget,
    durationSeconds: spec.base.countDurationSeconds,
  });
  if (input.winAmountRaw <= input.betAmountRaw) return Object.freeze(stages);
  const firstThreshold = thresholdRaw(
    input.betAmountRaw,
    spec.celebrationTiers[0]!.thresholdMultiplier,
  );
  const standardTarget =
    compareThreshold(
      input.winAmountRaw,
      input.betAmountRaw,
      spec.celebrationTiers[0]!.thresholdMultiplier,
    ) >= 0
      ? Number(firstThreshold)
      : input.winAmountRaw;
  stages.push({
    tierId: "standard",
    fromAmountRaw: input.betAmountRaw,
    toAmountRaw: standardTarget,
    durationSeconds: spec.standard.countDurationSeconds,
  });
  for (let index = 0; index < spec.celebrationTiers.length; index += 1) {
    const tier = spec.celebrationTiers[index]!;
    if (
      compareThreshold(
        input.winAmountRaw,
        input.betAmountRaw,
        tier.thresholdMultiplier,
      ) < 0
    )
      continue;
    const from = Number(
      thresholdRaw(input.betAmountRaw, tier.thresholdMultiplier),
    );
    const next = spec.celebrationTiers[index + 1];
    const to =
      next &&
      compareThreshold(
        input.winAmountRaw,
        input.betAmountRaw,
        next.thresholdMultiplier,
      ) >= 0
        ? Number(thresholdRaw(input.betAmountRaw, next.thresholdMultiplier))
        : input.winAmountRaw;
    stages.push({
      tierId: tier.id,
      fromAmountRaw: from,
      toAmountRaw: to,
      durationSeconds: tier.countDurationSeconds,
    });
  }
  return Object.freeze(stages);
}

export function compareThreshold(
  winRaw: number,
  betRaw: number,
  multiplier: number,
): -1 | 0 | 1 {
  const left = BigInt(winRaw);
  const right = BigInt(betRaw) * BigInt(multiplier);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function validateAwardInput(input: AwardCelebrationInput): void {
  if (!Number.isSafeInteger(input.betAmountRaw) || input.betAmountRaw <= 0)
    throw new Error("betAmountRaw must be a positive safe integer.");
  if (!Number.isSafeInteger(input.winAmountRaw) || input.winAmountRaw < 0)
    throw new Error("winAmountRaw must be a non-negative safe integer.");
}

function thresholdRaw(betRaw: number, multiplier: number): bigint {
  const value = BigInt(betRaw) * BigInt(multiplier);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("reached popup threshold exceeds safe integer range.");
  return value;
}
