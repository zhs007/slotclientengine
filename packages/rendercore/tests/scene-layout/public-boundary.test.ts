import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = resolve(__dirname, "../..");

describe("scene-layout public layer boundary", () => {
  it("exports only explicit data/core/editor subpaths", () => {
    const pkg = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(pkg.exports).toHaveProperty("./scene-layout/data");
    expect(pkg.exports).toHaveProperty("./scene-layout/core");
    expect(pkg.exports).toHaveProperty("./scene-layout/editor");
    expect(pkg.exports).not.toHaveProperty("./scene-layout");

    const root = readFileSync(join(PACKAGE_ROOT, "src/index.ts"), "utf8");
    expect(root).not.toMatch(/scene-layout\/index/u);
  });

  it("keeps package/editor adapters out of the data and core barrels", () => {
    const data = readFileSync(
      join(PACKAGE_ROOT, "src/scene-layout/data/index.ts"),
      "utf8",
    );
    const core = readFileSync(
      join(PACKAGE_ROOT, "src/scene-layout/core/index.ts"),
      "utf8",
    );
    expect(data).not.toMatch(
      /package-resource|production-zip|local-scene|configured-round|template-presentation|\/editor/u,
    );
    expect(core).not.toMatch(
      /production-zip|local-scene|configured-round|template-presentation|\/editor/u,
    );
  });

  it("keeps standalone app loops in the editor layer", () => {
    const core = readFileSync(
      join(PACKAGE_ROOT, "src/scene-layout/core/index.ts"),
      "utf8",
    );
    const editor = readFileSync(
      join(PACKAGE_ROOT, "src/scene-layout/editor/index.ts"),
      "utf8",
    );
    expect(core).not.toMatch(/local-scene-flow/u);
    expect(editor).toMatch(/local-scene-flow/u);
  });
});
