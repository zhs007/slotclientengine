import {
  collectSceneLayoutPackagePaths,
  createSceneLayoutPackageResourceFromResolvedFiles,
  parseSceneLayoutManifest,
  resolveSceneLayoutPackageFiles,
  type SceneLayoutManifestV1,
  type SceneLayoutPackageResource,
  type SceneLayoutResource,
} from "@slotclientengine/rendercore/scene-layout";
import {
  assertCanonicalPackagePath,
  extractBoundedZip as extractSharedBoundedZip,
} from "@slotclientengine/browserartifactio";
import { normalizeEditorPackageZipEntries } from "@slotclientengine/editorresource";

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
  readonly videoMetadata: ReadonlyMap<
    string,
    {
      readonly width: number;
      readonly height: number;
      readonly durationSeconds: number;
      readonly hasAudio: boolean | "unknown";
    }
  >;
  destroy(): void;
}

export async function importLayoutZip(
  zipBytes: Uint8Array,
  options: {
    readonly decodeImage?: (
      url: string,
    ) => Promise<{ readonly width: number; readonly height: number }>;
    readonly decodeVideo?: (url: string) => Promise<{
      readonly width: number;
      readonly height: number;
      readonly durationSeconds: number;
      readonly hasAudio: boolean | "unknown";
    }>;
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
  const resolvedFiles = await resolveSceneLayoutPackageFiles({
    manifest,
    files,
  });
  collectSceneLayoutPackagePaths({ manifest, files: resolvedFiles });
  const assets = new Map(
    [...resolvedFiles.entries()]
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
    readonly decodeVideo?: (url: string) => Promise<{
      readonly width: number;
      readonly height: number;
      readonly durationSeconds: number;
      readonly hasAudio: boolean | "unknown";
    }>;
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
  const videoMetadata = new Map<
    string,
    {
      readonly width: number;
      readonly height: number;
      readonly durationSeconds: number;
      readonly hasAudio: boolean | "unknown";
    }
  >();
  for (const transition of manifest.gameModes?.transitions ?? []) {
    const overlay = transition.overlay;
    if (!("fadeOutSeconds" in overlay)) continue;
    if (videoMetadata.has(overlay.resource.path)) continue;
    const decodeVideo = options.decodeVideo ?? decodeBrowserVideoUrl;
    const bytes = assets.get(overlay.resource.path)!;
    if (
      bytes.byteLength < 12 ||
      String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp"
    )
      throw new Error(
        `视频文件不是可识别的 ISO MP4（缺少 ftyp header）：${overlay.resource.path}`,
      );
    const url = URL.createObjectURL(
      new Blob([bytes as BlobPart], { type: "video/mp4" }),
    );
    try {
      const metadata = await decodeVideo(url);
      if (
        !Number.isSafeInteger(metadata.width) ||
        metadata.width <= 0 ||
        !Number.isSafeInteger(metadata.height) ||
        metadata.height <= 0 ||
        !Number.isFinite(metadata.durationSeconds) ||
        metadata.durationSeconds <= 0
      )
        throw new Error(`视频 metadata 无效：${overlay.resource.path}`);
      if (overlay.fadeOutSeconds >= metadata.durationSeconds)
        throw new Error(
          `fadeOutSeconds ${overlay.fadeOutSeconds} 必须小于视频实际时长 ${metadata.durationSeconds}。`,
        );
      videoMetadata.set(overlay.resource.path, Object.freeze({ ...metadata }));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const packageResource =
    await createSceneLayoutPackageResourceFromResolvedFiles({
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
    videoMetadata,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      packageResource.destroy();
    },
  });
}

function decodeBrowserVideoUrl(url: string): Promise<{
  readonly width: number;
  readonly height: number;
  readonly durationSeconds: number;
  readonly hasAudio: "unknown";
}> {
  if (typeof document === "undefined")
    return Promise.reject(
      new Error("导入 video 需要浏览器 metadata decoder。"),
    );
  const video = document.createElement("video");
  if (!video.canPlayType("video/mp4"))
    return Promise.reject(new Error("当前浏览器不支持 video/mp4。"));
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
    };
    const onReady = (): void => {
      const metadata = {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: video.duration,
        hasAudio: "unknown" as const,
      };
      cleanup();
      resolve(metadata);
    };
    const onError = (): void => {
      cleanup();
      reject(new Error("导入 video 无法解码。"));
    };
    video.preload = "auto";
    video.playsInline = true;
    video.addEventListener("canplay", onReady);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}

export function extractBoundedZip(
  zipBytes: Uint8Array,
): Map<string, Uint8Array> {
  const entries = normalizeEditorPackageZipEntries(
    extractSharedBoundedZip(zipBytes, {
      limits: LAYOUT_ZIP_LIMITS,
    }),
    ["layout.manifest.json"],
  );
  for (const path of entries.keys())
    assertCanonicalPackagePath(path, { requireLowercase: true });
  return entries;
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
