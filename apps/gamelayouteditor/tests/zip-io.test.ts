import { strToU8, zipSync } from "fflate";
import { Assets, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import {
  extractBoundedZip,
  importLayoutZip,
  LAYOUT_ZIP_LIMITS,
  validateLayoutAssets,
} from "../src/io/imported-layout-zip.js";
import { assetBytes, imageManifest } from "./fixtures.js";
import {
  editorProjectToManifest,
  manifestToEditorProject,
} from "../src/model/editor-project.js";

const decodeImage = async () => ({ width: 1, height: 1 });

const encode = (value: unknown) => strToU8(`${JSON.stringify(value)}\n`);

function compositePackageFixture() {
  const dependencyPath =
    "dependencies/image-strings/digits/image-string.manifest.json";
  const imageStringManifest = {
    version: 1,
    kind: "image-string",
    id: "digits",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs: {
      "0": {
        path: "assets/0.png",
        size: { width: 1, height: 1 },
        offset: { x: 0, y: 0 },
      },
    },
    fixedAdvanceGroups: [],
  };
  const symbolPackage = {
    version: 1,
    kind: "symbol-package",
    id: "demo-symbols",
    cellSize: { width: 20, height: 20 },
    entrypoints: {
      gameConfig: "gameconfig.json",
      symbolManifest: "symbol-state-textures.manifest.json",
    },
    resources: ["a.png"],
  };
  const gameConfig = {
    paytable: { "0": { code: 0, symbol: "A", pays: [1] } },
    symbolCodes: { A: 0 },
    reels: { main: [[0], [0]] },
  };
  const symbolManifest = {
    version: 1,
    states: [],
    symbols: { A: { normal: "./a.png", scale: 1 } },
  };
  const manifest = {
    ...imageManifest,
    nodes: [
      imageManifest.nodes[0],
      {
        id: "amount",
        order: 2,
        resource: {
          kind: "image-string" as const,
          manifest: dependencyPath,
          text: "000",
          anchor: { x: 0.5, y: 0.5 },
        },
        placements: { default: { x: 50, y: 50, scale: 1 } },
      },
    ],
    reels: { main: { ...imageManifest.reels.main, order: 1 } },
    symbolPackage: {
      manifest: "dependencies/symbols/demo-symbols/symbols.package.json",
      reel: "main" as const,
      reelSet: "main",
      renderMode: "standard" as const,
    },
  };
  const assets = new Map(assetBytes);
  assets.set(dependencyPath, encode(imageStringManifest));
  assets.set(
    "dependencies/image-strings/digits/assets/0.png",
    new Uint8Array([4]),
  );
  const symbolFiles = new Map([
    ["symbols.package.json", encode(symbolPackage)],
    ["gameconfig.json", encode(gameConfig)],
    ["symbol-state-textures.manifest.json", encode(symbolManifest)],
    ["a.png", new Uint8Array([5])],
  ]);
  return { manifest, assets, symbolFiles };
}

describe("layout zip IO", () => {
  it("round-trips vendored image-string and symbols closures without orphan bytes", async () => {
    const fixture = compositePackageFixture();
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const first = await exportLayoutZip({ ...fixture, decodeImage });
      const second = await exportLayoutZip({ ...fixture, decodeImage });
      expect(first.bytes).toEqual(second.bytes);
      const entries = extractBoundedZip(first.bytes);
      expect([...entries.keys()].sort()).toEqual([
        "assets/bg.png",
        "dependencies/image-strings/digits/assets/0.png",
        "dependencies/image-strings/digits/image-string.manifest.json",
        "dependencies/symbols/demo-symbols/a.png",
        "dependencies/symbols/demo-symbols/gameconfig.json",
        "dependencies/symbols/demo-symbols/symbol-state-textures.manifest.json",
        "dependencies/symbols/demo-symbols/symbols.package.json",
        "layout.manifest.json",
      ]);
      const imported = await importLayoutZip(first.bytes, { decodeImage });
      expect(imported.manifest).toEqual(fixture.manifest);
      const project = manifestToEditorProject(
        imported.manifest,
        imported.assets,
      );
      expect(project.symbolDependency).toMatchObject({
        packageId: "demo-symbols",
        reelSet: "main",
        renderMode: "standard",
        includeInExport: true,
      });
      expect(editorProjectToManifest(project)).toEqual(fixture.manifest);
      expect(
        project.assets.has("dependencies/symbols/demo-symbols/a.png"),
      ).toBe(false);
      imported.destroy();

      const withoutSymbols = {
        ...fixture.manifest,
        symbolPackage: undefined,
      };
      const unbound = await exportLayoutZip({
        manifest: withoutSymbols,
        assets: fixture.assets,
        decodeImage,
      });
      expect(
        [...extractBoundedZip(unbound.bytes).keys()].some((path) =>
          path.startsWith("dependencies/symbols/"),
        ),
      ).toBe(false);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("exports deterministic bytes and round-trips the exact closure", async () => {
    const assetsWithUnused = new Map(assetBytes);
    assetsWithUnused.set("assets/unused.png", new Uint8Array([9, 9]));
    const first = await exportLayoutZip({
      manifest: imageManifest,
      assets: assetsWithUnused,
      decodeImage,
    });
    const second = await exportLayoutZip({
      manifest: imageManifest,
      assets: assetBytes,
      decodeImage,
    });
    expect(first.fileName).toBe("fixture-layout.zip");
    expect(first.bytes).toEqual(second.bytes);
    const imported = await importLayoutZip(first.bytes, { decodeImage });
    expect(imported.manifest).toEqual(imageManifest);
    expect(imported.assets.get("assets/bg.png")).toEqual(
      assetBytes.get("assets/bg.png"),
    );
    imported.destroy();
    expect(extractBoundedZip(first.bytes).has("assets/unused.png")).toBe(false);
    expect(assetsWithUnused.has("assets/unused.png")).toBe(true);
  });

  it("fails when a used closure byte is missing but ignores unrelated library bytes", async () => {
    await expect(
      exportLayoutZip({
        manifest: imageManifest,
        assets: new Map([["assets/unused.png", new Uint8Array([1])]]),
        decodeImage,
      }),
    ).rejects.toThrow(/缺少 bytes/);
  });

  it("rejects extra, unsafe and noncanonical entries", async () => {
    const manifest = strToU8(`${JSON.stringify(imageManifest)}\n`);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": manifest,
          "assets/bg.png": new Uint8Array([1]),
          "assets/extra.png": new Uint8Array([2]),
        }),
        { decodeImage },
      ),
    ).rejects.toThrow(/精确一致/);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": manifest,
          "Assets/BG.PNG": new Uint8Array([1]),
        }),
        { decodeImage },
      ),
    ).rejects.toThrow(/小写/);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": manifest,
          "../escape.png": new Uint8Array([1]),
        }),
        { decodeImage },
      ),
    ).rejects.toThrow(/非法 segment/);
  });

  it("rejects missing/invalid manifests, missing assets and decoded size drift", async () => {
    await expect(
      importLayoutZip(zipSync({ "assets/bg.png": new Uint8Array([1]) }), {
        decodeImage,
      }),
    ).rejects.toThrow(/layout.manifest.json/);
    await expect(
      importLayoutZip(zipSync({ "layout.manifest.json": strToU8("{") }), {
        decodeImage,
      }),
    ).rejects.toThrow(/无效/);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": strToU8(JSON.stringify(imageManifest)),
        }),
        { decodeImage },
      ),
    ).rejects.toThrow(/精确一致/);
    await expect(
      importLayoutZip(
        zipSync({
          "layout.manifest.json": strToU8(JSON.stringify(imageManifest)),
          "assets/bg.png": new Uint8Array([1]),
        }),
        { decodeImage: async () => ({ width: 2, height: 1 }) },
      ),
    ).rejects.toThrow(/尺寸漂移/);
  });

  it("rejects non-zip bytes", async () => {
    await expect(
      importLayoutZip(new Uint8Array([1, 2, 3]), { decodeImage }),
    ).rejects.toThrow(/zip/);
  });

  it("enforces direct asset and archive size contracts and idempotent cleanup", async () => {
    await expect(
      validateLayoutAssets(imageManifest, new Map(), { decodeImage }),
    ).rejects.toThrow(/资源闭包/);
    expect(() =>
      extractBoundedZip("not bytes" as unknown as Uint8Array),
    ).toThrow(/Uint8Array/);
    expect(() =>
      extractBoundedZip(
        new Uint8Array(LAYOUT_ZIP_LIMITS.maxCompressedBytes + 1),
      ),
    ).toThrow(/200 MiB/);
    expect(() =>
      extractBoundedZip(
        zipSync({
          "assets/huge.bin": new Uint8Array(LAYOUT_ZIP_LIMITS.maxFileBytes + 1),
        }),
      ),
    ).toThrow(/50 MiB/);
    const validated = await validateLayoutAssets(imageManifest, assetBytes, {
      decodeImage,
    });
    validated.destroy();
    validated.destroy();
  });

  it("accepts clean directory entries but rejects a root directory entry", () => {
    expect(() =>
      extractBoundedZip(
        zipSync({
          "assets/": new Uint8Array(),
          "assets/file.bin": new Uint8Array([1]),
        }),
      ),
    ).not.toThrow();
    expect(() => extractBoundedZip(zipSync({ "/": new Uint8Array() }))).toThrow(
      /根目录|相对/,
    );
  });
});
