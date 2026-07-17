import {
  collectSceneLayoutAssetPaths,
  createSceneLayoutResource,
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
  type SceneLayoutResource,
} from "@slotclientengine/rendercore/scene-layout";
import { Unzip, UnzipInflate } from "fflate";
import { assertCanonicalPackagePath } from "./filename-policy.js";
import { ObjectUrlRegistry } from "./object-url-registry.js";

export const LAYOUT_ZIP_LIMITS = Object.freeze({
  maxEntries: 256,
  maxCompressedBytes: 50 * 1024 * 1024,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
});

export interface ImportedLayoutPackage {
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly resource: SceneLayoutResource;
  destroy(): void;
}

export async function importLayoutZip(
  zipBytes: Uint8Array,
  options: {
    readonly decodeImage?: (
      url: string,
    ) => Promise<{ readonly width: number; readonly height: number }>;
  } = {},
): Promise<ImportedLayoutPackage> {
  const files = extractBoundedZip(zipBytes);
  const manifestBytes = files.get("layout.manifest.json");
  if (!manifestBytes) {
    throw new Error("zip 根目录必须包含 layout.manifest.json。");
  }
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(decodeUtf8(manifestBytes));
  } catch (error) {
    throw new Error(`layout.manifest.json 无效：${formatError(error)}`);
  }
  const manifest = parseSceneLayoutManifest(rawManifest);
  const closure = collectSceneLayoutAssetPaths(manifest);
  const actualAssets = [...files.keys()]
    .filter((path) => path !== "layout.manifest.json")
    .sort();
  if (JSON.stringify(actualAssets) !== JSON.stringify([...closure].sort())) {
    throw new Error(
      `zip 文件必须与 manifest 资源闭包精确一致；expected=${closure.join(",")}, actual=${actualAssets.join(",")}。`,
    );
  }
  const assets = new Map(
    closure.map((path) => [path, files.get(path)!.slice()] as const),
  );
  return validateLayoutAssets(manifest, assets, options);
}

export async function validateLayoutAssets(
  manifestValue: SceneLayoutManifestV1,
  assets: ReadonlyMap<string, Uint8Array>,
  options: {
    readonly decodeImage?: (
      url: string,
    ) => Promise<{ readonly width: number; readonly height: number }>;
  } = {},
): Promise<ImportedLayoutPackage> {
  const manifest = parseSceneLayoutManifest(manifestValue);
  const closure = collectSceneLayoutAssetPaths(manifest);
  const actual = [...assets.keys()].sort();
  if (JSON.stringify(actual) !== JSON.stringify([...closure].sort())) {
    throw new Error("assets 必须与 manifest 资源闭包精确一致。");
  }
  const urls = new ObjectUrlRegistry();
  const imageModules: Record<string, string> = {};
  const skeletonModules: Record<string, unknown> = {};
  const atlasModules: Record<string, string> = {};
  const textureModules: Record<string, string> = {};
  const imageSpecs = new Map<
    string,
    { readonly width: number; readonly height: number }
  >();
  const kinds = classifyPaths(manifest);
  try {
    for (const path of closure) {
      assertCanonicalPackagePath(path);
      const bytes = assets.get(path)!;
      const kind = kinds.get(path);
      if (kind === "skeleton") {
        skeletonModules[path] = JSON.parse(decodeUtf8(bytes));
      } else if (kind === "atlas") {
        atlasModules[path] = decodeUtf8(bytes);
      } else {
        const url = urls.create(
          new Blob([bytes as BlobPart], { type: mimeType(path) }),
        );
        if (kind === "image") imageModules[path] = url;
        else textureModules[path] = url;
      }
    }
    for (const node of manifest.nodes) {
      if (node.resource.kind === "image") {
        imageSpecs.set(node.resource.path, node.resource.size);
      }
    }
    const decodeImage = options.decodeImage ?? decodeBrowserImage;
    for (const [path, url] of Object.entries({
      ...imageModules,
      ...textureModules,
    })) {
      const decoded = await decodeImage(url);
      const declared = imageSpecs.get(path);
      if (
        declared &&
        (decoded.width !== declared.width || decoded.height !== declared.height)
      ) {
        throw new Error(
          `图片尺寸漂移 ${path}：声明 ${declared.width}x${declared.height}，实际 ${decoded.width}x${decoded.height}。`,
        );
      }
    }
    const resource = createSceneLayoutResource({
      manifest,
      imageModules,
      skeletonModules,
      atlasModules,
      textureModules,
    });
    let destroyed = false;
    return Object.freeze({
      manifest,
      assets,
      resource,
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        resource.destroy();
        urls.destroy();
      },
    });
  } catch (error) {
    urls.destroy();
    throw error;
  }
}

