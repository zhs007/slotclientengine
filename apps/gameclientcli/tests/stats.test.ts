import { describe, expect, it } from "vitest";
import { RtpStatsAccumulator, calculateStakePerSpin } from "../src/stats";

describe("RtpStatsAccumulator", () => {
  it("calculates stake, total win, rtp, and rtp percent", () => {
    const stats = new RtpStatsAccumulator({
      bet: 10,
      lines: 10,
      times: 1,
      autonums: -1,
    });

    stats.addSpin(50, 1);
    const snapshot = stats.addSpin(150, 2);

    expect(snapshot.completedSpins).toBe(2);
    expect(snapshot.stakePerSpin).toBe(100);
    expect(snapshot.totalStake).toBe(200);
    expect(snapshot.totalWin).toBe(200);
    expect(snapshot.rtp).toBe(1);
    expect(snapshot.rtpPercent).toBe(100);
  });

  it("rejects invalid totalwin", () => {
    const stats = new RtpStatsAccumulator({
      bet: 10,
      lines: 10,
      times: 1,
      autonums: -1,
    });

    expect(() => stats.addSpin(Number.NaN, 1)).toThrow("totalwin");
  });

  it.each([[-1], [1.5]])("rejects invalid results %s", (results) => {
    const stats = new RtpStatsAccumulator({
      bet: 10,
      lines: 10,
      times: 1,
      autonums: -1,
    });

    expect(() => stats.addSpin(0, results)).toThrow("results");
  });

  it("rejects non-positive stake inputs", () => {
    expect(() =>
      calculateStakePerSpin({
        bet: 0,
        lines: 10,
        times: 1,
        autonums: -1,
      }),
    ).toThrow("bet");
  });
});
