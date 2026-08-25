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
  it("owns shared assets by initial, atlases before WebP and preserves media bytes", async () => {
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
});

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
