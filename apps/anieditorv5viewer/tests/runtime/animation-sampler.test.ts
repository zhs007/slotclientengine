import { describe, expect, it } from "vitest";
import {
  easeProgress,
  sampleLayerAnimationsAtTime,
} from "../../src/runtime/animation-sampler";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GTransformConfig,
} from "../../src/v5g/types";

const baseTransform: V5GTransformConfig = {
  x: 100,
  y: 50,
  scaleX: 1,
  scaleY: 1,
  rotation: 10,
  anchorX: 0.5,
  anchorY: 0.5,
};

function animation(
  type: V5GAnimationType,
  params: V5GAnimationConfig["params"],
  overrides: Partial<V5GAnimationConfig> = {},
): V5GAnimationConfig {
  return {
    id: `anim-${type}`,
    type,
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 1,
    params: { easing: "linear", ...params },
    ...overrides,
  };
}

describe("animation-sampler", () => {
  it("samples supported easing curves", () => {
    expect(easeProgress(0.5, "linear")).toBe(0.5);
    expect(easeProgress(0.5, "easeInQuad")).toBe(0.25);
    expect(easeProgress(0.5, "easeOutQuad")).toBe(0.75);
    expect(easeProgress(0.5, "easeInOutQuad")).toBe(0.5);
    expect(easeProgress(1, "backOut")).toBe(1);
  });

  it("samples move with baseX and baseY offsets", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("move", {
          fromX: 40,
          fromY: 10,
          toX: 80,
          toY: 30,
          baseX: 20,
          baseY: 5,
        }),
      ],
      0.5,
    );

    expect(sampled.transform.x).toBe(140);
    expect(sampled.transform.y).toBe(65);
  });

  it("clamps fade opacity to 0..1", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("fade", { fromOpacity: 0, toOpacity: 2 })],
      1,
    );

    expect(sampled.opacity).toBe(1);
  });

  it("preserves negative scale signs for scale animations", () => {
    const sampled = sampleLayerAnimationsAtTime(
      {
        transform: { ...baseTransform, scaleX: -1, scaleY: 2 },
        opacity: 1,
      },
      [
        animation("scale_up", {
          fromScaleX: 0.2,
          fromScaleY: 1,
          toScaleX: 1,
          toScaleY: 3,
        }),
      ],
      0.5,
    );

    expect(sampled.transform.scaleX).toBe(-0.6);
    expect(sampled.transform.scaleY).toBe(2);
  });

  it("samples rotate in degrees", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("rotate", { fromRotation: 0, toRotation: 90 })],
      0.5,
    );

    expect(sampled.transform.rotation).toBe(55);
  });

  it("samples scale_in and scale_out with optional fades", () => {
    const scaleIn = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("scale_in", { fromScale: 0, toScale: 2, fadeIn: true })],
      0.5,
    );
    const scaleOut = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("scale_out", { fromScale: 1, toScale: 0, fadeOut: true })],
      0.5,
    );

    expect(scaleIn.transform.scaleX).toBe(1);
    expect(scaleIn.opacity).toBe(0.5);
    expect(scaleOut.transform.scaleX).toBe(0.5);
    expect(scaleOut.opacity).toBe(0.5);
  });

  it("samples pop before and after peakAt", () => {
    const beforePeak = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("pop", { peakScale: 2, settleScale: 1, peakAt: 0.5 })],
      0.25,
    );
    const afterPeak = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("pop", { peakScale: 2, settleScale: 1, peakAt: 0.5 })],
      0.75,
    );

    expect(beforePeak.transform.scaleX).toBe(1.75);
    expect(afterPeak.transform.scaleX).toBe(1.25);
  });

  it("uses blink endOpacity at the end frame", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("blink", {
          minOpacity: 0.2,
          maxOpacity: 1,
          blinks: 2,
          endOpacity: 0.35,
        }),
      ],
      1,
    );

    expect(sampled.opacity).toBe(0.35);
  });

  it("adds move and shake instead of resetting to base", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("move", { fromX: 0, fromY: 0, toX: 20, toY: 0 }),
        animation("shake", {
          amplitudeX: 10,
          amplitudeY: 0,
          cycles: 1,
          decay: false,
        }),
      ],
      0.25,
    );

    expect(sampled.transform.x).toBe(115);
  });

  it("adds rotate and swing instead of resetting to base", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("rotate", { fromRotation: 0, toRotation: 90 }),
        animation("swing", { angle: 10, cycles: 1 }),
      ],
      0.25,
    );

    expect(sampled.transform.rotation).toBe(42.5);
  });

  it("multiplies scale_up and pulse instead of resetting to base", () => {
    const sampled = sampleLayerAnimationsAtTime(
      {
        transform: { ...baseTransform, scaleX: 2, scaleY: 2 },
        opacity: 1,
      },
      [
        animation("scale_up", {
          fromScaleX: 2,
          fromScaleY: 2,
          toScaleX: 4,
          toScaleY: 4,
        }),
        animation("pulse", { scale: 2, cycles: 1 }),
      ],
      0.25,
    );

    expect(sampled.transform.scaleX).toBe(3.75);
    expect(sampled.transform.scaleY).toBe(3.75);
  });

  it("leaves transform and opacity unchanged for non-combo particle animations", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 0.8 },
      [
        animation("particles", {
          count: 4,
          spread: 20,
          speed: 30,
          size: 16,
          gravity: 10,
        }),
        animation("particle_twinkle", {
          radius: 20,
          count: 4,
          spawnInterval: 0.1,
          twinkleDuration: 0.4,
          batchMin: 1,
          batchMax: 2,
          size: 16,
        }),
        animation("particle_wall", {
          emitterWidth: 300,
          direction: 270,
          spreadAngle: 15,
          speed: 200,
          lifetimeMin: 0.8,
          lifetimeMax: 2,
          spawnRate: 30,
          size: 48,
          gravity: 0,
          startScaleMin: 0.6,
          startScaleMax: 1,
          endScaleMin: 0.3,
          endScaleMax: 0.8,
          fadeOut: true,
        }),
      ],
      0.5,
    );

    expect(sampled.transform).toEqual(baseTransform);
    expect(sampled.opacity).toBe(0.8);
  });

  it("samples particle_combo source opacity for the image layer only", () => {
    const hiddenSource = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 0.8 },
      [
        animation("particle_combo", {
          count: 36,
          size: 42,
          sourceOpacity: 0,
          spawnMode: 1,
          spawnRadius: 90,
          spawnRatio: 0.18,
          targetX: 320,
          targetY: 0,
          travelMode: 1,
          curve: 160,
          orbitRadius: 80,
          orbitTurns: 1,
          orbitSpeed: 1,
          orbitRatio: 0.35,
          staggerRatio: 0.28,
          trailCount: 4,
          trailSpacing: 0.045,
          trailFade: 0.55,
          vanishMode: 1,
          vanishRatio: 0.18,
          flashScale: 1.6,
          flashIntensity: 1.4,
        }),
      ],
      0.5,
    );
    const visibleSource = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 0.8 },
      [
        animation("particle_combo", {
          count: 36,
          size: 42,
          sourceOpacity: 0.25,
          spawnMode: 1,
          spawnRadius: 90,
          spawnRatio: 0.18,
          targetX: 320,
          targetY: 0,
          travelMode: 1,
          curve: 160,
          orbitRadius: 80,
          orbitTurns: 1,
          orbitSpeed: 1,
          orbitRatio: 0.35,
          staggerRatio: 0.28,
          trailCount: 4,
          trailSpacing: 0.045,
          trailFade: 0.55,
          vanishMode: 1,
          vanishRatio: 0.18,
          flashScale: 1.6,
          flashIntensity: 1.4,
        }),
      ],
      0.5,
    );

    expect(hiddenSource.transform).toEqual(baseTransform);
    expect(hiddenSource.opacity).toBe(0);
    expect(visibleSource.opacity).toBe(0.2);
  });

  it("samples squash_stretch displacement and elastic scale", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("squash_stretch", {
          squashAngle: 90,
          squashAmount: 0.2,
          decayOscillateCount: 3,
          fromX: 0,
          fromY: -100,
          toX: 20,
          toY: 0,
          easing: "easeOutQuad",
        }),
      ],
      0.5,
    );

    expect(sampled.transform.x).toBeGreaterThan(baseTransform.x);
    expect(sampled.transform.y).toBeGreaterThan(baseTransform.y - 100);
    expect(sampled.transform.scaleX).not.toBe(1);
    expect(sampled.transform.scaleY).toBe(1);
  });

  it("ignores disabled animations", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 0.7 },
      [animation("fade", { fromOpacity: 0, toOpacity: 0 }, { enabled: false })],
      0.5,
    );

    expect(sampled.opacity).toBe(0.7);
  });

  it("applies overlapping animations in startTime order", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("fade", { fromOpacity: 0, toOpacity: 1 }, { startTime: 0 }),
        animation(
          "fade",
          { fromOpacity: 0.2, toOpacity: 0.8 },
          { startTime: 0.1 },
        ),
      ],
      0.6,
    );

    expect(sampled.opacity).toBe(0.5);
  });

  it("throws for unknown easing", () => {
    expect(() =>
      sampleLayerAnimationsAtTime(
        { transform: baseTransform, opacity: 1 },
        [
          animation("fade", {
            fromOpacity: 0,
            toOpacity: 1,
            easing: "mystery",
          }),
        ],
        0.5,
      ),
    ).toThrow("Unsupported V5G easing");
  });

  it("throws for missing required params", () => {
    expect(() =>
      sampleLayerAnimationsAtTime(
        { transform: baseTransform, opacity: 1 },
        [animation("move", { fromX: 0, fromY: 0, toX: 1 })],
        0.5,
      ),
    ).toThrow('requires numeric param "toY"');
  });
});
