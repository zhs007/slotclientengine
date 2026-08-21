import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import {
  assertUniqueEditorAssetKeys,
  canonicalExtensionOfEditorAssetKey,
} from "@slotclientengine/editorresource";
import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import {
  inspectSymbolSpineAtlas,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol/data";
import { parseJson } from "./package-reader.js";
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
  const preservedLogicalKeys = collectImplicitSymbolAtlasPageKeys(
    options.source,
  );
  const keyMapping = new Map<string, string>();
  const convertedKeys = new Set<string>();
  const targetKeys: string[] = [];
  for (const [key, entry] of options.source.sourceEntries) {
    const converted = isConvertible(entry.mediaType, key);
    const target =
      converted && !preservedLogicalKeys.has(key)
        ? replaceWithWebpExtension(key)
        : key;
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

function collectImplicitSymbolAtlasPageKeys(
  source: ValidatedLayoutPackage,
): ReadonlySet<string> {
  const roots = [
    ...(source.manifest.symbolPackage
      ? [source.manifest.symbolPackage.manifest]
      : []),
    ...Object.values(source.manifest.symbolPackages ?? {}).map(
      (binding) => binding.manifest,
    ),
  ];
  const keys = new Set<string>();
  for (const root of roots) {
    const packageBytes = source.files.get(root);
    if (!packageBytes)
      throw new Error(`Symbols package manifest 缺失：${root}`);
    const packageManifest = parseSymbolPackageManifest(
      parseJson(packageBytes, root),
    );
    for (const atlasKey of packageManifest.resources.filter((key) =>
      key.toLowerCase().endsWith(".atlas"),
    )) {
      const atlasBytes = source.files.get(atlasKey);
      if (!atlasBytes) throw new Error(`Symbols Spine atlas 缺失：${atlasKey}`);
      const atlasText = decodeUtf8(atlasBytes, atlasKey);
      for (const page of inspectSymbolSpineAtlas(atlasText).pageNames.slice(1))
        keys.add(resolvePackagePath(atlasKey, page));
    }
  }
  return keys;
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

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`Symbols Spine atlas 不是合法 UTF-8：${label}`, {
      cause: error,
    });
  }
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
