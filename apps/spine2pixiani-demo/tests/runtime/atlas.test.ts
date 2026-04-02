import { describe, expect, it } from "vitest";
import { cabinAtlasText } from "../../src/data/cabin-atlas.js";
import { parseAtlas } from "../../src/runtime/atlas.js";

describe("parseAtlas", () => {
  it("parses atlas metadata and rotated regions", () => {
    const atlas = parseAtlas(cabinAtlasText);

    expect(atlas.imageName).toBe("cabin.png");
    expect(atlas.size).toEqual({ width: 1394, height: 755 });
    expect(atlas.regions.ping1_04.rotate).toBe(true);
    expect(atlas.regions.ping1_04.size).toEqual({ width: 44, height: 5 });
    expect(atlas.regions.ui1.offset).toEqual({ x: 2, y: 0 });
  });
});