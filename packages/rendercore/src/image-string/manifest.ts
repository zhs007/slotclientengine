import {
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
} from "@slotclientengine/browserartifactio";
import { ImageStringError } from "./errors.js";
import type {
  ImageStringFixedAdvanceGroup,
  ImageStringGlyphSpec,
  ImageStringManifestV1,
} from "./types.js";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ASCII_PATTERN = /^[\x20-\x7e]+$/u;
const CONTROL_PATTERN = /\p{Cc}/u;

export function parseImageStringManifest(
  value: unknown,
): ImageStringManifestV1 {
  const root = objectAt(value, "image-string.manifest.json");
  exactKeys(
    root,
    ["version", "kind", "id", "metrics", "glyphs", "fixedAdvanceGroups"],
    "image-string.manifest.json",
  );
  if (root.version !== 1) fail("version", "必须等于 1");
  if (root.kind !== "image-string") fail("kind", '必须等于 "image-string"');
  const id = kebabId(root.id, "id");

  const metricsValue = objectAt(root.metrics, "metrics");
  exactKeys(metricsValue, ["lineHeight", "letterSpacing"], "metrics");
  const lineHeight = positiveFinite(
    metricsValue.lineHeight,
    "metrics.lineHeight",
  );
  const letterSpacing = nonNegativeFinite(
    metricsValue.letterSpacing,
    "metrics.letterSpacing",
  );

  const glyphValues = objectAt(root.glyphs, "glyphs");
  const glyphEntries = Object.entries(glyphValues);
  if (glyphEntries.length === 0) fail("glyphs", "不得为空");
  const glyphs: Record<string, ImageStringGlyphSpec> = {};
  const paths: string[] = [];
  for (const [character, raw] of glyphEntries) {
    assertGlyphCharacter(character, `glyphs.${JSON.stringify(character)}`);
    const path = `glyphs.${JSON.stringify(character)}`;
    const spec = objectAt(raw, path);
    exactKeys(spec, ["path", "size", "offset"], path);
    if (typeof spec.path !== "string") fail(`${path}.path`, "必须是字符串");
    let assetPath: string;
    try {
      assetPath = assertCanonicalPackagePath(spec.path, {
        requireLowercase: true,
      });
    } catch (error) {
      fail(`${path}.path`, formatError(error));
    }
    if (!ASCII_PATTERN.test(assetPath))
      fail(`${path}.path`, "必须是 ASCII 路径");
    if (!assetPath.startsWith("assets/"))
      fail(`${path}.path`, "必须位于 assets/ 下");
    if (!/\.(?:png|webp)$/u.test(assetPath))
      fail(`${path}.path`, "扩展名只能是 .png 或 .webp");
    paths.push(assetPath);

    const size = objectAt(spec.size, `${path}.size`);
    exactKeys(size, ["width", "height"], `${path}.size`);
    const width = positiveSafeInteger(size.width, `${path}.size.width`);
    const height = positiveSafeInteger(size.height, `${path}.size.height`);
    const offset = objectAt(spec.offset, `${path}.offset`);
    exactKeys(offset, ["x", "y"], `${path}.offset`);
    const offsetX = finiteNumber(offset.x, `${path}.offset.x`);
    const offsetY = finiteNumber(offset.y, `${path}.offset.y`);
    if (offsetY < 0 || offsetY + height > lineHeight) {
      fail(
        `${path}.offset.y`,
        `visual vertical rect 必须落在 0..${lineHeight}`,
      );
    }
    glyphs[character] = {
      path: assetPath,
      size: { width, height },
      offset: { x: offsetX, y: offsetY },
    };
  }
  try {
    assertNoPackagePathCollisions(paths);
  } catch (error) {
    fail("glyphs", formatError(error));
  }

  if (!Array.isArray(root.fixedAdvanceGroups))
    fail("fixedAdvanceGroups", "必须是数组");
  const groups: ImageStringFixedAdvanceGroup[] = [];
  const groupIds = new Set<string>();
  const assigned = new Set<string>();
  for (let index = 0; index < root.fixedAdvanceGroups.length; index += 1) {
    const path = `fixedAdvanceGroups[${index}]`;
    const raw = objectAt(root.fixedAdvanceGroups[index], path);
    exactKeys(raw, ["id", "characters", "advanceWidth", "align"], path);
    const groupId = kebabId(raw.id, `${path}.id`);
    if (groupIds.has(groupId)) fail(`${path}.id`, `重复 id "${groupId}"`);
    groupIds.add(groupId);
    if (!Array.isArray(raw.characters) || raw.characters.length === 0)
      fail(`${path}.characters`, "必须是非空数组");
    const characters: string[] = [];
    for (
      let characterIndex = 0;
      characterIndex < raw.characters.length;
      characterIndex += 1
    ) {
      const characterPath = `${path}.characters[${characterIndex}]`;
      const character = raw.characters[characterIndex];
      assertGlyphCharacter(character, characterPath);
      if (!(character in glyphs))
        fail(characterPath, `引用不存在的 glyph ${JSON.stringify(character)}`);
      if (characters.includes(character))
        fail(characterPath, `组内字符重复 ${JSON.stringify(character)}`);
      if (assigned.has(character))
        fail(
          characterPath,
          `字符 ${JSON.stringify(character)} 已属于其它 fixed group`,
        );
      characters.push(character);
      assigned.add(character);
    }
    const sorted = [...characters].sort(compareCodePoint);
    if (
      characters.some(
        (character, characterIndex) => character !== sorted[characterIndex],
      )
    ) {
      fail(`${path}.characters`, "必须按 Unicode code point 稳定排序");
    }
    const advanceWidth = positiveFinite(
      raw.advanceWidth,
      `${path}.advanceWidth`,
    );
    if (raw.align !== "start" && raw.align !== "center" && raw.align !== "end")
      fail(`${path}.align`, "只能是 start、center 或 end");
    for (const character of characters) {
      const glyph = glyphs[character];
      const alignOffset =
        raw.align === "start"
          ? 0
          : raw.align === "center"
            ? (advanceWidth - glyph.size.width) / 2
            : advanceWidth - glyph.size.width;
      const left = alignOffset + glyph.offset.x;
      const right = left + glyph.size.width;
      if (left < 0 || right > advanceWidth) {
        fail(
          `${path}.advanceWidth`,
          `无法容纳 glyph ${JSON.stringify(character)} 的 horizontal visual rect ${left}..${right}`,
        );
      }
    }
    groups.push({ id: groupId, characters, advanceWidth, align: raw.align });
  }

  return deepFreeze({
    version: 1,
    kind: "image-string",
    id,
    metrics: { lineHeight, letterSpacing },
    glyphs,
    fixedAdvanceGroups: groups,
  });
}

