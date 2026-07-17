import { Unzip, UnzipInflate, zipSync } from "fflate";
import {
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
  type PackagePathPolicy,
} from "./path.js";

export interface BoundedZipLimits {
  readonly maxEntries: number;
  readonly maxCompressedBytes: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export function extractBoundedZip(
  zipBytes: Uint8Array,
  options: {
    readonly limits: BoundedZipLimits;
    readonly pathPolicy?: PackagePathPolicy;
  },
): Map<string, Uint8Array> {
  if (!(zipBytes instanceof Uint8Array))
    throw new Error("zip 数据必须是 Uint8Array。");
  assertLimits(options.limits);
  if (zipBytes.byteLength > options.limits.maxCompressedBytes) {
    throw new Error(
      `zip 压缩文件超过 ${formatBytes(options.limits.maxCompressedBytes)} 上限。`,
    );
  }
  const files = new Map<string, Uint8Array>();
  const seenPaths: string[] = [];
  let entryCount = 0;
  let totalBytes = 0;
  let failure: Error | null = null;
  const unzip = new Unzip((file) => {
    if (failure) return;
    try {
      entryCount += 1;
      if (entryCount > options.limits.maxEntries) {
        throw new Error(`zip entry 数超过 ${options.limits.maxEntries} 上限。`);
      }
      const isDirectory = file.name.endsWith("/");
      const path = isDirectory ? file.name.slice(0, -1) : file.name;
      if (!path) throw new Error("zip 不允许根目录 entry。");
      assertCanonicalPackagePath(path, options.pathPolicy);
      seenPaths.push(path);
      assertNoPackagePathCollisions(seenPaths);
      if (isDirectory) {
        file.ondata = (error) => {
          if (error && !failure)
            failure = new Error(
              `zip 目录 entry 解压失败 ${file.name}：${formatError(error)}`,
            );
        };
        file.start();
        return;
      }
      if (
        file.originalSize !== undefined &&
        file.originalSize > options.limits.maxFileBytes
      ) {
        throw new Error(
          `zip 单文件超过 ${formatBytes(options.limits.maxFileBytes)} 上限：${file.name}`,
        );
      }
      const chunks: Uint8Array[] = [];
      let fileBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (failure) return;
        if (error) {
          failure = new Error(
            `zip 解压失败 ${file.name}：${formatError(error)}`,
          );
          return;
        }
        fileBytes += chunk.byteLength;
        totalBytes += chunk.byteLength;
        if (fileBytes > options.limits.maxFileBytes) {
          failure = new Error(
            `zip 单文件超过 ${formatBytes(options.limits.maxFileBytes)} 上限：${file.name}`,
          );
          file.terminate();
          return;
        }
        if (totalBytes > options.limits.maxTotalBytes) {
          failure = new Error(
            `zip 总解压尺寸超过 ${formatBytes(options.limits.maxTotalBytes)} 上限。`,
          );
          file.terminate();
          return;
        }
        chunks.push(chunk.slice());
        if (final) files.set(file.name, joinChunks(chunks, fileBytes));
      };
      file.start();
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      file.terminate();
    }
  });
  unzip.register(UnzipInflate);
  try {
    unzip.push(zipBytes, true);
  } catch (error) {
    throw failure ?? new Error(`zip 结构无效：${formatError(error)}`);
  }
  if (failure) throw failure;
  return files;
}

export function createDeterministicZip(
  entries:
    | ReadonlyMap<string, Uint8Array>
    | Readonly<Record<string, Uint8Array>>,
  options: {
    readonly level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
    readonly pathPolicy?: PackagePathPolicy;
  } = {},
): Uint8Array {
  const source =
    entries instanceof Map ? [...entries] : Object.entries(entries);
  const paths = source.map(([path]) => path);
  for (const path of paths)
    assertCanonicalPackagePath(path, options.pathPolicy);
  assertNoPackagePathCollisions(paths);
  const ordered = Object.fromEntries(
    source
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([path, bytes]) => [path, bytes.slice()]),
  );
  return zipSync(ordered, {
    level: options.level ?? 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}

function assertLimits(limits: BoundedZipLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`zip limit ${name} 必须是正安全整数。`);
  }
}

function joinChunks(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function formatBytes(bytes: number): string {
  return bytes % (1024 * 1024) === 0
    ? `${bytes / (1024 * 1024)} MiB`
    : `${bytes} bytes`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
