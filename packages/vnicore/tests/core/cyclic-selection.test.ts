import { describe, expect, it } from "vitest";
import {
  advanceVNICyclicContinuousMotion,
  createVNICyclicMotionSnapshot,
  createVNICyclicResolvePlan,
  getVNICyclicCarrierAlignmentErrorTurns,
  sampleVNICyclicResolveStopTurns,
} from "../../src/core/cyclic-selection";

describe("cyclic-selection core", () => {
  it("keeps an unwrapped phase for arbitrary continuous duration", () => {
    const initial = createVNICyclicMotionSnapshot({
      unwrappedTurns: 0.15,
      velocityTurnsPerSecond: 0.1,
      carrierCount: 13,
    });
    const short = advanceVNICyclicContinuousMotion(initial, 1.5);
    const long = advanceVNICyclicContinuousMotion(initial, 4.5);
    const hour = advanceVNICyclicContinuousMotion(initial, 3600);

    expect(short.unwrappedTurns).toBeCloseTo(0.3, 12);
    expect(long.unwrappedTurns).toBeCloseTo(0.6, 12);
    expect(long.unwrappedTurns - short.unwrappedTurns).toBeCloseTo(0.3, 12);
    expect(Number.isFinite(hour.unwrappedTurns)).toBe(true);
    expect(hour.unwrappedTurns).toBeCloseTo(360.15, 10);
  });

  it.each([1, -1] as const)(
    "aligns all 13 carriers exactly in direction %i",
    (direction) => {
      for (let target = 0; target < 13; target += 1) {
        const snapshot = createVNICyclicMotionSnapshot({
          unwrappedTurns: direction * 7.4321,
          velocityTurnsPerSecond: direction * 0.1,
          carrierCount: 13,
        });
        const plan = createVNICyclicResolvePlan({
          snapshot,
          selectedCarrierIndex: target,
          direction,
          rounds: 2,
          fastRelativeTurns: direction * 4.2,
          stopOvershoot: 0.18,
        });
        expect(sampleVNICyclicResolveStopTurns(plan, 0)).toBeCloseTo(
          plan.stopStartTurns,
          12,
        );
        expect(sampleVNICyclicResolveStopTurns(plan, 1)).toBeCloseTo(
          plan.finalTurns,
          12,
        );
        expect(
          getVNICyclicCarrierAlignmentErrorTurns(plan.finalTurns, target, 13),
        ).toBeLessThan(1e-12);
      }
    },
  );

  it("rejects invalid transitions and resolve parameters", () => {
    const snapshot = createVNICyclicMotionSnapshot({
      unwrappedTurns: 0,
      velocityTurnsPerSecond: 0.1,
      carrierCount: 13,
    });
    expect(() => advanceVNICyclicContinuousMotion(snapshot, 0)).toThrow(
      "positive finite",
    );
    expect(() =>
      createVNICyclicResolvePlan({
        snapshot,
        selectedCarrierIndex: 13,
        direction: 1,
        rounds: 0,
        fastRelativeTurns: 1,
        stopOvershoot: 0,
      }),
    ).toThrow("0..12");
    for (const rounds of [-1, 0.5, Number.NaN]) {
      expect(() =>
        createVNICyclicResolvePlan({
          snapshot,
          selectedCarrierIndex: 0,
          direction: 1,
          rounds,
          fastRelativeTurns: 1,
          stopOvershoot: 0,
        }),
      ).toThrow("rounds");
    }
  });
});
