import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { exportLayoutZip } from "../src/io/exported-layout-zip.js";
import {
  extractBoundedZip,
  importLayoutZip,
  LAYOUT_ZIP_LIMITS,
  validateLayoutAssets,
} from "../src/io/imported-layout-zip.js";
import { assetBytes, imageManifest } from "./fixtures.js";

const decodeImage = async () => ({ width: 1, height: 1 });

describe("layout zip IO", () => {
  it("exports deterministic bytes and round-trips the exact closure", async () => {
    const first = await exportLayoutZip({
      manifest: imageManifest,
      assets: assetBytes,
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
    ).toThrow(/50 MiB/);
    expect(() =>
      extractBoundedZip(
        zipSync({
          "assets/huge.bin": new Uint8Array(LAYOUT_ZIP_LIMITS.maxFileBytes + 1),
        }),
      ),
    ).toThrow(/20 MiB/);
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
