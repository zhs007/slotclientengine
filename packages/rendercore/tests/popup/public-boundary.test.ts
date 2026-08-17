import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(__dirname, "../..");

describe("popup public layer boundary", () => {
  it("keeps data independent from Pixi, DOM, runtime and editor workspace", () => {
    const data = readSourceTree(join(PACKAGE_ROOT, "src/popup/data"));
    expect(data).not.toMatch(
      /pixi\.js|editorresource|browserartifactio|\bContainer\b|\bTexture\b|\bFontFace\b|\bBlob\b|\bEventTarget\b/u,
    );
    expect(data).not.toMatch(/\.\.\/core|\.\.\/editor/u);
  });

  it("keeps core independent from mapped editor package infrastructure", () => {
    const core = readSourceTree(join(PACKAGE_ROOT, "src/popup/core"));
    expect(core).not.toMatch(/editorresource|browserartifactio/u);
    expect(core).not.toMatch(/\bApplication\b|requestAnimationFrame|\bRAF\b/u);
    expect(core).not.toMatch(/\.\.\/editor/u);
  });

  it("exports only data/core/editor subpaths and keeps snapshots out of core", () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(pkg.exports).toHaveProperty("./popup/data");
    expect(pkg.exports).toHaveProperty("./popup/core");
    expect(pkg.exports).toHaveProperty("./popup/editor");
    expect(pkg.exports).not.toHaveProperty("./popup");

    const root = readFileSync(join(PACKAGE_ROOT, "src/index.ts"), "utf8");
    const core = readFileSync(
      join(PACKAGE_ROOT, "src/popup/core/index.ts"),
      "utf8",
    );
    expect(root).not.toMatch(/popup\/index/u);
    expect(core).not.toMatch(/AwardCelebrationSnapshot|SpinePopupSnapshot/u);
    expect(core).not.toMatch(
      /createPopupPresentation|attachPopupLayerRuntimes|createPopupStyledText|acquirePopupFont|createPopupPromptText/u,
    );
  });
});

function readSourceTree(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"))
    .map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? readSourceTree(path)
        : entry.name.endsWith(".ts")
          ? readFileSync(path, "utf8")
          : "";
    })
    .join("\n");
}
