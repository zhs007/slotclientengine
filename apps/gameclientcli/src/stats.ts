import { RtpStatsSnapshot, SpinRequestConfig } from "./types";

export class RtpStatsAccumulator {
  private readonly stakePerSpin: number;
  private completedSpins = 0;
  private totalWin = 0;

  constructor(spinConfig: SpinRequestConfig) {
    this.stakePerSpin = calculateStakePerSpin(spinConfig);
  }

  public addSpin(totalwin: number, results: number): RtpStatsSnapshot {
    assertFiniteNumber(totalwin, "totalwin");
    assertNonNegativeInteger(results, "results");

    this.completedSpins += 1;
    this.totalWin += totalwin;
    return this.snapshot();
  }

  public snapshot(): RtpStatsSnapshot {
    const totalStake = this.stakePerSpin * this.completedSpins;
    const rtp = totalStake > 0 ? this.totalWin / totalStake : 0;

    return {
      completedSpins: this.completedSpins,
      stakePerSpin: this.stakePerSpin,
      totalStake,
      totalWin: this.totalWin,
      rtp,
      rtpPercent: rtp * 100,
    };
  }
}

export function calculateStakePerSpin(spinConfig: SpinRequestConfig): number {
  assertFinitePositiveNumber(spinConfig.bet, "bet");
  assertFinitePositiveNumber(spinConfig.lines, "lines");
  assertFinitePositiveNumber(spinConfig.times, "times");

  const stake = spinConfig.bet * spinConfig.lines * spinConfig.times;
  assertFinitePositiveNumber(stake, "stakePerSpin");
  return stake;
}

export function assertFinitePositiveNumber(
  value: number,
  fieldName: string,
): void {
  assertFiniteNumber(value, fieldName);
  if (value <= 0) {
    throw new Error(`${fieldName} 必须大于 0`);
  }
}

export function assertFiniteNumber(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} 必须是有限数字`);
  }
}

export function assertNonNegativeInteger(
  value: number,
  fieldName: string,
): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} 必须是非负整数`);
  }
}
