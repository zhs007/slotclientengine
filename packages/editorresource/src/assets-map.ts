import {
  allocateContentAddressedPath,
  assertCanonicalPackagePath,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  assertEditorAssetKey,
  assertUniqueEditorAssetKeys,
  canonicalExtensionOfEditorAssetKey,
  type EditorAssetKey,
} from "./key.js";

export const EDITOR_ASSETS_MAP_PATH = "assets.map.json";

export interface EditorAssetsMapEntry {
  readonly path: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly byteLength: number;
}

export interface EditorAssetsMapV1 {
  readonly version: 1;
  readonly kind: "editor-assets";
  readonly files: Readonly<Record<EditorAssetKey, EditorAssetsMapEntry>>;
}

export interface ResolvedEditorAsset extends EditorAssetsMapEntry {
  readonly key: EditorAssetKey;
  readonly bytes: Uint8Array;
}

export function parseEditorAssetsMap(value: unknown): EditorAssetsMapV1 {
  const root = record(value, "assets map");
  exactKeys(root, ["version", "kind", "files"], "assets map");
  if (root.version !== 1 || root.kind !== "editor-assets")
    throw new Error("assets map version/kind 无效。");
  const rawFiles = record(root.files, "assets map files");
  const keys = Object.keys(rawFiles);
  assertUniqueEditorAssetKeys(keys);
  const files: Record<string, EditorAssetsMapEntry> = {};
  for (const key of keys.sort((a, b) => a.localeCompare(b, "en"))) {
    const raw = record(rawFiles[key], `assets map files.${key}`);
    exactKeys(
      raw,
      ["path", "sha256", "mediaType", "byteLength"],
      `assets map files.${key}`,
    );
    if (typeof raw.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(raw.sha256))
      throw new Error(
        `assets map ${key}.sha256 必须是完整 lowercase SHA-256。`,
      );
    if (typeof raw.path !== "string")
      throw new Error(`assets map ${key}.path 必须是字符串。`);
    assertCanonicalPackagePath(raw.path, { requireLowercase: true });
    const extension = canonicalExtensionOfEditorAssetKey(key);
    const expected = allocateContentAddressedPath({
      digest: raw.sha256,
      extension,
    });
    if (raw.path !== expected)
      throw new Error(`assets map ${key}.path 与 sha256/扩展名不一致。`);
    if (typeof raw.mediaType !== "string" || !raw.mediaType.includes("/"))
      throw new Error(`assets map ${key}.mediaType 无效。`);
    if (
      typeof raw.byteLength !== "number" ||
      !Number.isSafeInteger(raw.byteLength) ||
      raw.byteLength < 0
    )
      throw new Error(`assets map ${key}.byteLength 无效。`);
    files[key] = Object.freeze({
      path: raw.path,
      sha256: raw.sha256,
      mediaType: raw.mediaType,
      byteLength: raw.byteLength,
    });
  }
  return Object.freeze({
    version: 1,
    kind: "editor-assets",
    files: Object.freeze(files),
  });
}

export function serializeEditorAssetsMap(map: EditorAssetsMapV1): Uint8Array {
  const parsed = parseEditorAssetsMap(map);
  return new TextEncoder().encode(`${JSON.stringify(parsed, null, 2)}\n`);
}

export function decodeEditorAssetsMap(bytes: Uint8Array): EditorAssetsMapV1 {
  if (!(bytes instanceof Uint8Array))
    throw new Error("assets map bytes 必须是 Uint8Array。");
  try {
    return parseEditorAssetsMap(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch (error) {
    throw new Error(`assets.map.json 无效：${formatError(error)}`);
  }
}

export async function validateEditorAssetsMapPackage(options: {
  readonly map: EditorAssetsMapV1 | unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly allowControlPaths?: readonly string[];
}): Promise<ReadonlyMap<EditorAssetKey, ResolvedEditorAsset>> {
  const map = parseEditorAssetsMap(options.map);
  const payloadPaths = new Set(
    Object.values(map.files).map(({ path }) => path),
  );
  const allowed = new Set([
    EDITOR_ASSETS_MAP_PATH,
    ...(options.allowControlPaths ?? []),
  ]);
  for (const path of options.files.keys()) {
    assertCanonicalPackagePath(path);
    if (path.startsWith("assets/") && !payloadPaths.has(path))
      throw new Error(`assets map package 包含 orphan payload：${path}`);
    if (!path.startsWith("assets/") && !allowed.has(path))
      throw new Error(`assets map package 包含未声明 control file：${path}`);
  }
  const resolved = new Map<EditorAssetKey, ResolvedEditorAsset>();
  for (const [key, entry] of Object.entries(map.files)) {
    const bytes = options.files.get(entry.path);
    if (!bytes) throw new Error(`assets map payload 缺失：${entry.path}`);
    if (bytes.byteLength !== entry.byteLength)
      throw new Error(`assets map payload byteLength 不一致：${key}`);
    const digest = await sha256Hex(bytes);
    if (digest !== entry.sha256)
      throw new Error(`assets map payload SHA-256 不一致：${key}`);
    resolved.set(key, Object.freeze({ key, ...entry, bytes: bytes.slice() }));
  }
  return readonlyMap(resolved);
}

/**
 * Resolves an exported assets map for runtime consumption.
 *
 * Payload size, digest and package-closure checks belong to the exporter/build
 * checker. Runtime only requires the mapped payloads to exist.
 */
export function resolveEditorAssetsMapPackage(options: {
  readonly map: EditorAssetsMapV1 | unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): ReadonlyMap<EditorAssetKey, ResolvedEditorAsset> {
  const map = parseEditorAssetsMap(options.map);
  const resolved = new Map<EditorAssetKey, ResolvedEditorAsset>();
  for (const [key, entry] of Object.entries(map.files)) {
    const bytes = options.files.get(entry.path);
    if (!bytes) throw new Error(`assets map payload 缺失：${entry.path}`);
    resolved.set(key, Object.freeze({ key, ...entry, bytes: bytes.slice() }));
  }
  return readonlyMap(resolved);
}

export function resolveEditorAssetMapEntry(
  map: EditorAssetsMapV1,
  key: string,
): EditorAssetsMapEntry {
  assertEditorAssetKey(key);
  const entry = parseEditorAssetsMap(map).files[key];
  if (!entry) throw new Error(`assets map 未声明 filename key：${key}`);
  return entry;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} 必须是 object。`);
  return value as Record<string, unknown>;
}
function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  )
    throw new Error(`${label} fields 无效：${actual.join(", ")}`);
}
function readonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const copy = new Map(source);
  for (const method of ["set", "delete", "clear"] as const)
    Object.defineProperty(copy, method, {
      value: () => {
        throw new Error("只读 assets map 不可修改。");
      },
    });
  return copy;
}
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
