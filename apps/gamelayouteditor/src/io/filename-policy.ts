const SEGMENT = /^[A-Za-z0-9._-]+$/;
const NODE_ID = /^[a-z0-9][a-z0-9._-]*$/;
import { assertCanonicalPackagePath as assertSharedPackagePath } from "@slotclientengine/browserartifactio";

export function canonicalizeUploadFileName(fileName: string): string {
  if (!SEGMENT.test(fileName) || fileName === "." || fileName === "..") {
    throw new Error(
      `文件名 "${fileName}" 非法；只允许 ASCII 字母、数字、点、下划线和连字符。`,
    );
  }
  return fileName;
}

export function assertCanonicalUploadFileNames(
  files: readonly Pick<File, "name">[],
): ReadonlyMap<string, string> {
  const canonicalBySource = new Map<string, string>();
  const sourceByCanonical = new Map<string, string>();
  for (const file of files) {
    const canonical = canonicalizeUploadFileName(file.name);
    const collisionKey = canonical.toLocaleLowerCase("en-US");
    const previous = sourceByCanonical.get(collisionKey);
    if (previous !== undefined)
      throw new Error(`文件名大小写别名冲突："${previous}" / "${file.name}"。`);
    sourceByCanonical.set(collisionKey, file.name);
    canonicalBySource.set(file.name, canonical);
  }
  return canonicalBySource;
}

export function createAssetPath(fileName: string): string {
  return `assets/${canonicalizeUploadFileName(fileName)}`;
}

export function deriveNodeId(fileName: string): string {
  const canonical = canonicalizeUploadFileName(fileName).toLowerCase();
  const dot = canonical.lastIndexOf(".");
  const id = dot <= 0 ? canonical : canonical.slice(0, dot);
  if (!NODE_ID.test(id)) {
    throw new Error(`节点 id "${id}" 非法。`);
  }
  return id;
}

export function assertCanonicalPackagePath(path: string): void {
  assertSharedPackagePath(path, { requireLowercase: true });
  const segments = path.split("/");
  if (segments.some((segment) => !SEGMENT.test(segment))) {
    throw new Error(`zip 路径包含非法 segment：${path}`);
  }
}
