import { assertCanonicalPackagePath } from "@slotclientengine/browserartifactio";
import { SceneLayoutError } from "../errors.js";

export const SCENE_LAYOUT_DELIVERY_MANIFEST_V1 = "delivery.manifest.json";
export const SCENE_LAYOUT_DELIVERY_MANIFEST = SCENE_LAYOUT_DELIVERY_MANIFEST_V1;

const SHA256_PATTERN = "[0-9a-f]{64}";
const CONTENT_FILENAME_PATTERN = new RegExp(
  `^(${SHA256_PATTERN})\\.([a-z0-9]+)$`,
  "u",
);

export interface SceneLayoutDeliveryFileV1 {
  readonly path: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly mediaType: string;
}

export interface SceneLayoutDeliveryFrameV1 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly rotated: boolean;
}

export interface SceneLayoutDeliveryAtlasV1 {
  readonly id: string;
  readonly owner: string;
  readonly image: SceneLayoutDeliveryFileV1 & {
    readonly mediaType: "image/webp";
    readonly width: number;
    readonly height: number;
  };
  readonly frames: Readonly<Record<string, SceneLayoutDeliveryFrameV1>>;
}

export interface SceneLayoutDeliveryChunkV1 {
  readonly id: string;
  readonly owner: string;
  readonly dependencies: readonly string[];
  readonly metadata: SceneLayoutDeliveryFileV1 | null;
  readonly atlases: readonly string[];
  readonly externalAssets: readonly string[];
}

export type SceneLayoutDeliveryAssetV1 =
  | {
      readonly kind: "metadata";
      readonly owner: string;
      readonly chunk: string;
      readonly entry: string;
      readonly sha256: string;
      readonly byteLength: number;
      readonly mediaType: string;
    }
  | {
      readonly kind: "atlas-frame";
      readonly owner: string;
      readonly atlas: string;
      readonly sourceByteLength: number;
      readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
    }
  | ({
      readonly kind: "external";
      readonly owner: string;
      readonly sourceByteLength: number;
    } & SceneLayoutDeliveryFileV1);

export type SceneLayoutDeliveryFileV2 = SceneLayoutDeliveryFileV1;
export type SceneLayoutDeliveryFrameV2 = SceneLayoutDeliveryFrameV1;
export type SceneLayoutDeliveryAtlasV2 = SceneLayoutDeliveryAtlasV1;
export type SceneLayoutDeliveryChunkV2 = SceneLayoutDeliveryChunkV1;
export type SceneLayoutDeliveryAssetV2 = SceneLayoutDeliveryAssetV1;

export interface SceneLayoutDeliveryManifestV1 {
  readonly version: 1;
  readonly kind: "scene-layout-delivery";
  readonly layoutId: string;
  readonly initialMode: string;
  readonly initialChunk: string;
  readonly chunks: readonly SceneLayoutDeliveryChunkV1[];
  readonly atlases: readonly SceneLayoutDeliveryAtlasV1[];
  readonly assets: Readonly<Record<string, SceneLayoutDeliveryAssetV1>>;
}

export interface SceneLayoutDeliveryManifestV2 {
  readonly version: 2;
  readonly kind: "scene-layout-delivery";
  readonly layoutId: string;
  readonly initialMode: string;
  readonly initialChunk: string;
  readonly chunks: readonly SceneLayoutDeliveryChunkV2[];
  readonly atlases: readonly SceneLayoutDeliveryAtlasV2[];
  readonly assets: Readonly<Record<string, SceneLayoutDeliveryAssetV2>>;
}

export type SceneLayoutDeliveryManifest =
  | SceneLayoutDeliveryManifestV1
  | SceneLayoutDeliveryManifestV2;

export interface SceneLayoutDeliveryPoolFilename {
  readonly kind: "content";
  readonly sha256: string;
  readonly extension: string;
}

