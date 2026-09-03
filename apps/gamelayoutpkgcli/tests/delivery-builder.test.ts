import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutManifestV8,
  upgradeSceneLayoutManifestToLatest,
} from "@slotclientengine/rendercore/scene-layout/data";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSceneLayoutDelivery,
  checkSceneLayoutDeliveryDirectory,
  commitSceneLayoutDeliveryDirectory,
  type BuiltSceneLayoutDelivery,
} from "../src/delivery-builder.js";
import { validateLayoutPackageBytes } from "../src/package-reader.js";
import type { CwebpRunner } from "../src/types.js";
import {
  createMappedLayoutZip,
  layoutFixture,
  logicalFixtureFiles,
} from "./fixtures.js";

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("Scene Layout CDN delivery builder", () => {
  it("keeps gameplay initial in a mode chunk when configured Splash owns startup", async () => {
    const latest = upgradeSceneLayoutManifestToLatest(layoutFixture());
    const alpha = latest.gameModes.modes.find((mode) => mode.id === "Alpha")!;
    const draft = {
      ...latest,
      gameModes: {
        ...latest.gameModes,
        splashMode: "Splash",
        modes: [
          ...latest.gameModes.modes,
          {
            ...alpha,
            id: "Splash",
            main: { ...alpha.main, enabled: false },
            nodeStates: {},
            symbolPackage: undefined,
            awardCelebrationPopup: undefined,
          },
        ],
        transitions: [
          ...(latest.gameModes.transitions ?? []),
          {
            from: "Splash",
            to: "Alpha",
            overlay: { kind: "none" as const },
          },
        ],
      },
      runtimeAllocation: undefined as never,
    };
    const manifest = parseSceneLayoutManifestV8({
      ...draft,
      runtimeAllocation: createSceneLayoutRuntimeAllocation(draft),
    });
    const logicalFiles = new Map(logicalFixtureFiles());
    logicalFiles.set("alpha.png", await image(200, 80, "#ff0000"));
    logicalFiles.set("beta.jpg", await image(40, 40, "#00ff00", "jpeg"));
    logicalFiles.set("shared.webp", await image(80, 200, "#0000ff", "webp"));
    const source = await validateLayoutPackageBytes(
      await createMappedLayoutZip({
        manifest,
        logicalFiles,
      }),
    );
    const runner: CwebpRunner = {
      version: vi.fn(async () => "cwebp test"),
      encode: vi.fn(async ({ inputPath, outputPath, quality }) => {
        await sharp(inputPath).webp({ quality }).toFile(outputPath);
      }),
    };
    const delivery = await buildSceneLayoutDelivery({
      source,
      quality: 80,
      cwebpExecutable: "cwebp",
      cwebpRunner: runner,
      maxAtlasSize: 256,
      atlasPadding: 2,
      atlasExtrude: 1,
    });

    expect(delivery.manifest.initialMode).toBe("Splash");
    expect(delivery.manifest.chunks.map((chunk) => chunk.id)).toContain(
      "mode:Alpha",
    );
  });

  it("owns assets by earliest mode, atlases before WebP and preserves media bytes", async () => {
    const original = logicalFixtureFiles();
    const alpha = await image(200, 80, "#ff0000");
    const beta = await image(40, 40, "#00ff00", "jpeg");
    const shared = await image(80, 200, "#0000ff", "webp");
    const logicalFiles = new Map(original);
    logicalFiles.set("alpha.png", alpha);
    logicalFiles.set("beta.jpg", beta);
    logicalFiles.set("shared.webp", shared);
    const source = await validateLayoutPackageBytes(
      await createMappedLayoutZip({
        manifest: layoutFixture(),
        logicalFiles,
      }),
    );
    const runner: CwebpRunner = {
      version: vi.fn(async () => "cwebp test"),
      encode: vi.fn(async ({ inputPath, outputPath, quality }) => {
        await sharp(inputPath).webp({ quality }).toFile(outputPath);
      }),
    };
    const delivery = await buildSceneLayoutDelivery({
      source,
      quality: 80,
      cwebpExecutable: "cwebp",
      cwebpRunner: runner,
      maxAtlasSize: 256,
      atlasPadding: 2,
      atlasExtrude: 1,
    });

    expect(delivery.manifest.chunks.map((chunk) => chunk.id)).toEqual([
      "initial",
      "mode:Beta",
      "media",
    ]);
    expect(delivery.manifest.assets["alpha.png"]).toMatchObject({
      kind: "atlas-frame",
      owner: "initial",
    });
    expect(delivery.manifest.assets["shared.webp"]).toMatchObject({
      kind: "atlas-frame",
      owner: "initial",
    });
    expect(delivery.manifest.assets["beta.jpg"]).toMatchObject({
      kind: "atlas-frame",
      owner: "mode:Beta",
    });
    expect(
      delivery.manifest.atlases.some((atlas) =>
        Object.values(atlas.frames).some((frame) => frame.rotated),
      ),
    ).toBe(true);
    expect(runner.encode).toHaveBeenCalledTimes(delivery.atlasCount);

    for (const key of ["alpha-to-beta.mp4", "beta-to-alpha.mp4"]) {
      const route = delivery.manifest.assets[key];
      expect(route).toMatchObject({ kind: "external", owner: "media" });
      if (route?.kind !== "external") throw new Error("Expected media route.");
      expect(delivery.files.get(route.path)).toEqual(logicalFiles.get(key));
    }

    const initialChunk = delivery.manifest.chunks[0]!.metadata;
    expect(initialChunk?.mediaType).toBe("application/zip");
    expect(delivery.manifest.version).toBe(2);
    expect(delivery.manifestFilename).toBe("delivery.manifest.json");
    expect(delivery.files.has(delivery.manifestFilename)).toBe(false);
    for (const [filename, bytes] of delivery.files) {
      expect(filename).not.toContain("/");
      const expectedHash = createHash("sha256").update(bytes).digest("hex");
      const declaredHash = filename.slice(0, filename.indexOf("."));
      expect(declaredHash).toBe(expectedHash);
    }

    const repeated = await buildSceneLayoutDelivery({
      source,
      quality: 80,
      cwebpExecutable: "cwebp",
      cwebpRunner: runner,
      maxAtlasSize: 256,
      atlasPadding: 2,
      atlasExtrude: 1,
    });
    expect(repeated.manifestFilename).toBe(delivery.manifestFilename);
    expect(repeated.manifestBytes).toEqual(delivery.manifestBytes);
    expect([...repeated.files]).toEqual([...delivery.files]);

    const initialEntries = chunkMetadataEntries(delivery, "initial");
    const assetsMapBytes = initialEntries.get("assets.map.json");
    if (!assetsMapBytes) throw new Error("Expected assets.map.json.");
    const assetsMap = JSON.parse(new TextDecoder().decode(assetsMapBytes));
    expect(assetsMap.files["alpha.png"].path).toMatch(
      /^assets\/[0-9a-f]{64}\.webp$/u,
    );
  });

  it("stores content-identical metadata aliases only in the earliest owner chunk", async () => {
    const atlas = new TextEncoder().encode(
      "shared-page.png\nsize:1,1\nfilter:Linear,Linear\nregion\nbounds:0,0,1,1\n",
    );
    const manifest = layoutFixture();
    const source = await validateLayoutPackageBytes(
      await createMappedLayoutZip({
        manifest: {
          ...manifest,
          nodes: [
            ...manifest.nodes,
            spineNode("alpha-spine", "Alpha", "alpha"),
            spineNode("beta-spine", "Beta", "beta"),
          ],
        },
        logicalFiles: new Map([
          ...logicalFixtureFiles(),
          ["alpha.png", await image(2, 2, "#ff0000")],
          ["beta.jpg", await image(2, 2, "#00ff00", "jpeg")],
          ["shared.webp", await image(2, 2, "#0000ff", "webp")],
          ["alpha.json", textBytes({ skeleton: { spine: "4.2" } })],
          ["alpha.atlas", atlas],
          ["alpha-spine.png", await image(1, 1, "#ffffff")],
          ["beta.json", textBytes({ skeleton: { spine: "4.2" } })],
          ["beta.atlas", atlas],
          ["beta-spine.png", await image(1, 1, "#ffffff")],
        ]),
      }),
    );
    const runner: CwebpRunner = {
      version: vi.fn(async () => "cwebp test"),
      encode: vi.fn(async ({ inputPath, outputPath, quality }) => {
        await sharp(inputPath).webp({ quality }).toFile(outputPath);
      }),
    };
    const delivery = await buildSceneLayoutDelivery({
      source,
      quality: 80,
      cwebpExecutable: "cwebp",
      cwebpRunner: runner,
      maxAtlasSize: 256,
      atlasPadding: 2,
      atlasExtrude: 1,
    });

    const alphaRoute = delivery.manifest.assets["alpha.atlas"];
    const betaRoute = delivery.manifest.assets["beta.atlas"];
    expect(alphaRoute).toMatchObject({
      kind: "metadata",
      owner: "initial",
      chunk: "initial",
    });
    expect(betaRoute).toMatchObject({
      kind: "metadata",
      owner: "initial",
      chunk: "initial",
    });
    if (alphaRoute?.kind !== "metadata" || betaRoute?.kind !== "metadata")
      throw new Error("Expected metadata routes.");
    expect(betaRoute.entry).toBe(alphaRoute.entry);

    const initialEntries = chunkMetadataEntries(delivery, "initial");
    const betaEntries = chunkMetadataEntries(delivery, "mode:Beta");
    expect(initialEntries.has(alphaRoute.entry)).toBe(true);
    expect(betaEntries.has(alphaRoute.entry)).toBe(false);
  });

  it("publishes into an append-only flat pool and reuses byte-equal files", async () => {
    const root = await mkdtemp(join(tmpdir(), "gamelayout-delivery-pool-"));
    roots.push(root);
    const outputDirectory = join(root, "pool");
    const delivery = fakeDelivery();

    await expect(
      commitSceneLayoutDeliveryDirectory({ outputDirectory, delivery }),
    ).resolves.toEqual({
      createdFileCount: 1,
      reusedFileCount: 0,
      manifestChanged: true,
    });
    await expect(
      commitSceneLayoutDeliveryDirectory({ outputDirectory, delivery }),
    ).resolves.toEqual({
      createdFileCount: 0,
      reusedFileCount: 1,
      manifestChanged: false,
    });

    const partialDirectory = join(root, "partial-pool");
    await mkdir(partialDirectory);
    const payload = [...delivery.files][0]!;
    await writeFile(join(partialDirectory, payload[0]), payload[1]);
    await expect(
      commitSceneLayoutDeliveryDirectory({
        outputDirectory: partialDirectory,
        delivery,
      }),
    ).resolves.toEqual({
      createdFileCount: 0,
      reusedFileCount: 1,
      manifestChanged: true,
    });

    const updated = fakeDelivery('{"version":2,"revision":2}\n');
    await expect(
      commitSceneLayoutDeliveryDirectory({
        outputDirectory,
        delivery: updated,
      }),
    ).resolves.toEqual({
      createdFileCount: 0,
      reusedFileCount: 1,
      manifestChanged: true,
    });
    await expect(
      readFile(join(outputDirectory, updated.manifestFilename), "utf8"),
    ).resolves.toBe('{"version":2,"revision":2}\n');

    const oldBytes = new Uint8Array([8]);
    const oldHash = createHash("sha256").update(oldBytes).digest("hex");
    await writeFile(join(outputDirectory, `${oldHash}.bin`), oldBytes);
    await expect(
      checkSceneLayoutDeliveryDirectory({
        outputDirectory,
        delivery: updated,
      }),
    ).resolves.toBeUndefined();

    await writeFile(join(outputDirectory, "README.txt"), "invalid");
    await expect(
      checkSceneLayoutDeliveryDirectory({
        outputDirectory,
        delivery: updated,
      }),
    ).rejects.toThrow(/非法文件名/);
  });

  it("rejects corrupt collisions and nested pool entries without overwriting", async () => {
    const root = await mkdtemp(join(tmpdir(), "gamelayout-delivery-corrupt-"));
    roots.push(root);
    const delivery = fakeDelivery();
    const outputDirectory = join(root, "pool");
    await mkdir(outputDirectory);
    const payloadFilename = [...delivery.files.keys()][0]!;
    await writeFile(
      join(outputDirectory, payloadFilename),
      new Uint8Array([9]),
    );

    await expect(
      commitSceneLayoutDeliveryDirectory({ outputDirectory, delivery }),
    ).rejects.toThrow(/同名文件内容不一致/);
    await expect(
      readFile(join(outputDirectory, payloadFilename)),
    ).resolves.toEqual(Buffer.from([9]));

    await rm(outputDirectory, { recursive: true, force: true });
    await mkdir(join(outputDirectory, "nested"), { recursive: true });
    await expect(
      commitSceneLayoutDeliveryDirectory({ outputDirectory, delivery }),
    ).rejects.toThrow(/扁平普通文件/);
  });
});

