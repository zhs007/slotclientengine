import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POSIX_ONLY_PATTERNS = Object.freeze([
  /\b(?:bash|sh)\s+-c\b/,
  /(?:^|&&\s*|\|\|\s*)[A-Z_][A-Z0-9_]*=/,
  /(?:^|&&\s*|\|\|\s*)(?:export|source)\s+/,
  /'/,
]);

test("package scripts avoid POSIX-only shell syntax", () => {
  for (const packageJsonPath of listPackageJsonFiles(ROOT)) {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
      assert.equal(typeof command, "string", `${packageJsonPath} ${name}`);
      for (const pattern of POSIX_ONLY_PATTERNS) {
        assert.doesNotMatch(command, pattern, `${packageJsonPath} ${name}`);
      }
    }
  }
});

function listPackageJsonFiles(root) {
  const files = [join(root, "package.json")];
  for (const directory of [join(root, "apps"), join(root, "packages")]) {
    for (const entry of readdirSync(directory)) {
      const packageDirectory = join(directory, entry);
      if (!statSync(packageDirectory).isDirectory()) continue;
      const packageJsonPath = join(packageDirectory, "package.json");
      try {
        if (statSync(packageJsonPath).isFile()) files.push(packageJsonPath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  return files;
}