export function createSceneLayoutDeliveryContentFilename(options: {
  readonly sha256: string;
  readonly extension: string;
}): string {
  const sha256 = hash(options.sha256, "delivery content sha256");
  if (!/^[a-z0-9]+$/u.test(options.extension))
    fail("delivery content extension must be lowercase alphanumeric");
  return `${sha256}.${options.extension}`;
}

export function parseSceneLayoutDeliveryPoolFilename(
  value: string,
): SceneLayoutDeliveryPoolFilename {
  if (typeof value !== "string" || value.includes("/"))
    fail("delivery pool filename must be one path segment");
  const content = CONTENT_FILENAME_PATTERN.exec(value);
  if (content)
    return Object.freeze({
      kind: "content",
      sha256: content[1]!,
      extension: content[2]!,
    });
  fail(`delivery pool filename is invalid: ${value}`);
}

export function parseSceneLayoutDeliveryManifest(
  value: unknown,
): SceneLayoutDeliveryManifest {
  const root = record(value, "Scene Layout delivery manifest");
  known(
    root,
    [
      "version",
      "kind",
      "layoutId",
      "initialMode",
      "initialChunk",
      "chunks",
      "atlases",
      "assets",
    ],
    "Scene Layout delivery manifest",
  );
  if (
    (root.version !== 1 && root.version !== 2) ||
    root.kind !== "scene-layout-delivery"
  )
    fail('must declare version=1|2 and kind="scene-layout-delivery"');
  const version = root.version;
  const layoutId = nonEmpty(root.layoutId, "layoutId");
  const initialMode = nonEmpty(root.initialMode, "initialMode");
  const initialChunk = nonEmpty(root.initialChunk, "initialChunk");
  const chunks = array(root.chunks, "chunks").map((chunk, index) =>
    parseChunk(chunk, index, version),
  );
  unique(
    chunks.map((chunk) => chunk.id),
    "chunk id",
  );
  unique(
    chunks.map((chunk) => chunk.owner),
    "chunk owner",
  );
  for (const chunk of chunks)
    if (chunk.id !== chunk.owner)
      fail(`chunk ${chunk.id} id must equal its owner`);
  const chunkIds = new Set(chunks.map((chunk) => chunk.id));
  if (!chunkIds.has(initialChunk))
    fail(`references unknown initialChunk ${initialChunk}`);
  if (!chunks.find((chunk) => chunk.id === initialChunk)?.metadata)
    fail(`initialChunk ${initialChunk} must contain metadata`);
  for (const chunk of chunks)
    for (const dependency of chunk.dependencies)
      if (!chunkIds.has(dependency))
        fail(`${chunk.id} references unknown dependency ${dependency}`);
      else if (dependency === chunk.id)
        fail(`${chunk.id} must not depend on itself`);
  assertAcyclicChunks(chunks);
  const atlases = array(root.atlases, "atlases").map((atlas, index) =>
    parseAtlas(atlas, index, version),
  );
  unique(
    atlases.map((atlas) => atlas.id),
    "atlas id",
  );
  const atlasIds = new Set(atlases.map((atlas) => atlas.id));
  const declaredAtlases: string[] = [];
  for (const chunk of chunks)
    for (const atlas of chunk.atlases)
      if (!atlasIds.has(atlas))
        fail(`${chunk.id} references unknown atlas ${atlas}`);
      else {
        declaredAtlases.push(atlas);
        if (
          atlases.find((candidate) => candidate.id === atlas)!.owner !==
          chunk.owner
        )
          fail(`${chunk.id} declares atlas ${atlas} owned by another chunk`);
      }
  unique(declaredAtlases, "declared atlas");
  if (declaredAtlases.length !== atlases.length)
    fail("every atlas must be declared by exactly one chunk");
  const assetsValue = record(root.assets, "assets");
  const assets: Record<string, SceneLayoutDeliveryAssetV1> = {};
  for (const [key, asset] of Object.entries(assetsValue)) {
    safeLogicalPath(key, `asset key ${key}`);
    assets[key] = parseAsset(asset, key, chunkIds, atlasIds, version);
  }
  for (const atlas of atlases)
    for (const key of Object.keys(atlas.frames)) {
      const asset = assets[key];
      if (!asset || asset.kind !== "atlas-frame" || asset.atlas !== atlas.id)
        fail(`atlas ${atlas.id} frame ${key} has no matching asset route`);
    }
  for (const [key, asset] of Object.entries(assets)) {
    if (!chunkIds.has(asset.owner))
      fail(`asset ${key} references unknown owner ${asset.owner}`);
    if (asset.kind === "metadata" && asset.chunk !== asset.owner)
      fail(`metadata asset ${key} chunk must equal its owner`);
    if (asset.kind === "atlas-frame") {
      const atlas = atlases.find((candidate) => candidate.id === asset.atlas)!;
      if (atlas.owner !== asset.owner)
        fail(`atlas asset ${key} owner does not match ${asset.atlas}`);
      if (!atlas.frames[key])
        fail(`atlas asset ${key} has no frame in ${asset.atlas}`);
    }
  }
  const metadataOwnerByEntry = new Map<string, string>();
  for (const [key, asset] of Object.entries(assets)) {
    if (asset.kind !== "metadata") continue;
    const owner = metadataOwnerByEntry.get(asset.entry);
    if (owner !== undefined && owner !== asset.owner)
      fail(
        `metadata entry ${asset.entry} is assigned to multiple owners: ${owner}, ${asset.owner} (asset ${key})`,
      );
    metadataOwnerByEntry.set(asset.entry, asset.owner);
  }
  const declaredExternal: string[] = [];
  for (const chunk of chunks)
    for (const key of chunk.externalAssets) {
      const asset = assets[key];
      if (!asset || asset.kind !== "external" || asset.owner !== chunk.owner)
        fail(`${chunk.id} external asset ${key} has no matching route`);
      declaredExternal.push(key);
    }
  unique(declaredExternal, "declared external asset");
  const externalCount = Object.values(assets).filter(
    (asset) => asset.kind === "external",
  ).length;
  if (declaredExternal.length !== externalCount)
    fail("every external asset must be declared by exactly one chunk");
  return Object.freeze({
    version,
    kind: "scene-layout-delivery",
    layoutId,
    initialMode,
    initialChunk,
    chunks: Object.freeze(chunks),
    atlases: Object.freeze(atlases),
    assets: Object.freeze(assets),
  }) as SceneLayoutDeliveryManifest;
}

