import { describe, expect, it } from "vitest";
import { parseReelManifest } from "../../src/reel/index.js";

describe("parseReelManifest", () => {
  it("parses a non-negative spin bounce strength including zero", () => {
    expect(
      parseReelManifest({ version: 1, spin: { bounceStrength: 0 } }),
    ).toEqual({ version: 1, spin: { bounceStrength: 0 } });
    expect(
      parseReelManifest({ version: 1, spin: { bounceStrength: 1.5 } }).spin
        .bounceStrength,
    ).toBe(1.5);
  });

  it("rejects missing, negative, non-finite and unknown values", () => {
    expect(() => parseReelManifest(null)).toThrow(/must be an object/);
    expect(() =>
      parseReelManifest({ version: 2, spin: { bounceStrength: 0 } }),
    ).toThrow(/version must be 1/);
    expect(() => parseReelManifest({ version: 1, spin: {} })).toThrow(
      /bounceStrength/,
    );
    expect(() =>
      parseReelManifest({ version: 1, spin: { bounceStrength: -1 } }),
    ).toThrow(/non-negative finite/);
    expect(() =>
      parseReelManifest({
        version: 1,
        spin: { bounceStrength: Number.POSITIVE_INFINITY },
      }),
    ).toThrow(/non-negative finite/);
    expect(() =>
      parseReelManifest({
        version: 1,
        spin: { bounceStrength: 0, fallback: true },
      }),
    ).toThrow(/unknown field/);
  });
});
