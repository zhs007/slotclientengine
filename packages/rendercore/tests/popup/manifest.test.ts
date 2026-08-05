import { describe, expect, it } from "vitest";
import {
  collectPopupDirectPaths,
  formatPopupAmount,
  parsePopupManifest,
  requiredPopupAmountCharacters,
} from "../../src/popup/index.js";
import { popupFixture } from "./fixtures.js";

describe("popup manifest", () => {
  it("strictly parses a standalone segmented Spine popup", () => {
    const hash = "a".repeat(64);
    const manifest = parsePopupManifest({
      version: 1,
      kind: "popup",
      id: "free-game",
      type: "spine",
      designViewport: { width: 1080, height: 1920 },
      resources: {
        effect: {
          kind: "spine",
          skeleton: `assets/${hash}.json`,
          atlas: `assets/${hash}.atlas`,
          textures: { "effect.png": `assets/${hash}.png` },
        },
      },
      spine: {
        resource: "effect",
        transform: { x: 0, y: 0, scale: 1 },
        playback: {
          mode: "segmented-animations",
          startAnimation: "start",
          loopAnimation: "loop",
          endAnimation: "end",
        },
      },
    });
    expect(manifest.type).toBe("spine");
    if (manifest.type !== "spine") throw new Error("Expected spine popup.");
    expect(manifest.spine.playback.loopAnimation).toBe("loop");
    expect(() =>
      parsePopupManifest({
        ...manifest,
        spine: {
          ...manifest.spine,
          playback: {
            ...manifest.spine.playback,
            endAnimation: "loop",
          },
        },
      }),
    ).toThrow(/must be unique/);
  });

  it("parses a single-line prompt and ordered image overlay", () => {
    const hash = (value: string) => `assets/${value.repeat(64)}`;
    const manifest = parsePopupManifest({
      version: 1,
      kind: "popup",
      id: "free-game",
      type: "spine",
      designViewport: { width: 1080, height: 1920 },
      resources: {
        effect: {
          kind: "spine",
          skeleton: `${hash("a")}.json`,
          atlas: `${hash("b")}.atlas`,
          textures: { "effect.png": `${hash("c")}.png` },
        },
        prompt: { kind: "font", path: `${hash("d")}.woff2` },
        shade: {
          kind: "image",
          path: `${hash("e")}.png`,
          size: { width: 300, height: 100 },
        },
      },
      spine: {
        resource: "effect",
        transform: { x: 0, y: 0, scale: 1 },
        playback: {
          mode: "segmented-animations",
          startAnimation: "start",
          loopAnimation: "loop",
          endAnimation: "end",
        },
        prompt: {
          font: "prompt",
          defaultText: "Press any key",
          fill: "#fff",
          order: 2,
          area: { x: 0, y: 400, width: 600, height: 80 },
        },
        overlays: [
          {
            id: "shade",
            kind: "image",
            order: 1,
            resource: "shade",
            transform: { x: 0, y: 400, scale: 1, rotation: 5 },
            anchor: { x: 0.5, y: 0.5 },
            visibleSegments: ["start", "loop"],
          },
        ],
      },
    });
    expect(manifest.type).toBe("spine");
    if (manifest.type !== "spine") throw new Error("Expected spine popup.");
    expect(manifest.spine.prompt?.defaultText).toBe("Press any key");
    expect(manifest.spine.overlays?.[0]?.transform.rotation).toBe(5);
    expect(collectPopupDirectPaths(manifest)).toContain(`${hash("d")}.woff2`);
    expect(() =>
      parsePopupManifest({
        ...manifest,
        spine: {
          ...manifest.spine,
          prompt: { ...manifest.spine.prompt!, defaultText: "one\ntwo" },
        },
      }),
    ).toThrow(/single line/);
    const expanded = structuredClone(manifest) as any;
    expanded.resources.timeline = {
      kind: "vni",
      project: `${hash("f")}.json`,
    };
    expanded.spine.overlays.push(
      {
        id: "timeline",
        kind: "vni",
        order: 3,
        resource: "timeline",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        playback: { mode: "once" },
      },
      {
        id: "sparkle",
        kind: "spine",
        order: 4,
        resource: "effect",
        transform: { x: 0, y: 0, scale: 1, rotation: -5 },
        playback: {
          mode: "segmented-animations",
          startAnimation: "Start",
          loopAnimation: "Loop",
          endAnimation: "End",
        },
      },
    );
    const parsed = parsePopupManifest(expanded);
    if (parsed.type !== "spine") throw new Error("expected spine popup");
    expect(parsed.spine.overlays).toHaveLength(3);
    expanded.spine.overlays[1].order = 2;
    expect(() => parsePopupManifest(expanded)).toThrow(/order must be unique/);
    expanded.spine.overlays[1].order = 3;
    expanded.spine.prompt.font = "shade";
    expect(() => parsePopupManifest(expanded)).toThrow(/font resource/);
  });

  it("strictly parses the complete game003-equivalent five-tier contract", () => {
    const manifest = parsePopupManifest(popupFixture());
    expect(manifest.awardCelebration.base.layers[0]).toMatchObject({
      parent: { kind: "popup-root" },
    });
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
  it("normalizes legacy ImgNumber root placement and validates exact VNI layer parents", () => {
    const legacy = structuredClone(popupFixture()) as any;
    delete legacy.awardCelebration.base.layers[0].parent;
    expect(
      parsePopupManifest(legacy as ReturnType<typeof popupFixture>)
        .awardCelebration.base.layers[0],
    ).toMatchObject({
      parent: { kind: "popup-root" },
    });
    const attached = structuredClone(popupFixture()) as any;
    attached.awardCelebration.celebrationTiers[0].layers.find(
      (layer: any) => layer.kind === "image-string",
    ).parent = {
      kind: "vni-text-layer",
      vniLayerId: "effect",
      textLayerId: "text-layer",
    };
    expect(
      parsePopupManifest(
        attached as ReturnType<typeof popupFixture>,
      ).awardCelebration.celebrationTiers[0].layers.find(
        (layer) => layer.kind === "image-string",
      ),
    ).toMatchObject({
      parent: {
        kind: "vni-text-layer",
        vniLayerId: "effect",
        textLayerId: "text-layer",
      },
    });
    attached.awardCelebration.celebrationTiers[0].layers.find(
      (layer: any) => layer.kind === "image-string",
    ).parent.vniLayerId = "missing";
    expect(() => parsePopupManifest(attached)).toThrow(/parent\.vniLayerId/);
  });
  it("strictly parses once VNI playback without segmented fields", () => {
    const value = structuredClone(popupFixture()) as any;
    value.awardCelebration.celebrationTiers[0].layers[0].playback = {
      mode: "once",
    };
    expect(
      parsePopupManifest(value as ReturnType<typeof popupFixture>)
        .awardCelebration.celebrationTiers[0]!.layers[0],
    ).toMatchObject({ playback: { mode: "once" } });
    value.awardCelebration.celebrationTiers[0].layers[0].playback.loopEndTime = 2.5;
    expect(() => parsePopupManifest(value)).toThrow(/unknown key/);
  });
  it("rejects unknown fields and requires exactly one always-visible ImgNumber per tier", () => {
    expect(() =>
      parsePopupManifest({ ...popupFixture(), extra: true }),
    ).toThrow(/unknown key/);
    const value = structuredClone(popupFixture()) as any;
    value.awardCelebration.base.layers[0].visibleSegments = ["start", "loop"];
    expect(() => parsePopupManifest(value)).toThrow(/unknown key/);
    const duplicate = structuredClone(popupFixture()) as any;
    duplicate.awardCelebration.base.layers.push({
      ...duplicate.awardCelebration.base.layers[0],
      id: "amount-2",
      order: 11,
    });
    expect(() => parsePopupManifest(duplicate)).toThrow(/恰好包含一个/);
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
