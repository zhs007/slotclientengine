import { Assets, Cache, Texture } from "pixi.js";
import { ImageStringError } from "../data/errors.js";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "../data/manifest.js";
import { getCompiledImageStringResource } from "./compiled.js";
import type { ImageStringResource } from "./types.js";

export type ImageStringImageModule = string | Texture;
export type DecodeImageStringImage = (
  blob: Blob,
  path: string,
) => Promise<{ readonly width: number; readonly height: number }>;

interface ObjectUrlOwner {
  destroy(): void;
}

export async function createImageStringResource(options: {
  readonly manifest: unknown;
  readonly imageModules: Readonly<Record<string, ImageStringImageModule>>;
  readonly ownedObjectUrls?: ObjectUrlOwner;
  readonly ownTextures?: boolean;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}): Promise<ImageStringResource> {
  const manifest = parseImageStringManifest(options.manifest);
  const expected = collectImageStringAssetPaths(manifest);
  assertExactImageStringKeys(
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
      return;
    }
    if (typeof module !== "string" || module.length === 0)
      throw new ImageStringError(
        `image-string imageModules 缺少有效资源：${path}`,
      );
    const texture =
      module.startsWith("scene-layout-delivery:") && Cache.has(module)
        ? Cache.get<Texture>(module)
        : await (options.loadTexture
            ? options.loadTexture(module, path)
            : Assets.load<Texture>({ src: module, parser: "loadTextures" }));
    textures[path] = texture;
    if (options.ownTextures !== false) {
      if (options.loadTexture) ownedTextures.add(texture);
      else ownedAssetUrls.add(module);
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
  const resource: ImageStringResource = Object.freeze({
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
  getCompiledImageStringResource(resource);
  return resource;
}

/** Creates a runtime resource from an already verified exact glyph closure. */
export async function createImageStringResourceFromResolvedFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
  readonly resolveAssetUrl?: (path: string) => string | undefined;
}): Promise<ImageStringResource> {
  const manifest = parseImageStringManifest(options.manifest);
  assertExactImageStringKeys(
    [...options.files.keys()].sort(),
    [
      "image-string.manifest.json",
      ...collectImageStringAssetPaths(manifest),
    ].sort(),
    "resolved image-string files",
  );
  const objectUrls = new LocalObjectUrlOwner();
  const imageModules: Record<string, string> = {};
  const externallyResolved = new Set<string>();
  try {
    for (const [character, glyph] of Object.entries(manifest.glyphs)) {
      const resolvedUrl = options.resolveAssetUrl?.(glyph.path);
      if (resolvedUrl) {
        imageModules[glyph.path] = resolvedUrl;
        externallyResolved.add(glyph.path);
        continue;
      }
      const blob = new Blob([copyArrayBuffer(options.files.get(glyph.path)!)], {
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
      imageModules[glyph.path] = objectUrls.create(blob);
    }
    const resource = await createImageStringResource({
      manifest,
      imageModules,
      ownedObjectUrls: objectUrls,
      ownTextures: options.resolveAssetUrl ? false : true,
      loadTexture: options.loadTexture,
    });
    for (const [character, glyph] of Object.entries(manifest.glyphs)) {
      if (!externallyResolved.has(glyph.path)) continue;
      assertDecodedSize(
        resource.textures[glyph.path]!,
        glyph.size,
        `glyph ${JSON.stringify(character)} (${glyph.path})`,
      );
    }
    return resource;
  } catch (error) {
    objectUrls.destroy();
    throw imageStringError(error);
  }
}

export function assertExactImageStringKeys(
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

class LocalObjectUrlOwner implements ObjectUrlOwner {
  readonly #urls = new Set<string>();
  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.#urls.add(url);
    return url;
  }
  destroy(): void {
    for (const url of this.#urls) URL.revokeObjectURL(url);
    this.#urls.clear();
  }
}

async function releaseOwnedResources(
  assetUrls: ReadonlySet<string>,
  textures: ReadonlySet<Texture>,
  objectUrls: ObjectUrlOwner | undefined,
): Promise<void> {
  try {
    if (assetUrls.size > 0) await Assets.unload([...assetUrls].sort());
  } finally {
    for (const texture of textures) texture.destroy(false);
    objectUrls?.destroy();
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

function mimeTypeForPath(path: string): string {
  return path.endsWith(".webp") ? "image/webp" : "image/png";
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function imageStringError(error: unknown): ImageStringError {
  return error instanceof ImageStringError
    ? error
    : new ImageStringError(formatError(error));
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
