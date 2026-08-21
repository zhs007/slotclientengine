import {
  EDITOR_ASSETS_MAP_PATH,
  decodeEditorAssetsMap,
  resolveEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import type { Texture } from "pixi.js";
import { ImageStringError } from "./data/errors.js";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "./data/manifest.js";
import type { ImageStringManifestV1 } from "./data/types.js";
import {
  assertExactImageStringKeys,
  createImageStringResourceFromResolvedFiles,
  type DecodeImageStringImage,
} from "./core/resource.js";
import type { ImageStringResource } from "./core/types.js";

export function validateImageStringPackageContents(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): ImageStringManifestV1 {
  const manifest = parseImageStringManifest(options.manifest);
  assertExactImageStringKeys(
    [...options.files.keys()].sort(),
    [
      "image-string.manifest.json",
      ...collectImageStringAssetPaths(manifest),
    ].sort(),
    "image-string package files",
  );
  return manifest;
}

export async function resolveImageStringPackageFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): Promise<{
  readonly manifest: ImageStringManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly mapped: boolean;
}> {
  const manifest = parseImageStringManifest(options.manifest);
  const references = collectImageStringAssetPaths(manifest);
  const filenameKeyPackage = references.every((path) => !path.includes("/"));
  const hasMap = options.files.has(EDITOR_ASSETS_MAP_PATH);
  if (filenameKeyPackage !== hasMap)
    throw new ImageStringError(
      filenameKeyPackage
        ? "filename-key image-string package 缺少 assets.map.json。"
        : "legacy image-string package 不得混入 assets.map.json。",
    );
  if (!hasMap) {
    const rootBytes = options.files.get("image-string.manifest.json");
    if (!rootBytes)
      throw new ImageStringError(
        "image-string package 缺少 image-string.manifest.json。",
      );
    const exact = new Map<string, Uint8Array>([
      ["image-string.manifest.json", rootBytes.slice()],
    ]);
    for (const key of references) {
      const bytes = options.files.get(key);
      if (!bytes) throw new ImageStringError(`image-string asset 缺失：${key}`);
      exact.set(key, bytes.slice());
    }
    validateImageStringPackageContents({ manifest, files: exact });
    return Object.freeze({ manifest, files: exact, mapped: false });
  }
  const map = decodeEditorAssetsMap(options.files.get(EDITOR_ASSETS_MAP_PATH)!);
  const resolved = resolveEditorAssetsMapPackage({
    map,
    files: options.files,
    keys: references,
  });
  const rootBytes = options.files.get("image-string.manifest.json");
  if (!rootBytes)
    throw new ImageStringError(
      "image-string package 缺少 image-string.manifest.json。",
    );
  const virtual = new Map<string, Uint8Array>([
    ["image-string.manifest.json", rootBytes.slice()],
  ]);
  for (const key of references) virtual.set(key, resolved.get(key)!.bytes);
  return Object.freeze({ manifest, files: virtual, mapped: true });
}

export async function createImageStringResourceFromFiles(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}): Promise<ImageStringResource> {
  const manifestValue =
    options.manifest ??
    parseManifestBytes(options.files.get("image-string.manifest.json"));
  const resolved = await resolveImageStringPackageFiles({
    manifest: manifestValue,
    files: options.files,
  });
  return createImageStringResourceFromResolvedFiles({
    manifest: resolved.manifest,
    files: resolved.files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
  });
}

export async function loadImageStringResourceFromUrl(options: {
  readonly manifestUrl: string | URL;
  readonly fetchImpl?: typeof fetch;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}): Promise<ImageStringResource> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function")
    throw new ImageStringError(
      "fetchImpl is required to load image-string URL.",
    );
  const manifestUrl = new URL(options.manifestUrl);
  if (manifestUrl.protocol !== "http:" && manifestUrl.protocol !== "https:")
    throw new ImageStringError(
      "image-string manifest URL 必须使用 http 或 https。",
    );
  const rootBytes = new Uint8Array(
    await (await fetchRequired(fetchImpl, manifestUrl)).arrayBuffer(),
  );
  const manifest = parseImageStringManifest(parseManifestBytes(rootBytes));
  const references = collectImageStringAssetPaths(manifest);
  const filenameKeyPackage = references.every((path) => !path.includes("/"));
  const remoteMap = filenameKeyPackage
    ? await loadRemoteEditorAssetMap(fetchImpl, manifestUrl)
    : undefined;
  const files = new Map<string, Uint8Array>([
    ["image-string.manifest.json", rootBytes],
  ]);
  for (const reference of references) {
    const mapped = remoteMap?.get(reference);
    if (filenameKeyPackage && !mapped)
      throw new ImageStringError(
        `assets map 未声明 image-string glyph：${reference}`,
      );
    const response = await fetchRequired(
      fetchImpl,
      resolveContainedUrl(manifestUrl, mapped?.path ?? reference),
    );
    files.set(reference, new Uint8Array(await response.arrayBuffer()));
  }
  return createImageStringResourceFromResolvedFiles({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
  });
}

interface RemoteEditorAsset {
  readonly path: string;
  readonly mediaType: string;
}

async function loadRemoteEditorAssetMap(
  fetchImpl: typeof fetch,
  manifestUrl: URL,
): Promise<ReadonlyMap<string, RemoteEditorAsset>> {
  const response = await fetchRequired(
    fetchImpl,
    resolveContainedUrl(manifestUrl, EDITOR_ASSETS_MAP_PATH),
  );
  try {
    const map = decodeEditorAssetsMap(
      new Uint8Array(await response.arrayBuffer()),
    );
    return new Map(Object.entries(map.files));
  } catch (error) {
    throw new ImageStringError(formatError(error));
  }
}

function parseManifestBytes(bytes: Uint8Array | undefined): unknown {
  if (!bytes)
    throw new ImageStringError(
      "image-string package 缺少 image-string.manifest.json。",
    );
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new ImageStringError(
      `image-string manifest JSON 无效：${formatError(error)}`,
    );
  }
}

async function fetchRequired(
  fetchImpl: typeof fetch,
  url: URL,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new ImageStringError(`请求失败 ${url.href}：${formatError(error)}`);
  }
  if (!response.ok)
    throw new ImageStringError(`请求失败 ${url.href}：HTTP ${response.status}`);
  return response;
}

function resolveContainedUrl(manifestUrl: URL, path: string): URL {
  const base = new URL("./", manifestUrl);
  const result = new URL(path, base);
  if (
    result.origin !== base.origin ||
    !result.pathname.startsWith(base.pathname)
  )
    throw new ImageStringError(`image-string 资源逃出 manifest 目录：${path}`);
  return result;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
