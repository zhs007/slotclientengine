import { describe, expect, it } from "vitest";
import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifest,
  resolveSceneLayoutReelGrid,
  resolveSceneLayoutViewport,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture, game003LayoutFixture } from "./fixtures.js";

describe("scene layout manifest", () => {
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
    ).toThrow(/lowercase scene layout asset path/);
  });

  it("allows complete resource signature reuse but rejects partial path sharing", () => {
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
    expect(() =>
      parseSceneLayoutManifest({
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
      }),
    ).toThrow(/distinct resource signatures/);
  });
});
