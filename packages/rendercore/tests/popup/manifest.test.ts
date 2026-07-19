import { describe, expect, it } from "vitest";
import {
  collectPopupDirectPaths,
  formatPopupAmount,
  parsePopupManifest,
  requiredPopupAmountCharacters,
} from "../../src/popup/index.js";
import { popupFixture } from "./fixtures.js";

describe("popup manifest", () => {
  it("strictly parses the complete game003-equivalent five-tier contract", () => {
    const manifest = parsePopupManifest(popupFixture());
    expect(
      manifest.awardCelebration.celebrationTiers.map((tier) => [
        tier.id,
        tier.thresholdMultiplier,
      ]),
    ).toEqual([
      ["bigwin", 15],
      ["superwin", 30],
      ["megawin", 50],
    ]);
    expect(
      manifest.awardCelebration.celebrationTiers.map((tier) => tier.layers[0]),
    ).toMatchObject([
      {
        playback: {
          loopStartTime: 1,
          loopEndTime: 2.5,
          keepParticlesAlive: true,
        },
      },
      {
        playback: {
          loopStartTime: 1,
          loopEndTime: 2.5,
          keepParticlesAlive: true,
        },
      },
      {
        playback: {
          loopStartTime: 1,
          loopEndTime: 2.5,
          keepParticlesAlive: true,
        },
      },
    ]);
  });
  it("rejects unknown fields and missing segment amount coverage", () => {
    expect(() =>
      parsePopupManifest({ ...popupFixture(), extra: true }),
    ).toThrow(/unknown key/);
    const value = structuredClone(popupFixture()) as any;
    value.awardCelebration.base.layers[0].visibleSegments = ["start", "loop"];
    expect(() => parsePopupManifest(value)).toThrow(/end segment/);
  });
  it("formats raw integer amounts deterministically", () => {
    expect(formatPopupAmount(123456, popupFixture().amountFormat)).toBe(
      "$1,234.56",
    );
    expect(formatPopupAmount(1, popupFixture().amountFormat)).toBe("$0.01");
    const plain = {
      ...popupFixture().amountFormat,
      fractionDigits: 0,
      useGrouping: false,
    } as const;
    expect(formatPopupAmount(123456, plain)).toBe("$1234");
    expect(requiredPopupAmountCharacters(plain)).not.toContain(",");
    expect(requiredPopupAmountCharacters(plain)).not.toContain(".");
    expect(() => formatPopupAmount(-1, plain)).toThrow(/non-negative/);
  });

  it("parses and collects exact image and official Spine direct resources", () => {
    const value = structuredClone(popupFixture()) as any;
    const digest = (character: string, extension: string) =>
      `assets/${character.repeat(64)}.${extension}`;
    value.resources.badge = {
      kind: "image",
      path: digest("3", "png"),
      size: { width: 120, height: 60 },
    };
    value.resources.frame = {
      kind: "spine",
      skeleton: digest("4", "json"),
      atlas: digest("5", "atlas"),
      textures: { "frame.png": digest("6", "png") },
    };
    value.awardCelebration.base.layers.push(
      {
        id: "badge",
        kind: "image",
        order: 11,
        resource: "badge",
        transform: { x: 0, y: 0, scale: 1 },
        anchor: { x: 0, y: 1 },
        visibleSegments: ["loop"],
      },
      {
        id: "frame",
        kind: "spine",
        order: 12,
        resource: "frame",
        transform: { x: 0, y: 0, scale: 1 },
        playback: {
          mode: "segmented-animations",
          startAnimation: "Start",
          loopAnimation: "Loop",
          endAnimation: "End",
        },
      },
    );
    const manifest = parsePopupManifest(value);
    expect(collectPopupDirectPaths(manifest)).toEqual(
      expect.arrayContaining([
        digest("3", "png"),
        digest("4", "json"),
        digest("5", "atlas"),
        digest("6", "png"),
      ]),
    );
  });

  it.each([
    ["version", (value: any) => (value.version = 2)],
    ["kind", (value: any) => (value.kind = "other")],
    ["type", (value: any) => (value.type = "normal")],
    ["viewport", (value: any) => (value.designViewport.width = 0)],
    ["raw scale", (value: any) => (value.amountFormat.rawScale = 0)],
    ["fraction", (value: any) => (value.amountFormat.fractionDigits = 7)],
    ["grouping", (value: any) => (value.amountFormat.useGrouping = "yes")],
    ["rounding", (value: any) => (value.amountFormat.rounding = "round")],
    ["control", (value: any) => (value.amountFormat.prefix = "\n")],
    ["id", (value: any) => (value.id = "Bad")],
    [
      "tier count",
      (value: any) => value.awardCelebration.celebrationTiers.pop(),
    ],
    [
      "tier order",
      (value: any) =>
        (value.awardCelebration.celebrationTiers[0].id = "superwin"),
    ],
    [
      "threshold",
      (value: any) =>
        (value.awardCelebration.celebrationTiers[1].thresholdMultiplier = 15),
    ],
    [
      "duration",
      (value: any) => (value.awardCelebration.base.countDurationSeconds = -1),
    ],
    [
      "layer order",
      (value: any) =>
        value.awardCelebration.base.layers.push({
          ...value.awardCelebration.base.layers[0],
          id: "other",
        }),
    ],
    [
      "duplicate layer id",
      (value: any) =>
        value.awardCelebration.celebrationTiers[0].layers.push({
          ...value.awardCelebration.celebrationTiers[0].layers[0],
          order: 3,
        }),
    ],
    [
      "negative order",
      (value: any) => (value.awardCelebration.base.layers[0].order = -1),
    ],
    [
      "zero transform scale",
      (value: any) =>
        (value.awardCelebration.base.layers[0].transform.scale = 0),
    ],
    [
      "resource",
      (value: any) =>
        (value.awardCelebration.base.layers[0].resource = "missing"),
    ],
    [
      "anchor",
      (value: any) => (value.awardCelebration.base.layers[0].anchor.x = 2),
    ],
    [
      "binding",
      (value: any) => (value.awardCelebration.base.layers[0].binding = "other"),
    ],
    [
      "empty segment list",
      (value: any) =>
        (value.awardCelebration.base.layers[0].visibleSegments = []),
    ],
    [
      "segment duplicate",
      (value: any) =>
        value.awardCelebration.base.layers[0].visibleSegments.push("start"),
    ],
    [
      "unused",
      (value: any) =>
        (value.resources.unused = {
          kind: "image",
          path: `assets/${"f".repeat(64)}.png`,
          size: { width: 1, height: 1 },
        }),
    ],
    [
      "image-string path",
      (value: any) => (value.resources.amount.manifest = "assets/x.json"),
    ],
    [
      "vni mode",
      (value: any) =>
        (value.awardCelebration.celebrationTiers[0].layers[0].playback.mode =
          "loop"),
    ],
    [
      "vni loop points",
      (value: any) =>
        (value.awardCelebration.celebrationTiers[0].layers[0].playback.loopStartTime = 3),
    ],
  ])("rejects invalid %s contract", (_label, mutate) => {
    const value = structuredClone(popupFixture()) as any;
    mutate(value);
    expect(() => parsePopupManifest(value)).toThrow();
  });
});
