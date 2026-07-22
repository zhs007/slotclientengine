import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  assertNoEditorAssetKeyAliases,
  basenameFromSourcePath,
} from "@slotclientengine/editorresource";
import {
  createImageStringResourceFromFiles,
  parseImageStringManifest,
  resolveImageStringPackageFiles,
  validateImageStringPackageContents,
  type DecodeImageStringImage,
} from "@slotclientengine/rendercore/image-string";
import type { Texture } from "pixi.js";
import type { ImportedEditorImageStringDependency } from "../model/editor-project.js";

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
): Promise<ImportedEditorImageStringDependency> {
  const files = extractBoundedZip(bytes, {
    limits: IMAGE_STRING_DEPENDENCY_ZIP_LIMITS,
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
  const resolved = await resolveImageStringPackageFiles({ manifest, files });
  validateImageStringPackageContents({ manifest, files: resolved.files });
  const resource = await createImageStringResourceFromFiles({
    manifest,
    files,
    decodeImage: validation.decodeImage,
    loadTexture: validation.loadTexture,
  });
  await resource.destroy();
  const rewritten = structuredClone(manifest) as {
    glyphs: Record<string, { path: string }>;
  };
  const pathMap = new Map<string, string>();
  for (const glyph of Object.values(rewritten.glyphs))
    if (!pathMap.has(glyph.path))
      pathMap.set(glyph.path, basenameFromSourcePath(glyph.path));
  assertNoEditorAssetKeyAliases([...pathMap.values()]);
  for (const glyph of Object.values(rewritten.glyphs))
    glyph.path = pathMap.get(glyph.path)!;
  const flatManifest = parseImageStringManifest(rewritten);
  const flatFiles = new Map<string, Uint8Array>([
    [
      "image-string.manifest.json",
      new TextEncoder().encode(`${JSON.stringify(flatManifest, null, 2)}\n`),
    ],
  ]);
  for (const [sourcePath, key] of pathMap)
    flatFiles.set(key, resolved.files.get(sourcePath)!.slice());
  return Object.freeze({
    id: flatManifest.id,
    rootKey: "image-string.manifest.json",
    manifest: flatManifest,
    keys: Object.freeze([...flatFiles.keys()].sort()),
    files: flatFiles,
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
