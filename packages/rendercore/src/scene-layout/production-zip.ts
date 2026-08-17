import {
  assertCanonicalPackagePath,
  extractBoundedZip,
  type BoundedZipLimits,
} from "@slotclientengine/browserartifactio";
import {
  decodeEditorAssetsMap,
  EDITOR_ASSETS_MAP_PATH,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import type { DecodeImageStringImage } from "../image-string/core/index.js";
import { SceneLayoutError } from "./errors.js";
import {
  collectSceneLayoutPackagePaths,
  createSceneLayoutPackageResourceFromResolvedFiles,
  resolveSceneLayoutPackageFiles,
} from "./package-resource.js";
import { parseSceneLayoutManifestDocument } from "./manifest.js";
import type {
  SceneLayoutManifest,
  SceneLayoutPackageResource,
} from "./types.js";
import { SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS } from "./data/package-limits.js";

const ROOT_MANIFEST = "layout.manifest.json";

export { SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS };

export interface InspectedSceneLayoutPackage {
  readonly manifest: SceneLayoutManifest;
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
  const manifest = parseSceneLayoutManifestDocument(rawManifest);
  const mapBytes = files.get(EDITOR_ASSETS_MAP_PATH);
  if (mapBytes)
    await validateEditorAssetsMapPackage({
      map: decodeEditorAssetsMap(mapBytes),
      files,
      allowControlPaths: [ROOT_MANIFEST],
    });
  const resolved = await resolveSceneLayoutPackageFiles({ manifest, files });
  collectSceneLayoutPackagePaths({ manifest, files: resolved });
  const totalBytes = [...files.values()].reduce(
    (total, bytes) => total + bytes.byteLength,
    0,
  );
  return Object.freeze({
    manifest,
    files: resolved,
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
  return createSceneLayoutPackageResourceFromResolvedFiles({
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
