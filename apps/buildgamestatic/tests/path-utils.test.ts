import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertExistingDirectory,
  assertExistingFile,
  assertExtension,
  assertRepoRelativePath,
  findRepoRoot,
  getGlobDirectory,
  toImportSpecifier,
  toImportSpecifierFromRoot,
} from "../src/path-utils.js";

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots = [];
});

describe("buildgamestatic path utils", () => {
  it("finds repo root and creates stable relative import specifiers", () => {
    const root = createRepoRoot();
    const outPath = join(
      root,
      "apps/game003/src/generated/game-static.generated.ts",
    );

    expect(findRepoRoot(join(root, "apps/game003/src/generated"))).toBe(root);
    expect(toImportSpecifier(outPath, "assets/game003-s1/bg1.jpg")).toBe(
      "../../../../assets/game003-s1/bg1.jpg",
    );
    expect(
      toImportSpecifierFromRoot(root, outPath, "assets/game003-s1/bg1.jpg"),
    ).toBe("../../../../assets/game003-s1/bg1.jpg");
    expect(getGlobDirectory("assets/game003-s1/*.png")).toBe(
      "assets/game003-s1",
    );
  });

  it("fails fast for invalid paths, missing files and wrong extensions", () => {
    const root = createRepoRoot();

    expect(() => assertExistingFile(root, "assets/missing.json")).toThrow(
      /引用文件不存在/,
    );
    expect(() => assertExistingDirectory(root, "assets/missing")).toThrow(
      /引用目录不存在/,
    );
    expect(() => assertRepoRelativePath("", "path")).toThrow(/非空路径/);
    expect(() => assertRepoRelativePath("/abs/file", "path")).toThrow(
      /不能使用绝对路径/,
    );
    expect(() => assertRepoRelativePath("a\\b", "path")).toThrow(
      /必须使用 \/ 分隔/,
    );
    expect(() => assertRepoRelativePath("a/../b", "path")).toThrow(/不能包含/);
    expect(() => assertExtension("bg.txt", [".jpg"], "background")).toThrow(
      /扩展名/,
    );
    expect(() => getGlobDirectory("assets/game003-s1/*.jpg")).toThrow(
      /pngGlob/,
    );
  });
});

function createRepoRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "buildgamestatic-path-"));
  roots.push(root);
  mkdirSync(join(root, "apps/game003/src/generated"), { recursive: true });
  mkdirSync(join(root, "assets/game003-s1"), { recursive: true });
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []", "utf8");
  writeFileSync(join(root, "package.json"), "{}", "utf8");
  writeFileSync(join(root, "assets/game003-s1/bg1.jpg"), "", "utf8");
  return root;
}
