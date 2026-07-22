import {
  createBoundedSourceIndex,
  extractBoundedZip,
  type BoundedSourceLimits,
  type BoundedZipLimits,
  type SourceFileLike,
} from "@slotclientengine/browserartifactio";
import {
  basenameFromSourcePath,
  editorAssetKeyCollisionToken,
  type EditorAssetKey,
} from "./key.js";

export interface EditorImportSourceFile {
  readonly sourcePath: string;
  readonly key: EditorAssetKey;
  readonly bytes: Uint8Array;
  readonly container: "file" | "zip";
  readonly containerName: string;
}

export interface EditorIngestionLimits {
  readonly files: BoundedSourceLimits;
  readonly zip: BoundedZipLimits;
}

export function normalizeEditorPackageZipEntries(
  entries: ReadonlyMap<string, Uint8Array>,
  rootSentinels: readonly string[],
): Map<string, Uint8Array> {
  if (entries.size === 0) throw new Error("zip 为空或结构无效。");
  const filtered = new Map(
    [...entries].filter(([path]) => !isMacOsMetadataPath(path)),
  );
  if (filtered.size === 0) throw new Error("ZIP 只包含 macOS metadata。");
  if (rootSentinels.some((sentinel) => filtered.has(sentinel))) return filtered;
  const outerDirectories = new Set(
    [...filtered.keys()].map((path) => path.split("/")[0]!),
  );
  if (outerDirectories.size !== 1) return filtered;
  if ([...filtered.keys()].some((path) => !path.includes("/"))) return filtered;
  const outerDirectory = [...outerDirectories][0]!;
  const unwrapped = new Map(
    [...filtered].map(([path, bytes]) => [
      path.slice(outerDirectory.length + 1),
      bytes,
    ]),
  );
  return rootSentinels.some((sentinel) => unwrapped.has(sentinel))
    ? unwrapped
    : filtered;
}

export async function ingestEditorResourceSources(options: {
  readonly files: readonly SourceFileLike[];
  readonly limits: EditorIngestionLimits;
}): Promise<readonly EditorImportSourceFile[]> {
  const indexed = createBoundedSourceIndex(options.files, options.limits.files);
  const output: EditorImportSourceFile[] = [];
  for (const { path, file } of indexed) {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength !== file.size)
      throw new Error(`source file 读取尺寸与预检不一致：${path}`);
    const bytes = new Uint8Array(buffer);
    if (isZip(bytes)) {
      const extracted = normalizeEditorPackageZipEntries(
        extractBoundedZip(bytes, {
          limits: options.limits.zip,
        }),
        [],
      );
      for (const [innerPath, innerBytes] of extracted)
        output.push(
          Object.freeze({
            sourcePath: innerPath,
            key: basenameFromSourcePath(innerPath),
            bytes: innerBytes.slice(),
            container: "zip" as const,
            containerName: path,
          }),
        );
    } else {
      output.push(
        Object.freeze({
          sourcePath: path,
          key: basenameFromSourcePath(path),
          bytes: bytes.slice(),
          container: "file" as const,
          containerName: path,
        }),
      );
    }
  }
  return Object.freeze(output);
}

export interface EditorFormatAdapter<TParsed = unknown> {
  readonly id: string;
  readonly discover: (
    files: readonly EditorImportSourceFile[],
  ) =>
    | readonly EditorAdapterCandidate<TParsed>[]
    | Promise<readonly EditorAdapterCandidate<TParsed>[]>;
}

export interface EditorAdapterProfile {
  readonly id: string;
  readonly label: string;
  readonly byteLength: number;
  readonly width?: number;
  readonly height?: number;
  readonly scale?: number;
}

export interface EditorAdapterCandidate<TParsed = unknown> {
  readonly adapterId: string;
  readonly rootKey: EditorAssetKey;
  readonly exactKeys: readonly EditorAssetKey[];
  readonly parsed: TParsed;
  readonly profiles?: readonly EditorAdapterProfile[];
  readonly selectedProfileId?: string;
  readonly diagnostics: readonly string[];
}

export async function discoverEditorAdapterCandidates(options: {
  readonly files: readonly EditorImportSourceFile[];
  readonly adapters: readonly EditorFormatAdapter[];
}): Promise<readonly EditorAdapterCandidate[]> {
  const claimed = new Map<string, string>();
  const candidates: EditorAdapterCandidate[] = [];
  for (const adapter of options.adapters) {
    const discovered = await adapter.discover(options.files);
    for (const candidate of discovered) {
      if (candidate.adapterId !== adapter.id)
        throw new Error(`adapter ${adapter.id} 返回了错误 adapterId。`);
      for (const key of candidate.exactKeys) {
        const token = editorAssetKeyCollisionToken(key);
        const previous = claimed.get(token);
        if (previous && previous !== candidate.rootKey)
          throw new Error(`资源被多个 adapter candidate 消费：${key}`);
        claimed.set(token, candidate.rootKey);
      }
      candidates.push(candidate);
    }
  }
  return Object.freeze(candidates);
}

export function chooseEditorAdapterProfile<T>(
  candidate: EditorAdapterCandidate<T>,
  profileId: string,
): EditorAdapterCandidate<T> {
  const profile = candidate.profiles?.find(({ id }) => id === profileId);
  if (!profile) throw new Error(`未找到 adapter profile：${profileId}`);
  return Object.freeze({ ...candidate, selectedProfileId: profile.id });
}

export function assertEditorAdapterProfilesChosen(
  candidates: readonly EditorAdapterCandidate[],
): void {
  const missing = candidates.filter(
    ({ profiles, selectedProfileId }) => profiles?.length && !selectedProfileId,
  );
  if (missing.length)
    throw new Error(
      `以下资源必须明确选择 profile：${missing.map(({ rootKey }) => rootKey).join(", ")}`,
    );
}

function isZip(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}

function isMacOsMetadataPath(path: string): boolean {
  const segments = path.split("/");
  const basename = segments.at(-1)!;
  return (
    segments.includes("__MACOSX") ||
    basename === ".DS_Store" ||
    basename.startsWith("._")
  );
}
