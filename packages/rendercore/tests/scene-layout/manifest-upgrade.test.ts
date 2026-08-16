import { describe, expect, it } from "vitest";
import {
  materializeSceneLayoutManifestForMode,
  parseSceneLayoutManifestDocument,
  resolveSceneLayoutViewport,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout manifest latest upgrade", () => {
  it("upgrades v1 without inventing Splash and copies root geometry to each mode", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    expect(latest.version).toBe(3);
    expect(latest.gameModes.initialMode).toBe("BaseGame");
    expect(latest.gameModes.modes.map((mode) => mode.id)).toEqual(["BaseGame"]);
    expect(latest.gameModes.modes[0]).toMatchObject({
      adaptation: {
        mode: "maximized-focus",
        artSize: { width: 2000, height: 2000 },
      },
      reelEnabled: true,
      backgroundNodes: { default: "bg" },
      reelPlacements: { main: { default: { x: 640, y: 337 } } },
    });
    expect(latest.runtimeAllocation).toEqual({
      version: 1,
      package: { nodes: ["bg"], symbolPackages: [], popups: [] },
      onDemand: { transitions: [], runtimeResources: [] },
      modes: {
        BaseGame: {
          variants: { default: { activeNodes: ["bg"] } },
          symbolPackage: null,
          awardCelebrationPopup: null,
        },
      },
    });
    expect(upgradeSceneLayoutManifestToLatest(latest)).toEqual(latest);
  });

  it("accepts mixed per-mode adaptation and materializes either stable geometry", () => {
    const mixed = parseSceneLayoutManifestDocument({
      version: 2,
      kind: "scene-layout",
      id: "mixed",
      nodes: [
        imageNode("splash-land", 0, { landscape: placement() }),
        imageNode("splash-port", 1, { portrait: placement() }),
        imageNode("base", 2, { default: placement() }),
      ],
      reels: {
        main: {
          columns: 1,
          rows: 1,
          cellSize: { width: 10, height: 10 },
          gap: { x: 0, y: 0 },
        },
      },
      gameModes: {
        initialMode: "Splash",
        modes: [
          {
            id: "Splash",
            adaptation: {
              mode: "orientation-focus",
              variants: {
                landscape: orientationVariant(200, 100),
                portrait: orientationVariant(100, 200),
              },
            },
            reelEnabled: false,
            reelPlacements: {},
            backgroundNodes: {
              landscape: "splash-land",
              portrait: "splash-port",
            },
            nodeStates: {},
            primaryAction: {
              kind: "request-game-mode",
              targetMode: "BaseGame",
            },
          },
          {
            id: "BaseGame",
            adaptation: {
              mode: "maximized-focus",
              artSize: { width: 100, height: 100 },
              focusRect: { x: 10, y: 10, width: 80, height: 80 },
            },
            reelEnabled: true,
            reelPlacements: { main: { default: { x: 20, y: 20 } } },
            backgroundNodes: { default: "base" },
            nodeStates: {},
          },
        ],
        transitions: [
          {
            from: "Splash",
            to: "BaseGame",
            overlay: { kind: "none" },
          },
        ],
      },
    });
    expect(mixed.version).toBe(2);
    if (mixed.version !== 2) throw new Error("expected v2");
    expect(mixed.gameModes.modes[0]?.reelEnabled).toBe(false);
    expect(mixed.gameModes.modes[0]?.reelPlacements).toEqual({});
    expect(
      materializeSceneLayoutManifestForMode(mixed, "Splash").adaptation.mode,
    ).toBe("orientation-focus");
    expect(
      materializeSceneLayoutManifestForMode(mixed, "BaseGame").adaptation.mode,
    ).toBe("maximized-focus");
  });

  it("retains the active orientation on square input and defaults the first square to landscape", () => {
    const manifest = upgradeSceneLayoutManifestToLatest({
      ...game002LayoutFixture,
      id: "orientation",
      adaptation: {
        mode: "orientation-focus",
        variants: {
          landscape: {
            artSize: { width: 2000, height: 2000 },
            focusRect: { x: 580, y: 277, width: 840, height: 1200 },
            frameFocusRect: { width: 840, height: 1200 },
            backgroundNode: "bg",
          },
          portrait: {
            artSize: { width: 2000, height: 2000 },
            focusRect: { x: 580, y: 277, width: 840, height: 1200 },
            frameFocusRect: { width: 840, height: 1200 },
            backgroundNode: "bg",
          },
        },
      },
      nodes: [
        {
          ...game002LayoutFixture.nodes[0],
          placements: {
            landscape: placement(),
            portrait: placement(),
          },
        },
      ],
      reels: {
        main: {
          ...game002LayoutFixture.reels.main,
          placements: {
            landscape: { x: 640, y: 337 },
            portrait: { x: 640, y: 337 },
          },
        },
      },
    });
    const effective = materializeSceneLayoutManifestForMode(manifest);
    expect(
      resolveSceneLayoutViewport({
        manifest: effective,
        viewportSize: { width: 2000, height: 2000 },
      }).variantId,
    ).toBe("landscape");
    expect(
      resolveSceneLayoutViewport({
        manifest: effective,
        viewportSize: { width: 2000, height: 2000 },
        previousVariantId: "portrait",
      }).variantId,
    ).toBe("portrait");
  });
});

function placement() {
  return { x: 0, y: 0, scale: 1 };
}

function imageNode(id: string, order: number, placements: object) {
  return {
    id,
    order,
    resource: {
      kind: "image",
      path: `${id}.png`,
      size: { width: 1, height: 1 },
    },
    placements,
  };
}

function orientationVariant(width: number, height: number) {
  return {
    artSize: { width, height },
    focusRect: { x: 10, y: 10, width: width - 20, height: height - 20 },
    frameFocusRect: { width: width - 20, height: height - 20 },
  };
}
