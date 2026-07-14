import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = resolve(__dirname, "..");
const BANNED_IMPORTS = Object.freeze([
  "@slotclientengine/netcore",
  "@slotclientengine/uiframeworks",
  "@slotclientengine/logiccore",
]);

describe("game001 source boundary", () => {
  it("uses gameframeworks as the app facade instead of direct lower-level packages", () => {
    const files = [
      ...listFiles(join(APP_ROOT, "src"), (file) => file.endsWith(".ts")),
      ...listFiles(
        join(APP_ROOT, "tests"),
        (file) =>
          file.endsWith(".ts") && basename(file) !== "source-boundary.test.ts",
      ),
      join(APP_ROOT, "package.json"),
    ];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const banned of BANNED_IMPORTS) {
        expect(content, `${file} must not reference ${banned}`).not.toContain(
          banned,
        );
      }
    }
  });

  it("keeps game001 runtime dependencies on the framework facade and renderer only", () => {
    const packageJson = JSON.parse(
      readFileSync(join(APP_ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies).toEqual({
      "@slotclientengine/gameframeworks": "workspace:*",
      "@slotclientengine/rendercore": "workspace:*",
      "pixi.js": "^8.1.6",
    });
  });

  it("resolves rendercore's transitive logiccore runtime through ESM source in Vite dev", () => {
    const viteConfig = readFileSync(join(APP_ROOT, "vite.config.ts"), "utf8");

    expect(viteConfig).toContain('find: "@slotclientengine/logiccore"');
    expect(viteConfig).toContain("../../packages/logiccore/src/index.ts");
    expect(viteConfig.indexOf("@slotclientengine/logiccore")).toBeLessThan(
      viteConfig.indexOf('find: "@slotclientengine/rendercore"'),
    );
  });
});

function listFiles(
  directory: string,
  predicate: (file: string) => boolean,
): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const file = join(directory, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      files.push(...listFiles(file, predicate));
      continue;
    }
    if (predicate(file)) {
      files.push(file);
    }
  }
  return files.sort();
}
