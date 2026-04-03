import { Texture } from "pixi.js";

export type AtlasRegion = {
  name: string;
  rotate: boolean;
  xy: { x: number; y: number };
  size: { width: number; height: number };
  orig: { width: number; height: number };
  offset: { x: number; y: number };
  index: number;
};

export type AtlasData = {
  imageName: string;
  size: { width: number; height: number };
  format: string;
  filter: string;
  repeat: string;
  regions: Record<string, AtlasRegion>;
};

function parsePair(value: string) {
  const [left, right] = value.split(",").map((item) => Number.parseInt(item.trim(), 10));
  return {
    x: left,
    y: right
  };
}

function parseSize(value: string) {
  const pair = parsePair(value);
  return {
    width: pair.x,
    height: pair.y
  };
}

export function parseAtlas(atlasText: string): AtlasData {
  const lines = atlasText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length < 6) {
    throw new Error("Invalid atlas: missing header");
  }

  const imageName = lines[0].trim();
  const size = parseSize(lines[1].split(":")[1].trim());
  const format = lines[2].split(":")[1].trim();
  const filter = lines[3].split(":")[1].trim();
  const repeat = lines[4].split(":")[1].trim();
  const regions: Record<string, AtlasRegion> = {};

  let index = 5;
  while (index < lines.length) {
    const name = lines[index].trim();
    const region: AtlasRegion = {
      name,
      rotate: false,
      xy: { x: 0, y: 0 },
      size: { width: 0, height: 0 },
      orig: { width: 0, height: 0 },
      offset: { x: 0, y: 0 },
      index: -1
    };

    const block = lines.slice(index + 1, index + 7);
    for (const line of block) {
      const [rawKey, rawValue] = line.split(":");
      const key = rawKey.trim();
      const value = rawValue.trim();
      if (key === "rotate") {
        region.rotate = value === "true";
      }
      if (key === "xy") {
        region.xy = parsePair(value);
      }
      if (key === "size") {
        region.size = parseSize(value);
      }
      if (key === "orig") {
        region.orig = parseSize(value);
      }
      if (key === "offset") {
        region.offset = parsePair(value);
      }
      if (key === "index") {
        region.index = Number.parseInt(value, 10);
      }
    }

    regions[name] = region;
    index += 7;
  }

  return {
    imageName,
    size,
    format,
    filter,
    repeat,
    regions
  };
}

async function loadImage(imageUrl: string) {
  const image = new Image();
  image.src = imageUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load atlas image: ${imageUrl}`));
  });
  return image;
}

function createRegionCanvas(image: CanvasImageSource, region: AtlasRegion) {
  const canvas = document.createElement("canvas");
  canvas.width = region.orig.width;
  canvas.height = region.orig.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create canvas context for atlas region");
  }

  const packedWidth = region.rotate ? region.size.height : region.size.width;
  const packedHeight = region.rotate ? region.size.width : region.size.height;
  const destX = region.offset.x;
  const destY = region.orig.height - region.size.height - region.offset.y;

  if (region.rotate) {
    context.save();
    context.translate(destX + region.size.width, destY);
    context.rotate(Math.PI / 2);
    context.drawImage(
      image,
      region.xy.x,
      region.xy.y,
      packedWidth,
      packedHeight,
      0,
      0,
      packedWidth,
      packedHeight
    );
    context.restore();
  } else {
    context.drawImage(
      image,
      region.xy.x,
      region.xy.y,
      packedWidth,
      packedHeight,
      destX,
      destY,
      region.size.width,
      region.size.height
    );
  }

  return canvas;
}

export async function loadAtlasTextures(atlasText: string, imageUrl: string) {
  const atlas = parseAtlas(atlasText);
  const image = await loadImage(imageUrl);
  const textures: Record<string, Texture> = {};

  for (const region of Object.values(atlas.regions)) {
    const canvas = createRegionCanvas(image, region);
    textures[region.name] = Texture.from(canvas);
  }

  return textures;
}