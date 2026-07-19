import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  createImageStringResourceFromFiles,
  parseImageStringManifest,
  validateImageStringPackageContents,
  type DecodeImageStringImage,
} from "@slotclientengine/rendercore/image-string";
import type { Texture } from "pixi.js";
import type { EditorImageStringDependency } from "../model/editor-project.js";

export const IMAGE_STRING_DEPENDENCY_ZIP_LIMITS = Object.freeze({
  maxEntries: 512,
  maxCompressedBytes: 50 * 1024 * 1024,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
});

export async function importImageStringDependencyZip(
  bytes: Uint8Array,
  validation: {
    readonly decodeImage?: DecodeImageStringImage;
    readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
  } = {},
): Promise<EditorImageStringDependency> {
  const files = extractBoundedZip(bytes, {
    limits: IMAGE_STRING_DEPENDENCY_ZIP_LIMITS,
    pathPolicy: { requireLowercase: true },
  });
  const manifestBytes = files.get("image-string.manifest.json");
  if (!manifestBytes) throw new Error("ZIP 缺少 image-string.manifest.json。");
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
    );
  } catch (error) {
    throw new Error(`image-string manifest JSON 无效：${formatError(error)}`);
  }
  const manifest = parseImageStringManifest(raw);
  validateImageStringPackageContents({ manifest, files });
  const resource = await createImageStringResourceFromFiles({
    manifest,
    files,
    decodeImage: validation.decodeImage,
    loadTexture: validation.loadTexture,
  });
  await resource.destroy();
  return Object.freeze({
    id: manifest.id,
    manifest,
    files: new Map([...files].map(([path, value]) => [path, value.slice()])),
    fingerprint: fingerprintFiles(files),
  });
}

function fingerprintFiles(files: ReadonlyMap<string, Uint8Array>): string {
  let hash = 0x811c9dc5;
  for (const [path, bytes] of [...files].sort(([a], [b]) =>
    a.localeCompare(b, "en"),
  )) {
    for (const byte of new TextEncoder().encode(path)) {
      hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    }
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