function assertAcyclicChunks(
  chunks: readonly SceneLayoutDeliveryChunkV1[],
): void {
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail(`chunk dependency cycle includes ${id}`);
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependencies) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const chunk of chunks) visit(chunk.id);
}

function parseChunk(
  value: unknown,
  index: number,
  version: 1 | 2,
): SceneLayoutDeliveryChunkV1 {
  const item = record(value, `chunks[${index}]`);
  known(
    item,
    ["id", "owner", "dependencies", "metadata", "atlases", "externalAssets"],
    `chunks[${index}]`,
  );
  return Object.freeze({
    id: nonEmpty(item.id, `chunks[${index}].id`),
    owner: nonEmpty(item.owner, `chunks[${index}].owner`),
    dependencies: strings(item.dependencies, `chunks[${index}].dependencies`),
    metadata:
      item.metadata === null
        ? null
        : parseFile(item.metadata, `chunks[${index}].metadata`, version, "zip"),
    atlases: strings(item.atlases, `chunks[${index}].atlases`),
    externalAssets: strings(
      item.externalAssets,
      `chunks[${index}].externalAssets`,
    ),
  });
}

function parseAtlas(
  value: unknown,
  index: number,
  version: 1 | 2,
): SceneLayoutDeliveryAtlasV1 {
  const item = record(value, `atlases[${index}]`);
  known(item, ["id", "owner", "image", "frames"], `atlases[${index}]`);
  const imageValue = record(item.image, `atlases[${index}].image`);
  known(
    imageValue,
    ["path", "sha256", "byteLength", "mediaType", "width", "height"],
    `atlases[${index}].image`,
  );
  if (imageValue.mediaType !== "image/webp")
    fail(`atlases[${index}].image.mediaType must be image/webp`);
  const framesValue = record(item.frames, `atlases[${index}].frames`);
  const frames: Record<string, SceneLayoutDeliveryFrameV1> = {};
  for (const [key, raw] of Object.entries(framesValue)) {
    safeLogicalPath(key, `atlas frame ${key}`);
    const frame = record(raw, `atlas frame ${key}`);
    known(
      frame,
      ["x", "y", "width", "height", "sourceWidth", "sourceHeight", "rotated"],
      `atlas frame ${key}`,
    );
    if (typeof frame.rotated !== "boolean")
      fail(`atlas frame ${key}.rotated must be boolean`);
    frames[key] = Object.freeze({
      x: integer(frame.x, `atlas frame ${key}.x`, true),
      y: integer(frame.y, `atlas frame ${key}.y`, true),
      width: integer(frame.width, `atlas frame ${key}.width`),
      height: integer(frame.height, `atlas frame ${key}.height`),
      sourceWidth: integer(frame.sourceWidth, `atlas frame ${key}.sourceWidth`),
      sourceHeight: integer(
        frame.sourceHeight,
        `atlas frame ${key}.sourceHeight`,
      ),
      rotated: frame.rotated,
    });
  }
  return Object.freeze({
    id: nonEmpty(item.id, `atlases[${index}].id`),
    owner: nonEmpty(item.owner, `atlases[${index}].owner`),
    image: Object.freeze({
      ...parseFile(imageValue, `atlases[${index}].image`, version, "webp"),
      mediaType: "image/webp",
      width: integer(imageValue.width, `atlases[${index}].image.width`),
      height: integer(imageValue.height, `atlases[${index}].image.height`),
    }),
    frames: Object.freeze(frames),
  });
}

