import { createHash } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  allocateContentAddressedPath,
  createDeterministicZip,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  canonicalExtensionOfEditorAssetKey,
  serializeEditorAssetsMap,
  type EditorAssetsMapEntry,
  type EditorAssetsMapV1,
} from "@slotclientengine/editorresource";
import {
  createSceneLayoutDeliveryContentFilename,
  createSceneLayoutDeliveryManifestFilename,
  parseSceneLayoutDeliveryPoolFilename,
  parseSceneLayoutDeliveryManifest,
  type SceneLayoutDeliveryAssetV1,
  type SceneLayoutDeliveryAtlasV1,
  type SceneLayoutDeliveryChunkV1,
  type SceneLayoutDeliveryFrameV1,
  type SceneLayoutDeliveryManifestV2,
} from "@slotclientengine/rendercore/scene-layout/data";
import { inspectSymbolSpineAtlas } from "@slotclientengine/rendercore/symbol/data";
import { MaxRectsPacker } from "maxrects-packer/dist/maxrects-packer.mjs";
import sharp from "sharp";
import { createSceneLayoutAssetGroups } from "./asset-groups.js";
import { encodeStableJson } from "./reference-rewriter.js";
import type {
  AudioOptimizationResult,
  CwebpRunner,
  OptimizedLogicalAsset,
  ValidatedLayoutPackage,
  WrittenOptimizedPackage,
} from "./types.js";

interface DecodedImage {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly sourceByteLength: number;
  readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
}

export interface BuildSceneLayoutDeliveryOptions {
  readonly source: ValidatedLayoutPackage;
  readonly quality: number;
  readonly cwebpExecutable: string;
  readonly cwebpRunner: CwebpRunner;
  readonly maxAtlasSize: number;
  readonly atlasPadding: number;
  readonly atlasExtrude: number;
}

export interface BuiltSceneLayoutDelivery {
  readonly manifest: SceneLayoutDeliveryManifestV2;
  readonly manifestFilename: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly atlasCount: number;
  readonly atlasFrameCount: number;
  readonly externalAssetCount: number;
}

