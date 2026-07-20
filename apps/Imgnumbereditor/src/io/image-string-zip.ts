import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  createImageStringResourceFromFiles,
  materializeImageStringPackage,
  parseImageStringManifest,
  validateImageStringPackageContents,
  type DecodeImageStringImage,
} from "@slotclientengine/rendercore/image-string";
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
  const materialized = await materializeImageStringPackage({
    manifest,
    files: createImageStringPackageFiles(project),
  });
  const files = new Map(materialized.files);
  const resource = await createImageStringResourceFromFiles({
    files,
    decodeImage: validation.decodeImage,
    loadTexture: validation.loadTexture,
  });
  await resource.destroy();
  return Object.freeze({
    filename: `${manifest.id}-image-string.zip`,
    bytes: createDeterministicZip(files, {
      pathPolicy: { requireLowercase: true },
    }),
  });
}

export function createImageStringPackageFiles(
  project: ImageStringEditorProject,
): Map<string, Uint8Array> {
  const manifest = createManifestFromProject(project);
  const files = new Map<string, Uint8Array>();
  files.set(
    "image-string.manifest.json",
    new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  );
  for (const glyph of project.glyphs.values())
    files.set(glyph.path, glyph.bytes.slice());
  return files;
}

export async function importImageStringZip(
  zipBytes: Uint8Array,
  validation: ImageStringZipValidationOptions = {},
): Promise<ImageStringEditorProject> {
  const files = extractBoundedZip(zipBytes, {
    limits: IMAGE_STRING_ZIP_LIMITS,
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
    throw new Error(`manifest JSON 无效：${formatError(error)}`);
  }
  const legacyManifest = parseImageStringManifest(raw);
  validateImageStringPackageContents({ manifest: legacyManifest, files });
  const resource = await createImageStringResourceFromFiles({
    manifest: legacyManifest,
    files,
    decodeImage: validation.decodeImage,
    loadTexture: validation.loadTexture,
  });
  await resource.destroy();
  const materialized = await materializeImageStringPackage({
    manifest: legacyManifest,
    files,
  });
  const manifest = materialized.manifest;
  const canonicalFiles = materialized.files;
  const glyphs = new Map<string, GlyphDraft>();
  for (const [character, spec] of Object.entries(manifest.glyphs))
    glyphs.set(character, {
      id: `imported-${character.codePointAt(0)!.toString(16)}`,
      originalName: spec.path.split("/").at(-1)!,
      mediaType: spec.path.endsWith(".webp") ? "image/webp" : "image/png",
      bytes: canonicalFiles.get(spec.path)!.slice(),
      width: spec.size.width,
      height: spec.size.height,
      suggestedCharacter: character,
      character,
      path: spec.path,
      contentPath: spec.path,
      digest: spec.path.slice("assets/".length, spec.path.lastIndexOf(".")),
      provenance: {
        sourceNames: Object.freeze([spec.path]),
        sourceKind: "package-import",
        batchLabel: `package-import:${manifest.id}`,
      },
      offset: { ...spec.offset },
    });
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
