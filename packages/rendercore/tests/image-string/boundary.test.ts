import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseImageStringManifest } from "../../src/image-string/data/index.js";
import { createRenderImageString } from "../../src/image-string/core/index.js";
import { layoutImageString } from "../../src/image-string/editor/index.js";
import { imageStringManifestFixture } from "./fixtures.js";
import { Texture } from "pixi.js";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("image-string layer boundaries", () => {
  it("publishes only explicit data/core/editor subpaths", async () => {
    const packageJson = JSON.parse(
      await readFile(`${packageRoot}package.json`, "utf8"),
    );
    expect(packageJson.exports["./image-string"]).toBeUndefined();
    expect(Object.keys(packageJson.exports)).toEqual(
      expect.arrayContaining([
        "./image-string/data",
        "./image-string/core",
        "./image-string/editor",
      ]),
    );
  });

  it("keeps data and core source graphs free of editor-layer imports", async () => {
    const dataFiles = ["errors.ts", "types.ts", "manifest.ts", "index.ts"];
    for (const file of dataFiles) {
      const source = await readFile(
        `${packageRoot}src/image-string/data/${file}`,
        "utf8",
      );
      expect(source).not.toMatch(/pixi\.js|editorresource|browserartifactio/u);
      expect(source).not.toMatch(/\.\.\/(?:core|editor)\//u);
    }
    const coreFiles = [
      "compiled.ts",
      "types.ts",
      "layout.ts",
      "resource.ts",
      "render-image-string.ts",
      "index.ts",
    ];
    for (const file of coreFiles) {
      const source = await readFile(
        `${packageRoot}src/image-string/core/${file}`,
        "utf8",
      );
      expect(source).not.toMatch(/editorresource|browserartifactio/u);
      expect(source).not.toMatch(/\.\.\/editor\//u);
    }
  });

  it("keeps full occurrence inspection outside the core facade", async () => {
    const manifest = parseImageStringManifest(imageStringManifestFixture);
    const resource = Object.freeze({
      manifest,
      textures: Object.freeze(
        Object.fromEntries(
          Object.values(manifest.glyphs).map((glyph) => [
            glyph.path,
            Texture.EMPTY,
          ]),
        ),
      ),
      destroyed: false,
      assertUsable() {},
      async destroy() {},
    });
    const renderer = createRenderImageString({ resource, text: "01" });
    expect("getSnapshot" in renderer).toBe(false);
    expect(layoutImageString({ manifest, text: "01" }).glyphCount).toBe(2);
    renderer.destroy();
  });
});
