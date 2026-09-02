import { describe, expect, it } from "vitest";
import {
  collectPopupDirectPaths,
  formatPopupAmount,
  loadPopupManifest,
  parsePopupManifest,
  requiredPopupAmountCharacters,
  validatePopupId,
} from "../../src/popup/index.js";
import { popupFixture, singleStatePopupFixture } from "./fixtures.js";

describe("popup manifest", () => {
  it("strictly parses a zero-or-more-layer single-state popup", () => {
    const parsed = parsePopupManifest(singleStatePopupFixture());
    expect(parsed).toMatchObject({ version: 8, type: "single-state" });
    if (parsed.type !== "single-state")
      throw new Error("Expected single-state popup.");
    expect(parsed.singleState.layers[0]?.id).toBe("heading");
    expect(
      parsePopupManifest({
        ...singleStatePopupFixture(),
        singleState: { layers: [] },
      }),
    ).toMatchObject({ singleState: { layers: [] } });
    expect(() =>
      parsePopupManifest({
        ...singleStatePopupFixture(),
        singleState: {
          layers: [
            {
              ...singleStatePopupFixture().singleState.layers[0],
              attachment: {
                kind: "spine-slot",
                target: { kind: "main-spine" },
                slot: "root",
              },
            },
          ],
        },
      }),
    ).toThrow(/main-spine/);
  });

  it("requires strict v9 width ranges and upgrades v8 text to disabled fitting", () => {
    const legacy = singleStatePopupFixture();
    const loaded = loadPopupManifest(legacy);
    expect(loaded.sourceVersion).toBe(8);
    expect(loaded.manifest.version).toBe(9);
    if (loaded.manifest.type !== "single-state")
      throw new Error("Expected single-state popup.");
    const upgraded = loaded.manifest.singleState.layers[0];
    expect(upgraded?.kind).toBe("text");
    if (upgraded?.kind !== "text") throw new Error("Expected text layer.");
    expect(upgraded.style.widthRange).toEqual({ minWidth: 0, maxWidth: 0 });

    const current = structuredClone(legacy) as any;
    current.version = 9;
    current.singleState.layers[0].style.widthRange = {
      minWidth: 240,
      maxWidth: 640,
    };
    expect(parsePopupManifest(current)).toMatchObject({ version: 9 });

    delete current.singleState.layers[0].style.widthRange;
    expect(() => parsePopupManifest(current)).toThrow(/widthRange/);
    current.singleState.layers[0].style.widthRange = {
      minWidth: 0,
      maxWidth: 640,
    };
    expect(() => parsePopupManifest(current)).toThrow(/0\/0/);
    current.singleState.layers[0].style.widthRange = {
      minWidth: 640,
      maxWidth: 240,
    };
    expect(() => parsePopupManifest(current)).toThrow(/must not exceed/);

    const award = structuredClone(
      loadPopupManifest(popupFixture()).manifest,
    ) as any;
    award.resources["title.woff2"] = {
      kind: "font",
      path: "title.woff2",
    };
    award.awardCelebration.base.layers.push({
      id: "heading",
      kind: "text",
      name: "heading",
      defaultText: "CONGRATS",
      order: 20,
      alpha: 1,
      resource: "title.woff2",
      attachment: { kind: "popup-root" },
      transform: { x: 0, y: -100, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 72,
        letterSpacing: 0,
        fill: { kind: "solid", color: "#ffffff" },
        arcDegrees: 20,
        widthRange: { minWidth: 240, maxWidth: 640 },
      },
    });
    expect(parsePopupManifest(award)).toMatchObject({ version: 9 });
    delete award.awardCelebration.base.layers.at(-1).style.widthRange;
    expect(() => parsePopupManifest(award)).toThrow(/widthRange/);
  });
  it("exposes the exact popup id contract for authoring validation", () => {
    expect(validatePopupId("free-game", "project id")).toBe("free-game");
    for (const value of ["", "Free-game", "free_game", "free--game", "-free"])
      expect(() => validatePopupId(value, "project id")).toThrow(
        /lowercase kebab-case/,
      );
  });

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

  it("parses v2 focus, backdrop, alpha, and system-font text", () => {
    const hash = (value: string) => `assets/${value.repeat(64)}`;
    const manifest = parsePopupManifest({
      version: 2,
      kind: "popup",
      id: "free-game-v2",
      name: "Free Game V2",
      type: "spine",
      designViewport: { width: 1080, height: 1920 },
      adaptation: {
        mode: "maximized-focus",
        focus: { left: 320, right: 320, top: 480, bottom: 480 },
      },
      backdrop: { enabled: true, color: "#000000", alpha: 0.5 },
      resources: {
        effect: {
          kind: "spine",
          skeleton: `${hash("a")}.json`,
          atlas: `${hash("b")}.atlas`,
          textures: { "effect.png": `${hash("c")}.png` },
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
        overlays: [
          {
            id: "heading",
            kind: "text",
            name: "heading",
            defaultText: "FREE GAME",
            order: 1,
            alpha: 0.75,
            transform: { x: 0, y: -200, scale: 1, rotation: 0 },
            anchor: { x: 0.5, y: 0.5 },
            style: {
              fontSize: 72,
              letterSpacing: 0,
              fill: { kind: "solid", color: "#ffffff" },
              arcDegrees: 0,
            },
            visibleSegments: ["start", "loop", "end"],
          },
        ],
      },
    });
    expect(manifest.version).toBe(2);
    if (manifest.version !== 2 || manifest.type !== "spine")
      throw new Error("Expected v2 spine popup.");
    expect(manifest.adaptation.focus.left).toBe(320);
    expect(manifest.spine.overlays?.[0]).toMatchObject({ alpha: 0.75 });
    expect(manifest.spine.overlays?.[0]).not.toHaveProperty("resource");
  });

  it("parses v3 focus without a finite design viewport", () => {
    const value = v2SpineManifestFixture();
    value.version = 3;
    delete value.designViewport;
    value.adaptation.focus = {
      left: 3200,
      right: 6400,
      top: 4800,
      bottom: 9600,
    };
    const manifest = parsePopupManifest(value);
    expect(manifest.version).toBe(3);
    expect(manifest).not.toHaveProperty("designViewport");
    if (manifest.version !== 3) throw new Error("Expected v3 popup.");
    expect(manifest.adaptation.focus.right).toBe(6400);

    value.designViewport = { width: 1080, height: 1920 };
    expect(() => parsePopupManifest(value)).toThrow(/designViewport/);
    delete value.designViewport;
    value.spine.prompt = {
      defaultText: "legacy",
      fill: "#ffffff",
      order: 10,
      area: { x: 0, y: 0, width: 100, height: 20 },
    };
    expect(() => parsePopupManifest(value)).toThrow(/not supported.*v3/);
  });

  it("parses v4 Spine slot attachments and rejects invalid graphs", () => {
    const value = v2SpineManifestFixture();
    value.version = 4;
    delete value.designViewport;
    value.resources.shade = {
      kind: "image",
      path: `assets/${"d".repeat(64)}.png`,
      size: { width: 100, height: 50 },
    };
    value.spine.overlays = [
      {
        id: "nested",
        kind: "spine",
        order: 1,
        alpha: 1,
        resource: "effect",
        attachment: {
          kind: "spine-slot",
          target: { kind: "main-spine" },
          slot: "Fx",
        },
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        playback: {
          mode: "segmented-animations",
          startAnimation: "start",
          loopAnimation: "loop",
          endAnimation: "end",
        },
      },
      {
        id: "shade",
        kind: "image",
        order: 1,
        alpha: 1,
        resource: "shade",
        attachment: {
          kind: "spine-slot",
          target: { kind: "layer", layerId: "nested" },
          slot: "Value",
        },
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        anchor: { x: 0.5, y: 0.5 },
        visibleSegments: ["start", "loop", "end"],
      },
    ];
    const manifest = parsePopupManifest(value);
    expect(manifest.version).toBe(4);
    if (manifest.version !== 4 || manifest.type !== "spine")
      throw new Error("Expected v4 Spine popup.");
    expect(manifest.spine.overlays?.[1]?.attachment).toEqual({
      kind: "spine-slot",
      target: { kind: "layer", layerId: "nested" },
      slot: "Value",
    });

    const missing = structuredClone(value);
    delete missing.spine.overlays[1].attachment;
    expect(() => parsePopupManifest(missing)).toThrow(/attachment/);

    const self = structuredClone(value);
    self.spine.overlays[0].attachment = {
      kind: "spine-slot",
      target: { kind: "layer", layerId: "nested" },
      slot: "Fx",
    };
    expect(() => parsePopupManifest(self)).toThrow(/nested -> nested/);

    const cycle = structuredClone(value);
    cycle.spine.overlays[0].attachment = {
      kind: "spine-slot",
      target: { kind: "layer", layerId: "second" },
      slot: "Fx",
    };
    cycle.spine.overlays.push({
      ...cycle.spine.overlays[0],
      id: "second",
      attachment: {
        kind: "spine-slot",
        target: { kind: "layer", layerId: "nested" },
        slot: "Fx",
      },
    });
    expect(() => parsePopupManifest(cycle)).toThrow(
      /nested -> second -> nested/,
    );

    const duplicate = structuredClone(value);
    duplicate.spine.overlays.push({
      ...duplicate.spine.overlays[1],
      id: "shade-two",
    });
    expect(() => parsePopupManifest(duplicate)).toThrow(/order 1/);
  });

  it("parses v4 image attachments to exact VNI text layers", () => {
    const value = v2SpineManifestFixture();
    value.version = 4;
    delete value.designViewport;
    value.resources.vni = {
      kind: "vni",
      project: `assets/${"d".repeat(64)}.json`,
    };
    value.resources.image = {
      kind: "image",
      path: `assets/${"e".repeat(64)}.png`,
      size: { width: 100, height: 50 },
    };
    value.spine.overlays = [
      {
        id: "vni-host",
        kind: "vni",
        order: 0,
        alpha: 1,
        resource: "vni",
        attachment: { kind: "popup-root" },
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        playback: { mode: "once" },
      },
      {
        id: "image-child",
        kind: "image",
        order: 1,
        alpha: 1,
        resource: "image",
        attachment: {
          kind: "vni-text-layer",
          vniLayerId: "vni-host",
          textLayerId: "content",
        },
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        anchor: { x: 0.5, y: 0.5 },
        visibleSegments: ["start", "loop", "end"],
      },
    ];

    const manifest = parsePopupManifest(value);
    if (manifest.type !== "spine") throw new Error("Expected Spine popup.");
    expect(manifest.spine.overlays?.[1]?.attachment).toEqual({
      kind: "vni-text-layer",
      vniLayerId: "vni-host",
      textLayerId: "content",
    });

    value.spine.overlays[0].attachment = {
      kind: "vni-text-layer",
      vniLayerId: "vni-host",
      textLayerId: "content",
    };
    expect(() => parsePopupManifest(value)).toThrow(/vni-host -> vni-host/);
  });

  it.each([
    ["name", (value: any) => delete value.name],
    ["adaptation", (value: any) => delete value.adaptation],
    ["backdrop", (value: any) => delete value.backdrop],
    ["adaptation mode", (value: any) => (value.adaptation.mode = "contain")],
    ["empty focus", (value: any) => (value.adaptation.focus.left = 0)],
    ["outside focus", (value: any) => (value.adaptation.focus.right = 600)],
    ["backdrop enabled", (value: any) => (value.backdrop.enabled = "yes")],
    ["backdrop color", (value: any) => (value.backdrop.color = "black")],
    ["backdrop alpha", (value: any) => (value.backdrop.alpha = 2)],
  ])("rejects invalid v2 %s", (_label, mutate) => {
    const value = v2SpineManifestFixture();
    mutate(value);
    expect(() => parsePopupManifest(value)).toThrow();
  });

  it("requires v2 layer alpha within the unit interval", () => {
    const value = v2SpineManifestFixture();
    value.resources.shade = {
      kind: "image",
      path: `assets/${"d".repeat(64)}.png`,
      size: { width: 100, height: 100 },
    };
    value.spine.overlays = [
      {
        id: "shade",
        kind: "image",
        order: 1,
        resource: "shade",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        anchor: { x: 0.5, y: 0.5 },
        visibleSegments: ["start", "loop", "end"],
      },
    ];
    expect(() => parsePopupManifest(value)).toThrow(/alpha/);
    value.spine.overlays[0]!.alpha = 1.1;
    expect(() => parsePopupManifest(value)).toThrow(/alpha/);
    value.spine.overlays[0]!.alpha = 0;
    expect(parsePopupManifest(value).version).toBe(2);
  });

  it.each([
    ["unsupported version", (v: any) => (v.version = 10)],
    [
      "resource root mismatch",
      (v: any) => (v.resources["bad.png"] = v.resources.effect),
    ],
    [
      "non-spine root",
      (v: any) =>
        (v.resources.effect = {
          kind: "image",
          path: `assets/${"a".repeat(64)}.png`,
          size: { width: 1, height: 1 },
        }),
    ],
    ["spine playback mode", (v: any) => (v.spine.playback.mode = "once")],
    ["empty animation", (v: any) => (v.spine.playback.startAnimation = "")],
    [
      "duplicate animation",
      (v: any) => (v.spine.playback.endAnimation = "loop"),
    ],
    ["empty textures", (v: any) => (v.resources.effect.textures = {})],
    [
      "invalid atlas page",
      (v: any) =>
        (v.resources.effect.textures = {
          "a/b.png": `assets/${"c".repeat(64)}.png`,
        }),
    ],
    ["non-string owned path", (v: any) => (v.resources.effect.skeleton = 1)],
    ["overlays object", (v: any) => (v.spine.overlays = {})],
    ["font overlay kind", (v: any) => (v.spine.overlays = [{ kind: "font" }])],
    [
      "empty segments",
      (v: any) => addV2TextOverlay(v, { visibleSegments: [] }),
    ],
    [
      "invalid segment",
      (v: any) => addV2TextOverlay(v, { visibleSegments: ["middle"] }),
    ],
    [
      "invalid fill kind",
      (v: any) =>
        addV2TextOverlay(v, {
          style: { ...v2TextStyle(), fill: { kind: "rainbow" } },
        }),
    ],
    [
      "short gradient",
      (v: any) =>
        addV2TextOverlay(v, {
          style: {
            ...v2TextStyle(),
            fill: {
              kind: "linear-gradient",
              angleDegrees: 0,
              stops: [{ offset: 0, color: "#ffffff" }],
            },
          },
        }),
    ],
    [
      "gradient endpoints",
      (v: any) =>
        addV2TextOverlay(v, {
          style: {
            ...v2TextStyle(),
            fill: {
              kind: "linear-gradient",
              angleDegrees: 0,
              stops: [
                { offset: 0.1, color: "#ffffff" },
                { offset: 1, color: "#000000" },
              ],
            },
          },
        }),
    ],
    [
      "gradient ordering",
      (v: any) =>
        addV2TextOverlay(v, {
          style: {
            ...v2TextStyle(),
            fill: {
              kind: "linear-gradient",
              angleDegrees: 0,
              stops: [
                { offset: 0, color: "#ffffff" },
                { offset: 0.5, color: "#888888" },
                { offset: 0.5, color: "#000000" },
                { offset: 1, color: "#000000" },
              ],
            },
          },
        }),
    ],
    [
      "arc range",
      (v: any) =>
        addV2TextOverlay(v, { style: { ...v2TextStyle(), arcDegrees: 181 } }),
    ],
    ["multiline project name", (v: any) => (v.name = "Bad\nName")],
    [
      "reserved prompt name",
      (v: any) => {
        v.spine.prompt = {
          defaultText: "Continue",
          fill: "#ffffff",
          order: 2,
          area: { x: 0, y: 0, width: 100, height: 20 },
        };
        addV2TextOverlay(v, { name: "prompt", order: 1 });
      },
    ],
    [
      "unused resource",
      (v: any) =>
        (v.resources.unused = {
          kind: "image",
          path: `assets/${"d".repeat(64)}.png`,
          size: { width: 1, height: 1 },
        }),
    ],
    [
      "unsupported font",
      (v: any) =>
        (v.resources.font = {
          kind: "font",
          path: `assets/${"d".repeat(64)}.png`,
        }),
    ],
    [
      "missing image resource",
      (v: any) =>
        (v.spine.overlays = [
          {
            id: "image",
            kind: "image",
            order: 1,
            alpha: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            anchor: { x: 0.5, y: 0.5 },
            visibleSegments: ["start"],
          },
        ]),
    ],
    ["invalid layer id", (v: any) => addV2TextOverlay(v, { id: "Bad_Id" })],
    [
      "non-NFC default text",
      (v: any) => addV2TextOverlay(v, { defaultText: "e\u0301" }),
    ],
    [
      "multiline default text",
      (v: any) => addV2TextOverlay(v, { defaultText: "a\nb" }),
    ],
    ["non-object adaptation", (v: any) => (v.adaptation = [])],
  ])("rejects additional strict %s contracts", (_label, mutate) => {
    const value = v2SpineManifestFixture();
    mutate(value);
    expect(() => parsePopupManifest(value)).toThrow();
  });

  it("rejects v1 system text without an explicit font resource", () => {
    const value = v2SpineManifestFixture();
    value.version = 1;
    delete value.name;
    delete value.adaptation;
    delete value.backdrop;
    addV2TextOverlay(value);
    delete value.spine.overlays[0].alpha;
    expect(() => parsePopupManifest(value)).toThrow(/resource is required/);
  });

  it("rejects tier unknown keys, empty layers, and duplicate string names", () => {
    const unknown = structuredClone(popupFixture()) as any;
    unknown.awardCelebration.base.extra = true;
    expect(() => parsePopupManifest(unknown)).toThrow(/unknown key/);
    const empty = structuredClone(popupFixture()) as any;
    empty.awardCelebration.base.layers = [];
    expect(() => parsePopupManifest(empty)).toThrow(/non-empty/);
    const duplicate = structuredClone(popupFixture()) as any;
    duplicate.awardCelebration.base.layers.push({
      ...duplicate.awardCelebration.base.layers[0],
      id: "manual-amount",
      order: 11,
      name: "win-amount",
      binding: "manual",
      defaultText: "0",
      visibleSegments: ["start"],
    });
    expect(() => parsePopupManifest(duplicate)).toThrow(/names must be unique/);
  });

  it("parses v2 ImgNumber and VNI overlays and rejects award name kind conflicts", () => {
    const value = v2SpineManifestFixture();
    value.resources.amount = {
      kind: "image-string",
      manifest: "image-string.manifest.json",
    };
    value.resources["effect-vni"] = {
      kind: "vni",
      project: `assets/${"d".repeat(64)}.json`,
    };
    value.spine.overlays = [
      {
        id: "manual-amount",
        kind: "image-string",
        name: "manual-amount",
        binding: "manual",
        defaultText: "100",
        order: 1,
        alpha: 1,
        resource: "amount",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        anchor: { x: 0.5, y: 0.5 },
        parent: { kind: "popup-root" },
        visibleSegments: ["start"],
      },
      {
        id: "vni",
        kind: "vni",
        order: 2,
        alpha: 1,
        resource: "effect-vni",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        playback: { mode: "once" },
      },
    ];
    expect(parsePopupManifest(value).type).toBe("spine");

    value.spine.overlays[0].binding = "win-amount";
    value.spine.overlays[0].name = "win-amount";
    delete value.spine.overlays[0].defaultText;
    delete value.spine.overlays[0].visibleSegments;
    expect(() => parsePopupManifest(value)).toThrow(/binding must be manual/);

    const conflict = structuredClone(popupFixture()) as any;
    conflict.resources.font = {
      kind: "font",
      path: `assets/${"f".repeat(64)}.woff2`,
    };
    conflict.awardCelebration.base.layers.push({
      id: "amount-text",
      kind: "text",
      name: "win-amount",
      defaultText: "WIN",
      order: 11,
      resource: "font",
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      style: v2TextStyle(),
      visibleSegments: ["start"],
    });
    expect(() => parsePopupManifest(conflict)).toThrow(/same kind/);
  });

  it("rejects layer animation modes, win-amount names, and owned extensions", () => {
    const layerAnimation = v2SpineManifestFixture();
    layerAnimation.spine.overlays = [
      {
        id: "nested-spine",
        kind: "spine",
        order: 1,
        alpha: 1,
        resource: "effect",
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
        playback: {
          mode: "once",
          startAnimation: "start",
          loopAnimation: "loop",
          endAnimation: "end",
        },
      },
    ];
    expect(() => parsePopupManifest(layerAnimation)).toThrow(/mode invalid/);
    const name = structuredClone(popupFixture()) as any;
    name.awardCelebration.base.layers[0].name = "wrong";
    expect(() => parsePopupManifest(name)).toThrow(/name must be win-amount/);
    const extension = v2SpineManifestFixture();
    extension.resources.bad = {
      kind: "vni",
      project: `assets/${"d".repeat(64)}.png`,
    };
    expect(() => parsePopupManifest(extension)).toThrow(/content-addressed/);
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

    const systemFont = structuredClone(manifest) as any;
    delete systemFont.spine.prompt.font;
    delete systemFont.resources.prompt;
    const parsedSystemFont = parsePopupManifest(systemFont);
    if (parsedSystemFont.type !== "spine")
      throw new Error("expected spine popup");
    expect(parsedSystemFont.spine.prompt).not.toHaveProperty("font");
    expect(collectPopupDirectPaths(parsedSystemFont)).not.toContain(
      `${hash("d")}.woff2`,
    );
    systemFont.spine.prompt.font = null;
    expect(() => parsePopupManifest(systemFont)).toThrow(/spine\.prompt\.font/);
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
  it("parses styled system text and additional manual ImgNumber nodes", () => {
    const value = structuredClone(popupFixture()) as any;
    value.resources.heading = {
      kind: "font",
      path: `assets/${"f".repeat(64)}.woff2`,
    };
    value.awardCelebration.base.layers.push(
      {
        id: "heading-base",
        kind: "text",
        name: "congratulations",
        order: 11,
        resource: "heading",
        defaultText: "CONGRATULATIONS!",
        transform: { x: 0, y: -100, scale: 1, rotation: -5 },
        anchor: { x: 0.5, y: 0.5 },
        style: {
          fontSize: 72,
          letterSpacing: 1,
          fill: {
            kind: "linear-gradient",
            angleDegrees: 90,
            stops: [
              { offset: 0, color: "#ffffff" },
              { offset: 1, color: "#ffd84d" },
            ],
          },
          stroke: { color: "#a40000", width: 6 },
          shadow: {
            color: "#000000",
            alpha: 0.6,
            blur: 4,
            distance: 6,
            angleDegrees: 90,
          },
          arcDegrees: 30,
        },
        visibleSegments: ["start", "loop"],
      },
      {
        id: "bonus-count",
        kind: "image-string",
        name: "bonus-count",
        binding: "manual",
        defaultText: "10",
        order: 12,
        resource: "amount",
        transform: { x: 0, y: 200, scale: 1 },
        anchor: { x: 0.5, y: 0.5 },
        parent: { kind: "popup-root" },
        visibleSegments: ["loop"],
      },
    );
    const manifest = parsePopupManifest(value);
    expect(manifest.type).toBe("award-celebration");
    if (manifest.type !== "award-celebration")
      throw new Error("Expected award celebration popup.");
    expect(manifest.awardCelebration.base.layers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "text",
          name: "congratulations",
          style: expect.objectContaining({ arcDegrees: 30 }),
        }),
        expect.objectContaining({
          kind: "image-string",
          name: "bonus-count",
          binding: "manual",
        }),
      ]),
    );
    expect(manifest.awardCelebration.base.layers[0]).toMatchObject({
      name: "win-amount",
    });
    value.awardCelebration.base.layers[1].style.fill.stops[1].offset = 0;
    expect(() => parsePopupManifest(value)).toThrow(/start at 0 and end at 1/);
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

function v2SpineManifestFixture(): any {
  return {
    version: 2,
    kind: "popup",
    id: "strict-v2",
    name: "Strict V2",
    type: "spine",
    designViewport: { width: 1000, height: 1000 },
    adaptation: {
      mode: "maximized-focus",
      focus: { left: 100, right: 100, top: 100, bottom: 100 },
    },
    backdrop: { enabled: true, color: "#000000", alpha: 0.5 },
    resources: {
      effect: {
        kind: "spine",
        skeleton: `assets/${"a".repeat(64)}.json`,
        atlas: `assets/${"b".repeat(64)}.atlas`,
        textures: { "effect.png": `assets/${"c".repeat(64)}.png` },
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
  };
}

function v2TextStyle(): any {
  return {
    fontSize: 48,
    letterSpacing: 0,
    fill: { kind: "solid", color: "#ffffff" },
    arcDegrees: 0,
  };
}

function addV2TextOverlay(value: any, overrides: any = {}): void {
  value.spine.overlays = [
    {
      id: "heading",
      kind: "text",
      name: "heading",
      defaultText: "HEADING",
      order: 1,
      alpha: 1,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      style: v2TextStyle(),
      visibleSegments: ["start", "loop", "end"],
      ...overrides,
    },
  ];
}
