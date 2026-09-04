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
  it.each([1, 1000, 100000])(
    "fits only Mega once distance %s without decreasing the incoming speed",
    (distance) => {
      const manifest = popupFixture();
      const input = { betAmountRaw: 100, winAmountRaw: 5000 + distance };
      const stages = createAwardCountStages(manifest, input);
      const before = createAwardAmountMotionPlan(manifest, input, stages)!;
      const fitted = createAwardAmountMotionPlan(
        manifest,
        input,
        stages,
        1,
        6.6,
      )!;
      expect(fitted.onceMega).toBe(true);
      expect(fitted.stages.slice(0, -1)).toEqual(before.stages.slice(0, -1));
      const mega = fitted.stages.at(-1)!;
      expect(mega.startRateRawPerSecond).toBe(
        fitted.stages.at(-2)!.endRateRawPerSecond,
      );
      expect(mega.accelerationRawPerSecondSquared).toBeGreaterThanOrEqual(0);
      const duration = awardAmountMotionElapsedForAmount(
        mega,
        input.winAmountRaw,
      );
      expect(duration).toBeCloseTo(
        Math.min(6.6, distance / mega.startRateRawPerSecond),
      );
      expect(awardAmountMotionAmountAtElapsed(mega, duration + 1e-9)).toBe(
        input.winAmountRaw,
      );
      expect(mega.endRateRawPerSecond).toBeGreaterThanOrEqual(
        mega.startRateRawPerSecond,
      );
    },
  );

  it("preserves partial/exact threshold finals and scales once counting only", () => {
    const manifest = popupFixture();
    for (const winAmountRaw of [50, 100, 2000, 4000, 5000]) {
      const input = { betAmountRaw: 100, winAmountRaw };
      const stages = createAwardCountStages(manifest, input);
      expect(
        createAwardAmountMotionPlan(manifest, input, stages, 1, 6.6),
      ).toEqual(createAwardAmountMotionPlan(manifest, input, stages));
    }
    const input = { betAmountRaw: 100, winAmountRaw: 100000 };
    const stages = createAwardCountStages(manifest, input);
    const normal = createAwardAmountMotionPlan(
      manifest,
      input,
      stages,
      1,
      6.6,
    )!.stages.at(-1)!;
    const scaled = createAwardAmountMotionPlan(
      manifest,
      input,
      stages,
      0.5,
      6.6,
    )!.stages.at(-1)!;
    expect(scaled.effectiveCanonicalDurationSeconds).toBeCloseTo(
      normal.effectiveCanonicalDurationSeconds * 0.5,
    );
    expect(scaled.startRateRawPerSecond).toBeCloseTo(
      normal.startRateRawPerSecond * 2,
    );
  });
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

  it("scales the complete amount timeline without changing its shape", () => {
    const manifest = popupFixture();
    const input = { betAmountRaw: 100, winAmountRaw: 6000 };
    const stages = createAwardCountStages(manifest, input);
    const baseline = createAwardAmountMotionPlan(manifest, input, stages)!;
    const scaled = createAwardAmountMotionPlan(manifest, input, stages, 0.8)!;

    expect(scaled.finalTierId).toBe(baseline.finalTierId);
    expect(scaled.terminalBrake).toMatchObject({
      tierId: baseline.terminalBrake.tierId,
      startAmountRaw: baseline.terminalBrake.startAmountRaw,
      finalAmountRaw: baseline.terminalBrake.finalAmountRaw,
    });
    expect(scaled.terminalBrake.durationSeconds).toBeCloseTo(
      baseline.terminalBrake.durationSeconds * 0.8,
    );
    for (const [index, stage] of scaled.stages.entries()) {
      const original = baseline.stages[index]!;
      expect(stage.fromAmountRaw).toBe(original.fromAmountRaw);
      expect(stage.toAmountRaw).toBe(original.toAmountRaw);
      expect(stage.configuredDurationSeconds).toBeCloseTo(
        original.configuredDurationSeconds * 0.8,
      );
      expect(stage.effectiveCanonicalDurationSeconds).toBeCloseTo(
        original.effectiveCanonicalDurationSeconds * 0.8,
      );
      expect(stage.startRateRawPerSecond).toBeCloseTo(
        original.startRateRawPerSecond / 0.8,
      );
      expect(stage.endRateRawPerSecond).toBeCloseTo(
        original.endRateRawPerSecond / 0.8,
      );
      expect(stage.accelerationRawPerSecondSquared).toBeCloseTo(
        original.accelerationRawPerSecondSquared / 0.8 ** 2,
      );
      const sampleAmount =
        original.fromAmountRaw +
        Math.floor((original.toAmountRaw - original.fromAmountRaw) * 0.5);
      const originalElapsed = awardAmountMotionElapsedForAmount(
        original,
        sampleAmount,
      );
      expect(
        awardAmountMotionElapsedForAmount(stage, sampleAmount),
      ).toBeCloseTo(originalElapsed * 0.8);
      expect(
        awardAmountMotionAmountAtElapsed(stage, originalElapsed * 0.8),
      ).toBeCloseTo(
        awardAmountMotionAmountAtElapsed(original, originalElapsed),
      );
    }
    const brakeElapsed = baseline.terminalBrake.durationSeconds * 0.6;
    expect(
      awardAmountTerminalBrakeAmountAtElapsed(
        scaled.terminalBrake,
        brakeElapsed * 0.8,
      ),
    ).toBeCloseTo(
      awardAmountTerminalBrakeAmountAtElapsed(
        baseline.terminalBrake,
        brakeElapsed,
      ),
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

  it("continues accelerating through a long megawin span", () => {
    const manifest = popupFixture();
    const input = { betAmountRaw: 100, winAmountRaw: 100_000 };
    const plan = createAwardAmountMotionPlan(
      manifest,
      input,
      createAwardCountStages(manifest, input),
    )!;
    const megawin = plan.stages.find(({ tierId }) => tierId === "megawin")!;
    const sampleDuration = Math.min(
      megawin.effectiveCanonicalDurationSeconds,
      awardAmountMotionElapsedForAmount(
        megawin,
        plan.terminalBrake.startAmountRaw,
      ),
    );
    const samples = [0, 0.25, 0.5, 0.75, 1].map((part) =>
      awardAmountMotionAmountAtElapsed(
        megawin,
        sampleDuration * part,
        plan.terminalBrake.startAmountRaw,
      ),
    );
    const deltas = samples
      .slice(1)
      .map((amount, index) => amount - samples[index]!);

    expect(deltas[1]).toBeGreaterThan(deltas[0]!);
    expect(deltas[2]).toBeGreaterThan(deltas[1]!);
    expect(deltas[3]).toBeGreaterThan(deltas[2]!);
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

  it.each([0, -0.8, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid amount duration scale %s",
    (scale) => {
      const manifest = popupFixture();
      const input = { betAmountRaw: 100, winAmountRaw: 6000 };
      expect(() =>
        createAwardAmountMotionPlan(
          manifest,
          input,
          createAwardCountStages(manifest, input),
          scale,
        ),
      ).toThrow(/amountDurationScale/);
    },
  );
});
