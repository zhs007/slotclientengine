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

export interface LoadedSourceFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface EditorAssetBlob {
  readonly digest: string;
  readonly extension: CanonicalAssetExtension;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

export interface EditorResourceProvenance {
  readonly sourceNames: readonly string[];
  readonly sourceKind: "files" | "directory" | "zip" | "package-import";
  readonly batchLabel: string;
}

export type CanonicalAssetExtension = "png" | "jpg" | "webp" | "json" | "atlas";

export interface DetectedAssetType {
  readonly extension: Extract<CanonicalAssetExtension, "png" | "jpg" | "webp">;
  readonly mediaType: "image/png" | "image/jpeg" | "image/webp";
}

export function suggestLogicalResourceId(sourceName: string): string | null {
  if (typeof sourceName !== "string" || sourceName.length === 0) return null;
  const basename = sourceName.replace(/^.*\//u, "");
  const stem = basename.replace(/\.[^.]*$/u, "");
  const normalized = stem
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-+/gu, "-");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized) ? normalized : null;
}

export function detectRasterAssetType(bytes: Uint8Array): DetectedAssetType {
  if (!(bytes instanceof Uint8Array))
    throw new Error("资源类型检测输入必须是 Uint8Array。");
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return Object.freeze({ extension: "png", mediaType: "image/png" });
  }
  if (
    bytes.byteLength >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    return Object.freeze({ extension: "webp", mediaType: "image/webp" });
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return Object.freeze({ extension: "jpg", mediaType: "image/jpeg" });
  }
  throw new Error("资源内容不是受支持的 PNG、JPEG 或 WebP。");
}

export async function createEditorAssetBlob(options: {
  readonly bytes: Uint8Array;
  readonly extension: CanonicalAssetExtension;
  readonly mediaType: string;
}): Promise<EditorAssetBlob> {
  const bytes = options.bytes.slice();
  const digest = await sha256Hex(bytes);
  return Object.freeze({
    digest,
    extension: options.extension,
    mediaType: options.mediaType,
    byteLength: bytes.byteLength,
    bytes,
  });
}

export function editorAssetBlobKey(
  blob: Pick<EditorAssetBlob, "digest" | "extension">,
): string {
  return `${blob.digest}.${blob.extension}`;
}

export function putEditorAssetBlob(
  store: Map<string, EditorAssetBlob>,
  blob: EditorAssetBlob,
): string {
  const key = editorAssetBlobKey(blob);
  const current = store.get(key);
  if (current && !bytesEqual(current.bytes, blob.bytes)) {
    throw new Error(`SHA-256 digest collision：${key}`);
  }
  if (!current) {
    store.set(key, Object.freeze({ ...blob, bytes: blob.bytes.slice() }));
  }
  return allocateContentAddressedPath(blob);
}

/** Non-production cache key for revocable preview objects only. */
export function ephemeralContentFingerprint(bytes: Uint8Array): string {
  let fingerprint = 0x811c9dc5;
  for (const byte of bytes)
    fingerprint = Math.imul(fingerprint ^ byte, 0x01000193) >>> 0;
  return `${bytes.byteLength}:${fingerprint.toString(16).padStart(8, "0")}`;
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

export async function loadBoundedSourceFiles(
  files: readonly SourceFileLike[],
  limits: BoundedSourceLimits,
): Promise<readonly LoadedSourceFile[]> {
  const index = createBoundedSourceIndex(files, limits);
  const loaded: LoadedSourceFile[] = [];
  for (const { path, file } of index) {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength !== file.size) {
      throw new Error(
        `source file 读取尺寸与预检不一致：${path} (${file.size} -> ${buffer.byteLength})`,
      );
    }
    loaded.push(Object.freeze({ path, bytes: new Uint8Array(buffer).slice() }));
  }
  return Object.freeze(loaded);
}

function assertSourceLimits(limits: BoundedSourceLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`source limit ${name} 必须是正安全整数。`);
    }
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}
