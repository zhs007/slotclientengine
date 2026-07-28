import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseJson,
  validateLayoutPackageBytes,
} from "../src/package-reader.js";
import { commitOutputPair } from "../src/package-writer.js";
import {
  createMappedLayoutZip,
  layoutFixture,
  logicalFixtureFiles,
  text,
} from "./fixtures.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("package input and output boundaries", () => {
  it("rejects malformed ZIP, missing controls, malformed JSON and legacy refs", async () => {
    const mapped = await createMappedLayoutZip();
    await expect(
      validateLayoutPackageBytes(mapped, {
        maxEntries: 1,
        maxCompressedBytes: 1024 * 1024,
        maxFileBytes: 1024 * 1024,
        maxTotalBytes: 1024 * 1024,
      }),
    ).rejects.toThrow(/ZIP 无效/);
    await expect(
      validateLayoutPackageBytes(createDeterministicZip(new Map())),
    ).rejects.toThrow(/layout\.manifest\.json/);
    await expect(
      validateLayoutPackageBytes(
        createDeterministicZip(
          new Map([["layout.manifest.json", text(layoutFixture())]]),
        ),
      ),
    ).rejects.toThrow(/assets\.map\.json/);
    expect(() => parseJson(new Uint8Array([0xff]), "fixture")).toThrow(
      /JSON 无效/,
    );

    const legacy = structuredClone(layoutFixture()) as any;
    legacy.nodes[0].resource.path = "legacy/alpha.png";
    await expect(
      validateLayoutPackageBytes(
        await createMappedLayoutZip({
          manifest: legacy,
          logicalFiles: logicalFixtureFiles(),
        }),
      ),
    ).rejects.toThrow(/legacy direct-path/);
  });

  it("returns immutable validated maps", async () => {
    const validated = await validateLayoutPackageBytes(
      await createMappedLayoutZip(),
    );
    expect(() =>
      (validated.files as Map<string, Uint8Array>).set(
        "extra.bin",
        new Uint8Array(),
      ),
    ).toThrow(/不可修改/);
    expect(() =>
      (validated.sourceEntries as Map<string, never>).clear(),
    ).toThrow(/不可修改/);
  });

  it("refuses existing outputs and rolls the ZIP back if JSON commit fails", async () => {
    const root = await makeRoot();
    const existing = join(root, "existing.zip");
    await writeFile(existing, "owned");
    await expect(
      commitOutputPair({
        outputPath: existing,
        zipBytes: new Uint8Array([1]),
        assetsJsonPath: join(root, "groups.json"),
        assetsJsonBytes: new Uint8Array([2]),
      }),
    ).rejects.toThrow(/拒绝覆盖/);

    const aliased = join(root, "aliased-output");
    await expect(
      commitOutputPair({
        outputPath: aliased,
        zipBytes: new Uint8Array([1]),
        assetsJsonPath: aliased,
        assetsJsonBytes: new Uint8Array([2]),
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });
    await expect(access(aliased)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "gamelayoutpkg-boundary-"));
  roots.push(root);
  return root;
}
