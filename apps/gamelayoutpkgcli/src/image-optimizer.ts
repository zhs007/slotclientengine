import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  assertUniqueEditorAssetKeys,
  canonicalExtensionOfEditorAssetKey,
  editorAssetKeyCollisionToken,
} from "@slotclientengine/editorresource";
import { inspectSymbolSpineAtlas } from "@slotclientengine/rendercore/symbol";
import type {
  CwebpRunner,
  ImageOptimizationResult,
  OptimizedLogicalAsset,
  ValidatedLayoutPackage,
} from "./types.js";

const execFileAsync = promisify(execFile);

export const nodeCwebpRunner: CwebpRunner = Object.freeze({
  async version(executable: string) {
    try {
      const result = await execFileAsync(executable, ["-version"], {
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      });
      const version = `${result.stdout}${result.stderr}`.trim();
      if (!version) throw new Error("没有返回版本信息。");
      return version.replace(/\r\n?/gu, "\n");
    } catch (error) {
      throw new Error(`cwebp 不可用（${executable}）：${formatError(error)}`);
    }
  },
  async encode(options: {
    readonly executable: string;
    readonly quality: number;
    readonly inputPath: string;
    readonly outputPath: string;
  }) {
    try {
      await execFileAsync(
        options.executable,
        [
          "-quiet",
          "-q",
          String(options.quality),
          "-o",
          options.outputPath,
          options.inputPath,
        ],
        { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (error) {
      throw new Error(
        `cwebp 编码失败 ${basename(options.inputPath)}：${formatError(error)}`,
      );
    }
  },
});

export async function optimizeLayoutImages(options: {
  readonly source: ValidatedLayoutPackage;
  readonly quality: number;
  readonly cwebpExecutable: string;
  readonly runner?: CwebpRunner;
}): Promise<ImageOptimizationResult> {
  const runner = options.runner ?? nodeCwebpRunner;
  const cwebpVersion = await runner.version(options.cwebpExecutable);
  const atlasPageBindings = collectAtlasPageBindings(
    options.source.sourceEntries,
  );
  const keyMapping = new Map<string, string>();
  const convertedKeys = new Set<string>();
  const targetKeys: string[] = [];
  for (const [key, entry] of options.source.sourceEntries) {
    const converted = isConvertible(entry.mediaType, key);
    const target = converted ? replaceWithWebpExtension(key) : key;
    if (converted) convertedKeys.add(key);
    keyMapping.set(key, target);
    targetKeys.push(target);
  }
  assertUniqueEditorAssetKeys(targetKeys);

  const assets = new Map<string, OptimizedLogicalAsset>();
  const cache = new Map<string, Uint8Array>();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "gamelayoutpkg-cwebp-"));
  let convertedImageCount = 0;
  try {
    for (const [sourceKey, entry] of options.source.sourceEntries) {
      const key = keyMapping.get(sourceKey)!;
      const converted = convertedKeys.has(sourceKey);
      let bytes = entry.bytes.slice();
      const atlasPages = atlasPageBindings.get(sourceKey);
      if (atlasPages)
        bytes = new TextEncoder().encode(
          rewriteAtlasPageNames(
            new TextDecoder().decode(bytes),
            atlasPages,
            keyMapping,
          ),
        );
      if (converted) {
        convertedImageCount += 1;
        const cached = cache.get(entry.sha256);
        if (cached) {
          bytes = cached.slice();
        } else {
          const inputPath = join(
            temporaryRoot,
            `input-${cache.size}.${canonicalExtensionOfEditorAssetKey(sourceKey)}`,
          );
          const outputPath = join(temporaryRoot, `output-${cache.size}.webp`);
          await writeFile(inputPath, entry.bytes);
          await runner.encode({
            executable: options.cwebpExecutable,
            quality: options.quality,
            inputPath,
            outputPath,
          });
          bytes = new Uint8Array(await readFile(outputPath));
          assertWebp(bytes, sourceKey);
          cache.set(entry.sha256, bytes.slice());
        }
      }
      assets.set(
        key,
        Object.freeze({
          key,
          sourceKey,
          bytes,
          sourceByteLength: entry.byteLength,
          converted,
          mediaType: converted ? "image/webp" : entry.mediaType,
        }),
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  return Object.freeze({
    cwebpVersion,
    keyMapping: readonlyMap(keyMapping),
    assets: readonlyMap(assets),
    convertedImageCount,
  });
}

function collectAtlasPageBindings(
  entries: ValidatedLayoutPackage["sourceEntries"],
): ReadonlyMap<string, ReadonlyMap<string, string>> {
  const sourceKeysByToken = new Map(
    [...entries.keys()].map((key) => [editorAssetKeyCollisionToken(key), key]),
  );
  const bindings = new Map<string, ReadonlyMap<string, string>>();
  for (const [key, entry] of entries) {
    if (!key.toLowerCase().endsWith(".atlas")) continue;
    let atlasText: string;
    try {
      atlasText = new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes);
    } catch (error) {
      throw new Error(
        `Spine atlas 不是合法 UTF-8：${key} (${formatError(error)})`,
      );
    }
    const pages = new Map<string, string>();
    for (const page of inspectSymbolSpineAtlas(atlasText).pageNames) {
      const sourceKey = sourceKeysByToken.get(
        editorAssetKeyCollisionToken(page),
      );
      if (!sourceKey)
        throw new Error(`Spine atlas 页资源不存在：${key} -> ${page}`);
      pages.set(page, sourceKey);
    }
    bindings.set(key, pages);
  }
  return bindings;
}

function rewriteAtlasPageNames(
  atlasText: string,
  pages: ReadonlyMap<string, string>,
  keyMapping: ReadonlyMap<string, string>,
): string {
  const parts = atlasText.split(/(\r?\n)/u);
  let cursor = 0;
  for (const [page, sourceKey] of pages) {
    const index = parts.findIndex(
      (part, candidate) => candidate >= cursor && part === page,
    );
    if (index < 0) throw new Error(`Spine atlas 页名无法重写：${page}`);
    parts[index] = keyMapping.get(sourceKey)!;
    cursor = index + 1;
  }
  return parts.join("");
}

function isConvertible(mediaType: string, key: string): boolean {
  const extension = canonicalExtensionOfEditorAssetKey(key);
  if (mediaType === "image/png") return extension === "png";
  if (mediaType === "image/jpeg") return extension === "jpg";
  if (mediaType === "image/webp") return false;
  if (extension === "png" || extension === "jpg")
    throw new Error(`图片 mediaType 与扩展名不一致：${key} (${mediaType})`);
  return false;
}

function replaceWithWebpExtension(key: string): string {
  return `${key.slice(0, key.lastIndexOf("."))}.webp`;
}

function assertWebp(bytes: Uint8Array, sourceKey: string): void {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.slice(from, to));
  if (
    bytes.byteLength < 12 ||
    ascii(0, 4) !== "RIFF" ||
    ascii(8, 12) !== "WEBP"
  )
    throw new Error(`cwebp 输出不是合法 WebP：${sourceKey}`);
}

function readonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  return new Map(source);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