export async function buildSceneLayoutDelivery(
  options: BuildSceneLayoutDeliveryOptions,
): Promise<BuiltSceneLayoutDelivery> {
  assertDeliveryOptions(options);
  const cwebpVersion = await options.cwebpRunner.version(
    options.cwebpExecutable,
  );
  const groups = createIdentityAssetGroups(
    options.source,
    options.quality,
    cwebpVersion,
  );
  const ownerByKey = chooseAssetOwners(
    options.source,
    groups.initialAssets,
    groups.groups,
  );
  const spineTextures = collectSpineTextureKeys(options.source);
  const decodedByOwner = new Map<string, DecodedImage[]>();
  const external = new Map<
    string,
    {
      readonly owner: string;
      readonly bytes: Uint8Array;
      readonly mediaType: string;
      readonly sourceByteLength: number;
    }
  >();
  const metadata = new Map<
    string,
    {
      readonly owner: string;
      readonly bytes: Uint8Array;
      readonly mediaType: string;
    }
  >();
  for (const [key, entry] of [...options.source.sourceEntries].sort(
    ([a], [b]) => compare(a, b),
  )) {
    const owner = ownerByKey.get(key) ?? "initial";
    if (isRaster(entry.mediaType, key) && !spineTextures.has(key)) {
      const decoded = await decodeImage(
        key,
        entry.bytes,
        entry.mediaType,
        entry.byteLength,
      );
      if (
        decoded.width + options.atlasExtrude * 2 <= options.maxAtlasSize &&
        decoded.height + options.atlasExtrude * 2 <= options.maxAtlasSize
      ) {
        const list = decodedByOwner.get(owner) ?? [];
        list.push(decoded);
        decodedByOwner.set(owner, list);
        continue;
      }
    }
    if (isRaster(entry.mediaType, key)) {
      external.set(key, {
        owner,
        bytes: await encodeWebp({
          bytes: entry.bytes,
          sourceKey: key,
          quality: options.quality,
          executable: options.cwebpExecutable,
          runner: options.cwebpRunner,
        }),
        mediaType: "image/webp",
        sourceByteLength: entry.byteLength,
      });
      continue;
    }
    if (isMedia(entry.mediaType)) {
      external.set(key, {
        owner: "media",
        bytes: entry.bytes.slice(),
        mediaType: entry.mediaType,
        sourceByteLength: entry.byteLength,
      });
      continue;
    }
    metadata.set(key, {
      owner,
      bytes: entry.bytes.slice(),
      mediaType: entry.mediaType,
    });
  }

  const files = new Map<string, Uint8Array>();
  const atlasRecords: SceneLayoutDeliveryAtlasV1[] = [];
  const assetRoutes: Record<string, SceneLayoutDeliveryAssetV1> = {};
  const chunkState = new Map<
    string,
    {
      metadata: Map<string, Uint8Array>;
      atlases: string[];
      externalAssets: string[];
    }
  >();
  const ensureChunk = (owner: string) => {
    const current = chunkState.get(owner);
    if (current) return current;
    const created = {
      metadata: new Map<string, Uint8Array>(),
      atlases: [],
      externalAssets: [],
    };
    chunkState.set(owner, created);
    return created;
  };
  ensureChunk("initial");
  for (const mode of options.source.manifest.gameModes!.modes)
    if (mode.id !== options.source.manifest.gameModes!.initialMode)
      ensureChunk(`mode:${mode.id}`);

  const mapEntries: Record<string, EditorAssetsMapEntry> = {};
  const metadataRecords = await Promise.all(
    [...metadata].map(async ([key, value]) => {
      const sha256 = await sha256Hex(value.bytes);
      return Object.freeze({
        key,
        value,
        sha256,
        path: allocateContentAddressedPath({
          digest: sha256,
          extension: canonicalExtensionOfEditorAssetKey(key),
        }),
      });
    }),
  );
  const metadataOwnerByPath = new Map<string, string>();
  for (const record of metadataRecords) {
    const current = metadataOwnerByPath.get(record.path);
    if (
      current === undefined ||
      compareOwnerPriority(options.source, record.value.owner, current) < 0
    )
      metadataOwnerByPath.set(record.path, record.value.owner);
  }
  for (const { key, value, path, sha256 } of metadataRecords) {
    const owner = metadataOwnerByPath.get(path)!;
    ensureChunk(owner).metadata.set(path, value.bytes);
    mapEntries[key] = {
      path,
      sha256,
      mediaType: value.mediaType,
      byteLength: value.bytes.byteLength,
    };
    assetRoutes[key] = {
      kind: "metadata",
      owner,
      chunk: owner,
      entry: path,
      sha256,
      byteLength: value.bytes.byteLength,
      mediaType: value.mediaType,
    };
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), "gamelayoutpkg-atlas-"));
  try {
    for (const [owner, images] of [...decodedByOwner].sort(([a], [b]) =>
      compare(a, b),
    )) {
      const packed = packImages(images, options);
      for (const [index, bin] of packed.entries()) {
        const atlasId = `atlas-${ownerSlug(owner)}-${index}`;
        const rendered = renderAtlas(bin, options.atlasExtrude);
        const pngPath = join(temporaryRoot, `${atlasId}.png`);
        const webpPath = join(temporaryRoot, `${atlasId}.webp`);
        await sharp(rendered.bytes, {
          raw: { width: rendered.width, height: rendered.height, channels: 4 },
        })
          .png()
          .toFile(pngPath);
        await options.cwebpRunner.encode({
          executable: options.cwebpExecutable,
          quality: options.quality,
          inputPath: pngPath,
          outputPath: webpPath,
        });
        const webp = new Uint8Array(await readFile(webpPath));
        assertWebp(webp, atlasId);
        const sha256 = await sha256Hex(webp);
        const packagePath = allocateContentAddressedPath({
          digest: sha256,
          extension: "webp",
        });
        const path = createSceneLayoutDeliveryContentFilename({
          sha256,
          extension: "webp",
        });
        setDeliveryFile(files, path, webp);
        const frames: Record<string, SceneLayoutDeliveryFrameV1> = {};
        for (const frame of rendered.frames) {
          frames[frame.key] = frame.frame;
          mapEntries[frame.key] = {
            path: packagePath,
            sha256,
            mediaType: "image/webp",
            byteLength: webp.byteLength,
          };
          assetRoutes[frame.key] = {
            kind: "atlas-frame",
            owner,
            atlas: atlasId,
            sourceByteLength: frame.sourceByteLength,
            mediaType: frame.mediaType,
          };
        }
        atlasRecords.push(
          Object.freeze({
            id: atlasId,
            owner,
            image: Object.freeze({
              path,
              sha256,
              byteLength: webp.byteLength,
              mediaType: "image/webp" as const,
              width: rendered.width,
              height: rendered.height,
            }),
            frames: Object.freeze(frames),
          }),
        );
        ensureChunk(owner).atlases.push(atlasId);
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }

  for (const [key, value] of external) {
    const sha256 = await sha256Hex(value.bytes);
    const extension = extensionForMedia(key, value.mediaType);
    const packagePath = allocateContentAddressedPath({
      digest: sha256,
      extension,
    });
    const path = createSceneLayoutDeliveryContentFilename({
      sha256,
      extension,
    });
    setDeliveryFile(files, path, value.bytes);
    mapEntries[key] = {
      path: packagePath,
      sha256,
      mediaType: value.mediaType,
      byteLength: value.bytes.byteLength,
    };
    assetRoutes[key] = {
      kind: "external",
      owner: value.owner,
      sourceByteLength: value.sourceByteLength,
      path,
      sha256,
      byteLength: value.bytes.byteLength,
      mediaType: value.mediaType,
    };
    ensureChunk(value.owner).externalAssets.push(key);
  }

  const assetsMap: EditorAssetsMapV1 = Object.freeze({
    version: 1,
    kind: "editor-assets",
    files: Object.freeze(mapEntries),
  });
  const initial = ensureChunk("initial");
  initial.metadata.set(
    "layout.manifest.json",
    encodeStableJson(options.source.manifest),
  );
  initial.metadata.set("assets.map.json", serializeEditorAssetsMap(assetsMap));

  const ownerOrder = orderOwners(options.source, chunkState.keys());
  const chunkRecords: SceneLayoutDeliveryChunkV1[] = [];
  for (const owner of ownerOrder) {
    const state = ensureChunk(owner);
    let metadataFile: SceneLayoutDeliveryChunkV1["metadata"] = null;
    if (state.metadata.size > 0) {
      const zip = createDeterministicZip(state.metadata, {
        level: 9,
        pathPolicy: { requireLowercase: true },
      });
      const sha256 = await sha256Hex(zip);
      const path = createSceneLayoutDeliveryContentFilename({
        sha256,
        extension: "zip",
      });
      setDeliveryFile(files, path, zip);
      metadataFile = Object.freeze({
        path,
        sha256,
        byteLength: zip.byteLength,
        mediaType: "application/zip",
      });
    }
    const dependencies = ownerDependencies(owner, groups.groups, ownerByKey);
    chunkRecords.push(
      Object.freeze({
        id: owner,
        owner,
        dependencies: Object.freeze(dependencies),
        metadata: metadataFile,
        atlases: Object.freeze([...state.atlases].sort(compare)),
        externalAssets: Object.freeze([...state.externalAssets].sort(compare)),
      }),
    );
  }
  const parsedManifest = parseSceneLayoutDeliveryManifest({
    version: 2,
    kind: "scene-layout-delivery",
    layoutId: options.source.manifest.id,
    initialMode: options.source.manifest.gameModes!.initialMode,
    initialChunk: "initial",
    chunks: chunkRecords,
    atlases: atlasRecords.sort((a, b) => compare(a.id, b.id)),
    assets: Object.fromEntries(
      Object.entries(assetRoutes).sort(([a], [b]) => compare(a, b)),
    ),
  });
  if (parsedManifest.version !== 2)
    throw new Error(
      "内部错误：CDN delivery builder 未生成 version 2 manifest。",
    );
  const manifest = parsedManifest;
  const manifestBytes = encodeStableJson(manifest);
  const manifestFilename = createSceneLayoutDeliveryManifestFilename(
    await sha256Hex(manifestBytes),
  );
  setDeliveryFile(files, manifestFilename, manifestBytes);
  return Object.freeze({
    manifest,
    manifestFilename,
    files: new Map(files),
    atlasCount: atlasRecords.length,
    atlasFrameCount: Object.values(assetRoutes).filter(
      (asset) => asset.kind === "atlas-frame",
    ).length,
    externalAssetCount: external.size,
  });
}

export async function commitSceneLayoutDeliveryDirectory(options: {
  readonly outputDirectory: string;
  readonly delivery: BuiltSceneLayoutDelivery;
}): Promise<{
  readonly createdFileCount: number;
  readonly reusedFileCount: number;
}> {
  await ensureDeliveryPoolDirectory(options.outputDirectory);
  const existing = await inspectDeliveryPoolDirectory(options.outputDirectory);
  const candidates = orderedDeliveryFiles(options.delivery);
  let reusedFileCount = 0;
  for (const [filename, bytes] of candidates) {
    if (!existing.has(filename)) continue;
    await assertDeliveryFileEquals(
      join(options.outputDirectory, filename),
      filename,
      bytes,
    );
    reusedFileCount += 1;
  }
  const stage = await mkdtemp(
    join(dirname(options.outputDirectory), ".gamelayout-delivery-"),
  );
  let createdFileCount = 0;
  try {
    for (const [filename, bytes] of candidates) {
      if (existing.has(filename)) continue;
      const staged = join(stage, filename);
      await writeFile(staged, bytes, { flag: "wx" });
      const target = join(options.outputDirectory, filename);
      try {
        await link(staged, target);
        createdFileCount += 1;
      } catch (error) {
        if ((error as { readonly code?: string }).code !== "EEXIST")
          throw error;
        await assertDeliveryFileEquals(target, filename, bytes);
        reusedFileCount += 1;
      }
    }
  } finally {
    await rm(stage, { recursive: true, force: true }).catch(() => undefined);
  }
  return Object.freeze({ createdFileCount, reusedFileCount });
}

export async function checkSceneLayoutDeliveryDirectory(options: {
  readonly outputDirectory: string;
  readonly delivery: BuiltSceneLayoutDelivery;
}): Promise<void> {
  const actual = await inspectDeliveryPoolDirectory(options.outputDirectory);
  for (const [filename, bytes] of orderedDeliveryFiles(options.delivery)) {
    if (!actual.has(filename))
      throw new Error(`交付目录缺少当前 delivery 文件：${filename}`);
    await assertDeliveryFileEquals(
      join(options.outputDirectory, filename),
      filename,
      bytes,
    );
  }
}

async function ensureDeliveryPoolDirectory(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error(`交付路径必须是普通目录：${root}`);
}

async function inspectDeliveryPoolDirectory(
  root: string,
): Promise<ReadonlySet<string>> {
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error(`交付路径必须是普通目录：${root}`);
  const entries = await readdir(root, { withFileTypes: true });
  const files = new Set<string>();
  for (const entry of entries) {
    if (!entry.isFile())
      throw new Error(`交付目录只能包含扁平普通文件：${entry.name}`);
    try {
      parseSceneLayoutDeliveryPoolFilename(entry.name);
    } catch (error) {
      throw new Error(
        `交付目录包含非法文件名 ${entry.name}：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    files.add(entry.name);
  }
  return files;
}

function orderedDeliveryFiles(
  delivery: BuiltSceneLayoutDelivery,
): readonly (readonly [string, Uint8Array])[] {
  const payload = [...delivery.files]
    .filter(([filename]) => filename !== delivery.manifestFilename)
    .sort(([left], [right]) => compare(left, right));
  const manifestBytes = delivery.files.get(delivery.manifestFilename);
  if (!manifestBytes)
    throw new Error(
      `delivery files 缺少 manifest：${delivery.manifestFilename}`,
    );
  return Object.freeze([
    ...payload,
    [delivery.manifestFilename, manifestBytes] as const,
  ]);
}

async function assertDeliveryFileEquals(
  target: string,
  filename: string,
  expected: Uint8Array,
): Promise<void> {
  const info = await lstat(target);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error(`交付文件不是普通文件：${filename}`);
  const actual = new Uint8Array(await readFile(target));
  if (!equalBytes(actual, expected))
    throw new Error(`交付目录同名文件内容不一致：${filename}`);
}

function setDeliveryFile(
  files: Map<string, Uint8Array>,
  filename: string,
  bytes: Uint8Array,
): void {
  parseSceneLayoutDeliveryPoolFilename(filename);
  const existing = files.get(filename);
  if (existing && !equalBytes(existing, bytes))
    throw new Error(`delivery physical filename collision：${filename}`);
  if (!existing) files.set(filename, bytes);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index])
  );
}

function createIdentityAssetGroups(
  source: ValidatedLayoutPackage,
  quality: number,
  cwebpVersion: string,
) {
  const assets = new Map<string, OptimizedLogicalAsset>();
  const keyMapping = new Map<string, string>();
  for (const [key, entry] of source.sourceEntries) {
    keyMapping.set(key, key);
    assets.set(key, {
      key,
      sourceKey: key,
      bytes: entry.bytes,
      sourceByteLength: entry.byteLength,
      converted: false,
      mediaType: entry.mediaType,
    });
  }
  const output: WrittenOptimizedPackage = {
    zipBytes: source.zipBytes,
    assetsMap: source.assetsMap,
    assets,
  };
  const audioOptimization: AudioOptimizationResult = {
    keyMapping,
    assets,
    ffmpegVersion: null,
    ffprobeVersion: null,
    convertedAudioCount: 0,
    inputAudioBytes: 0,
    outputAudioBytes: 0,
  };
  return createSceneLayoutAssetGroups({
    manifest: source.manifest,
    files: source.files,
    sourceZipBytes: source.zipBytes.byteLength,
    output,
    quality,
    cwebpVersion,
    convertedImageCount: 0,
    audioOptimization,
    audioOptions: {
      ffmpegExecutable: "unused",
      ffprobeExecutable: "unused",
      bgmBitrateKbps: 128,
      effectMonoBitrateKbps: 64,
      effectStereoBitrateKbps: 96,
    },
  });
}

function chooseAssetOwners(
  source: ValidatedLayoutPackage,
  initialAssets: readonly string[],
  groups: ReturnType<typeof createIdentityAssetGroups>["groups"],
): ReadonlyMap<string, string> {
  const initial = new Set(initialAssets);
  const modeOrder = source.manifest.gameModes!.modes.map((mode) => mode.id);
  const owners = new Map<string, string>();
  for (const key of source.sourceEntries.keys()) {
    if (initial.has(key)) {
      owners.set(key, "initial");
      continue;
    }
    const candidates = new Set<string>();
    for (const group of groups) {
      if (!group.requiredAssets.includes(key)) continue;
      if (group.kind === "mode" || group.kind === "transition")
        candidates.add(group.kind === "mode" ? group.modeId : group.ownerMode);
      else if (group.kind === "symbols" || group.kind === "award-celebration")
        for (const modeId of group.usedByModes) candidates.add(modeId);
      else if (group.kind === "spine-popup")
        for (const transitionId of group.usedByTransitions) {
          const transition = groups.find(
            (candidate) =>
              candidate.kind === "transition" && candidate.id === transitionId,
          );
          if (transition?.kind === "transition")
            candidates.add(transition.ownerMode);
        }
    }
    const mode = modeOrder.find((modeId) => candidates.has(modeId));
    if (mode) {
      owners.set(key, `mode:${mode}`);
      continue;
    }
    owners.set(key, "initial");
  }
  return owners;
}

function ownerDependencies(
  owner: string,
  groups: ReturnType<typeof createIdentityAssetGroups>["groups"],
  ownerByKey: ReadonlyMap<string, string>,
): readonly string[] {
  if (owner === "initial" || owner === "media") return Object.freeze([]);
  void groups;
  void ownerByKey;
  return Object.freeze(["initial"]);
}

function orderOwners(
  source: ValidatedLayoutPackage,
  values: Iterable<string>,
): readonly string[] {
  const owners = new Set(values);
  const preferred = [
    "initial",
    ...source.manifest.gameModes!.modes.map((mode) => `mode:${mode.id}`),
  ];
  return Object.freeze([
    ...preferred.filter((owner) => owners.delete(owner)),
    ...[...owners].sort(compare),
  ]);
}

function compareOwnerPriority(
  source: ValidatedLayoutPackage,
  left: string,
  right: string,
): number {
  if (left === right) return 0;
  const ordered = orderOwners(source, [left, right]);
  return ordered[0] === left ? -1 : 1;
}

function packImages(
  images: readonly DecodedImage[],
  options: BuildSceneLayoutDeliveryOptions,
) {
  const packer = new MaxRectsPacker(
    options.maxAtlasSize,
    options.maxAtlasSize,
    options.atlasPadding,
    {
      smart: true,
      pot: false,
      square: false,
      allowRotation: true,
      border: options.atlasPadding,
    },
  );
  for (const image of [...images].sort((a, b) => compare(a.key, b.key)))
    packer.add(
      image.width + options.atlasExtrude * 2,
      image.height + options.atlasExtrude * 2,
      image,
    );
  for (const bin of packer.bins)
    for (const rect of bin.rects)
      if (rect.oversized)
        throw new Error(
          `图片无法装入 atlas：${(rect.data as DecodedImage).key}`,
        );
  return packer.bins;
}

function renderAtlas(
  bin: ReturnType<typeof packImages>[number],
  extrude: number,
): {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly {
    key: string;
    frame: SceneLayoutDeliveryFrameV1;
    sourceByteLength: number;
    mediaType: DecodedImage["mediaType"];
  }[];
} {
  const bytes = new Uint8Array(bin.width * bin.height * 4);
  const frames = [...bin.rects]
    .sort((a, b) =>
      compare((a.data as DecodedImage).key, (b.data as DecodedImage).key),
    )
    .map((rect) => {
      const image = rect.data as DecodedImage;
      const storedWidth = rect.rot ? image.height : image.width;
      const storedHeight = rect.rot ? image.width : image.height;
      for (let y = -extrude; y < storedHeight + extrude; y++)
        for (let x = -extrude; x < storedWidth + extrude; x++) {
          const storedX = clamp(x, 0, storedWidth - 1);
          const storedY = clamp(y, 0, storedHeight - 1);
          const sourceX = rect.rot ? storedY : storedX;
          const sourceY = rect.rot ? image.height - 1 - storedX : storedY;
          const sourceOffset = (sourceY * image.width + sourceX) * 4;
          const targetX = rect.x + extrude + x;
          const targetY = rect.y + extrude + y;
          const targetOffset = (targetY * bin.width + targetX) * 4;
          bytes.set(
            image.bytes.subarray(sourceOffset, sourceOffset + 4),
            targetOffset,
          );
        }
      return Object.freeze({
        key: image.key,
        frame: Object.freeze({
          x: rect.x + extrude,
          y: rect.y + extrude,
          width: storedWidth,
          height: storedHeight,
          sourceWidth: image.width,
          sourceHeight: image.height,
          rotated: rect.rot,
        }),
        sourceByteLength: image.sourceByteLength,
        mediaType: image.mediaType,
      });
    });
  return Object.freeze({
    bytes,
    width: bin.width,
    height: bin.height,
    frames: Object.freeze(frames),
  });
}

async function decodeImage(
  key: string,
  bytes: Uint8Array,
  mediaType: string,
  sourceByteLength: number,
): Promise<DecodedImage> {
  const decoded = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    decoded.info.channels !== 4 ||
    decoded.info.width <= 0 ||
    decoded.info.height <= 0
  )
    throw new Error(`图片无法解码为 RGBA：${key}`);
  return Object.freeze({
    key,
    bytes: new Uint8Array(decoded.data),
    width: decoded.info.width,
    height: decoded.info.height,
    sourceByteLength,
    mediaType: mediaType as DecodedImage["mediaType"],
  });
}

async function encodeWebp(options: {
  bytes: Uint8Array;
  sourceKey: string;
  quality: number;
  executable: string;
  runner: CwebpRunner;
}): Promise<Uint8Array> {
  if (options.sourceKey.toLowerCase().endsWith(".webp"))
    return options.bytes.slice();
  const root = await mkdtemp(join(tmpdir(), "gamelayoutpkg-webp-"));
  try {
    const input = join(
      root,
      `input.${canonicalExtensionOfEditorAssetKey(options.sourceKey)}`,
    );
    const output = join(root, "output.webp");
    await writeFile(input, options.bytes);
    await options.runner.encode({
      executable: options.executable,
      quality: options.quality,
      inputPath: input,
      outputPath: output,
    });
    const bytes = new Uint8Array(await readFile(output));
    assertWebp(bytes, options.sourceKey);
    return bytes;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function collectSpineTextureKeys(
  source: ValidatedLayoutPackage,
): ReadonlySet<string> {
  const result = new Set<string>();
  const knownKeys = new Set(source.sourceEntries.keys());
  for (const [key, entry] of source.sourceEntries) {
    if (key.toLowerCase().endsWith(".atlas")) {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        entry.bytes,
      );
      for (const page of inspectSymbolSpineAtlas(text).pageNames) {
        if (knownKeys.has(page)) result.add(page);
        const matches = [...knownKeys].filter(
          (candidate) => basename(candidate) === basename(page),
        );
        if (matches.length === 1) result.add(matches[0]!);
      }
    }
    if (!key.toLowerCase().endsWith(".json")) continue;
    try {
      collectTypedSpineTextures(
        JSON.parse(new TextDecoder().decode(entry.bytes)),
        result,
      );
    } catch {
      // Package validation owns JSON validity; non-JSON skeleton payloads are ignored here.
    }
  }
  collectTypedSpineTextures(source.manifest, result);
  return result;
}

function collectTypedSpineTextures(value: unknown, result: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTypedSpineTextures(item, result);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (
    record.kind === "spine" &&
    record.textures &&
    typeof record.textures === "object" &&
    !Array.isArray(record.textures)
  )
    for (const path of Object.values(
      record.textures as Record<string, unknown>,
    ))
      if (typeof path === "string") result.add(path);
  for (const child of Object.values(record))
    collectTypedSpineTextures(child, result);
}

function assertDeliveryOptions(options: BuildSceneLayoutDeliveryOptions): void {
  if (
    !Number.isSafeInteger(options.maxAtlasSize) ||
    options.maxAtlasSize < 256 ||
    options.maxAtlasSize > 8192
  )
    throw new Error("atlas max size 必须是 256..8192 的整数。");
  if (
    !Number.isSafeInteger(options.atlasPadding) ||
    options.atlasPadding < 0 ||
    options.atlasPadding > 32
  )
    throw new Error("atlas padding 必须是 0..32 的整数。");
  if (
    !Number.isSafeInteger(options.atlasExtrude) ||
    options.atlasExtrude < 0 ||
    options.atlasExtrude > 16
  )
    throw new Error("atlas extrude 必须是 0..16 的整数。");
}

function isRaster(
  mediaType: string,
  key: string,
): mediaType is DecodedImage["mediaType"] {
  const extension = canonicalExtensionOfEditorAssetKey(key);
  return (
    (mediaType === "image/png" && extension === "png") ||
    (mediaType === "image/jpeg" &&
      (extension === "jpg" || extension === "jpeg")) ||
    (mediaType === "image/webp" && extension === "webp")
  );
}

function isMedia(mediaType: string): boolean {
  return mediaType.startsWith("audio/") || mediaType.startsWith("video/");
}

function extensionForMedia(key: string, mediaType: string): string {
  if (mediaType === "image/webp") return "webp";
  return canonicalExtensionOfEditorAssetKey(key);
}

function ownerSlug(owner: string): string {
  const slug = owner
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  const suffix = createHash("sha256").update(owner).digest("hex").slice(0, 8);
  return `${slug || "chunk"}-${suffix}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertWebp(bytes: Uint8Array, label: string): void {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.slice(from, to));
  if (
    bytes.byteLength < 12 ||
    ascii(0, 4) !== "RIFF" ||
    ascii(8, 12) !== "WEBP"
  )
    throw new Error(`WebP 输出无效：${label}`);
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
