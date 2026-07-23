import {
  assertCanonicalPackagePath,
  extractBoundedZip,
  type BoundedZipLimits,
} from "@slotclientengine/browserartifactio";
import type { DecodeImageStringImage } from "../image-string/index.js";
import { SceneLayoutError } from "./errors.js";
import {
  collectSceneLayoutPackagePaths,
  createSceneLayoutPackageResource,
  resolveSceneLayoutPackageFiles,
} from "./package-resource.js";
import { parseSceneLayoutManifest } from "./manifest.js";
import type {
  SceneLayoutManifestV1,
  SceneLayoutPackageResource,
} from "./types.js";

const ROOT_MANIFEST = "layout.manifest.json";

export const SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS: BoundedZipLimits =
  Object.freeze({
    maxEntries: 4096,
    maxCompressedBytes: 200 * 1024 * 1024,
    maxFileBytes: 50 * 1024 * 1024,
    maxTotalBytes: 500 * 1024 * 1024,
  });

export interface InspectedSceneLayoutPackage {
  readonly manifest: SceneLayoutManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly entryCount: number;
  readonly totalBytes: number;
}

export async function inspectSceneLayoutPackageZipBytes(options: {
  readonly zipBytes: Uint8Array;
  readonly limits?: BoundedZipLimits;
}): Promise<InspectedSceneLayoutPackage> {
  const files = extractCanonicalProductionZip(
    options.zipBytes,
    options.limits ?? SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS,
  );
  const manifestBytes = files.get(ROOT_MANIFEST);
  if (!manifestBytes)
    throw new SceneLayoutError(
      `Scene layout production ZIP is missing root "${ROOT_MANIFEST}".`,
    );
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
    );
  } catch (error) {
    throw new SceneLayoutError(
      `${ROOT_MANIFEST} is invalid: ${formatError(error)}`,
    );
  }
  const manifest = parseSceneLayoutManifest(rawManifest);
  const resolved = await resolveSceneLayoutPackageFiles({ manifest, files });
  collectSceneLayoutPackagePaths({ manifest, files: resolved });
  const totalBytes = [...files.values()].reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  return Object.freeze({
    manifest,
    files,
    entryCount: files.size,
    totalBytes,
  });
}

export async function loadSceneLayoutPackageFromZipBytes(options: {
  readonly zipBytes: Uint8Array;
  readonly limits?: BoundedZipLimits;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadSymbolTextures?: boolean;
}): Promise<SceneLayoutPackageResource> {
  const inspected = await inspectSceneLayoutPackageZipBytes(options);
  return createSceneLayoutPackageResource({
    manifest: inspected.manifest,
    files: inspected.files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    loadSymbolTextures: options.loadSymbolTextures,
  });
}

function extractCanonicalProductionZip(
  zipBytes: Uint8Array,
  limits: BoundedZipLimits,
): Map<string, Uint8Array> {
  let files: Map<string, Uint8Array>;
  try {
    files = extractBoundedZip(zipBytes, {
      limits,
      pathPolicy: { requireLowercase: true },
    });
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout production ZIP is invalid: ${formatError(error)}`,
    );
  }
  for (const path of files.keys())
    assertCanonicalPackagePath(path, { requireLowercase: true });
  if (
    [...files.keys()].some(
      (path) =>
        path === "__macosx" ||
        path.startsWith("__macosx/") ||
        path.endsWith("/.ds_store") ||
        path.split("/").some((part) => part.startsWith("._")),
    )
  )
    throw new SceneLayoutError(
      "Scene layout production ZIP must be canonical and must not contain Finder metadata or wrapper directories.",
    );
  return files;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
