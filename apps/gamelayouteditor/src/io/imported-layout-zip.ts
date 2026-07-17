import {
  collectSceneLayoutAssetPaths,
  createSceneLayoutResource,
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
  type SceneLayoutResource,
} from "@slotclientengine/rendercore/scene-layout";
import { extractBoundedZip as extractSharedBoundedZip } from "@slotclientengine/browserartifactio";
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
  return extractSharedBoundedZip(zipBytes, {
    limits: LAYOUT_ZIP_LIMITS,
    pathPolicy: { requireLowercase: true },
  });
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
