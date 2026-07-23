import { clampNumber } from "./coordinates.js";

export type VNICyclicMotionPhase = "continuous" | "resolving" | "settled";

export interface VNICyclicMotionSnapshot {
  readonly phase: VNICyclicMotionPhase;
  readonly unwrappedTurns: number;
  readonly velocityTurnsPerSecond: number;
  readonly carrierCount: number;
  readonly selectedCarrierIndex: number | null;
}

export interface VNICyclicResolvePlan {
  readonly startTurns: number;
  readonly fastRelativeTurns: number;
  readonly stopStartTurns: number;
  readonly finalTurns: number;
  readonly direction: 1 | -1;
  readonly carrierCount: number;
  readonly selectedCarrierIndex: number;
  readonly rounds: number;
  readonly stopOvershoot: number;
}

export function createVNICyclicMotionSnapshot(options: {
  unwrappedTurns: number;
  velocityTurnsPerSecond: number;
  carrierCount: number;
}): VNICyclicMotionSnapshot {
  assertFinite(options.unwrappedTurns, "cyclic unwrappedTurns");
  assertFinite(options.velocityTurnsPerSecond, "cyclic velocityTurnsPerSecond");
  assertCarrierCount(options.carrierCount);
  return Object.freeze({
    phase: "continuous",
    unwrappedTurns: options.unwrappedTurns,
    velocityTurnsPerSecond: options.velocityTurnsPerSecond,
    carrierCount: options.carrierCount,
    selectedCarrierIndex: null,
  });
}

export function advanceVNICyclicContinuousMotion(
  snapshot: VNICyclicMotionSnapshot,
  deltaSeconds: number,
): VNICyclicMotionSnapshot {
  if (snapshot.phase !== "continuous") {
    throw new Error(
      `Cannot advance cyclic continuous motion while phase is "${snapshot.phase}".`,
    );
  }
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    throw new Error("cyclic deltaSeconds must be a positive finite number.");
  }
  const unwrappedTurns =
    snapshot.unwrappedTurns + snapshot.velocityTurnsPerSecond * deltaSeconds;
  assertFinite(unwrappedTurns, "cyclic advanced unwrappedTurns");
  return Object.freeze({ ...snapshot, unwrappedTurns });
}

export function createVNICyclicResolvePlan(options: {
  snapshot: VNICyclicMotionSnapshot;
  selectedCarrierIndex: number;
  direction: 1 | -1;
  rounds: number;
  fastRelativeTurns: number;
  stopOvershoot: number;
}): VNICyclicResolvePlan {
  const {
    snapshot,
    selectedCarrierIndex,
    direction,
    rounds,
    fastRelativeTurns,
    stopOvershoot,
  } = options;
  if (snapshot.phase !== "continuous") {
    throw new Error(
      `Cannot create cyclic resolve plan while phase is "${snapshot.phase}".`,
    );
  }
  assertCarrierIndex(selectedCarrierIndex, snapshot.carrierCount);
  if (direction !== 1 && direction !== -1) {
    throw new Error("cyclic direction must be 1 or -1.");
  }
  if (!Number.isSafeInteger(rounds) || rounds < 0) {
    throw new Error("cyclic rounds must be a non-negative safe integer.");
  }
  assertFinite(fastRelativeTurns, "cyclic fastRelativeTurns");
  if (
    Math.sign(fastRelativeTurns) !== 0 &&
    Math.sign(fastRelativeTurns) !== direction
  ) {
    throw new Error("cyclic fastRelativeTurns must follow direction.");
  }
  if (!Number.isFinite(stopOvershoot) || stopOvershoot < 0) {
    throw new Error("cyclic stopOvershoot must be finite and non-negative.");
  }
  const stopStartTurns = snapshot.unwrappedTurns + fastRelativeTurns;
  const targetModulo = -selectedCarrierIndex / snapshot.carrierCount;
  const directionalDelta =
    direction === 1
      ? positiveModulo(targetModulo - stopStartTurns, 1)
      : -positiveModulo(stopStartTurns - targetModulo, 1);
  const finalTurns = stopStartTurns + directionalDelta + direction * rounds;
  assertFinite(finalTurns, "cyclic finalTurns");
  return Object.freeze({
    startTurns: snapshot.unwrappedTurns,
    fastRelativeTurns,
    stopStartTurns,
    finalTurns,
    direction,
    carrierCount: snapshot.carrierCount,
    selectedCarrierIndex,
    rounds,
    stopOvershoot,
  });
}

export function sampleVNICyclicResolveStopTurns(
  plan: VNICyclicResolvePlan,
  progress: number,
): number {
  if (!Number.isFinite(progress)) {
    throw new Error("cyclic stop progress must be finite.");
  }
  const t = clampNumber(progress, 0, 1);
  const eased = 1 - Math.pow(1 - t, 4);
  const overshoot =
    plan.direction *
    (plan.stopOvershoot / plan.carrierCount) *
    Math.sin(t * Math.PI) *
    Math.pow(t, 1.2);
  return (
    plan.stopStartTurns +
    (plan.finalTurns - plan.stopStartTurns) * eased +
    overshoot
  );
}

export function getVNICyclicCarrierAlignmentErrorTurns(
  turns: number,
  carrierIndex: number,
  carrierCount: number,
): number {
  assertFinite(turns, "cyclic alignment turns");
  assertCarrierCount(carrierCount);
  assertCarrierIndex(carrierIndex, carrierCount);
  const phase = positiveModulo(turns + carrierIndex / carrierCount, 1);
  return Math.min(phase, 1 - phase);
}

function assertCarrierCount(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("cyclic carrierCount must be a positive safe integer.");
  }
}

function assertCarrierIndex(value: number, carrierCount: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= carrierCount) {
    throw new Error(
      `cyclic selectedCarrierIndex must be within 0..${carrierCount - 1}.`,
    );
  }
}

function assertFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be finite.`);
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
