import {
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
} from "./path.js";

export interface BoundedSourceLimits {
  readonly maxEntries: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export interface SourceFileLike {
  readonly name: string;
  readonly size: number;
  readonly webkitRelativePath?: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface IndexedSourceFile {
  readonly path: string;
  readonly file: SourceFileLike;
}

export function suggestLogicalResourceId(sourceName: string): string | null {
  if (typeof sourceName !== "string" || sourceName.length === 0) return null;
  const basename = sourceName.replace(/^.*\//u, "");
  const stem = basename.replace(/\.[^.]*$/u, "");
  const normalized = stem
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s._-]+/gu, "-")
    .replace(/[^a-z0-9-]/gu, "")
    .replace(/^-+|-+$/gu, "")
    .replace(/-+/gu, "-");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized) ? normalized : null;
}

export function assertLogicalResourceId(value: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    throw new Error(`logical resource id 无效：${value}`);
  }
  return value;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!(bytes instanceof Uint8Array))
    throw new Error("SHA-256 输入必须是 Uint8Array。");
  if (!globalThis.crypto?.subtle)
    throw new Error("Web Crypto SHA-256 不可用。");
  const copy = bytes.slice();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function allocateContentAddressedPath(options: {
  readonly digest: string;
  readonly extension: string;
}): string {
  if (!/^[a-f0-9]{64}$/u.test(options.digest)) {
    throw new Error("content digest 必须是完整 64 位 lowercase SHA-256。");
  }
  const extension = options.extension.toLowerCase().replace(/^\./u, "");
  if (!/^[a-z0-9]+$/u.test(extension)) {
    throw new Error(`canonical extension 无效：${options.extension}`);
  }
  return `assets/${options.digest}.${extension}`;
}

export function createBoundedSourceIndex(
  files: readonly SourceFileLike[],
  limits: BoundedSourceLimits,
): readonly IndexedSourceFile[] {
  assertSourceLimits(limits);
  if (files.length > limits.maxEntries) {
    throw new Error(`source entry 数超过 ${limits.maxEntries} 上限。`);
  }
  let total = 0;
  const indexed = files.map((file) => {
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      throw new Error(`source file size 无效：${file.name}`);
    }
    if (file.size > limits.maxFileBytes) {
      throw new Error(
        `source 单文件超过 ${limits.maxFileBytes} bytes 上限：${file.name}`,
      );
    }
    total += file.size;
    if (total > limits.maxTotalBytes) {
      throw new Error(`source 总尺寸超过 ${limits.maxTotalBytes} bytes 上限。`);
    }
    const path = file.webkitRelativePath || file.name;
    assertCanonicalPackagePath(path);
    return Object.freeze({ path, file });
  });
  assertNoPackagePathCollisions(indexed.map(({ path }) => path));
  return Object.freeze(indexed);
}

export function resolveSourcePath(
  index: readonly IndexedSourceFile[],
  reference: string,
): IndexedSourceFile {
  assertCanonicalPackagePath(reference);
  const exact = index.find(({ path }) => path === reference);
  if (exact) return exact;
  const folded = reference.toLocaleLowerCase("en-US");
  const candidates = index.filter(
    ({ path }) => path.toLocaleLowerCase("en-US") === folded,
  );
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length > 1) {
    throw new Error(`source reference 大小写匹配存在歧义：${reference}`);
  }
  throw new Error(`source reference 缺失：${reference}`);
}

function assertSourceLimits(limits: BoundedSourceLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`source limit ${name} 必须是正安全整数。`);
    }
  }
}