function parseAsset(
  value: unknown,
  key: string,
  chunks: ReadonlySet<string>,
  atlases: ReadonlySet<string>,
  version: 1 | 2,
): SceneLayoutDeliveryAssetV1 {
  const item = record(value, `asset ${key}`);
  const kind = item.kind;
  const owner = nonEmpty(item.owner, `asset ${key}.owner`);
  if (kind === "metadata") {
    known(
      item,
      ["kind", "owner", "chunk", "entry", "sha256", "byteLength", "mediaType"],
      `asset ${key}`,
    );
    const chunk = nonEmpty(item.chunk, `asset ${key}.chunk`);
    if (!chunks.has(chunk))
      fail(`asset ${key} references unknown chunk ${chunk}`);
    const entry = safePath(
      nonEmpty(item.entry, `asset ${key}.entry`),
      `asset ${key}.entry`,
    );
    return Object.freeze({
      kind,
      owner,
      chunk,
      entry,
      sha256: hash(item.sha256, `asset ${key}.sha256`),
      byteLength: integer(item.byteLength, `asset ${key}.byteLength`, true),
      mediaType: nonEmpty(item.mediaType, `asset ${key}.mediaType`),
    });
  }
  if (kind === "atlas-frame") {
    known(
      item,
      ["kind", "owner", "atlas", "sourceByteLength", "mediaType"],
      `asset ${key}`,
    );
    const atlas = nonEmpty(item.atlas, `asset ${key}.atlas`);
    if (!atlases.has(atlas))
      fail(`asset ${key} references unknown atlas ${atlas}`);
    if (
      !new Set(["image/png", "image/jpeg", "image/webp"]).has(
        String(item.mediaType),
      )
    )
      fail(`asset ${key}.mediaType is invalid`);
    return Object.freeze({
      kind,
      owner,
      atlas,
      sourceByteLength: integer(
        item.sourceByteLength,
        `asset ${key}.sourceByteLength`,
        true,
      ),
      mediaType: item.mediaType as "image/png" | "image/jpeg" | "image/webp",
    });
  }
  if (kind === "external") {
    known(
      item,
      [
        "kind",
        "owner",
        "sourceByteLength",
        "path",
        "sha256",
        "byteLength",
        "mediaType",
      ],
      `asset ${key}`,
    );
    return Object.freeze({
      kind,
      owner,
      sourceByteLength: integer(
        item.sourceByteLength,
        `asset ${key}.sourceByteLength`,
        true,
      ),
      ...parseFile(
        item,
        `asset ${key}`,
        version,
        version === 2
          ? externalExtension(key, String(item.mediaType))
          : undefined,
      ),
    });
  }
  fail(`asset ${key}.kind is invalid`);
}

