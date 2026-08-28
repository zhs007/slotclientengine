import { describe, expect, it } from "vitest";
import {
  awardAmountMotionAmountAtElapsed,
  awardAmountMotionElapsedForAmount,
  awardAmountTerminalBrakeAmountAtElapsed,
  createAwardAmountMotionPlan,
} from "../../src/popup/award-amount-motion.js";
import { createAwardCountStages } from "../../src/popup/index.js";
import { popupFixture } from "./fixtures.js";

describe("award amount motion", () => {
  it("uses the complete standard span to time a partial win", () => {
    const manifest = popupFixture();
    const input = { betAmountRaw: 100, winAmountRaw: 200 };
    const plan = createAwardAmountMotionPlan(
      manifest,
      input,
      createAwardCountStages(manifest, input),
    )!;
    const standard = plan.stages[0]!;

    expect(standard.tierId).toBe("standard");
    expect(standard.canonicalSpanRaw).toBe(1400);
    expect(standard.effectiveCanonicalDurationSeconds).toBeCloseTo(3);
    expect(awardAmountMotionElapsedForAmount(standard, 200)).toBeLessThan(3);
  });

  it("precomputes increasing rates without resetting at tier boundaries", () => {
    const manifest = popupFixture();
    const input = { betAmountRaw: 100, winAmountRaw: 6000 };
    const plan = createAwardAmountMotionPlan(
      manifest,
      input,
      createAwardCountStages(manifest, input),
    )!;

    expect(plan.stages.map((stage) => stage.tierId)).toEqual([
      "standard",
      "bigwin",
      "superwin",
      "megawin",
    ]);
    for (const [index, stage] of plan.stages.entries()) {
      expect(stage.endRateRawPerSecond).toBeGreaterThan(
        stage.startRateRawPerSecond,
      );
      if (index > 0)
        expect(stage.startRateRawPerSecond).toBeCloseTo(
          plan.stages[index - 1]!.endRateRawPerSecond,
        );
    }
    expect(plan.stages[1]!.effectiveCanonicalDurationSeconds).toBeLessThan(
      plan.stages[1]!.configuredDurationSeconds,
    );
  });

  it("accelerates before the single terminal braking tail", () => {
    const manifest = popupFixture();
    const input = { betAmountRaw: 100, winAmountRaw: 200 };
    const plan = createAwardAmountMotionPlan(
      manifest,
      input,
      createAwardCountStages(manifest, input),
    )!;
    const standard = plan.stages[0]!;
    const accelerationEnd = plan.terminalBrake.startAmountRaw;
    const accelerationDuration = awardAmountMotionElapsedForAmount(
      standard,
      accelerationEnd,
    );
    const acceleratedSamples = [0, 0.25, 0.5, 0.75, 1].map((part) =>
      awardAmountMotionAmountAtElapsed(
        standard,
        accelerationDuration * part,
        accelerationEnd,
      ),
    );
    const acceleratingDeltas = acceleratedSamples
      .slice(1)
      .map((amount, index) => amount - acceleratedSamples[index]!);
    expect(acceleratingDeltas[1]).toBeGreaterThan(acceleratingDeltas[0]!);
    expect(acceleratingDeltas[2]).toBeGreaterThan(acceleratingDeltas[1]!);
    expect(acceleratingDeltas[3]).toBeGreaterThan(acceleratingDeltas[2]!);

    const brake = plan.terminalBrake;
    const brakingSamples = [0, 0.25, 0.5, 0.75, 1].map((part) =>
      awardAmountTerminalBrakeAmountAtElapsed(
        brake,
        brake.durationSeconds * part,
      ),
    );
    const brakingDeltas = brakingSamples
      .slice(1)
      .map((amount, index) => amount - brakingSamples[index]!);
    expect(brakingDeltas[1]).toBeLessThan(brakingDeltas[0]!);
    expect(brakingDeltas[2]).toBeLessThan(brakingDeltas[1]!);
    expect(brakingDeltas[3]).toBeLessThan(brakingDeltas[2]!);
    expect(brakingSamples.at(-1)).toBe(200);
  });

  it("keeps exact threshold finals on the reached visual tier", () => {
    const manifest = popupFixture();
    const input = { betAmountRaw: 100, winAmountRaw: 1500 };
    const plan = createAwardAmountMotionPlan(
      manifest,
      input,
      createAwardCountStages(manifest, input),
    )!;

    expect(plan.terminalBrake.tierId).toBe("standard");
    expect(plan.finalTierId).toBe("bigwin");
    expect(plan.terminalBrake.finalAmountRaw).toBe(1500);
  });

  it("keeps zero-duration canonical stages finite and instantaneous", () => {
    const manifest = structuredClone(popupFixture());
    (
      manifest.awardCelebration.standard as {
        countDurationSeconds: number;
      }
    ).countDurationSeconds = 0;
    for (const tier of manifest.awardCelebration.celebrationTiers)
      (tier as { countDurationSeconds: number }).countDurationSeconds = 0;
    const input = { betAmountRaw: 100, winAmountRaw: 6000 };
    const plan = createAwardAmountMotionPlan(
      manifest,
      input,
      createAwardCountStages(manifest, input),
    )!;

    for (const stage of plan.stages) {
      expect(stage.effectiveCanonicalDurationSeconds).toBe(0);
      expect(stage.endRateRawPerSecond).toBeGreaterThan(0);
      expect(Number.isFinite(stage.endRateRawPerSecond)).toBe(true);
      expect(awardAmountMotionElapsedForAmount(stage, stage.toAmountRaw)).toBe(
        0,
      );
      expect(awardAmountMotionAmountAtElapsed(stage, 0)).toBe(
        stage.toAmountRaw,
      );
    }
  });

  it("returns no rolling plan at or below bet and rejects unsafe canonical thresholds", () => {
    const manifest = popupFixture();
    for (const winAmountRaw of [50, 100]) {
      const input = { betAmountRaw: 100, winAmountRaw };
      expect(
        createAwardAmountMotionPlan(
          manifest,
          input,
          createAwardCountStages(manifest, input),
        ),
      ).toBeNull();
    }
    const unsafe = {
      betAmountRaw: Number.MAX_SAFE_INTEGER - 1,
      winAmountRaw: Number.MAX_SAFE_INTEGER,
    };
    expect(() =>
      createAwardAmountMotionPlan(
        manifest,
        unsafe,
        createAwardCountStages(manifest, unsafe),
      ),
    ).toThrow(/threshold exceeds/);
  });
});
