import { describe, expect, it } from "vitest";
import {
  createSceneLayoutAssetGroups,
  parseSceneLayoutAssetGroups,
} from "../src/asset-groups.js";

describe("asset-groups v1 parser", () => {
  it("rejects unknown fields, uncovered assets and wrong deltas", () => {
    const valid = fixture();
    expect(parseSceneLayoutAssetGroups(valid).initialMode).toBe("Alpha");
    expect(() =>
      parseSceneLayoutAssetGroups({ ...valid, extra: true }),
    ).toThrow(/fields/);
    expect(() =>
      parseSceneLayoutAssetGroups({
        ...valid,
        assets: {
          ...valid.assets,
          "orphan.webp": valid.assets["a.webp"],
        },
      }),
    ).toThrow(/未覆盖/);
    expect(() =>
      parseSceneLayoutAssetGroups({
        ...valid,
        groups: valid.groups.map((group) =>
          group.id === "mode:Beta"
            ? { ...group, incrementalAssets: [] }
            : group,
        ),
      }),
    ).toThrow(/required - initial/);
  });

  it("accepts a standalone spine-popup group without mode ownership", () => {
    const valid = fixture();
    const parsed = parseSceneLayoutAssetGroups({
      ...valid,
      initialAssets: ["a.webp", "b.webp"],
      groups: [
        ...valid.groups.map((group) =>
          group.id === "mode:Beta"
            ? { ...group, incrementalAssets: [] }
            : group,
        ),
        {
          id: "spine-popup:free-game",
          kind: "spine-popup",
          popupId: "free-game",
          usedByTransitions: [],
          requiredAssets: ["b.webp"],
          incrementalAssets: [],
        },
      ],
    });
    expect(parsed.groups.at(-1)).toMatchObject({
      kind: "spine-popup",
      popupId: "free-game",
    });
  });

  it("keeps global layer assets shared and assigns scoped layers to one mode", () => {
    const keys = ["base.png", "free.png", "shared.png", "free-only.png"];
    const manifest = {
      version: 1,
      kind: "scene-layout",
      id: "layout",
      nodes: [
        imageNode("base-bg", "base.png"),
        imageNode("free-bg", "free.png"),
        imageNode("shared", "shared.png"),
        { ...imageNode("free-only", "free-only.png"), gameMode: "FreeGame" },
      ],
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          { id: "BaseGame", backgroundNodes: { default: "base-bg" } },
          { id: "FreeGame", backgroundNodes: { default: "free-bg" } },
        ],
        transitions: [],
      },
    } as never;
    const outputAssets = new Map(
      keys.map((key) => [
        key,
        {
          key,
          sourceKey: key,
          bytes: new Uint8Array([1]),
          sourceByteLength: 1,
          converted: false,
          mediaType: "image/png",
        },
      ]),
    );
    const groups = createSceneLayoutAssetGroups({
      manifest,
      files: new Map(),
      sourceZipBytes: 4,
      output: {
        zipBytes: new Uint8Array(),
        assets: outputAssets,
        assetsMap: {
          version: 1,
          files: Object.fromEntries(
            keys.map((key) => [
              key,
              {
                path: key,
                mediaType: "image/png",
                sha256: "a".repeat(64),
                byteLength: 1,
              },
            ]),
          ),
        },
      } as never,
      quality: 80,
      cwebpVersion: "test",
      convertedImageCount: 0,
    });
    expect(
      groups.groups.find((group) => group.id === "shared")?.requiredAssets,
    ).toEqual(["shared.png"]);
    expect(
      groups.groups.find((group) => group.id === "mode:BaseGame")
        ?.requiredAssets,
    ).toEqual(["base.png", "shared.png"]);
    expect(
      groups.groups.find((group) => group.id === "mode:FreeGame")
        ?.requiredAssets,
    ).toEqual(["free-only.png", "free.png", "shared.png"]);
  });
});

function imageNode(id: string, path: string) {
  return {
    id,
    order: 0,
    resource: { kind: "image", path, size: { width: 1, height: 1 } },
    placements: { default: { x: 0, y: 0, scale: 1 } },
  };
}

function fixture() {
  const asset = {
    path: `assets/${"a".repeat(64)}.webp`,
    mediaType: "image/webp",
    sha256: "a".repeat(64),
    byteLength: 12,
    sourceKey: "a.png",
    sourceByteLength: 20,
    converted: true,
  };
  return {
    version: 1,
    kind: "scene-layout-asset-groups",
    layoutId: "layout",
    initialMode: "Alpha",
    optimization: {
      imageCodec: "webp",
      quality: 80,
      cwebpVersion: "1",
      inputZipBytes: 10,
      outputZipBytes: 8,
      convertedImageCount: 1,
    },
    controlFiles: ["assets.map.json", "layout.manifest.json"],
    assets: {
      "a.webp": asset,
      "b.webp": { ...asset, sourceKey: "b.png" },
    },
    initialAssets: ["a.webp"],
    groups: [
      {
        id: "mode:Alpha",
        kind: "mode",
        modeId: "Alpha",
        initial: true,
        requiredAssets: ["a.webp"],
        incrementalAssets: [],
      },
      {
        id: "mode:Beta",
        kind: "mode",
        modeId: "Beta",
        initial: false,
        requiredAssets: ["a.webp", "b.webp"],
        incrementalAssets: ["b.webp"],
      },
      {
        id: "shared",
        kind: "shared",
        requiredAssets: [],
        incrementalAssets: [],
      },
    ],
  };
}
