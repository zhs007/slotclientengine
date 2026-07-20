import { describe, expect, it } from "vitest";
import { materializeImageStringPackage } from "../../src/image-string/index.js";

const png = (seed: number) =>
  new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, seed]);

describe("image-string content materializer", () => {
  it("hashes leaves, deduplicates exact bytes and rewrites the root", async () => {
    const manifest = {
      version: 1,
      kind: "image-string",
      id: "digits",
      metrics: { lineHeight: 10, letterSpacing: 0 },
      glyphs: {
        "0": {
          path: "assets/zero.png",
          size: { width: 5, height: 10 },
          offset: { x: 0, y: 0 },
        },
        "1": {
          path: "assets/one.png",
          size: { width: 5, height: 10 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    };
    const result = await materializeImageStringPackage({
      manifest,
      files: new Map([
        ["assets/zero.png", png(1)],
        ["assets/one.png", png(1)],
      ]),
    });
    expect(result.manifest.glyphs["0"].path).toBe(
      result.manifest.glyphs["1"].path,
    );
    expect(result.manifest.glyphs["0"].path).toMatch(
      /^assets\/[a-f0-9]{64}\.png$/u,
    );
    expect(result.files.size).toBe(2);
  });

  it("rejects missing bytes and JPEG glyph payload", async () => {
    const manifest = {
      version: 1,
      kind: "image-string",
      id: "glyph",
      metrics: { lineHeight: 1, letterSpacing: 0 },
      glyphs: {
        a: {
          path: "assets/a.png",
          size: { width: 1, height: 1 },
          offset: { x: 0, y: 0 },
        },
      },
      fixedAdvanceGroups: [],
    };
    await expect(
      materializeImageStringPackage({ manifest, files: new Map() }),
    ).rejects.toThrow(/缺少 glyph bytes/);
    await expect(
      materializeImageStringPackage({
        manifest,
        files: new Map([["assets/a.png", new Uint8Array([255, 216, 255])]]),
      }),
    ).rejects.toThrow(/不支持 JPEG/);
  });
});