function spineNode(id: string, gameMode: string, prefix: string) {
  return {
    id,
    order: 10,
    gameMode,
    resource: {
      kind: "spine" as const,
      skeleton: `${prefix}.json`,
      atlas: `${prefix}.atlas`,
      textures: { "shared-page.png": `${prefix}-spine.png` },
      defaultAnimation: "idle",
      loop: true,
    },
    placements: { default: { x: 0, y: 0, scale: 1 } },
  };
}

function textBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function fakeDelivery(
  manifestText = '{"version":2}\n',
): BuiltSceneLayoutDelivery {
  const payload = new Uint8Array([1, 2, 3]);
  const payloadHash = createHash("sha256").update(payload).digest("hex");
  const manifestBytes = new TextEncoder().encode(manifestText);
  const manifestFilename = "delivery.manifest.json";
  return {
    manifest: {} as BuiltSceneLayoutDelivery["manifest"],
    manifestFilename,
    manifestBytes,
    files: new Map([[`${payloadHash}.zip`, payload]]),
    atlasCount: 0,
    atlasFrameCount: 0,
    externalAssetCount: 0,
  };
}

function chunkMetadataEntries(
  delivery: Awaited<ReturnType<typeof buildSceneLayoutDelivery>>,
  owner: string,
): ReadonlyMap<string, Uint8Array> {
  const chunk = delivery.manifest.chunks.find(
    (candidate) => candidate.id === owner,
  );
  if (!chunk) throw new Error(`Expected chunk: ${owner}.`);
  if (!chunk.metadata) return new Map();
  const bytes = delivery.files.get(chunk.metadata.path);
  if (!bytes) throw new Error(`Missing metadata ZIP: ${chunk.metadata.path}.`);
  return extractBoundedZip(bytes, {
    limits: {
      maxEntries: 100,
      maxCompressedBytes: 10_000_000,
      maxFileBytes: 10_000_000,
      maxTotalBytes: 10_000_000,
    },
    pathPolicy: { requireLowercase: true },
  });
}

async function image(
  width: number,
  height: number,
  background: string,
  format: "jpeg" | "png" | "webp" = "png",
): Promise<Uint8Array> {
  const pipeline = sharp({
    create: { width, height, channels: 4, background },
  });
  return new Uint8Array(
    await (
      format === "webp"
        ? pipeline.webp()
        : format === "jpeg"
          ? pipeline.jpeg()
          : pipeline.png()
    ).toBuffer(),
  );
}
