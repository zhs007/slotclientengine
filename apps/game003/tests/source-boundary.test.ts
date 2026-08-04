import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = process.cwd();
const REPO_ROOT = resolve(APP_ROOT, "../..");

describe("game003 source boundary", () => {
  it("uses gameframeworks/rendercore without direct lower-level runtime packages", () => {
    const pkg = JSON.parse(
      readFileSync(join(APP_ROOT, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toHaveProperty("@slotclientengine/gameframeworks");
    expect(pkg.dependencies).toHaveProperty("@slotclientengine/rendercore");
    expect(pkg.dependencies).not.toHaveProperty("@slotclientengine/netcore");
    expect(pkg.dependencies).not.toHaveProperty("@slotclientengine/logiccore");
    expect(pkg.dependencies).not.toHaveProperty(
      "@slotclientengine/uiframeworks",
    );
  });

  it("keeps the loading entry light and live parameters out of import.meta.env", () => {
    const source = readSourceTree(join(APP_ROOT, "src"));
    const main = readFileSync(join(APP_ROOT, "src/main.ts"), "utf8");
    expect(source).not.toMatch(/import\.meta\.env|VITE_GAME003_/);
    expect(main).toMatch(/@slotclientengine\/gameloading/);
    expect(main).not.toMatch(/gameframeworks|rendercore|pixi\.js|game-entry/);
  });

  it("has no legacy presentation, bg-bar, conveyor, or minecart implementation", () => {
    const source = readSourceTree(join(APP_ROOT, "src"));
    for (const path of [
      "src/assets.ts",
      "src/game-layout.ts",
      "src/bg-bar-runtime.ts",
      "src/minecart-interaction-runtime.ts",
      "config/game-static.yaml",
    ]) {
      expect(existsSync(join(APP_ROOT, path))).toBe(false);
    }
    expect(source).not.toMatch(
      /createGame003BgBar|MinecartInteraction|conveyor/,
    );
    expect(source).not.toContain(["assets", "game003-s1"].join("/"));
  });

  it("keeps game003 business extensions out of shared packages", () => {
    const sharedSource = [
      "packages/rendercore/src",
      "packages/logiccore/src",
      "packages/gameframeworks/src",
    ]
      .map((path) => readSourceTree(join(REPO_ROOT, path)))
      .join("\n");
    expect(sharedSource).not.toMatch(
      /game003MinecartInteraction|game003WinSymbolLoop|game003CoinOverlay/,
    );
  });
});

function readSourceTree(root: string): string {
  const chunks: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) chunks.push(readSourceTree(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      chunks.push(readFileSync(path, "utf8"));
    }
  }
  return chunks.join("\n");
}
