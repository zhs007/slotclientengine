import { describe, expect, it } from "vitest";
import { resolveAwardTiming } from "../../src/popup/award-timing.js";
import { loadPopupManifest } from "../../src/popup/data/normalize.js";
import { popupFixture } from "./fixtures.js";

describe("award project timing", () => {
  const onceSpec = () => {
    const spec = popupFixture().awardCelebration;
    return {
      ...spec,
      celebrationTiers: spec.celebrationTiers.map((tier) => ({
        ...tier,
        layers: tier.layers.map((layer) =>
          layer.kind === "vni"
            ? { ...layer, playback: { mode: "once" as const } }
            : layer,
        ),
      })),
    };
  };

  it("fills seconds from metadata without changing source or manifest version", () => {
    const spec = onceSpec();
    expect(resolveAwardTiming(spec, () => 10)).toEqual({
      megaOnce: true,
      onceMegaCountDurationSeconds: 10 * 0.66,
      finalAmountHoldDurationSeconds: 10 * 0.33,
    });
    expect(spec).not.toHaveProperty("onceMegaCountDurationSeconds");
    const manifest = loadPopupManifest({
      ...popupFixture(),
      awardCelebration: {
        ...spec,
        onceMegaCountDurationSeconds: 2,
        finalAmountHoldDurationSeconds: 0,
      },
    }).manifest;
    expect(manifest.version).toBe(9);
    if (manifest.type !== "award-celebration")
      throw new Error("Expected award.");
    expect(
      resolveAwardTiming(manifest.awardCelebration, () => 10),
    ).toMatchObject({
      onceMegaCountDurationSeconds: 2,
      finalAmountHoldDurationSeconds: 0,
    });
  });

  it("uses segmented end and ignores a valid stored once duration", () => {
    expect(
      resolveAwardTiming(
        {
          ...popupFixture().awardCelebration,
          onceMegaCountDurationSeconds: 99,
        },
        () => 4,
      ),
    ).toEqual({
      megaOnce: false,
      onceMegaCountDurationSeconds: 99,
      finalAmountHoldDurationSeconds: 1.5,
    });
  });

  it("aggregates all Mega VNI completion times and disables fitting for mixed modes", () => {
    const spec = onceSpec();
    const mega = spec.celebrationTiers[2]!;
    const effect = mega.layers.find((layer) => layer.kind === "vni")!;
    const mixed = {
      ...spec,
      celebrationTiers: [
        {
          ...mega,
          layers: [
            ...mega.layers,
            {
              ...effect,
              id: "other",
              resource: "other",
              playback: {
                mode: "segmented" as const,
                loopStartTime: 1,
                loopEndTime: 2,
                keepParticlesAlive: true,
              },
            },
          ],
        },
      ],
    };
    expect(
      resolveAwardTiming(mixed, (id) => (id === "other" ? 7 : 10)),
    ).toEqual({ megaOnce: false, finalAmountHoldDurationSeconds: 5 });
    expect(
      resolveAwardTiming(
        {
          ...mixed,
          celebrationTiers: [
            {
              ...mega,
              layers: [
                ...mega.layers,
                { ...effect, id: "other", resource: "other" },
              ],
            },
          ],
        },
        (id) => (id === "other" ? 20 : 10),
      ),
    ).toEqual({
      megaOnce: true,
      onceMegaCountDurationSeconds: 20 * 0.66,
      finalAmountHoldDurationSeconds: 20 * 0.33,
    });
  });

  it("uses zero minimum hold when there is no Mega VNI", () => {
    const spec = popupFixture().awardCelebration;
    expect(
      resolveAwardTiming(
        {
          ...spec,
          celebrationTiers: spec.celebrationTiers.map((tier) => ({
            ...tier,
            layers: tier.layers.filter((layer) => layer.kind !== "vni"),
          })),
        },
        () => {
          throw new Error("must not read");
        },
      ),
    ).toEqual({ megaOnce: false, finalAmountHoldDurationSeconds: 0 });
  });

  it.each([0, -1, NaN, Infinity])(
    "rejects invalid once duration %s even when segmented",
    (value) => {
      expect(() =>
        resolveAwardTiming(
          {
            ...popupFixture().awardCelebration,
            onceMegaCountDurationSeconds: value,
          },
          () => 4,
        ),
      ).toThrow(/onceMegaCountDurationSeconds/);
    },
  );
  it("rejects invalid metadata, hold and unknown schema keys", () => {
    expect(() => resolveAwardTiming(onceSpec(), () => 0)).toThrow(
      /VNI duration/,
    );
    expect(() =>
      resolveAwardTiming(popupFixture().awardCelebration, () => 2),
    ).toThrow(/loop range/);
    expect(() =>
      resolveAwardTiming(
        { ...onceSpec(), finalAmountHoldDurationSeconds: -1 },
        () => 10,
      ),
    ).toThrow(/finalAmountHold/);
    const manifest = popupFixture();
    expect(() =>
      loadPopupManifest({
        ...manifest,
        awardCelebration: {
          ...manifest.awardCelebration,
          unexpectedSeconds: 1,
        },
      }),
    ).toThrow(/unknown key/);
  });
});
