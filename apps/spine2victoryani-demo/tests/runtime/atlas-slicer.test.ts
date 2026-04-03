import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { parseAtlas } from "../../src/runtime/atlas-core.js";
import { sliceAtlasRegion, writeSlicedAtlasAssets } from "../../src/runtime/atlas-slicer.js";

const tempDirs: string[] = [];

async function createTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "spine2victoryani-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("atlas-slicer", () => {
  it("restores rotated regions to their original dimensions", async () => {
    const atlasText = await readFile(new URL("../../src/assets/cabin.atlas", import.meta.url), "utf8");
    const atlas = parseAtlas(atlasText);
    const rotatedRegion = Object.values(atlas.regions).find((region) => region.rotate);

    expect(rotatedRegion).toBeDefined();

    const buffer = await sliceAtlasRegion(new URL("../../src/assets/cabin.png", import.meta.url).pathname, rotatedRegion!);
    const metadata = await sharp(buffer).metadata();

    expect(metadata.width).toBe(rotatedRegion!.orig.width);
    expect(metadata.height).toBe(rotatedRegion!.orig.height);
  });

  it("writes one standalone PNG per atlas region", async () => {
    const atlasText = await readFile(new URL("../../src/assets/cabin.atlas", import.meta.url), "utf8");
    const atlas = parseAtlas(atlasText);
    const outputDir = await createTempDir();
    const fileNames = Object.fromEntries(Object.keys(atlas.regions).map((name) => [name, `${name}.png`]));

    const assets = await writeSlicedAtlasAssets(new URL("../../src/assets/cabin.png", import.meta.url).pathname, atlas, outputDir, fileNames);

    expect(assets).toHaveLength(Object.keys(atlas.regions).length);
    await Promise.all(
      assets.map(async (asset) => {
        const metadata = await sharp(join(outputDir, asset.fileName)).metadata();
        expect(metadata.width).toBeGreaterThan(0);
        expect(metadata.height).toBeGreaterThan(0);
      })
    );
  });
});