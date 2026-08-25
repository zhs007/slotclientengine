import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { buildSceneLayoutDelivery } from "../src/delivery-builder.js";
import { validateLayoutPackageBytes } from "../src/package-reader.js";
import type { CwebpRunner } from "../src/types.js";
import {
  createMappedLayoutZip,
  layoutFixture,
  logicalFixtureFiles,
} from "./fixtures.js";

describe("Scene Layout CDN delivery builder", () => {
  it("owns assets by earliest mode, atlases before WebP and preserves media bytes", async () => {
    const original = logicalFixtureFiles();
    const alpha = await image(200, 80, "#ff0000");
    const beta = await image(40, 40, "#00ff00", "jpeg");
    const shared = await image(80, 200, "#0000ff", "webp");
    const logicalFiles = new Map(original);
    logicalFiles.set("alpha.png", alpha);
    logicalFiles.set("beta.jpg", beta);
    logicalFiles.set("shared.webp", shared);
    const source = await validateLayoutPackageBytes(
      await createMappedLayoutZip({
        manifest: layoutFixture(),
        logicalFiles,
      }),
    );
    const runner: CwebpRunner = {
      version: vi.fn(async () => "cwebp test"),
      encode: vi.fn(async ({ inputPath, outputPath, quality }) => {
        await sharp(inputPath).webp({ quality }).toFile(outputPath);
      }),
    };
    const delivery = await buildSceneLayoutDelivery({
      source,
      quality: 80,
      cwebpExecutable: "cwebp",
      cwebpRunner: runner,
      maxAtlasSize: 256,
      atlasPadding: 2,
      atlasExtrude: 1,
    });

    expect(delivery.manifest.chunks.map((chunk) => chunk.id)).toEqual([
      "initial",
      "mode:Beta",
      "media",
    ]);
    expect(delivery.manifest.assets["alpha.png"]).toMatchObject({
      kind: "atlas-frame",
      owner: "initial",
    });
    expect(delivery.manifest.assets["shared.webp"]).toMatchObject({
      kind: "atlas-frame",
      owner: "initial",
    });
    expect(delivery.manifest.assets["beta.jpg"]).toMatchObject({
      kind: "atlas-frame",
      owner: "mode:Beta",
    });
    expect(
      delivery.manifest.atlases.some((atlas) =>
        Object.values(atlas.frames).some((frame) => frame.rotated),
      ),
    ).toBe(true);
    expect(runner.encode).toHaveBeenCalledTimes(delivery.atlasCount);

    for (const key of ["alpha-to-beta.mp4", "beta-to-alpha.mp4"]) {
      const route = delivery.manifest.assets[key];
      expect(route).toMatchObject({ kind: "external", owner: "media" });
      if (route?.kind !== "external") throw new Error("Expected media route.");
      expect(delivery.files.get(route.path)).toEqual(logicalFiles.get(key));
    }

    const initialChunk = delivery.manifest.chunks[0]!.metadata;
    expect(initialChunk?.mediaType).toBe("application/zip");
    expect(delivery.files.has("delivery.manifest.json")).toBe(true);
  });

  it("stores content-identical metadata aliases only in the earliest owner chunk", async () => {
    const atlas = new TextEncoder().encode(
      "shared-page.png\nsize:1,1\nfilter:Linear,Linear\nregion\nbounds:0,0,1,1\n",
    );
    const manifest = layoutFixture();
    const source = await validateLayoutPackageBytes(
      await createMappedLayoutZip({
        manifest: {
          ...manifest,
          nodes: [
            ...manifest.nodes,
            spineNode("alpha-spine", "Alpha", "alpha"),
            spineNode("beta-spine", "Beta", "beta"),
          ],
        },
        logicalFiles: new Map([
          ...logicalFixtureFiles(),
          ["alpha.png", await image(2, 2, "#ff0000")],
          ["beta.jpg", await image(2, 2, "#00ff00", "jpeg")],
          ["shared.webp", await image(2, 2, "#0000ff", "webp")],
          ["alpha.json", textBytes({ skeleton: { spine: "4.2" } })],
          ["alpha.atlas", atlas],
          ["alpha-spine.png", await image(1, 1, "#ffffff")],
          ["beta.json", textBytes({ skeleton: { spine: "4.2" } })],
          ["beta.atlas", atlas],
          ["beta-spine.png", await image(1, 1, "#ffffff")],
        ]),
      }),
    );
    const runner: CwebpRunner = {
      version: vi.fn(async () => "cwebp test"),
      encode: vi.fn(async ({ inputPath, outputPath, quality }) => {
        await sharp(inputPath).webp({ quality }).toFile(outputPath);
      }),
    };
    const delivery = await buildSceneLayoutDelivery({
      source,
      quality: 80,
      cwebpExecutable: "cwebp",
      cwebpRunner: runner,
      maxAtlasSize: 256,
      atlasPadding: 2,
      atlasExtrude: 1,
    });

    const alphaRoute = delivery.manifest.assets["alpha.atlas"];
    const betaRoute = delivery.manifest.assets["beta.atlas"];
    expect(alphaRoute).toMatchObject({
      kind: "metadata",
      owner: "initial",
      chunk: "initial",
    });
    expect(betaRoute).toMatchObject({
      kind: "metadata",
      owner: "initial",
      chunk: "initial",
    });
    if (alphaRoute?.kind !== "metadata" || betaRoute?.kind !== "metadata")
      throw new Error("Expected metadata routes.");
    expect(betaRoute.entry).toBe(alphaRoute.entry);

    const initialEntries = chunkMetadataEntries(delivery, "initial");
    const betaEntries = chunkMetadataEntries(delivery, "mode:Beta");
    expect(initialEntries.has(alphaRoute.entry)).toBe(true);
    expect(betaEntries.has(alphaRoute.entry)).toBe(false);
  });
});

function spineNode(id: string, gameMode: string, prefix: string) {
  return {
    id,
    order: 10,
    gameMode,
    resource: {
      kind: "spine" as const,
      skeleton: `${prefix}.json`,
      atlas: `${prefix}.atlas`,
      textures: { "shared-page.png": `${prefix}-spine.png` },
      defaultAnimation: "idle",
      loop: true,
    },
    placements: { default: { x: 0, y: 0, scale: 1 } },
  };
}

function textBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function chunkMetadataEntries(
  delivery: Awaited<ReturnType<typeof buildSceneLayoutDelivery>>,
  owner: string,
): ReadonlyMap<string, Uint8Array> {
  const chunk = delivery.manifest.chunks.find(
    (candidate) => candidate.id === owner,
  );
  if (!chunk) throw new Error(`Expected chunk: ${owner}.`);
  if (!chunk.metadata) return new Map();
  const bytes = delivery.files.get(chunk.metadata.path);
  if (!bytes) throw new Error(`Missing metadata ZIP: ${chunk.metadata.path}.`);
  return extractBoundedZip(bytes, {
    limits: {
      maxEntries: 100,
      maxCompressedBytes: 10_000_000,
      maxFileBytes: 10_000_000,
      maxTotalBytes: 10_000_000,
    },
    pathPolicy: { requireLowercase: true },
  });
}

async function image(
  width: number,
  height: number,
  background: string,
  format: "jpeg" | "png" | "webp" = "png",
): Promise<Uint8Array> {
  const pipeline = sharp({
    create: { width, height, channels: 4, background },
  });
  return new Uint8Array(
    await (
      format === "webp"
        ? pipeline.webp()
        : format === "jpeg"
          ? pipeline.jpeg()
          : pipeline.png()
    ).toBuffer(),
  );
}
