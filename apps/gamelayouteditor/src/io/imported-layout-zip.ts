import {
  collectSceneLayoutPackagePaths,
  createSceneLayoutPackageResource,
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
  type SceneLayoutPackageResource,
  type SceneLayoutResource,
} from "@slotclientengine/rendercore/scene-layout";
import { extractBoundedZip as extractSharedBoundedZip } from "@slotclientengine/browserartifactio";

export const LAYOUT_ZIP_LIMITS = Object.freeze({
  maxEntries: 4096,
  maxCompressedBytes: 200 * 1024 * 1024,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 500 * 1024 * 1024,
});

export interface ImportedLayoutPackage {
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly resource: SceneLayoutResource;
  readonly packageResource: SceneLayoutPackageResource;
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
  if (!manifestBytes)
    throw new Error("zip 根目录必须包含 layout.manifest.json。");
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(decodeUtf8(manifestBytes));
  } catch (error) {
    throw new Error(`layout.manifest.json 无效：${formatError(error)}`);
  }
  const manifest = parseSceneLayoutManifest(rawManifest);
  collectSceneLayoutPackagePaths({ manifest, files });
  const assets = new Map(
    [...files.entries()]
      .filter(([path]) => path !== "layout.manifest.json")
      .map(([path, bytes]) => [path, bytes.slice()] as const),
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
  collectSceneLayoutPackagePaths({ manifest, files: assets });
  if (options.decodeImage) {
    for (const node of manifest.nodes) {
      if (node.resource.kind !== "image") continue;
      const bytes = assets.get(node.resource.path)!;
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: mimeType(node.resource.path) }),
      );
      try {
        const decoded = await options.decodeImage(url);
        if (
          decoded.width !== node.resource.size.width ||
          decoded.height !== node.resource.size.height
        ) {
          throw new Error(
            `图片尺寸漂移 ${node.resource.path}：声明 ${node.resource.size.width}x${node.resource.size.height}，实际 ${decoded.width}x${decoded.height}。`,
          );
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }
  const packageResource = await createSceneLayoutPackageResource({
    manifest,
    files: assets,
    ...(options.decodeImage
      ? {
          decodeImage: async (blob: Blob) => {
            const url = URL.createObjectURL(blob);
            try {
              return await options.decodeImage!(url);
            } finally {
              URL.revokeObjectURL(url);
            }
          },
        }
      : {}),
  });
  let destroyed = false;
  return Object.freeze({
    manifest,
    assets,
    resource: packageResource.layout,
    packageResource,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      packageResource.destroy();
    },
  });
}

export function extractBoundedZip(
  zipBytes: Uint8Array,
): Map<string, Uint8Array> {
  return extractSharedBoundedZip(zipBytes, {
    limits: LAYOUT_ZIP_LIMITS,
    pathPolicy: { requireLowercase: true },
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
