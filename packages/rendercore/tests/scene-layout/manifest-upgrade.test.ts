import { describe, expect, it } from "vitest";
import {
  parseSceneLayoutManifestDocument,
  resolveSceneLayoutViewportV7,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout manifest latest upgrade", () => {
  it("upgrades v1 to a canonical v7 center-coordinate document", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    expect(latest.version).toBe(7);
    expect(latest).not.toHaveProperty("adaptation");
    expect(latest).not.toHaveProperty("reels");
    expect(latest.main).toEqual({
      columns: 6,
      rows: 9,
      cellSize: { width: 120, height: 120 },
      gap: { x: 0, y: 0 },
    });
    expect(latest.gameModes.modes).toHaveLength(1);
    expect(latest.gameModes.modes[0]).toMatchObject({
      id: "BaseGame",
      main: {
        enabled: true,
        variants: {
          landscape: { x: 0, y: -123 },
          portrait: { x: 0, y: -123 },
        },
      },
    });
    expect(latest.runtimeAllocation).toMatchObject({
      version: 3,
      package: { nodes: ["bg"] },
      modes: {
        BaseGame: {
          variants: {
            landscape: { activeNodes: ["bg"] },
            portrait: { activeNodes: ["bg"] },
          },
        },
      },
    });
    expect(upgradeSceneLayoutManifestToLatest(latest)).toEqual(latest);
  });

  it("turns legacy per-mode backgrounds into ordinary scoped nodes", () => {
    const legacy = structuredClone(game002LayoutFixture) as any;
    legacy.nodes.push({
      ...structuredClone(legacy.nodes[0]),
      id: "free-bg",
      order: 1,
      resource: {
        ...structuredClone(legacy.nodes[0].resource),
        path: "assets/free-bg.png",
      },
    });
    legacy.reels.main.order = 2;
    legacy.gameModes = {
      initialMode: "BaseGame",
      modes: [
        { id: "BaseGame", backgroundNodes: { default: "bg" }, nodeStates: {} },
        {
          id: "FreeGame",
          backgroundNodes: { default: "free-bg" },
          nodeStates: {},
        },
      ],
      transitions: [],
    };

    const latest = upgradeSceneLayoutManifestToLatest(legacy);
    expect(latest.main.order).toBe(2);
    expect(latest.nodes.find(({ id }) => id === "bg")?.scope).toEqual({
      BaseGame: ["landscape", "portrait"],
    });
    expect(latest.nodes.find(({ id }) => id === "free-bg")?.scope).toEqual({
      FreeGame: ["landscape", "portrait"],
    });
    expect(
      latest.runtimeAllocation.modes.FreeGame?.variants.landscape?.activeNodes,
    ).toEqual(["free-bg"]);
  });

  it("reads legacy mixed mode geometry and exports only v7 main variants", () => {
    const legacy = parseSceneLayoutManifestDocument({
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
      },
    });
    const latest = upgradeSceneLayoutManifestToLatest(legacy);
    expect(latest.gameModes.modes[0]).not.toHaveProperty("adaptation");
    expect(latest.gameModes.modes[0]?.main.enabled).toBe(false);
    expect(latest.gameModes.modes[1]?.main.enabled).toBe(true);
    expect(Object.keys(latest.gameModes.modes[1]!.main.variants)).toEqual([
      "landscape",
      "portrait",
    ]);
  });

  it("retains the active orientation on square input", () => {
    const manifest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    expect(
      resolveSceneLayoutViewportV7({
        manifest,
        viewportSize: { width: 2000, height: 2000 },
      }).variantId,
    ).toBe("landscape");
    expect(
      resolveSceneLayoutViewportV7({
        manifest,
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
