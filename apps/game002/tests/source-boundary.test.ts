import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = resolve(__dirname, "..");
const BANNED_IMPORTS = Object.freeze([
  "@slotclientengine/netcore",
  "@slotclientengine/uiframeworks",
  "@slotclientengine/logiccore",
]);
const BANNED_RUNTIME_CONFIG_STRINGS = Object.freeze([
  ["VITE", "GAME002"].join("_"),
  ["7a82f5ca", "45b5aa32", "46b2ad01", "23272295"].join(""),
  ["065P8N", "OEgwd", "SXFTB6uDqX"].join(""),
  ["gameserv", "rgstest", "slammerstudios", "com"].join("."),
]);

describe("game002 source boundary", () => {
  it("uses gameframeworks as the app facade instead of direct lower-level packages", () => {
    const files = [
      ...listFiles(join(APP_ROOT, "src"), (file) => file.endsWith(".ts")),
      ...listFiles(
        join(APP_ROOT, "tests"),
        (file) =>
          file.endsWith(".ts") && basename(file) !== "source-boundary.test.ts",
      ),
      join(APP_ROOT, "package.json"),
      join(APP_ROOT, "vite.config.ts"),
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

  it("keeps game002 runtime dependencies on the framework facade and renderer only", () => {
    const packageJson = JSON.parse(
      readFileSync(join(APP_ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(packageJson.dependencies).toEqual({
      "@slotclientengine/gameframeworks": "workspace:*",
      "@slotclientengine/rendercore": "workspace:*",
      "pixi.js": "^8.1.6",
    });
  });

  it("keeps Vite source aliases limited to rendercore entrypoints", () => {
    const viteConfig = readFileSync(join(APP_ROOT, "vite.config.ts"), "utf8");

    expect(viteConfig).toContain("@slotclientengine/rendercore");
    expect(viteConfig).toContain("../../packages/rendercore/src/index.ts");
    expect(viteConfig).not.toMatch(
      /\.\.\/\.\.\/packages\/(?:logiccore|netcore|uiframeworks)\//,
    );
  });

  it("keeps static release config out of build-time env and old defaults", () => {
    const files = [
      ...listFiles(join(APP_ROOT, "src"), (file) => file.endsWith(".ts")),
      ...listFiles(join(APP_ROOT, "tests"), (file) => file.endsWith(".ts")),
      ...listFilesIfExists(join(APP_ROOT, "scripts"), (file) =>
        file.endsWith(".mjs"),
      ),
      join(APP_ROOT, "package.json"),
      join(APP_ROOT, "vite.config.ts"),
      join(APP_ROOT, "README.md"),
    ];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const banned of BANNED_RUNTIME_CONFIG_STRINGS) {
        expect(content, `${file} must not contain ${banned}`).not.toContain(
          banned,
        );
      }
    }

    const mainSource = readFileSync(join(APP_ROOT, "src/main.ts"), "utf8");
    expect(mainSource).not.toContain("import.meta.env");
  });

  it("collects runtime skin backgrounds without using the old portrait crop", () => {
    const skinConfigSource = readFileSync(
      join(APP_ROOT, "src/skin-config.ts"),
      "utf8",
    );
    const adapterSource = readFileSync(
      join(APP_ROOT, "src/game-adapter.ts"),
      "utf8",
    );

    expect(skinConfigSource).toContain("assets/game002-s1/bg.jpg?url");
    expect(skinConfigSource).toContain("assets/game002/bgfull.jpg?url");
    expect(skinConfigSource).toContain("assets/game003/bg.jpg?url");
    expect(skinConfigSource).toContain("assets/game002-s2/bg.png?url");
    expect(skinConfigSource).toContain("assets/game002-s3/bg.jpg?url");
    expect(skinConfigSource).not.toContain("assets/game002/bg.jpg?url");
    expect(adapterSource).not.toContain("assets/game002/bg.jpg?url");
    expect(adapterSource).toContain("skin.backgroundUrl");
    expect(adapterSource).toContain("skin.symbolModules");
  });

  it("keeps skin focus regions explicit and delegates art rect mapping to rendercore", () => {
    const sourceFiles = listFiles(join(APP_ROOT, "src"), (file) =>
      file.endsWith(".ts"),
    );
    const layoutSource = readFileSync(
      join(APP_ROOT, "src/game-layout.ts"),
      "utf8",
    );
    const mainSource = readFileSync(join(APP_ROOT, "src/main.ts"), "utf8");
    const skinConfigSource = readFileSync(
      join(APP_ROOT, "src/skin-config.ts"),
      "utf8",
    );
    const bannedMappingPairs = Object.freeze([
      ["rect.x", "visibleRect.x"],
      ["rect.y", "visibleRect.y"],
    ]);

    expect(skinConfigSource).toContain(
      "focusRegion: GAME002_SKIN1_FOCUS_REGION",
    );
    expect(skinConfigSource).toContain(
      "focusRegion: GAME002_SKIN2_FOCUS_REGION",
    );
    expect(skinConfigSource).toContain(
      "focusRegion: GAME002_SKIN3_FOCUS_REGION",
    );
    expect(skinConfigSource).toContain(
      "focusRegion: GAME002_SKIN4_FOCUS_REGION",
    );
    expect(skinConfigSource).toContain(
      "focusRegion: GAME002_SKIN5_FOCUS_REGION",
    );
    expect(layoutSource).toContain("mapArtRectToViewport");
    expect(mainSource).toContain("createGame002FramePolicy(skin.focusRegion)");
    expect(layoutSource).not.toMatch(/focusRegion\s*\?\?/);
    expect(layoutSource).not.toMatch(/focusRegion\s*\|\|/);

    for (const file of sourceFiles) {
      const content = readFileSync(file, "utf8");
      for (const [left, right] of bannedMappingPairs) {
        expect(content, `${file} must delegate ${left} mapping`).not.toContain(
          `${left} - ${right}`,
        );
      }
    }
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

function listFilesIfExists(
  directory: string,
  predicate: (file: string) => boolean,
): string[] {
  return existsSync(directory) ? listFiles(directory, predicate) : [];
}
