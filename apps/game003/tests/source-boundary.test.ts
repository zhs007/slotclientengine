import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = process.cwd();
const REPO_ROOT = resolve(APP_ROOT, "../..");

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

  it("does not import netcore, uiframeworks, logiccore, or vnicore directly from source", () => {
    const source = readSourceTree(join(APP_ROOT, "src"));

    expect(source).not.toMatch(/@slotclientengine\/netcore/);
    expect(source).not.toMatch(/@slotclientengine\/uiframeworks/);
    expect(source).not.toMatch(/@slotclientengine\/logiccore/);
    expect(source).not.toMatch(/@slotclientengine\/vnicore/);
    expect(source).not.toMatch(/@esotericsoftware\/spine-pixi-v8/);
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

  it("keeps layout anchored by static focus-relative positions", () => {
    const source = readSourceTree(join(APP_ROOT, "src"));

    expect(source).toMatch(/mainReelBackgroundPositionInFocusRect/);
    expect(source).toMatch(/positionInFocusRect/);
    expect(source).not.toMatch(
      new RegExp(["left", "bottom", "of", "main", "reel"].join("-")),
    );
    expect(source).not.toMatch(
      new RegExp(["top", "center", "of", "main", "reel"].join("-")),
    );
    expect(source).not.toMatch(new RegExp(["scenePart", "Gap"].join("")));
    expect(source).not.toMatch(/rect\.x - visibleRect\.x/);
    expect(source).not.toMatch(/rect\.y - visibleRect\.y/);
  });

  it("keeps bg-bar slot placement explicit instead of deriving from conveyor size", () => {
    const bgBarSource = [
      readFileSync(join(APP_ROOT, "src/bg-bar-layout.ts"), "utf8"),
      readFileSync(join(APP_ROOT, "src/bg-bar-runtime.ts"), "utf8"),
      readFileSync(join(APP_ROOT, "config/game-static.yaml"), "utf8"),
    ].join("\n");

    expect(bgBarSource).toMatch(/slotRectsInConveyor/);
    expect(bgBarSource).not.toMatch(/height\s*\/\s*5/);
    expect(bgBarSource).not.toMatch(/width\s*\/\s*5/);
  });

  it("keeps minecart interaction semantics out of shared packages", () => {
    const sharedSource = [
      readSourceTree(join(REPO_ROOT, "packages/rendercore/src")),
      readSourceTree(join(REPO_ROOT, "packages/logiccore/src")),
      readSourceTree(join(REPO_ROOT, "packages/gameframeworks/src")),
    ].join("\n");

    expect(sharedSource).not.toMatch(
      /minecart|Minecart|game003MinecartInteraction|game003-minecart/,
    );
  });

  it("keeps bg-wins result loop and amount overlay semantics out of shared packages", () => {
    const sharedSource = [
      readSourceTree(join(REPO_ROOT, "packages/rendercore/src")),
      readSourceTree(join(REPO_ROOT, "packages/logiccore/src")),
      readSourceTree(join(REPO_ROOT, "packages/gameframeworks/src")),
    ].join("\n");

    expect(sharedSource).not.toMatch(
      /bg-wins|game003WinSymbolLoop|resultAmount/,
    );
  });

  it("keeps L1-L5 VNI animation selection out of win playback business code", () => {
    const businessSource = [
      readFileSync(join(APP_ROOT, "src/game-adapter.ts"), "utf8"),
      readFileSync(join(APP_ROOT, "src/game-demo.ts"), "utf8"),
    ].join("\n");

    expect(businessSource).not.toMatch(/L[1-5]-wins/);
    expect(businessSource).not.toMatch(/stageRect/);
    expect(businessSource).not.toMatch(/kind:\s*["']vni["']/);
    expect(businessSource).not.toMatch(/\bL[1-5]\b/);
  });

  it("keeps symbol render priority as manifest data instead of runtime branches", () => {
    const runtimeSource = [
      readFileSync(join(APP_ROOT, "src/game-adapter.ts"), "utf8"),
      readFileSync(join(APP_ROOT, "src/game-demo.ts"), "utf8"),
      readFileSync(join(APP_ROOT, "src/skin-config.ts"), "utf8"),
    ].join("\n");

    expect(runtimeSource).toMatch(/SymbolRenderPriorityMapFromManifest/);
    expect(runtimeSource).not.toMatch(/zIndex[\s\S]{0,120}\b(?:SC|CL|WL)\b/);
    expect(runtimeSource).not.toMatch(
      /\b(?:SC|CL|WL)\b[\s\S]{0,120}renderPriority/,
    );
  });

  it("keeps Spine skeleton globs explicit and out-of-scope JSON resources out of runtime config", () => {
    const runtimeConfigSource = [
      readSourceTree(join(APP_ROOT, "src")),
      readFileSync(join(APP_ROOT, "config/game-static.yaml"), "utf8"),
    ].join("\n");

    expect(runtimeConfigSource).not.toContain(
      ["assets/game003-s1/", "*.json"].join(""),
    );
    expect(runtimeConfigSource).toMatch(/\{WL,H1,H2,H3,H4,H5,CL,SC\}\.json/);
    const outOfScopeSymbols = [
      ["B", "N"],
      ["C", "N"],
      ["E", "S"],
      ["M", "P", "2"],
      ["R", "S"],
      ["Reel", "_", "Near", "Win"],
      ["U", "P"],
      ["U", "P", "C", "N"],
    ].map((parts) => parts.join(""));

    for (const outOfScope of outOfScopeSymbols) {
      expect(runtimeConfigSource).not.toMatch(
        new RegExp(`\\b${outOfScope}\\b`),
      );
    }
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