export function collectImageStringAssetPaths(
  manifest: ImageStringManifestV1,
): readonly string[] {
  return Object.values(manifest.glyphs)
    .map((glyph) => glyph.path)
    .sort((left, right) => left.localeCompare(right, "en"));
}

export function validateImageStringText(
  text: string,
  manifest?: ImageStringManifestV1,
): readonly string[] {
  if (typeof text !== "string")
    throw new ImageStringError("image-string text 必须是 string。");
  if (text.normalize("NFC") !== text)
    throw new ImageStringError("image-string text 必须使用 Unicode NFC。");
  if (CONTROL_PATTERN.test(text))
    throw new ImageStringError("image-string text 不得包含控制字符。");
  const characters = Array.from(text);
  for (const character of characters) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff)
      throw new ImageStringError(
        "image-string text 不得包含未配对 surrogate。",
      );
    if (manifest && !(character in manifest.glyphs))
      throw new ImageStringError(
        `image-string text 缺少 glyph ${JSON.stringify(character)}。`,
      );
  }
  return characters;
}

function assertGlyphCharacter(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || value.length === 0)
    fail(path, "必须是一个非空 Unicode scalar value");
  if (value.normalize("NFC") !== value) fail(path, "必须使用 Unicode NFC");
  if (CONTROL_PATTERN.test(value)) fail(path, "不得是控制字符");
  const characters = Array.from(value);
  const codePoint = characters[0]?.codePointAt(0);
  if (
    characters.length !== 1 ||
    codePoint === undefined ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff)
  )
    fail(path, "必须恰好是一个 Unicode scalar value");
}

function compareCodePoint(left: string, right: string): number {
  return left.codePointAt(0)! - right.codePointAt(0)!;
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(path, "必须是对象");
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(`${path}.${key}`, "未知字段");
  for (const key of allowed)
    if (!(key in value)) fail(`${path}.${key}`, "缺少字段");
}

function kebabId(value: unknown, path: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value))
    fail(path, "必须是 lowercase ASCII kebab-case");
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(path, "必须是有限数");
  return value;
}

function positiveFinite(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (number <= 0) fail(path, "必须是正数");
  return number;
}

function nonNegativeFinite(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (number < 0) fail(path, "必须是非负数");
  return number;
}

function positiveSafeInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0)
    fail(path, "必须是正安全整数");
  return value as number;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value as Record<string, unknown>))
    deepFreeze(child);
  return Object.freeze(value);
}

function fail(path: string, message: string): never {
  throw new ImageStringError(`${path}: ${message}`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
