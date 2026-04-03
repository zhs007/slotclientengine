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

export function sanitizeAssetName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}