import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  createImageStringResourceFromFiles,
  materializeMappedImageStringPackage,
  parseImageStringManifest,
  resolveImageStringPackageFiles,
  validateImageStringPackageContents,
  type DecodeImageStringImage,
} from "@slotclientengine/rendercore/image-string";
import {
  EDITOR_ASSETS_MAP_PATH,
  assertNoEditorAssetKeyAliases,
  basenameFromSourcePath,
  createEditorAssetEntry,
  decodeEditorAssetsMap,
  normalizeEditorPackageZipEntries,
} from "@slotclientengine/editorresource";
import type { Texture } from "pixi.js";
import {
  createManifestFromProject,
  freezeEditorProject,
  type GlyphDraft,
  type ImageStringEditorProject,
} from "../model/editor-project.js";

export const IMAGE_STRING_ZIP_LIMITS = Object.freeze({
  maxEntries: 512,
  maxCompressedBytes: 50 * 1024 * 1024,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
});

export interface ImageStringZipValidationOptions {
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}

export async function exportImageStringZip(
  project: ImageStringEditorProject,
  validation: ImageStringZipValidationOptions = {},
): Promise<{ readonly filename: string; readonly bytes: Uint8Array }> {
  const manifest = createManifestFromProject(project);
  const files = new Map(await createImageStringPackageFiles(project));
  const resource = await createImageStringResourceFromFiles({
    files,
    decodeImage: validation.decodeImage,
    loadTexture: validation.loadTexture,
  });
  await resource.destroy();
  return Object.freeze({
    filename: `${manifest.id}-image-string.zip`,
    bytes: createDeterministicZip(files, {
      level: 6,
    }),
  });
}

export async function createImageStringPackageFiles(
  project: ImageStringEditorProject,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const manifest = createManifestFromProject(project);
  const files = new Map<string, Uint8Array>();
  files.set(
    "image-string.manifest.json",
    new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  );
  for (const glyph of project.glyphs.values())
    files.set(glyph.key, glyph.bytes.slice());
  return (await materializeMappedImageStringPackage({ manifest, files })).files;
}

export async function importImageStringZip(
  zipBytes: Uint8Array,
  validation: ImageStringZipValidationOptions = {},
): Promise<ImageStringEditorProject> {
  const files = normalizeEditorPackageZipEntries(
    extractBoundedZip(zipBytes, {
      limits: IMAGE_STRING_ZIP_LIMITS,
    }),
    ["image-string.manifest.json"],
  );
  const manifestBytes = files.get("image-string.manifest.json");
  if (!manifestBytes) throw new Error("ZIP 缺少 image-string.manifest.json。");
  let raw: unknown;
  try {
    raw = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
    );
  } catch (error) {
    throw new Error(`manifest JSON 无效：${formatError(error)}`);
  }
  const sourceManifest = parseImageStringManifest(raw);
  const hasMap = files.has(EDITOR_ASSETS_MAP_PATH);
  if (!hasMap)
    validateImageStringPackageContents({ manifest: sourceManifest, files });
  const resource = await createImageStringResourceFromFiles({
    manifest: sourceManifest,
    files,
    decodeImage: validation.decodeImage,
    loadTexture: validation.loadTexture,
  });
  await resource.destroy();
  const resolved = await resolveImageStringPackageFiles({
    manifest: sourceManifest,
    files,
  });
  const rewritten = structuredClone(sourceManifest) as {
    glyphs: Record<string, { path: string }>;
  };
  const pathToKey = new Map<string, string>();
  for (const glyph of Object.values(rewritten.glyphs)) {
    if (pathToKey.has(glyph.path)) continue;
    if (/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/u.test(glyph.path))
      throw new Error(
        `legacy package 仅保留 hash path ${glyph.path}；导入审查必须先指定 filename key。`,
      );
    pathToKey.set(
      glyph.path,
      glyph.path.includes("/")
        ? basenameFromSourcePath(glyph.path)
        : glyph.path,
    );
  }
  assertNoEditorAssetKeyAliases([...pathToKey.values()]);
  for (const glyph of Object.values(rewritten.glyphs))
    glyph.path = pathToKey.get(glyph.path)!;
  const manifest = parseImageStringManifest(rewritten);
  const assetMap = hasMap
    ? decodeEditorAssetsMap(files.get(EDITOR_ASSETS_MAP_PATH)!)
    : undefined;
  const glyphs = new Map<string, GlyphDraft>();
  for (const [character, spec] of Object.entries(manifest.glyphs)) {
    const sourcePath = [...pathToKey].find(([, key]) => key === spec.path)?.[0];
    if (!sourcePath)
      throw new Error(`image-string glyph source path 缺失：${spec.path}`);
    glyphs.set(character, {
      ...(await createEditorAssetEntry({
        key: spec.path,
        mediaType: spec.path.toLowerCase().endsWith(".webp")
          ? "image/webp"
          : "image/png",
        bytes: resolved.files.get(sourcePath)!.slice(),
      })),
      mediaType: spec.path.toLowerCase().endsWith(".webp")
        ? "image/webp"
        : "image/png",
      width: spec.size.width,
      height: spec.size.height,
      suggestedCharacter: character,
      character,
      offset: { ...spec.offset },
    });
  }
  if (assetMap && Object.keys(assetMap.files).length !== pathToKey.size)
    throw new Error("assets map 包含 image-string closure 外的 entry。");
  return freezeEditorProject({
    id: manifest.id,
    metrics: { ...manifest.metrics },
    glyphs,
    fixedAdvanceGroups: manifest.fixedAdvanceGroups.map((group) => ({
      ...group,
      characters: [...group.characters],
    })),
    unmappedFiles: new Map(),
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
