import { describe, expect, it } from "vitest";
import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifestDocument,
  parseSceneLayoutManifestV3,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout manifest v3", () => {
  it("accepts a canonical allocation and rejects missing or drifting v3 fields", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    expect(parseSceneLayoutManifestDocument(latest)).toEqual(latest);
    const { runtimeAllocation: _allocation, ...missing } = latest;
    expect(() => parseSceneLayoutManifestDocument(missing)).toThrow(
      /runtimeAllocation is required/,
    );
    expect(() =>
      parseSceneLayoutManifestDocument({
        ...latest,
        runtimeAllocation: {
          ...latest.runtimeAllocation,
          package: {
            ...latest.runtimeAllocation.package,
            nodes: [],
          },
        },
      }),
    ).toThrow(/runtimeAllocation\.package\.nodes/);
  });

  it("normalizes both v1 and v2 through the same RenderCore latest path", () => {
    const fromV1 = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    const { runtimeAllocation: _allocation, audio: _audio, ...modern } = fromV1;
    const fromV2 = upgradeSceneLayoutManifestToLatest({
      ...modern,
      version: 2,
    });
    expect(fromV2).toEqual(fromV1);
    expect(Object.isFrozen(fromV1.runtimeAllocation)).toBe(true);
  });

  it("repairs legacy presentation order conflicts but keeps v3 strict", () => {
    const conflictedV1 = structuredClone(game002LayoutFixture) as any;
    conflictedV1.nodes[0].order = 1;
    conflictedV1.nodes.push({
      ...structuredClone(conflictedV1.nodes[0]),
      id: "overlay",
      order: 2,
    });
    conflictedV1.reels.main.order = 2;
    conflictedV1.popups = {
      first: {
        type: "spine",
        manifest: "dependencies/popups/first/popup.manifest.json",
        order: 2000,
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
      second: {
        type: "spine",
        manifest: "dependencies/popups/second/popup.manifest.json",
        order: 2000,
        placements: { default: { x: 0, y: 0, scale: 1 } },
      },
    };
    const parsedV1 = parseSceneLayoutManifestDocument(conflictedV1);
    expect(parsedV1.version).toBe(1);
    expect(parsedV1.nodes.map((node) => node.order)).toEqual([0, 3]);
    const repairedV1 = upgradeSceneLayoutManifestToLatest(conflictedV1);
    expect(repairedV1.nodes.map((node) => node.order)).toEqual([0, 3]);
    expect(repairedV1.reels.main.order).toBe(2);
    expect(
      Object.values(repairedV1.popups ?? {}).map((popup) => popup.order),
    ).toEqual([2000, 2001]);
    expect(
      conflictedV1.nodes.map((node: { order: number }) => node.order),
    ).toEqual([1, 2]);

    const validV3 = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    const { runtimeAllocation: _allocation, audio: _audio, ...v2 } = validV3;
    const conflictedV2 = structuredClone({ ...v2, version: 2 }) as any;
    conflictedV2.reels.main.order = conflictedV2.nodes[0].order;
    const parsedV2 = parseSceneLayoutManifestDocument(conflictedV2);
    expect(parsedV2.version).toBe(2);
    expect(parsedV2.nodes[0].order).toBe(1);
    const repairedV2 = upgradeSceneLayoutManifestToLatest(conflictedV2);
    expect(repairedV2.nodes[0].order).toBe(1);
    expect(repairedV2.reels.main.order).toBe(0);

    const { audio: _latestAudio, ...v3Source } = validV3;
    const conflictedV3 = structuredClone({ ...v3Source, version: 3 }) as any;
    conflictedV3.reels.main.order = conflictedV3.nodes[0].order;
    expect(() => parseSceneLayoutManifestV3(conflictedV3)).toThrow(
      /order.*unique/,
    );
    const repairedV3 = parseSceneLayoutManifestDocument(conflictedV3);
    expect(repairedV3.version).toBe(4);
    expect(repairedV3.nodes[0].order).toBe(1);
    expect(repairedV3.reels.main.order).toBe(0);
    expect(upgradeSceneLayoutManifestToLatest(conflictedV3)).toEqual(
      repairedV3,
    );
  });

  it("parses optional per-mode BGM and global programmatic routes in v4", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    const modeId = latest.gameModes.modes[0]!.id;
    const withAudio = upgradeSceneLayoutManifestToLatest({
      ...latest,
      audio: {
        version: 1,
        effects: [
          {
            name: "click",
            asset: {
              sources: [{ path: "click.mp3", mediaType: "audio/mpeg" }],
            },
            playback: "once",
            offsetSeconds: 0.1,
            voices: { maxConcurrent: 2, overflow: "restart-oldest" },
            bgm: { kind: "keep" },
          },
        ],
        music: [
          {
            name: "base",
            asset: {
              sources: [{ path: "base.ogg", mediaType: "audio/ogg" }],
            },
            loop: true,
            fadeOutSeconds: 0.5,
            fadeInSeconds: 0.75,
          },
        ],
        programmaticEffects: ["click", "award.coin"],
      },
      gameModes: {
        ...latest.gameModes,
        modes: latest.gameModes.modes.map((mode) =>
          mode.id === modeId ? { ...mode, bgm: "base" } : mode,
        ),
      },
    });
    expect(withAudio.version).toBe(4);
    expect(withAudio.gameModes.modes[0]!.bgm).toBe("base");
    expect(collectSceneLayoutAssetPaths(withAudio)).toEqual(
      expect.arrayContaining(["base.ogg", "click.mp3"]),
    );
    expect(() =>
      upgradeSceneLayoutManifestToLatest({
        ...withAudio,
        gameModes: {
          ...withAudio.gameModes,
          modes: withAudio.gameModes.modes.map((mode) => ({
            ...mode,
            bgm: "missing",
          })),
        },
      }),
    ).toThrow(/unknown BGM/);
  });
});
