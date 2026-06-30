import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = process.cwd();

describe("game003 source boundary", () => {
  it("depends on gameframeworks and rendercore without direct live/UI/logic packages", () => {
    const pkg = JSON.parse(
      readFileSync(join(APP_ROOT, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };

    expect(pkg.dependencies).toHaveProperty("@slotclientengine/gameframeworks");
    expect(pkg.dependencies).toHaveProperty("@slotclientengine/gameloading");
    expect(pkg.dependencies).toHaveProperty("@slotclientengine/rendercore");
    expect(pkg.dependencies).not.toHaveProperty("@slotclientengine/netcore");
    expect(pkg.dependencies).not.toHaveProperty(
      "@slotclientengine/uiframeworks",
    );
    expect(pkg.dependencies).not.toHaveProperty("@slotclientengine/logiccore");
  });

  it("does not import netcore, uiframeworks, or logiccore directly from source", () => {
    const source = readSourceTree(join(APP_ROOT, "src"));

    expect(source).not.toMatch(/@slotclientengine\/netcore/);
    expect(source).not.toMatch(/@slotclientengine\/uiframeworks/);
    expect(source).not.toMatch(/@slotclientengine\/logiccore/);
  });

  it("keeps live runtime parameters out of import.meta.env", () => {
    const source = readSourceTree(join(APP_ROOT, "src"));

    expect(source).not.toMatch(/import\.meta\.env/);
    expect(source).not.toMatch(/VITE_GAME003_/);
  });

  it("keeps main.ts as a light loading entry without static game runtime imports", () => {
    const mainSource = readFileSync(join(APP_ROOT, "src/main.ts"), "utf8");

    expect(mainSource).toMatch(/@slotclientengine\/gameloading/);
    expect(mainSource).not.toMatch(/@slotclientengine\/gameframeworks/);
    expect(mainSource).not.toMatch(/@slotclientengine\/rendercore/);
    expect(mainSource).not.toMatch(/pixi\.js/);
    expect(mainSource).not.toMatch(/\.\/game-entry/);
    expect(mainSource).not.toMatch(/\.\/game-adapter/);
    expect(mainSource).not.toMatch(/\.\/game-demo/);
  });
});

function readSourceTree(root: string): string {
  const chunks: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      chunks.push(readSourceTree(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      chunks.push(readFileSync(entryPath, "utf8"));
    }
  }
  return chunks.join("\n");
}
