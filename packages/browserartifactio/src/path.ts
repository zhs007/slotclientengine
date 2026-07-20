export interface PackagePathPolicy {
  readonly requireLowercase?: boolean;
}

export function assertCanonicalPackagePath(
  value: string,
  policy: PackagePathPolicy = {},
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("package path 必须是非空字符串。");
  }
  if (value.includes("\0")) throw new Error("package path 不得包含 NUL。");
  if (value.includes("\\"))
    throw new Error("package path 必须使用 POSIX 分隔符。");
  if (/^(?:\/|[A-Za-z]:|[A-Za-z][A-Za-z0-9+.-]*:)/u.test(value)) {
    throw new Error(`package path 不得是绝对路径或 URL：${value}`);
  }
  if (/[?#]/u.test(value) || /%[0-9A-Fa-f]{2}/u.test(value)) {
    throw new Error(
      `package path 不得包含 query、hash 或 percent escape：${value}`,
    );
  }
  const segments = value.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`package path 包含非法 segment：${value}`);
  }
  if (value.normalize("NFC") !== value) {
    throw new Error(`package path 必须使用 Unicode NFC：${value}`);
  }
  if (policy.requireLowercase && value !== value.toLowerCase()) {
    throw new Error(`package path 必须为小写：${value}`);
  }
  return value;
}

export function canonicalizeManifestPackagePath(
  value: string,
  policy: PackagePathPolicy = {},
): string {
  const canonical = value.startsWith("./") ? value.slice(2) : value;
  return assertCanonicalPackagePath(canonical, policy);
}

export function resolvePackagePath(
  baseFile: string,
  reference: string,
  policy: PackagePathPolicy = {},
): string {
  const base = assertCanonicalPackagePath(baseFile, policy);
  const raw = reference.startsWith("./") ? reference.slice(2) : reference;
  if (raw.startsWith("/"))
    throw new Error(`资源引用不得是绝对路径：${reference}`);
  const stack = base.split("/").slice(0, -1);
  for (const segment of raw.split("/")) {
    if (!segment || segment === ".") {
      if (segment === ".") continue;
      throw new Error(`资源引用包含空 segment：${reference}`);
    }
    if (segment === "..") {
      if (stack.length === 0)
        throw new Error(`资源引用逃出 package 根目录：${reference}`);
      stack.pop();
    } else {
      stack.push(segment);
    }
  }
  return assertCanonicalPackagePath(stack.join("/"), policy);
}

export function assertNoPackagePathCollisions(paths: readonly string[]): void {
  const exact = new Set<string>();
  const normalized = new Map<string, string>();
  const folded = new Map<string, string>();
  for (const path of paths) {
    assertCanonicalPackagePath(path);
    if (exact.has(path)) throw new Error(`package path 重复：${path}`);
    exact.add(path);
    const nfc = path.normalize("NFC");
    const previousNormalized = normalized.get(nfc);
    if (previousNormalized && previousNormalized !== path) {
      throw new Error(
        `package path Unicode normalization collision：${previousNormalized} / ${path}`,
      );
    }
    normalized.set(nfc, path);
    const caseFold = nfc.toLocaleLowerCase("en-US");
    const previousFolded = folded.get(caseFold);
    if (previousFolded && previousFolded !== path) {
      throw new Error(
        `package path ASCII case-fold collision：${previousFolded} / ${path}`,
      );
    }
    folded.set(caseFold, path);
  }
}

/**
 * Validates package paths while permitting the exact same canonical spelling
 * to be referenced more than once. This is the correct policy for
 * content-addressed manifests: two logical resources may intentionally point
 * at the same blob, but case/NFC aliases remain ambiguous and are rejected.
 */
export function assertNoPackagePathAliases(paths: readonly string[]): void {
  const canonical = new Map<string, string>();
  for (const path of paths) {
    assertCanonicalPackagePath(path);
    const key = path.normalize("NFC").toLocaleLowerCase("en-US");
    const previous = canonical.get(key);
    if (previous !== undefined && previous !== path) {
      throw new Error(
        `package path canonical alias collision：${previous} / ${path}`,
      );
    }
    canonical.set(key, path);
  }
}
