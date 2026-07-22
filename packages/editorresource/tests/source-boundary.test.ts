import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const EDITOR_SOURCE_ROOTS = [
  "apps/imgnumbereditor/src",
  "apps/popupeditor/src",
  "apps/symbolseditor/src",
  "apps/gamelayouteditor/src",
  "packages/editorresource/src",
] as const;

const FORBIDDEN = [
  /webkitdirectory/u,
  /webkitRelativePath/u,
  /data-upload-directory/u,
  /upload-folder/u,
  /suggestLogicalResourceId/u,
  /assertLogicalResourceId/u,
  /sourceKind:\s*["']directory["']/u,
  /dependencies\/(?:image-strings|symbols|popups)\//u,
  /logicalResource/u,
  /defaultLogical/u,
] as const;

describe("four-editor source boundary", () => {
  it("does not restore directory, logical-id, or nested dependency paths", () => {
    const repository = resolve(process.cwd(), "../..");
    const violations: string[] = [];
    for (const relativeRoot of EDITOR_SOURCE_ROOTS) {
      const root = resolve(repository, relativeRoot);
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        for (const pattern of FORBIDDEN)
          if (pattern.test(source))
            violations.push(
              `${file.slice(repository.length + 1)} matches ${pattern.source}`,
            );
      }
    }
    expect(violations).toEqual([]);
  });
});

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx|html)$/u.test(entry.name) ? [path] : [];
  });
}
