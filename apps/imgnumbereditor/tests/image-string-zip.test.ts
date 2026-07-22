import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  exportImageStringZip,
  importImageStringZip,
} from "../src/io/image-string-zip.js";
import { projectFixture, validationOptions } from "./helpers.js";

describe("image-string ZIP", () => {
  it("exports deterministic bytes and imports an equivalent project", async () => {
    const first = await exportImageStringZip(
      projectFixture(),
      validationOptions,
    );
    const second = await exportImageStringZip(
      projectFixture(),
      validationOptions,
    );
    expect(first.filename).toBe("neutral-library-image-string.zip");
    expect(first.bytes).toEqual(second.bytes);
    const files = extractBoundedZip(first.bytes, {
      limits: {
        maxEntries: 20,
        maxCompressedBytes: 1024 * 1024,
        maxFileBytes: 1024 * 1024,
        maxTotalBytes: 1024 * 1024,
      },
    });
    const manifest = JSON.parse(
      new TextDecoder().decode(files.get("image-string.manifest.json")),
    ) as { glyphs: Record<string, { path: string }> };
    expect(Object.values(manifest.glyphs).map(({ path }) => path)).toEqual([
      "0-1.png",
      "1-1.png",
      "+-1.png",
    ]);
    expect(files.has("assets.map.json")).toBe(true);
    expect(
      [...files.keys()].filter((path) =>
        /^assets\/[a-f0-9]{64}\.png$/u.test(path),
      ),
    ).toHaveLength(3);
    const imported = await importImageStringZip(first.bytes, validationOptions);
    expect(imported.id).toBe("neutral-library");
    expect([...imported.glyphs.keys()]).toEqual(["0", "1", "+"]);
    expect(imported.fixedAdvanceGroups[0].advanceWidth).toBe(8);
  });

  it("rejects orphan files and preserves strict declared dimensions", async () => {
    const exported = await exportImageStringZip(
      projectFixture(),
      validationOptions,
    );
    await expect(
      importImageStringZip(exported.bytes, {
        decodeImage: async () => ({ width: 1, height: 1 }),
        loadTexture: async () => new Texture({ source: Texture.EMPTY.source }),
      }),
    ).rejects.toThrow("尺寸不匹配");
    const bad = createDeterministicZip(
      new Map([
        ["image-string.manifest.json", new TextEncoder().encode("{}")],
        ["assets/orphan.png", new Uint8Array([1])],
      ]),
      { pathPolicy: { requireLowercase: true } },
    );
    await expect(
      importImageStringZip(bad, validationOptions),
    ).rejects.toThrow();
    const missing = createDeterministicZip(
      new Map([["assets/u0030.png", new Uint8Array([1])]]),
      { pathPolicy: { requireLowercase: true } },
    );
    await expect(
      importImageStringZip(missing, validationOptions),
    ).rejects.toThrow("缺少");
    const malformed = createDeterministicZip(
      new Map([["image-string.manifest.json", new TextEncoder().encode("{")]]),
      { pathPolicy: { requireLowercase: true } },
    );
    await expect(
      importImageStringZip(malformed, validationOptions),
    ).rejects.toThrow("JSON");
  });
});
