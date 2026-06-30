import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export function findRepoRoot(startDir = process.cwd()): string {
  let current = resolve(startDir);
  for (;;) {
    if (
      existsSync(resolve(current, "pnpm-workspace.yaml")) &&
      existsSync(resolve(current, "package.json"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error("无法从当前目录定位仓库根目录。");
    }
    current = parent;
  }
}

export function resolveRepoPath(
  rootDir: string,
  repoRelativePath: string,
): string {
  assertRepoRelativePath(repoRelativePath, "repo path");
  return resolve(rootDir, repoRelativePath);
}

export function assertExistingFile(
  rootDir: string,
  repoRelativePath: string,
): void {
  const resolved = resolveRepoPath(rootDir, repoRelativePath);
  if (!existsSync(resolved) || !statSync(resolved).isFile()) {
    throw new Error(`引用文件不存在：${repoRelativePath}`);
  }
}

export function assertExistingDirectory(
  rootDir: string,
  repoRelativePath: string,
): void {
  const resolved = resolveRepoPath(rootDir, repoRelativePath);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(`引用目录不存在：${repoRelativePath}`);
  }
}

export function toImportSpecifier(
  outPath: string,
  targetRepoRelativePath: string,
): string {
  const fromDir = dirname(outPath);
  const targetPath = resolveRepoPath(
    findRepoRoot(fromDir),
    targetRepoRelativePath,
  );
  const specifier = normalizeImportPath(relative(fromDir, targetPath));
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

export function toImportSpecifierFromRoot(
  rootDir: string,
  outPath: string,
  targetRepoRelativePath: string,
): string {
  const specifier = normalizeImportPath(
    relative(
      dirname(outPath),
      resolveRepoPath(rootDir, targetRepoRelativePath),
    ),
  );
  return specifier.startsWith(".") ? specifier : `./${specifier}`;
}

export function assertRepoRelativePath(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} 必须是非空路径。`);
  }
  if (isAbsolute(value)) {
    throw new Error(`${label} 不能使用绝对路径：${value}`);
  }
  if (value.includes("\\")) {
    throw new Error(`${label} 必须使用 / 分隔：${value}`);
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`${label} 不能包含空段、. 或 ..：${value}`);
  }
}

export function normalizeImportPath(value: string): string {
  return value.split(sep).join("/");
}

export function assertExtension(
  path: string,
  extensions: readonly string[],
  label: string,
): void {
  const lower = path.toLowerCase();
  if (!extensions.some((extension) => lower.endsWith(extension))) {
    throw new Error(`${label} 扩展名必须是 ${extensions.join(" / ")}：${path}`);
  }
}

export function getGlobDirectory(globPath: string): string {
  const marker = "/*.png";
  if (!globPath.endsWith(marker)) {
    throw new Error(`symbol pngGlob 必须形如 assets/path/*.png：${globPath}`);
  }
  return globPath.slice(0, -marker.length);
}
