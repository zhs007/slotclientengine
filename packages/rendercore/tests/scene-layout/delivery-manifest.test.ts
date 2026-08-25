import { describe, expect, it } from "vitest";
import { parseSceneLayoutDeliveryManifest } from "../../src/scene-layout/data/delivery.js";

const hash = "a".repeat(64);

describe("Scene Layout delivery manifest", () => {
  it("accepts uppercase logical keys while keeping physical paths canonical", () => {
    const parsed = parseSceneLayoutDeliveryManifest(fixture());
    expect(parsed.assets["Symbol-A.png"]).toMatchObject({
      kind: "atlas-frame",
      owner: "initial",
    });
  });

  it("rejects unknown routes and unsafe physical paths", () => {
    const valid = fixture();
    expect(() =>
      parseSceneLayoutDeliveryManifest({
        ...valid,
        assets: {
          ...valid.assets,
          "missing.png": {
            kind: "atlas-frame",
            owner: "initial",
            atlas: "missing",
            sourceByteLength: 1,
            mediaType: "image/png",
          },
        },
      }),
    ).toThrow(/unknown atlas/);
    expect(() =>
      parseSceneLayoutDeliveryManifest({
        ...valid,
        chunks: valid.chunks.map((chunk) => ({
          ...chunk,
          metadata: { ...chunk.metadata!, path: "../chunk.zip" },
        })),
      }),
    ).toThrow(/unsafe/);
  });
});

function fixture() {
  return {
    version: 1,
    kind: "scene-layout-delivery",
    layoutId: "layout",
    initialMode: "BaseGame",
    initialChunk: "initial",
    chunks: [
      {
        id: "initial",
        owner: "initial",
        dependencies: [],
        metadata: {
          path: `chunks/initial.${hash}.zip`,
          sha256: hash,
          byteLength: 1,
          mediaType: "application/zip",
        },
        atlases: ["atlas-initial"],
        externalAssets: [],
      },
    ],
    atlases: [
      {
        id: "atlas-initial",
        owner: "initial",
        image: {
          path: `assets/${hash}.webp`,
          sha256: hash,
          byteLength: 1,
          mediaType: "image/webp",
          width: 16,
          height: 16,
        },
        frames: {
          "Symbol-A.png": {
            x: 0,
            y: 0,
            width: 8,
            height: 8,
            sourceWidth: 8,
            sourceHeight: 8,
            rotated: false,
          },
        },
      },
    ],
    assets: {
      "Symbol-A.png": {
        kind: "atlas-frame",
        owner: "initial",
        atlas: "atlas-initial",
        sourceByteLength: 1,
        mediaType: "image/png",
      },
    },
  } as const;
}
