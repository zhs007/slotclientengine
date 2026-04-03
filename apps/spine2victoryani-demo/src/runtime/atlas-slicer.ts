import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { AtlasData, AtlasRegion } from "./atlas-core.js";

export interface SlicedAssetEntry {
  textureName: string;
  fileName: string;
  relativePath: string;
  width: number;
  height: number;
}

export async function sliceAtlasRegion(imagePath: string, region: AtlasRegion) {
  const packedWidth = region.rotate ? region.size.height : region.size.width;
  const packedHeight = region.rotate ? region.size.width : region.size.height;
  const destX = region.offset.x;
  const destY = region.orig.height - region.size.height - region.offset.y;

  let extracted = sharp(imagePath).extract({
    left: region.xy.x,
    top: region.xy.y,
    width: packedWidth,
    height: packedHeight
  });

  if (region.rotate) {
    extracted = extracted.rotate(90);
  }

  const regionBuffer = await extracted.png().toBuffer();
  return sharp({
    create: {
      width: region.orig.width,
      height: region.orig.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: regionBuffer,
        left: destX,
        top: destY
      }
    ])
    .png()
    .toBuffer();
}

export async function writeSlicedAtlasAssets(
  imagePath: string,
  atlas: AtlasData,
  outputDir: string,
  fileNames: Record<string, string>
) {
  await mkdir(outputDir, { recursive: true });
  const assets: SlicedAssetEntry[] = [];

  for (const region of Object.values(atlas.regions)) {
    const buffer = await sliceAtlasRegion(imagePath, region);
    const fileName = fileNames[region.name];
    const filePath = join(outputDir, fileName);
    await writeFile(filePath, buffer);
    assets.push({
      textureName: region.name,
      fileName,
      relativePath: `./assets/${fileName}`,
      width: region.orig.width,
      height: region.orig.height
    });
  }

  return assets;
}