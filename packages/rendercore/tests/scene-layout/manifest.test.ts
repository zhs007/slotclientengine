import { describe, expect, it } from "vitest";
import {
  assertSceneLayoutGeometryCompatible,
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifest,
  resolveSceneLayoutReelGrid,
  resolveSceneLayoutViewport,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture, game003LayoutFixture } from "./fixtures.js";

describe("scene layout manifest", () => {
  const gameModeManifest = () => ({
    ...game002LayoutFixture,
    nodes: [
      {
        ...game002LayoutFixture.nodes[0],
        resource: {
          kind: "spine" as const,
          skeleton: "assets/bg/bg.json",
          atlas: "assets/bg/bg.atlas",
          textures: { "bg.png": "assets/bg/bg.png" },
          stateMachine: {
            initialState: "BG",
            states: { BG: { animation: "BG" }, FG: { animation: "FG" } },
            transitions: [
              { from: "BG", to: "FG", animation: "BG_FG" },
              { from: "FG", to: "BG", animation: "FG_BG" },
            ],
          },
        },
      },
    ],
    popups: {
      "base-popup": {
        type: "award-celebration" as const,
        manifest: "dependencies/popups/base-popup/popup.manifest.json",
        order: 2000,
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
      "free-popup": {
        type: "award-celebration" as const,
        manifest: "dependencies/popups/free-popup/popup.manifest.json",
        order: 2001,
        placements: { default: { x: 10, y: -20, scale: 0.9 } },
      },
    },
    gameModes: {
      initialMode: "BaseGame",
      modes: [
        {
          id: "BaseGame",
          nodeStates: { bg: "BG" },
          awardCelebrationPopup: "base-popup",
        },
        {
          id: "FreeGame",
          nodeStates: { bg: "FG" },
          awardCelebrationPopup: "free-popup",
        },
        {
          id: "BonusGame",
          nodeStates: { bg: "BG" },
          awardCelebrationPopup: "base-popup",
        },
        { id: "NoCelebration", nodeStates: { bg: "BG" } },
      ],
    },
  });

  it("keeps legacy coordinates compatible and strictly parses center coordinates", () => {
    const legacy = parseSceneLayoutManifest(game002LayoutFixture);
    expect(legacy.coordinateOrigin).toBeUndefined();
    expect(legacy.nodes[0].placements.default).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      center: { x: 0.5, y: 0.5 },
    });

    const centered = structuredClone(game002LayoutFixture) as any;
    centered.coordinateOrigin = "center";
    centered.nodes[0].placements.default = { x: -999.5, y: -999.5, scale: 1 };
    centered.reels.main.placements.default = { x: 0, y: -123 };
    const parsed = parseSceneLayoutManifest(centered);
    expect(parsed.coordinateOrigin).toBe("center");

    const invalidOrigin = structuredClone(centered);
    invalidOrigin.coordinateOrigin = "bottom-right";
    expect(() => parseSceneLayoutManifest(invalidOrigin)).toThrow(
      /coordinateOrigin/,
    );
    const unsupportedScale = structuredClone(centered);
    unsupportedScale.reels.main.placements.default.scale = 1;
    expect(() => parseSceneLayoutManifest(unsupportedScale)).toThrow(
      /unknown key/,
    );
  });

  it("strictly parses node rotation without widening other placement schemas", () => {
    const rotated = structuredClone(game002LayoutFixture) as any;
    rotated.nodes[0].placements.default = {
      x: 10,
      y: -20,
      scale: 0.75,
      rotation: -450,
      center: { x: 0, y: 1 },
    };
    expect(
      parseSceneLayoutManifest(rotated).nodes[0].placements.default,
    ).toEqual(rotated.nodes[0].placements.default);

    for (const placement of [
      { x: 0, y: 0, scale: 1, rotation: Number.NaN },
      { x: 0, y: 0, scale: 1, center: { x: 0.5 } },
      { x: 0, y: 0, scale: 1, center: { x: -0.1, y: 0.5 } },
      { x: 0, y: 0, scale: 1, center: { x: 0.5, y: 1.1 } },
    ]) {
      const invalid = structuredClone(game002LayoutFixture) as any;
      invalid.nodes[0].placements.default = placement;
      expect(() => parseSceneLayoutManifest(invalid)).toThrow();
    }

    const popup = gameModeManifest() as any;
    popup.popups["base-popup"].placements.default.rotation = 90;
    expect(() => parseSceneLayoutManifest(popup)).toThrow(/unknown key/);
  });

  it("accepts geometry-only manifest changes and rejects structural changes", () => {
    const moved = structuredClone(game002LayoutFixture) as any;
    moved.coordinateOrigin = "top-left";
    moved.nodes[0].placements.default.x = 12;
    expect(() =>
      assertSceneLayoutGeometryCompatible(game002LayoutFixture, moved),
    ).not.toThrow();

    const structural = structuredClone(game002LayoutFixture) as any;
    structural.nodes[0].resource.path = "assets/replaced.png";
    expect(() =>
      assertSceneLayoutGeometryCompatible(game002LayoutFixture, structural),
    ).toThrow(/immutable structure/);
  });

  it("strictly parses program-owned runtime resources into the asset closure", () => {
    const manifest = {
      ...game002LayoutFixture,
      runtimeResources: {
        "nearwin.fx": {
          kind: "spine" as const,
          skeleton: "assets/symbols/symbols.json",
          atlas: "assets/symbols/symbols.atlas",
          textures: { "symbols.png": "assets/symbols/symbols.png" },
        },
        "help.image": {
          kind: "image" as const,
          path: "assets/help.png",
          size: { width: 20, height: 10 },
        },
        "win.amount": {
          kind: "image-string" as const,
          manifest:
            "dependencies/image-strings/win-amount/image-string.manifest.json",
        },
        "spark.vni": {
          kind: "vni" as const,
          project: "assets/spark/runtime.json",
        },
        "intro.video": {
          kind: "video" as const,
          path: "intro.mp4",
          mimeType: "video/mp4" as const,
        },
      },
    };
    const parsed = parseSceneLayoutManifest(manifest);
    expect(parsed.runtimeResources?.["nearwin.fx"]).toMatchObject({
      kind: "spine",
      atlas: "assets/symbols/symbols.atlas",
    });
    expect(collectSceneLayoutAssetPaths(parsed)).toEqual(
      expect.arrayContaining([
        "assets/help.png",
        "intro.mp4",
        "assets/spark/runtime.json",
        "assets/symbols/symbols.json",
        "assets/symbols/symbols.atlas",
        "assets/symbols/symbols.png",
        "dependencies/image-strings/win-amount/image-string.manifest.json",
      ]),
    );
    expect(Object.isFrozen(parsed.runtimeResources)).toBe(true);

    expect(() =>
      parseSceneLayoutManifest({
        ...manifest,
        runtimeResources: {
          ...manifest.runtimeResources,
          NearWin: manifest.runtimeResources["nearwin.fx"],
        },
      }),
    ).toThrow(/runtimeResources|key/);

    expect(() =>
      parseSceneLayoutManifest({
        ...manifest,
        runtimeResources: {
          broken: { kind: "binary", path: "assets/raw.bin" },
        },
      }),
    ).toThrow(/kind/);
  });

  it("rejects incomplete program resource variants without fallback", () => {
    const invalidResources = [
      {},
      { image: { kind: "image", path: "help.png" } },
      {
        spine: {
          kind: "spine",
          skeleton: "nearwin.json",
          atlas: "nearwin.atlas",
        },
      },
      { amount: { kind: "image-string" } },
      { spark: { kind: "vni" } },
      { intro: { kind: "video", path: "intro.mp4", mimeType: "video/webm" } },
      {
        image: {
          kind: "image",
          path: "help.png",
          size: { width: 1, height: 1 },
          fallback: "other.png",
        },
      },
    ];
    for (const runtimeResources of invalidResources)
      expect(() =>
        parseSceneLayoutManifest({
          ...game002LayoutFixture,
          runtimeResources,
        }),
      ).toThrow();
  });

  it("parses independent VNI and non-looping Spine layers without allowing unstable backgrounds", () => {
    const manifest = structuredClone(game002LayoutFixture) as any;
    manifest.nodes.push(
      {
        id: "vni-fx",
        order: 2,
        resource: {
          kind: "vni",
          project: "assets/fx/runtime.json",
          loop: false,
        },
        placements: { default: { x: 10, y: 20, scale: 0.5 } },
      },
      {
        id: "spine-fx",
        order: 3,
        resource: {
          kind: "spine",
          skeleton: "assets/fx/fx.json",
          atlas: "assets/fx/fx.atlas",
          textures: { "fx.png": "assets/fx/fx.png" },
          defaultAnimation: "Appear",
          loop: false,
        },
        placements: { default: { x: 30, y: 40, scale: 1 } },
      },
    );
    const parsed = parseSceneLayoutManifest(manifest);
    expect(parsed.nodes.at(-2)?.resource).toEqual({
      kind: "vni",
      project: "assets/fx/runtime.json",
      loop: false,
    });
    const spineResource = parsed.nodes.at(-1)?.resource;
    expect(
      spineResource?.kind === "spine" && "loop" in spineResource
        ? spineResource.loop
        : undefined,
    ).toBe(false);
    expect(collectSceneLayoutAssetPaths(parsed)).toContain(
      "assets/fx/runtime.json",
    );

    const unstableBackground = structuredClone(manifest);
    unstableBackground.adaptation.backgroundNode = "spine-fx";
    unstableBackground.nodes[0].order = 4;
    expect(() => parseSceneLayoutManifest(unstableBackground)).toThrow(
      /must loop/,
    );
    const vniBackground = structuredClone(manifest);
    vniBackground.adaptation.backgroundNode = "vni-fx";
    vniBackground.nodes[0].order = 4;
    expect(() => parseSceneLayoutManifest(vniBackground)).toThrow(
      /cannot be vni/,
    );
  });

  it("strictly parses generic game modes and multiple reusable popup bindings", () => {
    const parsed = parseSceneLayoutManifest(gameModeManifest());
    expect(parsed.gameModes?.modes.map((mode) => mode.id)).toEqual([
      "BaseGame",
      "FreeGame",
      "BonusGame",
      "NoCelebration",
    ]);
    expect(Object.keys(parsed.popups ?? {})).toEqual([
      "base-popup",
      "free-popup",
    ]);
    expect(Object.isFrozen(parsed.gameModes?.modes)).toBe(true);
  });

  it("keeps legacy layers global and strictly validates one optional mode scope", () => {
    const scoped = structuredClone(gameModeManifest()) as any;
    scoped.nodes.push({
      ...game002LayoutFixture.nodes[0],
      id: "free-only",
      order: 1,
      gameMode: "FreeGame",
      resource: {
        kind: "image",
        path: "assets/free-only.png",
        size: { width: 1, height: 1 },
      },
    });
    const parsed = parseSceneLayoutManifest(scoped);
    expect(parsed.nodes[0].gameMode).toBeUndefined();
    expect(parsed.nodes[1].gameMode).toBe("FreeGame");

    const statefulScoped = structuredClone(scoped);
    statefulScoped.nodes[1].resource = structuredClone(
      statefulScoped.nodes[0].resource,
    );
    statefulScoped.gameModes.modes[1].nodeStates["free-only"] = "FG";
    expect(() => parseSceneLayoutManifest(statefulScoped)).not.toThrow();
    statefulScoped.gameModes.modes[0].nodeStates["free-only"] = "BG";
    expect(() => parseSceneLayoutManifest(statefulScoped)).toThrow(
      /nodeStates must cover/,
    );

    const unknown = structuredClone(scoped);
    unknown.nodes[1].gameMode = "Missing";
    expect(() => parseSceneLayoutManifest(unknown)).toThrow(/unknown mode/);

    const scopedBackground = structuredClone(scoped);
    scopedBackground.nodes[0].gameMode = "BaseGame";
    expect(() => parseSceneLayoutManifest(scopedBackground)).toThrow(
      /background node.*gameMode/,
    );

    const noModes = structuredClone(scoped);
    delete noModes.gameModes;
    expect(() => parseSceneLayoutManifest(noModes)).toThrow(
      /requires gameModes/,
    );

    const changedScope = structuredClone(scoped);
    changedScope.nodes[1].gameMode = "BonusGame";
    expect(() =>
      assertSceneLayoutGeometryCompatible(scoped, changedScope),
    ).toThrow(/immutable structure/);
  });

  it("parses canonical mode backgrounds and plural symbol bindings strictly", () => {
    const canonical = {
      ...game002LayoutFixture,
      nodes: gameModeManifest().nodes,
      reels: { main: { ...game002LayoutFixture.reels.main, order: 10 } },
      symbolPackages: {
        "base-symbols": {
          manifest: "dependencies/symbols/base-symbols/symbols.package.json",
          reel: "main",
          reelSet: "base",
          renderMode: "grid-cell",
        },
        "free-symbols": {
          manifest: "dependencies/symbols/free-symbols/symbols.package.json",
          reel: "main",
          reelSet: "free",
          renderMode: "standard",
        },
      },
      gameModes: {
        initialMode: "BG",
        modes: [
          {
            id: "BG",
            backgroundNodes: { default: "bg" },
            nodeStates: { bg: "BG" },
            symbolPackage: "base-symbols",
          },
          {
            id: "FG",
            backgroundNodes: { default: "bg" },
            nodeStates: { bg: "FG" },
            symbolPackage: "free-symbols",
          },
        ],
        transitions: [
          {
            from: "BG",
            to: "FG",
            overlay: {
              resource: {
                kind: "spine",
                skeleton: "assets/transition/transition.json",
                atlas: "assets/transition/transition.atlas",
                textures: {
                  "transition.png": "assets/transition/transition.png",
                },
              },
              animation: "BG_FG",
              switchEvent: "SwitchScene",
              placements: { default: { x: 1000, y: 1000, scale: 1 } },
            },
          },
        ],
      },
    };
    const parsed = parseSceneLayoutManifest(canonical);
    expect(parsed.gameModes?.modes[1]).toMatchObject({
      backgroundNodes: { default: "bg" },
      symbolPackage: "free-symbols",
    });
    expect(Object.isFrozen(parsed.symbolPackages)).toBe(true);
    expect(collectSceneLayoutAssetPaths(parsed)).toContain(
      "dependencies/symbols/free-symbols/symbols.package.json",
    );
    expect(collectSceneLayoutAssetPaths(parsed)).toEqual(
      expect.arrayContaining([
        "assets/transition/transition.json",
        "assets/transition/transition.atlas",
        "assets/transition/transition.png",
      ]),
    );

    const both = structuredClone(canonical) as any;
    both.symbolPackage = both.symbolPackages["base-symbols"];
    expect(() => parseSceneLayoutManifest(both)).toThrow(/both/);
    const missingBackground = structuredClone(canonical) as any;
    delete missingBackground.gameModes.modes[1].backgroundNodes;
    expect(() => parseSceneLayoutManifest(missingBackground)).toThrow(
      /backgroundNodes is required/,
    );
    const orphan = structuredClone(canonical) as any;
    delete orphan.gameModes.modes[1].symbolPackage;
    expect(() => parseSceneLayoutManifest(orphan)).toThrow(/orphaned/);
    const badInitial = structuredClone(canonical) as any;
    badInitial.gameModes.modes[0].backgroundNodes.default = "missing";
    expect(() => parseSceneLayoutManifest(badInitial)).toThrow(/unknown node/);
    const noTransition = structuredClone(canonical) as any;
    noTransition.nodes[0].resource.stateMachine.transitions = [];
    expect(() => parseSceneLayoutManifest(noTransition)).not.toThrow();

    const selfTransition = structuredClone(canonical) as any;
    selfTransition.gameModes.transitions[0].to = "BG";
    expect(() => parseSceneLayoutManifest(selfTransition)).toThrow(
      /self transition/,
    );
    const duplicateTransition = structuredClone(canonical) as any;
    duplicateTransition.gameModes.transitions.push(
      structuredClone(duplicateTransition.gameModes.transitions[0]),
    );
    expect(() => parseSceneLayoutManifest(duplicateTransition)).toThrow(
      /unique/,
    );
    const wrongPlacement = structuredClone(canonical) as any;
    wrongPlacement.gameModes.transitions[0].overlay.placements.portrait = {
      x: 0,
      y: 0,
      scale: 1,
    };
    expect(() => parseSceneLayoutManifest(wrongPlacement)).toThrow(
      /unknown key/,
    );
    const unknownOverlayKey = structuredClone(canonical) as any;
    unknownOverlayKey.gameModes.transitions[0].overlay.event = "SwitchScene";
    expect(() => parseSceneLayoutManifest(unknownOverlayKey)).toThrow(
      /unknown key/,
    );
  });

  it("parses a strict video-blackout union and collects its exact MP4", () => {
    const hash = "a".repeat(64);
    const value = gameModeManifest() as any;
    value.gameModes.transitions = [
      {
        from: "BaseGame",
        to: "FreeGame",
        overlay: {
          resource: {
            kind: "video",
            path: `assets/${hash}.mp4`,
            mimeType: "video/mp4",
          },
          fit: "contain",
          fadeOutSeconds: 0.5,
        },
      },
    ];
    const parsed = parseSceneLayoutManifest(value);
    expect(parsed.gameModes?.transitions?.[0]).toMatchObject({
      overlay: { resource: { kind: "video" } },
    });
    expect(collectSceneLayoutAssetPaths(parsed)).toContain(
      `assets/${hash}.mp4`,
    );
    expect(Object.isFrozen(parsed.gameModes?.transitions?.[0].overlay)).toBe(
      true,
    );

    for (const mutate of [
      (draft: any) => (draft.gameModes.transitions[0].overlay.animation = "x"),
      (draft: any) => (draft.gameModes.transitions[0].overlay.fit = "cover"),
      (draft: any) =>
        (draft.gameModes.transitions[0].overlay.resource.mimeType =
          "video/webm"),
      (draft: any) =>
        (draft.gameModes.transitions[0].overlay.resource.path =
          "assets/video.mp4"),
      (draft: any) =>
        (draft.gameModes.transitions[0].overlay.fadeOutSeconds = 0),
    ]) {
      const invalid = structuredClone(value);
      mutate(invalid);
      expect(() => parseSceneLayoutManifest(invalid)).toThrow();
    }
  });

  it("strictly binds an optional Spine popup before a Spine transition", () => {
    const value = gameModeManifest() as any;
    value.popups["free-entry"] = {
      type: "spine",
      manifest: "free-entry-popup.manifest.json",
      order: 2002,
      placements: { default: { x: 0, y: 0, scale: 1 } },
    };
    value.gameModes.transitions = [
      {
        from: "BaseGame",
        to: "FreeGame",
        preludePopup: "free-entry",
        overlay: {
          resource: {
            kind: "spine",
            skeleton: "transition.json",
            atlas: "transition.atlas",
            textures: { "transition.png": "transition.png" },
          },
          animation: "BaseToFree",
          switchEvent: "SwitchScene",
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
      },
    ];
    const parsed = parseSceneLayoutManifest(value);
    expect(parsed.gameModes?.transitions?.[0]).toMatchObject({
      preludePopup: "free-entry",
    });
    expect(collectSceneLayoutAssetPaths(parsed)).toContain(
      "free-entry-popup.manifest.json",
    );

    const unknown = structuredClone(value);
    unknown.gameModes.transitions[0].preludePopup = "missing";
    expect(() => parseSceneLayoutManifest(unknown)).toThrow(/unknown popup/);

    const wrongType = structuredClone(value);
    wrongType.gameModes.transitions[0].preludePopup = "base-popup";
    expect(() => parseSceneLayoutManifest(wrongType)).toThrow(/spine popup/);

    const video = structuredClone(value);
    video.gameModes.transitions[0] = {
      from: "BaseGame",
      to: "FreeGame",
      preludePopup: "free-entry",
      overlay: {
        resource: {
          kind: "video",
          path: `assets/${"a".repeat(64)}.mp4`,
          mimeType: "video/mp4",
        },
        fit: "contain",
        fadeOutSeconds: 0.5,
      },
    };
    expect(
      parseSceneLayoutManifest(video).gameModes?.transitions?.[0],
    ).toMatchObject({
      preludePopup: "free-entry",
      overlay: { resource: { kind: "video" } },
    });
  });

  it("parses an explicit no-effect transition with an optional Spine popup", () => {
    const value = gameModeManifest() as any;
    value.popups["free-entry"] = {
      type: "spine",
      manifest: "free-entry-popup.manifest.json",
      order: 2002,
      placements: { default: { x: 0, y: 0, scale: 1 } },
    };
    value.gameModes.transitions = [
      {
        from: "BaseGame",
        to: "FreeGame",
        preludePopup: "free-entry",
        overlay: { kind: "none" },
      },
    ];
    const parsed = parseSceneLayoutManifest(value);
    expect(parsed.gameModes?.transitions?.[0]).toMatchObject({
      preludePopup: "free-entry",
      overlay: { kind: "none" },
    });
    expect(Object.isFrozen(parsed.gameModes?.transitions?.[0].overlay)).toBe(
      true,
    );
    const invalid = structuredClone(value);
    invalid.gameModes.transitions[0].overlay.resource = { kind: "video" };
    expect(() => parseSceneLayoutManifest(invalid)).toThrow(/unknown key/);
  });

  it("normalizes legacy popup order and rejects presentation order conflicts", () => {
    const legacy = gameModeManifest() as any;
    delete legacy.popups["free-popup"];
    legacy.gameModes.modes[1].awardCelebrationPopup = "base-popup";
    delete legacy.popups["base-popup"].order;
    expect(parseSceneLayoutManifest(legacy).popups?.["base-popup"]?.order).toBe(
      2000,
    );

    const duplicate = gameModeManifest() as any;
    duplicate.popups["free-popup"].order = 2000;
    expect(() => parseSceneLayoutManifest(duplicate)).toThrow(
      /node\/reel\/popup order.*unique/,
    );

    const belowArt = structuredClone(gameModeManifest()) as any;
    belowArt.reels.main.order = 999;
    belowArt.popups["base-popup"].order = 999;
    expect(() => parseSceneLayoutManifest(belowArt)).toThrow(/order.*unique/);
    belowArt.popups["base-popup"].order = 500;
    expect(() => parseSceneLayoutManifest(belowArt)).toThrow(
      /greater than every node\/reel order/,
    );
  });

  it("rejects every invalid game-mode reference and incomplete state mapping", () => {
    type MutableGameModeManifest = {
      gameModes: {
        extra?: unknown;
        initialMode: unknown;
        modes: Array<{
          id: unknown;
          nodeStates?: Record<string, unknown>;
          awardCelebrationPopup?: unknown;
          extra?: unknown;
        }>;
      };
      popups: Record<string, { manifest: string }>;
    };
    const invalid = (
      mutate: (value: MutableGameModeManifest) => void,
      pattern: RegExp,
    ) => {
      const value: MutableGameModeManifest =
        structuredClone(gameModeManifest());
      mutate(value);
      expect(() => parseSceneLayoutManifest(value)).toThrow(pattern);
    };
    invalid((value) => (value.gameModes.extra = true), /unknown key/);
    invalid(
      (value) => (value.gameModes.initialMode = "Missing"),
      /unknown mode/,
    );
    invalid((value) => (value.gameModes.modes = []), /non-empty array/);
    invalid((value) => (value.gameModes.modes[1].id = "BaseGame"), /unique/);
    invalid((value) => (value.gameModes.modes[1].id = "bad id"), /ASCII state/);
    invalid(
      (value) => delete value.gameModes.modes[1].nodeStates,
      /must be an object/,
    );
    invalid(
      (value) => (value.gameModes.modes[1].nodeStates = {}),
      /cover every/,
    );
    invalid(
      (value) =>
        (value.gameModes.modes[1].nodeStates = { bg: "FG", extra: "BG" }),
      /cover every/,
    );
    invalid(
      (value) => (value.gameModes.modes[1].nodeStates!.bg = "Missing"),
      /unknown stable state/,
    );
    invalid(
      (value) => (value.gameModes.modes[0].nodeStates!.bg = "FG"),
      /initialState/,
    );
    invalid(
      (value) => (value.gameModes.modes[1].awardCelebrationPopup = "missing"),
      /unknown popup/,
    );
    invalid((value) => {
      delete value.gameModes.modes[0].awardCelebrationPopup;
      delete value.gameModes.modes[2].awardCelebrationPopup;
    }, /orphaned/);
    invalid(
      (value) =>
        (value.popups["base-popup"]!.manifest =
          "dependencies/popups/other/popup.manifest.json"),
      /must equal binding id/,
    );
    invalid((value) => (value.popups = {}), /must not be empty/);
    invalid((value) => (value.gameModes.modes[0].extra = true), /unknown key/);
  });
  it("keeps the legacy v1 shape unchanged when optional package fields are absent", () => {
    const manifest = parseSceneLayoutManifest(game002LayoutFixture);
    expect(Object.hasOwn(manifest, "symbolPackage")).toBe(false);
    expect(Object.hasOwn(manifest.reels.main, "order")).toBe(false);
  });

  it("rejects null instead of treating it as an omitted symbol binding", () => {
    expect(() =>
      parseSceneLayoutManifest({
        ...game002LayoutFixture,
        symbolPackage: null,
      }),
    ).toThrow(/must be an object/);
  });

  it("parses one viewport-center popup binding and requires every active variant", () => {
    const parsed = parseSceneLayoutManifest({
      ...game003LayoutFixture,
      popups: {
        "game003-win-celebration": {
          type: "award-celebration",
          manifest:
            "dependencies/popups/game003-win-celebration/popup.manifest.json",
          placements: {
            landscape: { x: 10, y: -20, scale: 1 },
            portrait: { x: 0, y: 30, scale: 0.8 },
          },
        },
      },
    });
    expect(
      parsed.popups?.["game003-win-celebration"].placements.portrait,
    ).toEqual({
      x: 0,
      y: 30,
      scale: 0.8,
    });
    expect(collectSceneLayoutAssetPaths(parsed)).toContain(
      "dependencies/popups/game003-win-celebration/popup.manifest.json",
    );
    const invalid = structuredClone(parsed) as any;
    delete invalid.popups["game003-win-celebration"].placements.portrait;
    expect(() => parseSceneLayoutManifest(invalid)).toThrow(
      /portrait.*required/,
    );
  });

  it("parses image-string, stateful Spine and an ordered symbol binding", () => {
    const manifest = parseSceneLayoutManifest({
      ...game002LayoutFixture,
      nodes: [
        {
          id: "bg",
          order: 0,
          resource: {
            kind: "spine",
            skeleton: "assets/bg/bg.json",
            atlas: "assets/bg/bg.atlas",
            textures: { "bg.png": "assets/bg/bg.png" },
            stateMachine: {
              initialState: "BG",
              states: {
                BG: { animation: "BG" },
                FG: { animation: "FG" },
              },
              transitions: [
                { from: "BG", to: "FG", animation: "BG_FG" },
                { from: "FG", to: "BG", animation: "FG_BG" },
              ],
            },
          },
          placements: { default: { x: 0, y: 0, scale: 1 } },
        },
        {
          id: "total-win",
          order: 20,
          resource: {
            kind: "image-string",
            manifest:
              "dependencies/image-strings/usd-amount/image-string.manifest.json",
            text: "$001.25",
            anchor: { x: 0.5, y: 0.5 },
          },
          placements: { default: { x: 1000, y: 1500, scale: 1 } },
        },
      ],
      reels: { main: { ...game002LayoutFixture.reels.main, order: 10 } },
      symbolPackage: {
        manifest: "dependencies/symbols/game002-symbols/symbols.package.json",
        reel: "main",
        reelSet: "bg-reel01",
        renderMode: "grid-cell",
      },
    });
    expect(manifest.nodes[0].resource).toMatchObject({
      kind: "spine",
      stateMachine: { initialState: "BG" },
    });
    expect(manifest.nodes[1].resource).toMatchObject({
      kind: "image-string",
      text: "$001.25",
      anchor: { x: 0.5, y: 0.5 },
    });
    expect(manifest.symbolPackage?.renderMode).toBe("grid-cell");
    expect(Object.isFrozen(manifest.nodes[1].resource)).toBe(true);
  });

  it("rejects invalid image-string, state-machine and symbol binding contracts", () => {
    const imageStringNode = {
      id: "amount",
      order: 1,
      resource: {
        kind: "image-string",
        manifest:
          "dependencies/image-strings/amount/image-string.manifest.json",
        text: "001",
        anchor: { x: 0.5, y: 0.5 },
      },
      placements: { default: { x: 0, y: 0, scale: 1 } },
    };
    const withNode = (node: unknown) => ({
      ...game002LayoutFixture,
      nodes: [game002LayoutFixture.nodes[0], node],
    });
    expect(() =>
      parseSceneLayoutManifest(
        withNode({
          ...imageStringNode,
          resource: {
            ...imageStringNode.resource,
            manifest: "assets/amount.json",
          },
        }),
      ),
    ).toThrow(/dependencies\/image-strings/);
    expect(() =>
      parseSceneLayoutManifest(
        withNode({
          ...imageStringNode,
          resource: {
            ...imageStringNode.resource,
            anchor: { x: 1.1, y: 0.5 },
          },
        }),
      ),
    ).toThrow(/anchor.x/);
    expect(() =>
      parseSceneLayoutManifest({
        ...game002LayoutFixture,
        nodes: [
          {
            id: "bg",
            order: 0,
            resource: {
              kind: "spine",
              skeleton: "assets/bg/bg.json",
              atlas: "assets/bg/bg.atlas",
              textures: { "bg.png": "assets/bg/bg.png" },
              defaultAnimation: "BG",
              loop: true,
              stateMachine: {
                initialState: "BG",
                states: { BG: { animation: "BG" } },
                transitions: [],
              },
            },
            placements: { default: { x: 0, y: 0, scale: 1 } },
          },
        ],
      }),
    ).toThrow(/unknown key|either/);
    const stateful = {
      kind: "spine",
      skeleton: "assets/bg/bg.json",
      atlas: "assets/bg/bg.atlas",
      textures: { "bg.png": "assets/bg/bg.png" },
      stateMachine: {
        initialState: "BG",
        states: {
          BG: { animation: "same" },
          FG: { animation: "same" },
        },
        transitions: [],
      },
    };
    expect(() =>
      parseSceneLayoutManifest({
        ...game002LayoutFixture,
        nodes: [
          {
            ...game002LayoutFixture.nodes[0],
            resource: stateful,
          },
        ],
      }),
    ).toThrow(/animation.*unique/);
    expect(() =>
      parseSceneLayoutManifest({
        ...game002LayoutFixture,
        reels: { main: { ...game002LayoutFixture.reels.main, order: 0 } },
        symbolPackage: {
          manifest: "dependencies/symbols/demo/symbols.package.json",
          reel: "main",
          reelSet: "main",
          renderMode: "standard",
        },
      }),
    ).toThrow(/node\/reel order/);
    expect(() =>
      parseSceneLayoutManifest({
        ...game002LayoutFixture,
        symbolPackage: {
          manifest: "dependencies/symbols/demo/symbols.package.json",
          reel: "main",
          reelSet: "main",
          renderMode: "standard",
        },
      }),
    ).toThrow(/order is required/);
  });

  it("parses, deeply freezes and resolves game002 geometry", () => {
    const manifest = parseSceneLayoutManifest(game002LayoutFixture);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.nodes[0].resource)).toBe(true);
    expect(resolveSceneLayoutReelGrid(manifest, "main")).toMatchObject({
      variantId: "default",
      artRect: { x: 640, y: 337, width: 720, height: 1080 },
      stride: { width: 120, height: 120 },
    });
    expect(manifest.adaptation.mode).toBe("maximized-focus");
    if (manifest.adaptation.mode !== "maximized-focus") {
      throw new Error("game002 fixture adaptation mode drifted");
    }
    const focus = manifest.adaptation.focusRect;
    const reel = resolveSceneLayoutReelGrid(manifest, "main").artRect;
    expect(reel.x).toBeGreaterThanOrEqual(focus.x);
    expect(reel.y).toBeGreaterThanOrEqual(focus.y);
    expect(reel.x + reel.width).toBeLessThanOrEqual(focus.x + focus.width);
    expect(reel.y + reel.height).toBeLessThanOrEqual(focus.y + focus.height);
    expect(collectSceneLayoutAssetPaths(manifest)).toEqual(["assets/bg.png"]);
    for (const viewportSize of [
      { width: 1920, height: 1080 },
      { width: 390, height: 844 },
      { width: 1200, height: 1200 },
      { width: 1430, height: 1464 },
    ]) {
      const snapshot = resolveSceneLayoutViewport({ manifest, viewportSize });
      expect(snapshot.variantId).toBe("default");
      expect(snapshot.reels.main.artRect).toEqual({
        x: 640,
        y: 337,
        width: 720,
        height: 1080,
      });
    }
  });

  it("resolves game003 nonzero gap and square to landscape", () => {
    const manifest = parseSceneLayoutManifest(game003LayoutFixture);
    expect(
      resolveSceneLayoutReelGrid(manifest, "main", "landscape"),
    ).toMatchObject({
      artRect: { x: 400, y: 250, width: 885, height: 650 },
      stride: { width: 180, height: 130 },
    });
    expect(
      resolveSceneLayoutViewport({
        manifest,
        viewportSize: { width: 1424, height: 1125 },
      }).variantId,
    ).toBe("landscape");
    expect(
      resolveSceneLayoutViewport({
        manifest,
        viewportSize: { width: 1174, height: 1200 },
      }).variantId,
    ).toBe("portrait");
    expect(
      manifest.nodes.find((node) => node.id === "majorbk")?.placements,
    ).toEqual({
      landscape: {
        x: 620,
        y: 105,
        scale: 1,
        rotation: 0,
        center: { x: 0.5, y: 0.5 },
      },
      portrait: {
        x: 260,
        y: 405,
        scale: 1,
        rotation: 0,
        center: { x: 0.5, y: 0.5 },
      },
    });
    expect(
      manifest.nodes.find((node) => node.id === "conveyor1")?.placements,
    ).toEqual({
      landscape: {
        x: 30,
        y: 40,
        scale: 1,
        rotation: 0,
        center: { x: 0.5, y: 0.5 },
      },
    });
    expect(
      manifest.nodes.find((node) => node.id === "conveyor2")?.placements,
    ).toEqual({
      portrait: {
        x: 50,
        y: 60,
        scale: 1,
        rotation: 0,
        center: { x: 0.5, y: 0.5 },
      },
    });
    expect(
      manifest.nodes.find((node) => node.id === "mega")?.placements,
    ).toEqual({
      landscape: {
        x: 904,
        y: 116,
        scale: 1,
        rotation: 0,
        center: { x: 0.5, y: 0.5 },
      },
      portrait: {
        x: 544,
        y: 416,
        scale: 1,
        rotation: 0,
        center: { x: 0.5, y: 0.5 },
      },
    });
  });

  it("rejects unknown fields, missing variants, invalid bounds and collisions", () => {
    expect(() =>
      parseSceneLayoutManifest({ ...game002LayoutFixture, extra: true }),
    ).toThrow(/unknown key/);
    expect(() =>
      parseSceneLayoutManifest({
        ...game003LayoutFixture,
        adaptation: {
          ...game003LayoutFixture.adaptation,
          variants: {
            landscape: game003LayoutFixture.adaptation.variants.landscape,
          },
        },
      }),
    ).toThrow(/landscape and portrait/);
    expect(() =>
      parseSceneLayoutManifest({
        ...game002LayoutFixture,
        reels: {
          main: {
            ...game002LayoutFixture.reels.main,
            placements: { default: { x: 1500, y: 337 } },
          },
        },
      }),
    ).toThrow(/fit inside artSize/);
    expect(() =>
      parseSceneLayoutManifest({
        ...game002LayoutFixture,
        adaptation: {
          ...game002LayoutFixture.adaptation,
          focusRect: { x: 700, y: 400, width: 500, height: 500 },
        },
      }),
    ).toThrow(/focusRect must contain reel/);
    expect(() =>
      parseSceneLayoutManifest({
        ...game002LayoutFixture,
        nodes: [
          game002LayoutFixture.nodes[0],
          {
            ...game002LayoutFixture.nodes[0],
            id: "other",
            order: 1,
            resource: {
              ...game002LayoutFixture.nodes[0].resource,
              path: "ASSETS/BG.PNG",
            },
          },
        ],
      }),
    ).toThrow(/alias collision/);
  });

  it("allows exact content path reuse without merging resource semantics", () => {
    const shared = parseSceneLayoutManifest({
      ...game002LayoutFixture,
      nodes: [
        game002LayoutFixture.nodes[0],
        {
          ...game002LayoutFixture.nodes[0],
          id: "overlay",
          order: 1,
        },
      ],
    });
    expect(shared.nodes).toHaveLength(2);
    expect(collectSceneLayoutAssetPaths(shared)).toEqual(["assets/bg.png"]);
    const differentSize = parseSceneLayoutManifest({
      ...game002LayoutFixture,
      nodes: [
        game002LayoutFixture.nodes[0],
        {
          ...game002LayoutFixture.nodes[0],
          id: "overlay",
          order: 1,
          resource: {
            ...game002LayoutFixture.nodes[0].resource,
            size: { width: 1999, height: 2000 },
          },
        },
      ],
    });
    expect(differentSize.nodes[1]?.resource).toMatchObject({
      kind: "image",
      size: { width: 1999, height: 2000 },
    });
  });
});
