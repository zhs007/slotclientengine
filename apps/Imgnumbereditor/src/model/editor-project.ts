import {
  parseImageStringManifest,
  type ImageStringManifestV1,
} from "@slotclientengine/rendercore/image-string";

export interface UploadedImageDraft {
  readonly id: string;
  readonly originalName: string;
  readonly mediaType: "image/png" | "image/webp";
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly suggestedCharacter: string | null;
}

export interface GlyphDraft extends UploadedImageDraft {
  readonly character: string;
  readonly path: string;
  readonly offset: { readonly x: number; readonly y: number };
}

export interface FixedAdvanceGroupDraft {
  readonly id: string;
  readonly characters: readonly string[];
  readonly advanceWidth: number;
  readonly align: "start" | "center" | "end";
}

export interface ImageStringEditorProject {
  readonly id: string;
  readonly metrics: {
    readonly lineHeight: number;
    readonly letterSpacing: number;
  };
  readonly glyphs: ReadonlyMap<string, GlyphDraft>;
  readonly fixedAdvanceGroups: readonly FixedAdvanceGroupDraft[];
  readonly unmappedFiles: ReadonlyMap<string, UploadedImageDraft>;
}

export const DEFAULT_STATIC_TEMPLATES = Object.freeze([
  "0123456789",
  "9876543210",
  "001234567890",
  "+123.45",
  "-678.90",
  "12×34",
]);

export function createDefaultEditorProject(): ImageStringEditorProject {
  return Object.freeze({
    id: "new-image-string",
    metrics: Object.freeze({ lineHeight: 64, letterSpacing: 0 }),
    glyphs: new Map(),
    fixedAdvanceGroups: Object.freeze([]),
    unmappedFiles: new Map(),
  });
}

export function cloneEditorProject(
  project: ImageStringEditorProject,
): ImageStringEditorProject {
  return {
    id: project.id,
    metrics: { ...project.metrics },
    glyphs: new Map(
      [...project.glyphs].map(([character, glyph]) => [
        character,
        cloneGlyph(glyph),
      ]),
    ),
    fixedAdvanceGroups: project.fixedAdvanceGroups.map((group) => ({
      ...group,
      characters: [...group.characters],
    })),
    unmappedFiles: new Map(
      [...project.unmappedFiles].map(([id, image]) => [id, cloneImage(image)]),
    ),
  };
}

export function freezeEditorProject(
  project: ImageStringEditorProject,
): ImageStringEditorProject {
  return Object.freeze({
    id: project.id,
    metrics: Object.freeze({ ...project.metrics }),
    glyphs: readonlyMap(
      [...project.glyphs].map(([character, glyph]) => [
        character,
        Object.freeze({
          ...cloneGlyph(glyph),
          offset: Object.freeze({ ...glyph.offset }),
        }),
      ]),
    ),
    fixedAdvanceGroups: Object.freeze(
      project.fixedAdvanceGroups.map((group) =>
        Object.freeze({
          ...group,
          characters: Object.freeze([...group.characters]),
        }),
      ),
    ),
    unmappedFiles: readonlyMap(
      [...project.unmappedFiles].map(([id, image]) => [
        id,
        Object.freeze(cloneImage(image)),
      ]),
    ),
  });
}

export function suggestCharacterFromFilename(filename: string): string | null {
  const basename = filename
    .replace(/^.*[\\/]/u, "")
    .replace(/\.(?:png|webp)$/iu, "")
    .replace(/-\d+$/u, "");
  return isSingleAllowedScalar(basename) ? basename : null;
}

export function deriveGlyphAssetPath(
  character: string,
  mediaType: UploadedImageDraft["mediaType"],
): string {
  assertSingleAllowedScalar(character);
  const codePoint = character.codePointAt(0)!;
  return `assets/u${codePoint.toString(16).padStart(4, "0")}.${mediaType === "image/webp" ? "webp" : "png"}`;
}

export function confirmGlyphMapping(
  project: ImageStringEditorProject,
  fileId: string,
  character: string,
): ImageStringEditorProject {
  assertSingleAllowedScalar(character);
  if (project.glyphs.has(character))
    throw new Error(`字符 ${JSON.stringify(character)} 已映射。`);
  const image = project.unmappedFiles.get(fileId);
  if (!image) throw new Error(`未找到待映射图片：${fileId}`);
  const path = deriveGlyphAssetPath(character, image.mediaType);
  if ([...project.glyphs.values()].some((glyph) => glyph.path === path))
    throw new Error(`目标路径冲突：${path}`);
  const next = cloneEditorProject(project);
  (next.unmappedFiles as Map<string, UploadedImageDraft>).delete(fileId);
  (next.glyphs as Map<string, GlyphDraft>).set(character, {
    ...cloneImage(image),
    character,
    path,
    offset: { x: 0, y: 0 },
  });
  return freezeEditorProject(next);
}

