import { describe, expect, it } from "vitest";
import {
  AWARD_POPUP_STATES,
  migrateLegacyPopupSegments,
  parsePopupManifest,
  POPUP_SEGMENTS,
  upgradePopupManifestToV5,
} from "../../src/popup/index.js";
import { popupFixture } from "./fixtures.js";

describe("popup state visibility", () => {
  it("expands legacy full selection and migrates partial selection by index", () => {
    const cases = [
      [["start"], ["base"]],
      [["loop"], ["standard"]],
      [["end"], ["bigwin"]],
      [
        ["start", "loop"],
        ["base", "standard"],
      ],
      [
        ["start", "end"],
        ["base", "bigwin"],
      ],
      [
        ["loop", "end"],
        ["standard", "bigwin"],
      ],
      [POPUP_SEGMENTS, AWARD_POPUP_STATES],
    ] as const;
    for (const [source, expected] of cases)
      expect(migrateLegacyPopupSegments(source, AWARD_POPUP_STATES)).toEqual(
        expected,
      );
    expect(
      migrateLegacyPopupSegments(["start", "end"], POPUP_SEGMENTS),
    ).toEqual(["start", "end"]);
    expect(() => migrateLegacyPopupSegments([], AWARD_POPUP_STATES)).toThrow(
      /non-empty/,
    );
  });

  it("upgrades a legal legacy award manifest to canonical v5", () => {
    const upgraded = upgradePopupManifestToV5(
      parsePopupManifest(popupFixture()),
    );
    expect(upgraded.version).toBe(5);
    expect(upgraded.backdrop.visibleStates).toEqual(AWARD_POPUP_STATES);
    if (upgraded.type !== "award-celebration")
      throw new Error("Expected award popup.");
    expect(upgraded.awardCelebration.base.layers[0]!.visibleStates).toEqual(
      AWARD_POPUP_STATES,
    );
    expect(parsePopupManifest(upgraded)).toEqual(upgraded);
  });

  it("rejects v5 states from the other popup type", () => {
    const upgraded = structuredClone(
      upgradePopupManifestToV5(parsePopupManifest(popupFixture())),
    ) as any;
    upgraded.backdrop.visibleStates = ["start"];
    expect(() => parsePopupManifest(upgraded)).toThrow(/invalid state/);
    upgraded.backdrop.visibleStates = [...AWARD_POPUP_STATES];
    upgraded.awardCelebration.base.layers[0].visibleStates = ["loop"];
    expect(() => parsePopupManifest(upgraded)).toThrow(/invalid state/);
  });
});
