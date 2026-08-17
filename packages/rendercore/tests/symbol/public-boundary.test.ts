import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(__dirname, "../..");

describe("symbol public boundary", () => {
  it("exports only data/core/editor symbol subpaths", () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(pkg.exports).toHaveProperty("./symbol/data");
    expect(pkg.exports).toHaveProperty("./symbol/core");
    expect(pkg.exports).toHaveProperty("./symbol/editor");
    expect(pkg.exports).not.toHaveProperty("./symbol");
  });

  it("keeps the mutable player out of public barrels", () => {
    const root = readFileSync(join(PACKAGE_ROOT, "src/index.ts"), "utf8");
    const core = readFileSync(
      join(PACKAGE_ROOT, "src/symbol/core/index.ts"),
      "utf8",
    );
    const editor = readFileSync(
      join(PACKAGE_ROOT, "src/symbol/editor/index.ts"),
      "utf8",
    );
    expect(root).not.toMatch(/symbol\/index/u);
    expect(core).not.toMatch(/symbol-player/u);
    expect(editor).not.toMatch(/symbol-player/u);
    expect(editor).toContain("preview-player");
  });

  it("keeps data and core barrels independent of editor exports", () => {
    const data = readFileSync(
      join(PACKAGE_ROOT, "src/symbol/data/index.ts"),
      "utf8",
    );
    const core = readFileSync(
      join(PACKAGE_ROOT, "src/symbol/core/index.ts"),
      "utf8",
    );
    expect(data).not.toMatch(/\/editor|editorresource|pixi\.js/u);
    expect(core).not.toMatch(/\/editor|editorresource/u);
  });
});
