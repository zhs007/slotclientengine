import { describe, expect, it } from "vitest";
import {
  createSceneLayoutRuntimeAllocationV1,
  parseSceneLayoutManifestDocument,
  parseSceneLayoutManifestV5,
  parseSceneLayoutManifestV6,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture, game003LayoutFixture } from "./fixtures.js";

describe("scene layout manifest v6", () => {
  it("deep-copies a legacy maximized ordinary default placement to both orientations", () => {
    const source = structuredClone(game002LayoutFixture) as any;
    source.nodes.push({
      id: "ordinary",
      order: 1,
      resource: {
        kind: "image",
        path: "assets/ordinary.png",
        size: { width: 10, height: 20 },
      },
      placements: {
        default: {
          x: 11,
          y: 22,
          scale: 0.75,
          rotation: 90,
          center: { x: 0.25, y: 0.5 },
        },
      },
    });
    const before = structuredClone(source);

    const latest = upgradeSceneLayoutManifestToLatest(source);
    const ordinary = latest.nodes.find((node) => node.id === "ordinary")!;

    expect(latest.version).toBe(6);
    expect(source).toEqual(before);
    expect(ordinary.placements).toEqual({
      landscape: before.nodes[1].placements.default,
      portrait: before.nodes[1].placements.default,
    });
    expect(ordinary.placements.landscape).not.toBe(
      ordinary.placements.portrait,
    );
    expect(latest.nodes[0]!.placements).toMatchObject({
      default: game002LayoutFixture.nodes[0].placements.default,
    });
    expect(Object.keys(latest.nodes[0]!.placements)).toEqual(["default"]);
    expect(latest.runtimeAllocation).toMatchObject({
      version: 2,
      modes: {
        BaseGame: {
          variants: {
            landscape: { activeNodes: ["bg", "ordinary"] },
            portrait: { activeNodes: ["bg", "ordinary"] },
          },
        },
      },
    });
    expect(upgradeSceneLayoutManifestToLatest(latest)).toEqual(latest);
  });

  it("preserves legacy orientation visibility independently", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game003LayoutFixture);
    const landscape = latest.nodes.find(
      (node) => node.id === "conveyor1",
    )!.placements;
    const portrait = latest.nodes.find(
      (node) => node.id === "conveyor2",
    )!.placements;
    expect(landscape).toMatchObject({
      landscape: { x: 30, y: 40, scale: 1 },
    });
    expect(landscape.portrait).toBeUndefined();
    expect(portrait).toMatchObject({
      portrait: { x: 50, y: 60, scale: 1 },
    });
    expect(portrait.landscape).toBeUndefined();
  });

  it("strictly reads a native v5 document before upgrading its ordinary default", () => {
    const latest = upgradeSceneLayoutManifestToLatest({
      ...game002LayoutFixture,
      nodes: [
        ...game002LayoutFixture.nodes,
        {
          id: "ordinary",
          order: 1,
          resource: {
            kind: "image" as const,
            path: "assets/ordinary.png",
            size: { width: 1, height: 1 },
          },
          placements: { default: { x: 7, y: 8, scale: 1 } },
        },
      ],
    });
    const v5Draft = structuredClone(latest) as any;
    v5Draft.version = 5;
    v5Draft.nodes[1].placements = {
      default: {
        x: 7,
        y: 8,
        scale: 1,
        rotation: 0,
        center: { x: 0.5, y: 0.5 },
      },
    };
    v5Draft.runtimeAllocation = createSceneLayoutRuntimeAllocationV1(v5Draft);

    const v5 = parseSceneLayoutManifestV5(v5Draft);
    const upgraded = upgradeSceneLayoutManifestToLatest(v5);
    expect(upgraded.version).toBe(6);
    expect(upgraded.nodes[1]!.placements).toEqual({
      landscape: v5.nodes[1]!.placements.default,
      portrait: v5.nodes[1]!.placements.default,
    });
  });

  it("rejects native ordinary default/unknown keys and allocation drift", () => {
    const latest = upgradeSceneLayoutManifestToLatest({
      ...game002LayoutFixture,
      nodes: [
        ...game002LayoutFixture.nodes,
        {
          id: "ordinary",
          order: 1,
          resource: {
            kind: "image" as const,
            path: "assets/ordinary.png",
            size: { width: 1, height: 1 },
          },
          placements: { default: { x: 1, y: 2, scale: 1 } },
        },
      ],
    });
    const defaultKey = structuredClone(latest) as any;
    defaultKey.nodes[1].placements = {
      default: structuredClone(defaultKey.nodes[1].placements.landscape),
    };
    expect(() => parseSceneLayoutManifestV6(defaultKey)).toThrow(
      /ordinary node.*default|invalid placement/u,
    );

    const unknownKey = structuredClone(latest) as any;
    unknownKey.nodes[1].placements.square = { x: 0, y: 0, scale: 1 };
    expect(() => parseSceneLayoutManifestV6(unknownKey)).toThrow(
      /unknown key|invalid placement/u,
    );

    const drift = structuredClone(latest) as any;
    drift.runtimeAllocation.modes.BaseGame.variants.portrait.activeNodes = [
      "bg",
    ];
    expect(() => parseSceneLayoutManifestV6(drift)).toThrow(
      /runtimeAllocation/u,
    );
  });

  it("continues to reject future manifest versions", () => {
    expect(() =>
      parseSceneLayoutManifestDocument({
        ...upgradeSceneLayoutManifestToLatest(game002LayoutFixture),
        version: 7,
      }),
    ).toThrow(/version|unknown key/u);
  });
});
