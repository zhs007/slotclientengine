import { describe, expect, it } from "vitest";
import { prepareVisibleOccurrenceMotion } from "../../src/reel/index.js";

describe("visible occurrence motion", () => {
  it("samples line motion and CSS-style time easing with exact endpoints", () => {
    const motion = prepareVisibleOccurrenceMotion(
      {
        durationMs: 200,
        path: { kind: "line" },
        easing: { kind: "cubic-bezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
        stacking: { layer: "above-effects", order: 3 },
      },
      { x: 10, y: 20 },
      { x: 110, y: 20 },
    );

    expect(motion.sample(0)).toEqual({ x: 10, y: 20 });
    expect(motion.sample(0.5).x).toBeCloseTo(60, 4);
    expect(motion.sample(1)).toEqual({ x: 110, y: 20 });
  });

  it("uses total arc length rather than equal time per Bezier segment", () => {
    const motion = prepareVisibleOccurrenceMotion(
      {
        durationMs: 100,
        path: {
          kind: "cubic-bezier-path",
          segments: [
            {
              control1: { x: 3.33, y: 0 },
              control2: { x: 6.66, y: 0 },
              end: { x: 10, y: 0 },
            },
            {
              control1: { x: 40, y: 0 },
              control2: { x: 70, y: 0 },
              end: { x: 100, y: 0 },
            },
          ],
        },
        easing: { kind: "linear" },
        stacking: { layer: "above-symbols", order: 0 },
      },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    );

    expect(motion.sample(0.5).x).toBeCloseTo(50, 1);
  });

  it("rejects invalid path, easing, duration and stacking contracts", () => {
    const base = {
      durationMs: 100,
      path: { kind: "line" as const },
      easing: { kind: "linear" as const },
      stacking: { layer: "above-symbols" as const, order: 0 },
    };
    expect(() =>
      prepareVisibleOccurrenceMotion(
        { ...base, durationMs: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ),
    ).toThrow(/durationMs/);
    expect(() =>
      prepareVisibleOccurrenceMotion(
        {
          ...base,
          easing: { kind: "cubic-bezier", x1: -1, y1: 0, x2: 1, y2: 1 },
        },
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ),
    ).toThrow(/x1\/x2/);
    expect(() =>
      prepareVisibleOccurrenceMotion(
        { ...base, stacking: { layer: "above-effects", order: -1 } },
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ),
    ).toThrow(/order/);
    expect(() =>
      prepareVisibleOccurrenceMotion(
        {
          ...base,
          path: {
            kind: "cubic-bezier-path",
            segments: [
              {
                control1: { x: 0, y: 0 },
                control2: { x: 1, y: 1 },
                end: { x: 2, y: 2 },
              },
            ],
          },
        },
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ),
    ).toThrow(/end at target/);
  });
});
