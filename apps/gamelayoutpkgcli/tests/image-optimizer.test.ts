import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { optimizeLayoutImages } from "../src/image-optimizer.js";
import type { CwebpRunner, ValidatedLayoutPackage } from "../src/types.js";
import { fakeWebp } from "./fixtures.js";

function source(
  entries: Readonly<
    Record<
      string,
      {
        readonly mediaType: string;
        readonly bytes: Uint8Array;
        readonly sha256?: string;
      }
    >
  >,
): ValidatedLayoutPackage {
  return {
    zipBytes: new Uint8Array(),
    manifest: {} as never,
    assetsMap: { version: 1, kind: "editor-assets", files: {} },
    files: new Map(),
    sourceEntries: new Map(
      Object.entries(entries).map(([key, entry]) => [
        key,
        {
          path: `assets/${entry.sha256 ?? key}`,
          sha256: entry.sha256 ?? key,
          mediaType: entry.mediaType,
          byteLength: entry.bytes.byteLength,
          bytes: entry.bytes,
        },
      ]),
    ),
  };
}

function runner(bytes = fakeWebp(8)): CwebpRunner {
  return {
    version: vi.fn(async () => "fixture-cwebp 1"),
    encode: vi.fn(async ({ outputPath }) => {
      await writeFile(outputPath, bytes);
    }),
  };
}

describe("image optimizer", () => {
  it("converts PNG/JPEG once per digest and preserves WebP/non-image", async () => {
    const fake = runner();
    const result = await optimizeLayoutImages({
      source: source({
        "A.png": {
          mediaType: "image/png",
          bytes: new Uint8Array([1]),
          sha256: "same",
        },
        "B.jpg": {
          mediaType: "image/jpeg",
          bytes: new Uint8Array([1]),
          sha256: "same",
        },
        "C.webp": {
          mediaType: "image/webp",
          bytes: fakeWebp(3),
          sha256: "webp",
        },
        "config.json": {
          mediaType: "application/json",
          bytes: new Uint8Array([2]),
          sha256: "json",
        },
      }),
      quality: 80,
      cwebpExecutable: "/path with spaces/cwebp",
      runner: fake,
    });
    expect(result.convertedImageCount).toBe(2);
    expect(result.assets.has("A.webp")).toBe(true);
    expect(result.assets.has("B.webp")).toBe(true);
    expect(result.assets.get("C.webp")?.converted).toBe(false);
    expect(fake.encode).toHaveBeenCalledOnce();
    expect(fake.version).toHaveBeenCalledWith("/path with spaces/cwebp");
  });

  it("rejects target key collisions, media mismatches and invalid output", async () => {
    await expect(
      optimizeLayoutImages({
        source: source({
          "hero.png": {
            mediaType: "image/png",
            bytes: new Uint8Array([1]),
            sha256: "one",
          },
          "hero.jpg": {
            mediaType: "image/jpeg",
            bytes: new Uint8Array([2]),
            sha256: "two",
          },
        }),
        quality: 80,
        cwebpExecutable: "cwebp",
        runner: runner(),
      }),
    ).rejects.toThrow(/collision/);
    await expect(
      optimizeLayoutImages({
        source: source({
          "hero.png": {
            mediaType: "application/octet-stream",
            bytes: new Uint8Array([1]),
          },
        }),
        quality: 80,
        cwebpExecutable: "cwebp",
        runner: runner(),
      }),
    ).rejects.toThrow(/mediaType/);
    await expect(
      optimizeLayoutImages({
        source: source({
          "hero.png": {
            mediaType: "image/png",
            bytes: new Uint8Array([1]),
          },
        }),
        quality: 80,
        cwebpExecutable: "cwebp",
        runner: runner(new Uint8Array([1])),
      }),
    ).rejects.toThrow(/合法 WebP/);
  });

  it("keeps Spine atlas page logical names while converting their bytes", async () => {
    const result = await optimizeLayoutImages({
      source: source({
        "symbol.atlas": {
          mediaType: "text/plain",
          bytes: new TextEncoder().encode(
            "symbol.png\nsize:1,1\nfilter:Linear,Linear\nregion\nbounds:0,0,1,1\n",
          ),
        },
        "symbol.png": {
          mediaType: "image/png",
          bytes: new Uint8Array([1]),
        },
      }),
      quality: 80,
      cwebpExecutable: "cwebp",
      runner: runner(),
    });

    expect(result.keyMapping.get("symbol.png")).toBe("symbol.png");
    expect(result.assets.get("symbol.png")).toMatchObject({
      converted: true,
      mediaType: "image/webp",
    });
    expect(result.assets.has("symbol.webp")).toBe(false);
  });
});
