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
