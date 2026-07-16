import { describe, expect, it } from "vitest";
import { parseReelManifest } from "../../src/reel/index.js";

describe("parseReelManifest", () => {
  it("parses a non-negative spin bounce strength including zero", () => {
    expect(
      parseReelManifest({
        version: 1,
        spin: { bounceStrength: 0, dimmingAlpha: 0.6 },
      }),
    ).toEqual({
      version: 1,
      spin: { bounceStrength: 0, dimmingAlpha: 0.6 },
    });
    expect(
      parseReelManifest({
        version: 1,
        spin: { bounceStrength: 1.5, dimmingAlpha: 1 },
      }).spin,
    ).toEqual({ bounceStrength: 1.5, dimmingAlpha: 1 });
  });

  it("rejects missing, negative, non-finite and unknown values", () => {
    expect(() => parseReelManifest(null)).toThrow(/must be an object/);
    expect(() =>
      parseReelManifest({
        version: 2,
        spin: { bounceStrength: 0, dimmingAlpha: 0.6 },
      }),
    ).toThrow(/version must be 1/);
    expect(() => parseReelManifest({ version: 1, spin: {} })).toThrow(
      /bounceStrength/,
    );
    expect(() =>
      parseReelManifest({
        version: 1,
        spin: { bounceStrength: -1, dimmingAlpha: 0.6 },
      }),
    ).toThrow(/non-negative finite/);
    expect(() =>
      parseReelManifest({
        version: 1,
        spin: {
          bounceStrength: Number.POSITIVE_INFINITY,
          dimmingAlpha: 0.6,
        },
      }),
    ).toThrow(/non-negative finite/);
    expect(() =>
      parseReelManifest({ version: 1, spin: { bounceStrength: 0 } }),
    ).toThrow(/dimmingAlpha/);
    for (const dimmingAlpha of [-0.1, 1.1, Number.POSITIVE_INFINITY]) {
      expect(() =>
        parseReelManifest({
          version: 1,
          spin: { bounceStrength: 0, dimmingAlpha },
        }),
      ).toThrow(/dimmingAlpha/);
    }
    expect(() =>
      parseReelManifest({
        version: 1,
        spin: { bounceStrength: 0, dimmingAlpha: 0.6, fallback: true },
      }),
    ).toThrow(/unknown field/);
  });
});
