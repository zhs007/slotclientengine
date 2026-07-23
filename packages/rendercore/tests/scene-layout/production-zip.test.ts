import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { describe, expect, it } from "vitest";
import {
  inspectSceneLayoutPackageZipBytes,
  loadSceneLayoutPackageFromZipBytes,
  SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

function validZip(): Uint8Array {
  return createDeterministicZip(
    new Map([
      ["layout.manifest.json", encode(game002LayoutFixture)],
      ["assets/bg.png", new Uint8Array([1, 2, 3])],
    ]),
  );
}

describe("scene-layout production ZIP", () => {
  it("accepts a canonical exact closure and reports bounded metadata", async () => {
    const inspected = await inspectSceneLayoutPackageZipBytes({
      zipBytes: validZip(),
    });
    expect(inspected.manifest.id).toBe("game002");
    expect(inspected.entryCount).toBe(2);
    expect(inspected.totalBytes).toBeGreaterThan(3);
    expect(SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS.maxEntries).toBeGreaterThan(121);
    expect(SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS.maxTotalBytes).toBeGreaterThan(
      13_324_795,
    );

    const resource = await loadSceneLayoutPackageFromZipBytes({
      zipBytes: validZip(),
      loadSymbolTextures: false,
      decodeImage: async () => {
        throw new Error("fixture has no image-string resources");
      },
    });
    expect(resource.manifest.id).toBe("game002");
    resource.destroy();
  });

  it("rejects wrapper directories, Finder metadata and bounded oversize input", async () => {
    const wrapped = createDeterministicZip(
      new Map([
        ["wrapper/layout.manifest.json", encode(game002LayoutFixture)],
        ["wrapper/assets/bg.png", new Uint8Array([1])],
      ]),
    );
    await expect(
      inspectSceneLayoutPackageZipBytes({ zipBytes: wrapped }),
    ).rejects.toThrow(/missing root/);

    const finder = createDeterministicZip(
      new Map([
        ["layout.manifest.json", encode(game002LayoutFixture)],
        ["assets/bg.png", new Uint8Array([1])],
        ["__macosx/metadata", new Uint8Array([1])],
      ]),
    );
    await expect(
      inspectSceneLayoutPackageZipBytes({ zipBytes: finder }),
    ).rejects.toThrow(/Finder metadata/);

    await expect(
      inspectSceneLayoutPackageZipBytes({
        zipBytes: validZip(),
        limits: {
          maxEntries: 1,
          maxCompressedBytes: 1024 * 1024,
          maxFileBytes: 1024 * 1024,
          maxTotalBytes: 1024 * 1024,
        },
      }),
    ).rejects.toThrow(/entry/);
  });

  it.each([
    ["assets/.ds_store", /Finder metadata/],
    ["assets/._background", /Finder metadata/],
  ])("rejects canonical metadata entry %s", async (path, message) => {
    const zip = createDeterministicZip(
      new Map([
        ["layout.manifest.json", encode(game002LayoutFixture)],
        ["assets/bg.png", new Uint8Array([1])],
        [path, new Uint8Array([1])],
      ]),
    );
    await expect(
      inspectSceneLayoutPackageZipBytes({ zipBytes: zip }),
    ).rejects.toThrow(message);
  });

  it("wraps malformed ZIP and manifest JSON errors at the production boundary", async () => {
    await expect(
      inspectSceneLayoutPackageZipBytes({
        zipBytes: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow(/missing root/);

    const invalidManifest = createDeterministicZip(
      new Map([
        ["layout.manifest.json", new TextEncoder().encode("{ not-json")],
      ]),
    );
    await expect(
      inspectSceneLayoutPackageZipBytes({ zipBytes: invalidManifest }),
    ).rejects.toThrow(/layout.manifest.json is invalid/);
  });
});
