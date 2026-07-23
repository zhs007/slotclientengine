import { describe, expect, it } from "vitest";
import {
  advanceVNICyclicContinuousMotion,
  createVNICyclicMotionSnapshot,
  createVNICyclicResolvePlan,
  getVNICyclicCarrierAlignmentErrorTurns,
  sampleVNICyclicResolveStopTurns,
} from "../../src/core/cyclic-selection";
import {
  createCardCarousel3DContinuousMotion,
  createCardCarousel3DResolvePlan,
  prepareCardCarousel3D,
  sampleCardCarousel3DResolveMotion,
} from "../../src/core/card-carousel-3d";
import type { V5GAnimationConfig } from "../../src/core/types";

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

  it.each([0, 1.5, 4.5, 10])(
    "resolves continuous duration %s without phase rewind",
    (duration) => {
      const prepared = prepareCardCarousel3D(carouselAnimation());
      const continuous = createCardCarousel3DContinuousMotion(
        prepared,
        duration,
      );
      const plan = createCardCarousel3DResolvePlan(
        prepared,
        continuous.rotation,
        7,
      );
      const settled = sampleCardCarousel3DResolveMotion(
        prepared,
        plan,
        prepared.fastDuration + prepared.stopDuration + prepared.holdDuration,
      );
      expect(settled.rotation / (Math.PI * 2)).toBeCloseTo(plan.finalTurns, 12);
      expect(
        getVNICyclicCarrierAlignmentErrorTurns(
          plan.finalTurns,
          7,
          prepared.cardCount,
        ),
      ).toBeLessThan(1e-12);
      expect(plan.startTurns).toBeCloseTo(
        prepared.introRotation / (Math.PI * 2) +
          prepared.direction * prepared.idleSpeed * duration,
        12,
      );
    },
  );
});

function carouselAnimation(): V5GAnimationConfig {
  return {
    id: "anim_module_mrupw05e_8",
    name: "Bamboo carousel",
    type: "card_carousel_3d",
    startTime: 0,
    duration: 9.6,
    enabled: true,
    seed: 5,
    params: {
      phasePreviewMode: "full_demo",
      cardCount: 13,
      targetIndex: 0,
      rounds: 1,
      direction: 1,
      introDuration: 1.5,
      introSpeed: 0.1,
      revealDirection: 0,
      revealStagger: 0.08,
      revealOffsetX: 50,
      revealScaleFrom: 0.9,
      demoIdleDuration: 1.5,
      idleSpeed: 0.1,
      fastDuration: 2,
      fastSpeed: 2.8,
      accelRatio: 0.28,
      stopDuration: 1.6,
      holdDuration: 3,
      stopOvershoot: 0.18,
      finalPop: 0,
      finalGlow: 0,
      radius: 420,
      cardSpacing: 1.05,
      perspective: 0.8,
      slices: 8,
      visibleRange: 0.5,
      cardSize: 720,
      centerScale: 1,
      sideScale: 0.9,
      sideAlpha: 1,
      shadeStrength: 0.9,
      curve: 0.1,
      tilt: 0,
      sourceOpacity: 0,
      hideBack: true,
      keepOriginal: false,
    },
  };
}
