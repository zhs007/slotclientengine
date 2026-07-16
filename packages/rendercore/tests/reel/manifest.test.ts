import { describe, expect, it } from "vitest";
import rawManifest from "../../../../assets/game002-s3/reel.manifest.json";
import { parseReelManifest } from "../../src/reel/index.js";

describe("parseReelManifest", () => {
  it("parses and deeply freezes the complete effect and refill contract", () => {
    const manifest = parseReelManifest(rawManifest);
    expect(manifest).toMatchObject({
      version: 1,
      spin: {
        bounceStrength: 0,
        dimmingAlpha: 0.4,
        timing: { startStepMs: 16, stopStepMs: 16 },
        anticipation: {
          effect: "anticipation",
          triggerLandedCount: 2,
          firstFollowingStopDelayMs: 2000.0001,
          stopStepMs: 240,
        },
        cellEffects: {
          anticipation: { skeleton: "./Nearwin1.json", loopCount: 3 },
          refillSweep: { skeleton: "./Nearwin2.json", loopCount: 1 },
        },
      },
      cascade: {
        anticipationRefill: {
          sweep: {
            effect: "refillSweep",
            startStepMs: 80,
            order: "left-right-bottom-up",
          },
          spin: {
            effect: "anticipation",
            order: "left-right-top-down",
            stopStepMs: 240,
          },
        },
      },
    });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(
      Object.isFrozen(manifest.spin.cellEffects.anticipation!.transform),
    ).toBe(true);
  });

  it("rejects missing, unknown, invalid path, timing, loop and order values", () => {
    const mutate = (callback: (copy: any) => void) => {
      const copy = structuredClone(rawManifest);
      callback(copy);
      return () => parseReelManifest(copy);
    };
    expect(() => parseReelManifest(null)).toThrow(/must be an object/);
    expect(mutate((copy) => (copy.version = 2))).toThrow(/version must be 1/);
    expect(mutate((copy) => delete copy.cascade)).toThrow(/cascade/);
    expect(mutate((copy) => (copy.spin.fallback = true))).toThrow(
      /unknown field/,
    );
    expect(mutate((copy) => (copy.spin.dimmingAlpha = 1.1))).toThrow(
      /dimmingAlpha/,
    );
    expect(mutate((copy) => (copy.spin.timing.startStepMs = -1))).toThrow(
      /startStepMs/,
    );
    expect(
      mutate((copy) => (copy.spin.timing.speedSymbolsPerSecond = 0)),
    ).toThrow(/speedSymbolsPerSecond/);
    expect(
      mutate((copy) => (copy.spin.cellEffects.anticipation.loopCount = 0)),
    ).toThrow(/positive safe integer/);
    expect(
      mutate((copy) => (copy.spin.cellEffects.anticipation.loopCount = 1.5)),
    ).toThrow(/positive safe integer/);
    expect(
      mutate(
        (copy) =>
          (copy.spin.cellEffects.anticipation.skeleton = "../Nearwin1.json"),
      ),
    ).toThrow(/local/);
    expect(
      mutate(
        (copy) =>
          (copy.spin.cellEffects.anticipation.skeleton =
            "https://example.com/a.json"),
      ),
    ).toThrow(/local/);
    expect(
      mutate(
        (copy) => (copy.cascade.anticipationRefill.sweep.order = "reverse"),
      ),
    ).toThrow(/order/);
    expect(
      mutate(
        (copy) => (copy.cascade.anticipationRefill.spin.order = "reverse"),
      ),
    ).toThrow(/order/);
    expect(
      mutate((copy) => (copy.spin.anticipation.effect = "missing")),
    ).toThrow(/missing/);
    expect(
      mutate(
        (copy) => (copy.cascade.anticipationRefill.sweep.effect = "missing"),
      ),
    ).toThrow(/missing/);
    expect(
      mutate(
        (copy) => (copy.cascade.anticipationRefill.spin.effect = "missing"),
      ),
    ).toThrow(/missing/);
    expect(
      mutate((copy) => {
        copy.spin.cellEffects["bad id"] = copy.spin.cellEffects.anticipation;
      }),
    ).toThrow(/effect id/);
  });
});