export function extractBoundedZip(
  zipBytes: Uint8Array,
): Map<string, Uint8Array> {
  if (!(zipBytes instanceof Uint8Array))
    throw new Error("zip 数据必须是 Uint8Array。");
  if (zipBytes.byteLength > LAYOUT_ZIP_LIMITS.maxCompressedBytes) {
    throw new Error("zip 压缩文件超过 50 MiB 上限。");
  }
  const files = new Map<string, Uint8Array>();
  let entryCount = 0;
  let totalBytes = 0;
  let failure: Error | null = null;
  const unzip = new Unzip((file) => {
    if (failure) return;
    try {
      entryCount += 1;
      if (entryCount > LAYOUT_ZIP_LIMITS.maxEntries) {
        throw new Error("zip entry 数超过 256 上限。");
      }
      if (file.name.endsWith("/")) {
        assertDirectoryPath(file.name);
        file.ondata = (error) => {
          if (error && !failure) {
            failure = new Error(
              `zip 目录 entry 解压失败 ${file.name}：${formatError(error)}`,
            );
          }
        };
        file.start();
        return;
      }
      assertCanonicalPackagePath(file.name);
      if (files.has(file.name)) throw new Error(`zip 路径重复：${file.name}`);
      if (
        file.originalSize !== undefined &&
        file.originalSize > LAYOUT_ZIP_LIMITS.maxFileBytes
      ) {
        throw new Error(`zip 单文件超过 20 MiB 上限：${file.name}`);
      }
      const chunks: Uint8Array[] = [];
      let fileBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (failure) return;
        if (error) {
          failure = new Error(
            `zip 解压失败 ${file.name}：${formatError(error)}`,
          );
          return;
        }
        fileBytes += chunk.byteLength;
        totalBytes += chunk.byteLength;
        if (fileBytes > LAYOUT_ZIP_LIMITS.maxFileBytes) {
          failure = new Error(`zip 单文件超过 20 MiB 上限：${file.name}`);
          file.terminate();
          return;
        }
        if (totalBytes > LAYOUT_ZIP_LIMITS.maxTotalBytes) {
          failure = new Error("zip 总解压尺寸超过 100 MiB 上限。");
          file.terminate();
          return;
        }
        chunks.push(chunk.slice());
        if (final) files.set(file.name, joinChunks(chunks, fileBytes));
      };
      file.start();
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      file.terminate();
    }
  });
  unzip.register(UnzipInflate);
  try {
    unzip.push(zipBytes, true);
  } catch (error) {
    throw failure ?? new Error(`zip 结构无效：${formatError(error)}`);
  }
  if (failure) throw failure;
  return files;
}

function classifyPaths(manifest: SceneLayoutManifestV1) {
  const result = new Map<string, "image" | "skeleton" | "atlas" | "texture">();
  for (const node of manifest.nodes) {
    const resource = node.resource;
    if (resource.kind === "image") result.set(resource.path, "image");
    else {
      result.set(resource.skeleton, "skeleton");
      result.set(resource.atlas, "atlas");
      for (const path of Object.values(resource.textures)) {
        result.set(path, "texture");
      }
    }
  }
  return result;
}

function decodeBrowserImage(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`图片无法解码：${url}`));
    image.src = url;
  });
}

function assertDirectoryPath(path: string): void {
  const trimmed = path.slice(0, -1);
  if (!trimmed) throw new Error("zip 不允许根目录 entry。");
  assertCanonicalPackagePath(trimmed);
}

function joinChunks(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function mimeType(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
