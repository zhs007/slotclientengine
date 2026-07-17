const SEGMENT = /^[A-Za-z0-9._-]+$/;
const NODE_ID = /^[a-z0-9][a-z0-9._-]*$/;

export function canonicalizeUploadFileName(fileName: string): string {
  if (!SEGMENT.test(fileName) || fileName === "." || fileName === "..") {
    throw new Error(
      `文件名 "${fileName}" 非法；只允许 ASCII 字母、数字、点、下划线和连字符。`,
    );
  }
  return fileName.toLowerCase();
}

export function createAssetPath(fileName: string): string {
  return `assets/${canonicalizeUploadFileName(fileName)}`;
}

export function deriveNodeId(fileName: string): string {
  const canonical = canonicalizeUploadFileName(fileName);
  const dot = canonical.lastIndexOf(".");
  const id = dot <= 0 ? canonical : canonical.slice(0, dot);
  if (!NODE_ID.test(id)) {
    throw new Error(`节点 id "${id}" 非法。`);
  }
  return id;
}

export function assertCanonicalPackagePath(path: string): void {
  if (path !== path.toLowerCase()) {
    throw new Error(`zip 路径必须为小写：${path}`);
  }
  if (path.includes("\\") || path.startsWith("/") || /^[a-z]:/i.test(path)) {
    throw new Error(`zip 路径必须是相对 POSIX 路径：${path}`);
  }
  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        !SEGMENT.test(segment),
    )
  ) {
    throw new Error(`zip 路径包含非法 segment：${path}`);
  }
}

export function rewriteAtlasPageNamesToLowercase(atlasText: string): {
  readonly atlasText: string;
  readonly pages: readonly string[];
} {
  const lines = atlasText.replace(/\r\n?/g, "\n").split("\n");
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || /^\s/.test(line) || line.includes(":")) continue;
    const next = lines
      .slice(index + 1)
      .find((candidate) => candidate.length > 0);
    if (!next?.startsWith("size:")) continue;
    const canonical = canonicalizeUploadFileName(line);
    lines[index] = canonical;
    pages.push(canonical);
  }
  if (pages.length === 0) throw new Error("Spine atlas 没有可识别的 page。");
  if (new Set(pages).size !== pages.length) {
    throw new Error("Spine atlas page 小写化后发生冲突。");
  }
  return Object.freeze({
    atlasText: `${lines.join("\n").replace(/\n+$/u, "")}\n`,
    pages: Object.freeze(pages),
  });
}
