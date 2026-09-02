import { describe, expect, it } from "vitest";
import {
  AWARD_POPUP_STATES,
  LATEST_POPUP_MANIFEST_VERSION,
  loadPopupManifest,
  migrateLegacyPopupSegments,
  parsePopupManifest,
  POPUP_SEGMENTS,
  upgradePopupManifestToV5,
  upgradePopupManifestToV6,
} from "../../src/popup/index.js";
import { popupFixture } from "./fixtures.js";

describe("popup state visibility", () => {
  it("strictly loads every supported source version through the default latest normalizer", () => {
    const v1 = popupFixture();
    const adaptation = {
      mode: "maximized-focus" as const,
      focus: { left: 450, right: 450, top: 800, bottom: 800 },
    };
    const withAlpha = (tier: any) => ({
      ...tier,
      layers: tier.layers.map((layer: any) => ({ ...layer, alpha: 1 })),
    });
    const v2 = {
      ...v1,
      version: 2 as const,
      name: "Popup",
      adaptation,
      backdrop: { enabled: false, color: "#000000", alpha: 0.5 },
      awardCelebration: {
        base: withAlpha(v1.awardCelebration.base),
        standard: withAlpha(v1.awardCelebration.standard),
        celebrationTiers: v1.awardCelebration.celebrationTiers.map(withAlpha),
      },
    };
    const { designViewport: _v2Viewport, ...v3Rest } = v2;
    const v3 = { ...v3Rest, version: 3 as const };
    const attachTier = (tier: any) => ({
      ...tier,
      layers: tier.layers.map((layer: any) => {
        const { parent, ...rest } = layer;
        return {
          ...rest,
          attachment: parent ?? { kind: "popup-root" },
        };
      }),
    });
    const v4 = {
      ...v3,
      version: 4 as const,
      awardCelebration: {
        base: attachTier(v3.awardCelebration.base),
        standard: attachTier(v3.awardCelebration.standard),
        celebrationTiers: v3.awardCelebration.celebrationTiers.map(attachTier),
      },
    };
    const v5 = upgradePopupManifestToV5(parsePopupManifest(v4));
    const v6 = upgradePopupManifestToV6(v5);
    for (const source of [v1, v2, v3, v4, v5, v6]) {
      const loaded = loadPopupManifest(source);
      expect(loaded.sourceVersion).toBe(source.version);
      expect(loaded.manifest.version).toBe(LATEST_POPUP_MANIFEST_VERSION);
      expect(loadPopupManifest(loaded.manifest).manifest).toEqual(
        loaded.manifest,
      );
    }
    expect(() => loadPopupManifest({ ...v6, version: 10 })).toThrow(/version/);
  });

  it("does not invent a Tap info object parent while normalizing legacy Spine popups", () => {
    const hash = "a".repeat(64);
    const legacy = {
      version: 1,
      kind: "popup",
      id: "legacy-spine",
      type: "spine",
      designViewport: { width: 100, height: 100 },
      resources: {
        spine: {
          kind: "spine",
          skeleton: `assets/${hash}.json`,
          atlas: `assets/${hash}.atlas`,
          textures: { "popup.png": `assets/${hash}.png` },
        },
      },
      spine: {
        resource: "spine",
        transform: { x: 0, y: 0, scale: 1 },
        playback: {
          mode: "segmented-animations",
          startAnimation: "Start",
          loopAnimation: "Loop",
          endAnimation: "End",
        },
      },
    } as const;
    const loaded = loadPopupManifest(legacy);
    expect(loaded.manifest.version).toBe(9);
    expect(loaded.manifest.type).toBe("spine");
    if (loaded.manifest.type !== "spine")
      throw new Error("Expected Spine popup.");
    expect(loaded.manifest.spine).not.toHaveProperty("tapInfoObject");
    expect(loadPopupManifest(loaded.manifest).manifest).toEqual(
      loaded.manifest,
    );
  });

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

  it("upgrades legacy award visibility into canonical v6 tier ownership", () => {
    const upgraded = upgradePopupManifestToV6(
      parsePopupManifest(popupFixture()),
    );
    expect(upgraded.version).toBe(6);
    expect(upgraded.backdrop.visibleStates).toEqual(AWARD_POPUP_STATES);
    if (upgraded.type !== "award-celebration")
      throw new Error("Expected award popup.");
    for (const tier of [
      upgraded.awardCelebration.base,
      upgraded.awardCelebration.standard,
      ...upgraded.awardCelebration.celebrationTiers,
    ]) {
      expect(tier.layers).toContainEqual(
        expect.objectContaining({ id: "win-amount", binding: "win-amount" }),
      );
      for (const layer of tier.layers)
        expect(layer).not.toHaveProperty("visibleStates");
    }
    expect(parsePopupManifest(upgraded)).toEqual(upgraded);
  });

  it("splits conflicting legacy ids deterministically during v6 migration", () => {
    const legacy = structuredClone(
      upgradePopupManifestToV5(parsePopupManifest(popupFixture())),
    ) as any;
    legacy.awardCelebration.base.layers.push({
      id: "effect",
      kind: "text",
      name: "heading",
      defaultText: "BASE",
      order: 20,
      alpha: 1,
      attachment: { kind: "popup-root" },
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 64,
        letterSpacing: 0,
        fill: { kind: "solid", color: "#ffffff" },
        arcDegrees: 0,
      },
      visibleStates: [...AWARD_POPUP_STATES],
    });
    legacy.awardCelebration.standard.layers.push({
      ...legacy.awardCelebration.celebrationTiers[0].layers.find(
        ({ kind }: { kind: string }) => kind === "vni",
      ),
      id: "effect",
    });
    const upgraded = upgradePopupManifestToV6(legacy);
    if (upgraded.type !== "award-celebration")
      throw new Error("Expected award popup.");
    expect(
      upgraded.awardCelebration.base.layers.find(
        ({ kind }: { kind: string }) => kind === "text",
      )!.id,
    ).toBe("effect");
    expect(
      upgraded.awardCelebration.standard.layers.find(
        ({ kind }: { kind: string }) => kind === "vni",
      )!.id,
    ).toBe("effect-standard");
  });

  it("reserves the canonical win-amount id during legacy migration", () => {
    const legacy = structuredClone(
      upgradePopupManifestToV5(parsePopupManifest(popupFixture())),
    ) as any;
    legacy.awardCelebration.base.layers.push({
      id: "win-amount",
      kind: "text",
      name: "legacy-heading",
      defaultText: "BASE",
      order: 0,
      alpha: 1,
      attachment: { kind: "popup-root" },
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 64,
        letterSpacing: 0,
        fill: { kind: "solid", color: "#ffffff" },
        arcDegrees: 0,
      },
      visibleStates: [...AWARD_POPUP_STATES],
    });
    const upgraded = upgradePopupManifestToV6(legacy);
    if (upgraded.type !== "award-celebration")
      throw new Error("Expected award popup.");
    expect(
      upgraded.awardCelebration.base.layers.find(
        (layer) =>
          layer.kind === "image-string" && layer.binding === "win-amount",
      )!.id,
    ).toBe("win-amount");
    expect(
      upgraded.awardCelebration.base.layers.find(
        ({ kind }: { kind: string }) => kind === "text",
      )!.id,
    ).toBe("win-amount-base");
    expect(parsePopupManifest(upgraded)).toEqual(upgraded);
  });
});
