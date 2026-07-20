import { describe, expect, it } from "vitest";
import {
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
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
      "free-popup": {
        type: "award-celebration" as const,
        manifest: "dependencies/popups/free-popup/popup.manifest.json",
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
      landscape: { x: 620, y: 105, scale: 1 },
      portrait: { x: 260, y: 405, scale: 1 },
    });
    expect(
      manifest.nodes.find((node) => node.id === "conveyor1")?.placements,
    ).toEqual({ landscape: { x: 30, y: 40, scale: 1 } });
    expect(
      manifest.nodes.find((node) => node.id === "conveyor2")?.placements,
    ).toEqual({ portrait: { x: 50, y: 60, scale: 1 } });
    expect(
      manifest.nodes.find((node) => node.id === "mega")?.placements,
    ).toEqual({
      landscape: { x: 904, y: 116, scale: 1 },
      portrait: { x: 544, y: 416, scale: 1 },
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
