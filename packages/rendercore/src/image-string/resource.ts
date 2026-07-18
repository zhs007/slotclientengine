import { ObjectUrlRegistry } from "@slotclientengine/browserartifactio";
import { Assets, Texture } from "pixi.js";
import { ImageStringError } from "./errors.js";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "./manifest.js";
import type { ImageStringManifestV1, ImageStringResource } from "./types.js";

export type ImageStringImageModule = string | Texture;
export type DecodeImageStringImage = (
  blob: Blob,
  path: string,
) => Promise<{ readonly width: number; readonly height: number }>;

export function validateImageStringPackageContents(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): ImageStringManifestV1 {
  const manifest = parseImageStringManifest(options.manifest);
  const expected = [
    "image-string.manifest.json",
    ...collectImageStringAssetPaths(manifest),
  ].sort();
  const actual = [...options.files.keys()].sort();
  assertExactKeys(actual, expected, "image-string package files");
  return manifest;
}

export async function createImageStringResource(options: {
  readonly manifest: unknown;
  readonly imageModules: Readonly<Record<string, ImageStringImageModule>>;
  readonly ownedObjectUrls?: ObjectUrlRegistry;
  readonly ownTextures?: boolean;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}): Promise<ImageStringResource> {
  const manifest = parseImageStringManifest(options.manifest);
  const expected = collectImageStringAssetPaths(manifest);
  assertExactKeys(
    Object.keys(options.imageModules).sort(),
    [...expected].sort(),
    "image-string imageModules",
  );
  const textures: Record<string, Texture> = {};
  const ownedTextures = new Set<Texture>();
  const ownedAssetUrls = new Set<string>();
  const loading = expected.map(async (path) => {
    const module = options.imageModules[path];
    if (module instanceof Texture) {
      textures[path] = module;
      if (options.ownTextures) ownedTextures.add(module);
    } else if (typeof module === "string" && module.length > 0) {
      const texture = await (options.loadTexture
        ? options.loadTexture(module, path)
        : Assets.load<Texture>({
            src: module,
            parser: "loadTextures",
          }));
      textures[path] = texture;
      if (options.ownTextures !== false) {
        if (options.loadTexture) ownedTextures.add(texture);
        else ownedAssetUrls.add(module);
      }
    } else {
      throw new ImageStringError(
        `image-string imageModules 缺少有效资源：${path}`,
      );
    }
  });
  try {
    await Promise.all(loading);
  } catch (error) {
    await Promise.allSettled(loading);
    await releaseOwnedResources(
      ownedAssetUrls,
      ownedTextures,
      options.ownedObjectUrls,
    );
    throw imageStringError(error);
  }
  let destroyed = false;
  let destroyPromise: Promise<void> | null = null;
  return Object.freeze({
    manifest,
    textures: Object.freeze(textures),
    get destroyed(): boolean {
      return destroyed;
    },
    assertUsable(): void {
      if (destroyed)
        throw new ImageStringError(
          `image-string resource "${manifest.id}" 已销毁。`,
        );
    },
    destroy(): Promise<void> {
      if (destroyPromise) return destroyPromise;
      destroyed = true;
      destroyPromise = releaseOwnedResources(
        ownedAssetUrls,
        ownedTextures,
        options.ownedObjectUrls,
      );
      return destroyPromise;
    },
  });
}

async function releaseOwnedResources(
  assetUrls: ReadonlySet<string>,
  textures: ReadonlySet<Texture>,
  objectUrls: ObjectUrlRegistry | undefined,
): Promise<void> {
  try {
    if (assetUrls.size > 0) await Assets.unload([...assetUrls].sort());
  } finally {
    for (const texture of textures) texture.destroy(false);
    objectUrls?.destroy();
  }
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
  const manifest = validateImageStringPackageContents({
    manifest: manifestValue,
    files: options.files,
  });
  const registry = new ObjectUrlRegistry();
  const imageModules: Record<string, string> = {};
  try {
    for (const [character, glyph] of Object.entries(manifest.glyphs)) {
      const bytes = options.files.get(glyph.path)!;
      const blob = new Blob([copyArrayBuffer(bytes)], {
        type: mimeTypeForPath(glyph.path),
      });
      const decoded = await (options.decodeImage ?? decodeBrowserImage)(
        blob,
        glyph.path,
      );
      assertDecodedSize(
        decoded,
        glyph.size,
        `glyph ${JSON.stringify(character)} (${glyph.path})`,
      );
      imageModules[glyph.path] = registry.create(blob);
    }
    return await createImageStringResource({
      manifest,
      imageModules,
      ownedObjectUrls: registry,
      ownTextures: true,
      loadTexture: options.loadTexture,
    });
  } catch (error) {
    registry.destroy();
    throw imageStringError(error);
  }
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
  const manifestResponse = await fetchRequired(fetchImpl, manifestUrl);
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(await manifestResponse.text());
  } catch (error) {
    throw new ImageStringError(
      `image-string manifest JSON 无效：${formatError(error)}`,
    );
  }
  const manifest = parseImageStringManifest(manifestValue);
  const registry = new ObjectUrlRegistry();
  const modules: Record<string, string> = {};
  try {
    for (const [character, glyph] of Object.entries(manifest.glyphs)) {
      const assetUrl = resolveContainedUrl(manifestUrl, glyph.path);
      const response = await fetchRequired(fetchImpl, assetUrl);
      const blob = await response.blob();
      const decoded = await (options.decodeImage ?? decodeBrowserImage)(
        blob,
        glyph.path,
      );
      assertDecodedSize(
        decoded,
        glyph.size,
        `glyph ${JSON.stringify(character)} (${glyph.path})`,
      );
      modules[glyph.path] = registry.create(blob);
    }
    return await createImageStringResource({
      manifest,
      imageModules: modules,
      ownedObjectUrls: registry,
      ownTextures: true,
      loadTexture: options.loadTexture,
    });
  } catch (error) {
    registry.destroy();
    throw imageStringError(error);
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

async function decodeBrowserImage(
  blob: Blob,
  path: string,
): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch (error) {
      throw new ImageStringError(`图片解码失败 ${path}：${formatError(error)}`);
    }
  }
  if (typeof Image === "undefined")
    throw new ImageStringError(`图片解码器不可用：${path}`);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () =>
        reject(new ImageStringError(`图片解码失败：${path}`));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function assertDecodedSize(
  actual: { readonly width: number; readonly height: number },
  expected: { readonly width: number; readonly height: number },
  label: string,
): void {
  if (
    !Number.isSafeInteger(actual.width) ||
    !Number.isSafeInteger(actual.height) ||
    actual.width !== expected.width ||
    actual.height !== expected.height
  )
    throw new ImageStringError(
      `${label} 尺寸不匹配：声明 ${expected.width}x${expected.height}，实际 ${actual.width}x${actual.height}。`,
    );
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

function mimeTypeForPath(path: string): string {
  return path.endsWith(".webp") ? "image/webp" : "image/png";
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function assertExactKeys(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const missing = expected.filter((path) => !actual.includes(path));
  const extra = actual.filter((path) => !expected.includes(path));
  if (missing.length || extra.length)
    throw new ImageStringError(
      `${label} 必须精确匹配资源闭包。缺少：[${missing.join(", ")}]；多余：[${extra.join(", ")}]。`,
    );
}

function imageStringError(error: unknown): ImageStringError {
  return error instanceof ImageStringError
    ? error
    : new ImageStringError(formatError(error));
}
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