export function replaceGlyphImage(
  project: ImageStringEditorProject,
  character: string,
  image: UploadedImageDraft,
): ImageStringEditorProject {
  const current = project.glyphs.get(character);
  if (!current) throw new Error(`未找到 glyph ${JSON.stringify(character)}。`);
  const next = cloneEditorProject(project);
  (next.glyphs as Map<string, GlyphDraft>).set(character, {
    ...cloneImage(image),
    character,
    path: deriveGlyphAssetPath(character, image.mediaType),
    offset: { ...current.offset },
  });
  createManifestFromProject(next);
  return freezeEditorProject(next);
}

export function unmapGlyph(
  project: ImageStringEditorProject,
  character: string,
): ImageStringEditorProject {
  const current = project.glyphs.get(character);
  if (!current) throw new Error(`未找到 glyph ${JSON.stringify(character)}。`);
  if (
    project.fixedAdvanceGroups.some((group) =>
      group.characters.includes(character),
    )
  ) {
    throw new Error(
      `glyph ${JSON.stringify(character)} 仍被 fixed group 引用。`,
    );
  }
  if (project.unmappedFiles.has(current.id))
    throw new Error(`待映射图片 id 冲突：${current.id}`);
  const next = cloneEditorProject(project);
  (next.glyphs as Map<string, GlyphDraft>).delete(character);
  (next.unmappedFiles as Map<string, UploadedImageDraft>).set(current.id, {
    id: current.id,
    originalName: current.originalName,
    mediaType: current.mediaType,
    bytes: current.bytes.slice(),
    width: current.width,
    height: current.height,
    suggestedCharacter: character,
  });
  return freezeEditorProject(next);
}

export function removeUnmappedImage(
  project: ImageStringEditorProject,
  fileId: string,
): ImageStringEditorProject {
  if (!project.unmappedFiles.has(fileId))
    throw new Error(`未找到待映射图片：${fileId}`);
  const next = cloneEditorProject(project);
  (next.unmappedFiles as Map<string, UploadedImageDraft>).delete(fileId);
  return freezeEditorProject(next);
}

export function createManifestFromProject(
  project: ImageStringEditorProject,
): ImageStringManifestV1 {
  const glyphs = Object.fromEntries(
    [...project.glyphs]
      .sort(([left], [right]) => left.codePointAt(0)! - right.codePointAt(0)!)
      .map(([character, glyph]) => [
        character,
        {
          path: glyph.path,
          size: { width: glyph.width, height: glyph.height },
          offset: { ...glyph.offset },
        },
      ]),
  );
  return parseImageStringManifest({
    version: 1,
    kind: "image-string",
    id: project.id,
    metrics: { ...project.metrics },
    glyphs,
    fixedAdvanceGroups: project.fixedAdvanceGroups.map((group) => ({
      ...group,
      characters: [...group.characters],
    })),
  });
}

export function maxGroupVisualWidth(
  project: ImageStringEditorProject,
  characters: readonly string[],
): number {
  if (characters.length === 0) throw new Error("fixed group 字符不得为空。");
  return Math.max(
    ...characters.map((character) => {
      const glyph = project.glyphs.get(character);
      if (!glyph)
        throw new Error(
          `fixed group 引用不存在的 glyph ${JSON.stringify(character)}。`,
        );
      return glyph.offset.x + glyph.width;
    }),
  );
}

function assertSingleAllowedScalar(value: string): void {
  if (!isSingleAllowedScalar(value))
    throw new Error(
      "字符必须恰好是一个 NFC Unicode scalar，且不能是控制字符。",
    );
}

function isSingleAllowedScalar(value: string): boolean {
  if (
    typeof value !== "string" ||
    value.normalize("NFC") !== value ||
    /\p{Cc}/u.test(value)
  )
    return false;
  const values = Array.from(value);
  const codePoint = values[0]?.codePointAt(0);
  return (
    values.length === 1 &&
    codePoint !== undefined &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
  );
}

function cloneImage(image: UploadedImageDraft): UploadedImageDraft {
  return { ...image, bytes: image.bytes.slice() };
}
function cloneGlyph(glyph: GlyphDraft): GlyphDraft {
  return { ...glyph, bytes: glyph.bytes.slice(), offset: { ...glyph.offset } };
}

function readonlyMap<K, V>(
  entries: readonly (readonly [K, V])[],
): ReadonlyMap<K, V> {
  const map = new Map(entries);
  for (const method of ["set", "delete", "clear"] as const)
    Object.defineProperty(map, method, {
      value: () => {
        throw new Error("只读 project map 不可修改。");
      },
    });
  return map;
}