function parseFile(
  value: unknown,
  label: string,
  version: 1 | 2,
  requiredExtension?: string,
): SceneLayoutDeliveryFileV1 {
  const item = record(value, label);
  const sha256 = hash(item.sha256, `${label}.sha256`);
  const path = safePath(nonEmpty(item.path, `${label}.path`), `${label}.path`);
  if (version === 2) {
    const parsed = parseSceneLayoutDeliveryPoolFilename(path);
    if (parsed.sha256 !== sha256)
      fail(`${label}.path hash must equal ${label}.sha256`);
    if (requiredExtension && parsed.extension !== requiredExtension)
      fail(`${label}.path extension must be ${requiredExtension}`);
  }
  return Object.freeze({
    path,
    sha256,
    byteLength: integer(item.byteLength, `${label}.byteLength`, true),
    mediaType: nonEmpty(item.mediaType, `${label}.mediaType`),
  });
}

function externalExtension(key: string, mediaType: string): string {
  if (mediaType === "image/webp") return "webp";
  const index = key.lastIndexOf(".");
  const extension = index < 0 ? "" : key.slice(index + 1).toLowerCase();
  if (!/^[a-z0-9]+$/u.test(extension))
    fail(`external asset ${key} must have a canonical extension`);
  return extension;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function strings(value: unknown, label: string): readonly string[] {
  const result = array(value, label).map((item, index) =>
    nonEmpty(item, `${label}[${index}]`),
  );
  unique(result, label);
  return Object.freeze(result);
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    fail(`${label} must be a non-empty string`);
  return value;
}

function integer(value: unknown, label: string, allowZero = false): number {
  if (
    !Number.isSafeInteger(value) ||
    (allowZero ? (value as number) < 0 : (value as number) <= 0)
  )
    fail(
      `${label} must be ${allowZero ? "a non-negative" : "a positive"} safe integer`,
    );
  return value as number;
}

function hash(value: unknown, label: string): string {
  const result = nonEmpty(value, label);
  if (!/^[0-9a-f]{64}$/u.test(result))
    fail(`${label} must be lowercase SHA-256`);
  return result;
}

function safePath(path: string, label: string): string {
  try {
    assertCanonicalPackagePath(path, { requireLowercase: true });
  } catch (error) {
    throw new SceneLayoutError(`${label} is unsafe: ${formatError(error)}`);
  }
  return path;
}

function safeLogicalPath(path: string, label: string): string {
  try {
    assertCanonicalPackagePath(path);
  } catch (error) {
    throw new SceneLayoutError(`${label} is unsafe: ${formatError(error)}`);
  }
  return path;
}

function known(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) fail(`${label} has unknown fields: ${unknown.join(",")}`);
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    fail(`${label} contains duplicates`);
}

function fail(message: string): never {
  throw new SceneLayoutError(`Scene Layout delivery manifest ${message}.`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
