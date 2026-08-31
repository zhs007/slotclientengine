import { describe, expect, it } from "vitest";
import {
  createSceneLayoutDeliveryContentFilename,
  parseSceneLayoutDeliveryManifest,
  parseSceneLayoutDeliveryPoolFilename,
} from "../../src/scene-layout/data/delivery.js";

const hash = "a".repeat(64);

describe("Scene Layout delivery manifest", () => {
  it("accepts uppercase logical keys while keeping physical paths canonical", () => {
    const parsed = parseSceneLayoutDeliveryManifest(fixture());
    expect(parsed.assets["Symbol-A.png"]).toMatchObject({
      kind: "atlas-frame",
      owner: "initial",
    });
  });

  it("accepts strict flat v2 content paths", () => {
    const parsed = parseSceneLayoutDeliveryManifest(fixture(2));
    expect(parsed.version).toBe(2);
    expect(parsed.chunks[0]?.metadata?.path).toBe(`${hash}.zip`);
    expect(parsed.atlases[0]?.image.path).toBe(`${hash}.webp`);
    expect(
      createSceneLayoutDeliveryContentFilename({
        sha256: hash,
        extension: "zip",
      }),
    ).toBe(`${hash}.zip`);
    expect(parseSceneLayoutDeliveryPoolFilename(`${hash}.mp4`)).toEqual({
      kind: "content",
      sha256: hash,
      extension: "mp4",
    });
  });

  it("rejects nested, mismatched and malformed v2 physical filenames", () => {
    const valid = fixture(2);
    expect(() =>
      parseSceneLayoutDeliveryManifest({
        ...valid,
        chunks: valid.chunks.map((chunk) => ({
          ...chunk,
          metadata: { ...chunk.metadata!, path: `chunks/${hash}.zip` },
        })),
      }),
    ).toThrow(/pool filename|one path segment/);
    expect(() =>
      parseSceneLayoutDeliveryManifest({
        ...valid,
        chunks: valid.chunks.map((chunk) => ({
          ...chunk,
          metadata: { ...chunk.metadata!, path: `${"b".repeat(64)}.zip` },
        })),
      }),
    ).toThrow(/path hash/);
    expect(() =>
      parseSceneLayoutDeliveryManifest({
        ...valid,
        chunks: valid.chunks.map((chunk) => ({
          ...chunk,
          metadata: { ...chunk.metadata!, path: `${hash}.webp` },
        })),
      }),
    ).toThrow(/extension must be zip/);
    expect(() =>
      parseSceneLayoutDeliveryPoolFilename(`${hash.slice(1)}.zip`),
    ).toThrow(/invalid/);
    expect(() =>
      parseSceneLayoutDeliveryPoolFilename(`delivery.${hash}.json`),
    ).toThrow(/invalid/);
  });

  it("keeps v1 external routes compatible and validates v2 extensions", () => {
    const legacy = fixture();
    expect(() =>
      parseSceneLayoutDeliveryManifest({
        ...legacy,
        chunks: legacy.chunks.map((chunk) => ({
          ...chunk,
          externalAssets: ["intro"],
        })),
        assets: {
          ...legacy.assets,
          intro: {
            kind: "external",
            owner: "initial",
            sourceByteLength: 1,
            path: `assets/${hash}.mp4`,
            sha256: hash,
            byteLength: 1,
            mediaType: "video/mp4",
          },
        },
      }),
    ).not.toThrow();

    const current = fixture(2);
    expect(() =>
      parseSceneLayoutDeliveryManifest({
        ...current,
        chunks: current.chunks.map((chunk) => ({
          ...chunk,
          externalAssets: ["intro.mp4"],
        })),
        assets: {
          ...current.assets,
          "intro.mp4": {
            kind: "external",
            owner: "initial",
            sourceByteLength: 1,
            path: `${hash}.webm`,
            sha256: hash,
            byteLength: 1,
            mediaType: "video/mp4",
          },
        },
      }),
    ).toThrow(/extension must be mp4/);
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

  it("rejects one physical metadata entry assigned to multiple chunk owners", () => {
    const valid = fixture();
    const entry = `assets/${hash}.atlas`;
    expect(() =>
      parseSceneLayoutDeliveryManifest({
        ...valid,
        chunks: [
          ...valid.chunks,
          {
            id: "mode:FreeGame",
            owner: "mode:FreeGame",
            dependencies: ["initial"],
            metadata: {
              path: `chunks/free.${hash}.zip`,
              sha256: hash,
              byteLength: 1,
              mediaType: "application/zip",
            },
            atlases: [],
            externalAssets: [],
          },
        ],
        assets: {
          ...valid.assets,
          "base.atlas": {
            kind: "metadata",
            owner: "initial",
            chunk: "initial",
            entry,
            sha256: hash,
            byteLength: 1,
            mediaType: "text/plain",
          },
          "free.atlas": {
            kind: "metadata",
            owner: "mode:FreeGame",
            chunk: "mode:FreeGame",
            entry,
            sha256: hash,
            byteLength: 1,
            mediaType: "text/plain",
          },
        },
      }),
    ).toThrow(/metadata entry.*multiple owners/);
  });
});

function fixture(version: 1 | 2 = 1) {
  return {
    version,
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
          path: version === 1 ? `chunks/initial.${hash}.zip` : `${hash}.zip`,
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
          path: version === 1 ? `assets/${hash}.webp` : `${hash}.webp`,
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
