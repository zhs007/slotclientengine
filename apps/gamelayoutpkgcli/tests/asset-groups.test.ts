import { describe, expect, it } from "vitest";
import { parseSceneLayoutAssetGroups } from "../src/asset-groups.js";

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
});

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
