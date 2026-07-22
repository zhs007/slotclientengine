import {
  allocateContentAddressedPath,
  detectRasterAssetType,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  commitEditorAssetImport,
  createEditorAssetsMapFromWorkspace,
  createEmptyEditorAssetWorkspace,
  materializeEditorAssetPayloads,
  reviewEditorAssetImport,
  serializeEditorAssetsMap,
  type EditorAssetRewriteAdapter,
} from "@slotclientengine/editorresource";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "./manifest.js";
import type { ImageStringManifestV1 } from "./types.js";

export interface MaterializedImageStringPackage {
  readonly manifest: ImageStringManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export interface MappedImageStringPackage {
  readonly manifest: ImageStringManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

/** Creates the filename-key + assets.map.json package introduced by Task 119. */
export async function materializeMappedImageStringPackage(options: {
  readonly manifest: ImageStringManifestV1 | unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): Promise<MappedImageStringPackage> {
  const manifest = parseImageStringManifest(options.manifest);
  const keys = collectImageStringAssetPaths(manifest);
  if (keys.some((key) => key.includes("/")))
    throw new Error(
      "mapped image-string materializer 只接受 filename-key manifest。",
    );
  const incoming = keys.map((key) => {
    const bytes = options.files.get(key);
    if (!bytes) throw new Error(`mapped image-string 缺少 glyph bytes：${key}`);
    const detected = detectRasterAssetType(bytes);
    if (detected.extension === "jpg")
      throw new Error(`image-string glyph 不支持 JPEG：${key}`);
    return { key, mediaType: detected.mediaType, bytes };
  });
  const empty = createEmptyEditorAssetWorkspace();
  const review = await reviewEditorAssetImport({ workspace: empty, incoming });
  const adapter: EditorAssetRewriteAdapter<null> = {
    cloneProject: () => null,
    collectReferences: () => ({ references: [] }),
    renameReferences: () => null,
  };
  const { workspace } = await commitEditorAssetImport({
    workspace: empty,
    project: null,
    review,
    adapter,
  });
  const map = createEditorAssetsMapFromWorkspace(workspace, keys);
  const output = new Map(materializeEditorAssetPayloads(workspace, keys));
  output.set("assets.map.json", serializeEditorAssetsMap(map));
  output.set(
    "image-string.manifest.json",
    new TextEncoder().encode(
      `${JSON.stringify(sortValue(manifest), null, 2)}\n`,
    ),
  );
  return Object.freeze({ manifest, files: output });
}

/** Materializes owned glyph payload from leaves to the root manifest. */
export async function materializeImageStringPackage(options: {
  readonly manifest: ImageStringManifestV1 | unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): Promise<MaterializedImageStringPackage> {
  const source = parseImageStringManifest(options.manifest);
  const pathMap = new Map<string, string>();
  const output = new Map<string, Uint8Array>();
  for (const path of collectImageStringAssetPaths(source)) {
    if (pathMap.has(path)) continue;
    const bytes = options.files.get(path);
    if (!bytes)
      throw new Error(`image-string materializer 缺少 glyph bytes：${path}`);
    const detected = detectRasterAssetType(bytes);
    if (detected.extension === "jpg")
      throw new Error(`image-string glyph 不支持 JPEG：${path}`);
    const digest = await sha256Hex(bytes);
    const target = allocateContentAddressedPath({
      digest,
      extension: detected.extension,
    });
    const existing = output.get(target);
    if (existing && !equalBytes(existing, bytes))
      throw new Error(`image-string SHA-256 collision：${target}`);
    output.set(target, bytes.slice());
    pathMap.set(path, target);
  }
  const rewritten = structuredClone(source) as {
    glyphs: Record<string, { path: string }>;
  };
  for (const glyph of Object.values(rewritten.glyphs))
    glyph.path = pathMap.get(glyph.path)!;
  const manifest = parseImageStringManifest(rewritten);
  output.set(
    "image-string.manifest.json",
    new TextEncoder().encode(
      `${JSON.stringify(sortValue(manifest), null, 2)}\n`,
    ),
  );
  return Object.freeze({ manifest, files: output });
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}
