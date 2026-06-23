import { describe, expect, it } from "vitest";
import {
  easeProgress,
  sampleLayerAnimationsAtTime,
} from "../../src/core/animation-sampler";
import type {
  V5GAnimationConfig,
  V5GAnimationType,
  V5GTransformConfig,
} from "../../src/core/types";

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

  it("samples slide, bounce, pulse, float, and swing animations", () => {
    const slide = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("slide_in", { fromX: -10, fromY: 0, toX: 0, toY: 20 })],
      0.5,
    );
    expect(slide.transform.x).toBe(95);
    expect(slide.transform.y).toBe(60);
    expect(slide.opacity).toBe(0.5);

    const bounce = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("bounce_in", {
          fromScale: 0,
          toScale: 1,
          overshoot: 0,
          easing: "linear",
        }),
      ],
      0.5,
    );
    expect(bounce.transform.scaleX).toBe(0.875);
    expect(bounce.opacity).toBe(0.625);

    const pulse = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("pulse", { scale: 2, cycles: 1 })],
      0.25,
    );
    expect(pulse.transform.scaleX).toBe(1.5);

    const floating = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("float", { amplitude: 20, cycles: 1 })],
      0.25,
    );
    expect(floating.transform.y).toBe(70);

    const swing = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("swing", { angle: 30, cycles: 1 })],
      0.25,
    );
    expect(swing.transform.rotation).toBe(40);
  });

  it("samples entry, exit, emphasis, and particle marker animations", () => {
    const scaleIn = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("scale_in", { fromScale: 0, toScale: 1 })],
      0.5,
    );
    expect(scaleIn.transform.scaleX).toBe(0.5);
    expect(scaleIn.opacity).toBe(0.5);

    const scaleOut = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("scale_out", { fromScale: 1, toScale: 0 })],
      0.5,
    );
    expect(scaleOut.transform.scaleX).toBe(0.5);
    expect(scaleOut.opacity).toBe(0.5);

    const pop = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [animation("pop", { peakScale: 1.4, settleScale: 1, peakAt: 0.5 })],
      0.5,
    );
    expect(pop.transform.scaleX).toBe(1.4);

    const shake = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("shake", {
          amplitudeX: 10,
          amplitudeY: 20,
          cycles: 1,
          decay: false,
        }),
      ],
      0.25,
    );
    expect(shake.transform.x).toBe(110);
    expect(shake.transform.y).toBe(39.0195);

    const blink = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation("blink", {
          minOpacity: 0.2,
          maxOpacity: 1,
          blinks: 1,
          endOpacity: 1,
        }),
      ],
      0.5,
    );
    expect(blink.opacity).toBe(0.2);

    const particleMarker = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 0.8 },
      [
        animation("particles", {
          count: 4,
          spread: 20,
          speed: 40,
          size: 8,
          gravity: 0,
        }),
      ],
      0.5,
    );
    expect(particleMarker.transform).toEqual(baseTransform);
    expect(particleMarker.opacity).toBe(0.8);
  });

  it("samples particle_combo source opacity for the image layer only", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 0.8 },
      [
        animation("particle_combo", {
          count: 4,
          size: 12,
          sourceOpacity: 0.25,
          spawnMode: 1,
          spawnRadius: 30,
          spawnRatio: 0.2,
          targetX: 10,
          targetY: 20,
          travelMode: 0,
          curve: 0,
          orbitRadius: 10,
          orbitTurns: 1,
          orbitSpeed: 1,
          orbitRatio: 0.4,
          staggerRatio: 0,
          trailCount: 0,
          trailSpacing: 0.03,
          trailFade: 0.6,
          vanishMode: 0,
          vanishRatio: 0.2,
          flashScale: 1.2,
          flashIntensity: 1,
        }),
      ],
      0.5,
    );

    expect(sampled.opacity).toBe(0.2);
    expect(sampled.transform).toEqual(baseTransform);
  });

  it("samples squash_stretch displacement and elastic scale", () => {
    const sampled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 1 },
      [
        animation(
          "squash_stretch",
          {
            squashAngle: 90,
            squashAmount: 0.4,
            decayOscillateCount: 2,
            fromX: 0,
            fromY: 0,
            toX: 20,
            toY: -10,
          },
          { startTime: 0, duration: 1 },
        ),
      ],
      0.5,
    );

    expect(sampled.transform.x).not.toBe(baseTransform.x);
    expect(sampled.transform.y).not.toBe(baseTransform.y);
    expect(sampled.transform.scaleX).not.toBe(baseTransform.scaleX);
    expect(sampled.opacity).toBe(1);
  });

  it("ignores disabled animations and applies overlaps in startTime order", () => {
    const disabled = sampleLayerAnimationsAtTime(
      { transform: baseTransform, opacity: 0.7 },
      [animation("fade", { fromOpacity: 0, toOpacity: 0 }, { enabled: false })],
      0.5,
    );
    expect(disabled.opacity).toBe(0.7);

    const overlapping = sampleLayerAnimationsAtTime(
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
    expect(overlapping.opacity).toBe(0.5);
  });

  it("throws for unknown easing and missing required params", () => {
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
    expect(() =>
      sampleLayerAnimationsAtTime(
        { transform: baseTransform, opacity: 1 },
        [animation("move", { fromX: 0, fromY: 0, toX: 1 })],
        0.5,
      ),
    ).toThrow('requires numeric param "toY"');
  });
});
