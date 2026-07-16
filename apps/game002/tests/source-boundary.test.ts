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
      "@slotclientengine/gameloading": "workspace:*",
      "@slotclientengine/gameframeworks": "workspace:*",
      "@slotclientengine/rendercore": "workspace:*",
      "pixi.js": "^8.1.6",
    });
  });

  it("keeps Vite source aliases aligned across rendercore and its logiccore runtime", () => {
    const viteConfig = readFileSync(join(APP_ROOT, "vite.config.ts"), "utf8");

    expect(viteConfig).toContain('find: "@slotclientengine/logiccore"');
    expect(viteConfig).toContain("../../packages/logiccore/src/index.ts");
    expect(viteConfig).toContain("@slotclientengine/rendercore");
    expect(viteConfig).toContain("../../packages/rendercore/src/index.ts");
    expect(viteConfig).toContain(
      "../../packages/rendercore/src/background/index.ts",
    );
    expect(viteConfig.indexOf("rendercore/background")).toBeLessThan(
      viteConfig.indexOf('find: "@slotclientengine/rendercore"'),
    );
    expect(viteConfig.indexOf("@slotclientengine/logiccore")).toBeLessThan(
      viteConfig.indexOf('find: "@slotclientengine/rendercore"'),
    );
    expect(viteConfig).not.toMatch(
      /\.\.\/\.\.\/packages\/(?:netcore|uiframeworks)\//,
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

  it("packages only game002-s3 assets and no legacy skin resources", () => {
    const skinConfigSource = readFileSync(
      join(APP_ROOT, "src/skin-config.ts"),
      "utf8",
    );
    const adapterSource = readFileSync(
      join(APP_ROOT, "src/game-adapter.ts"),
      "utf8",
    );

    const backgroundConfigSource = readFileSync(
      join(APP_ROOT, "src/background-config.ts"),
      "utf8",
    );
    expect(backgroundConfigSource).toContain(
      "assets/game002-s3/background.manifest.json",
    );
    expect(skinConfigSource).toContain("assets/game002-s3/reel.manifest.json");
    expect(skinConfigSource).toContain("parseReelManifest");
    expect(skinConfigSource).not.toContain("bounceStrength: 0");
    expect(skinConfigSource).not.toContain("dimmingAlpha: 0.6");
    expect(backgroundConfigSource).toContain(
      "{BG,BG_2,BG_3,BG_4,BG_5,BG_6,BG_7,BG_8}.png",
    );
    expect(backgroundConfigSource).toContain("spineAtlasPage=");
    for (const legacyPath of [
      "symbols" + "001",
      "symbols" + "002",
      "symbols" + "003",
      "game002" + "-s1",
      "game002" + "-s2",
      ["game002", "bgfull"].join("/"),
      ["assets", "game003", "bg"].join("/"),
    ]) {
      expect(skinConfigSource).not.toContain(legacyPath);
    }
    expect(skinConfigSource).not.toMatch(/game002-s3\/\*\.(?:png|json)/);
    expect(backgroundConfigSource).not.toMatch(/game002-s3\/(?:\*|\*\*)/);
    expect(adapterSource).toContain("skin.background");
    expect(adapterSource).not.toContain("backgroundUrl");
    expect(adapterSource).not.toContain("createPositionedSprite");
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
    const gameEntrySource = readFileSync(
      join(APP_ROOT, "src/game-entry.ts"),
      "utf8",
    );
    const skinConfigSource = readFileSync(
      join(APP_ROOT, "src/skin-config.ts"),
      "utf8",
    );
    const bannedMappingPairs = Object.freeze([
      ["rect.x", "visibleRect.x"],
      ["rect.y", "visibleRect.y"],
    ]);

    expect(skinConfigSource).toContain(
      "GAME002_BACKGROUND_RESOURCE.manifest.adaptation.focusRect",
    );
    expect(layoutSource).toContain("GAME002_BACKGROUND_MANIFEST.artSize");
    expect(layoutSource).toContain("mapArtRectToViewport");
    expect(layoutSource).toContain("createMaximizedFocusedArtViewportPolicy");
    expect(gameEntrySource).toContain(
      "createGame002FramePolicy(options.prepared.skin.focusRegion)",
    );
    expect(skinConfigSource).not.toContain("frameFocusRect");
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

  it("keeps Spine ownership in rendercore and loading before framework entry", () => {
    const source = listFiles(join(APP_ROOT, "src"), (file) =>
      file.endsWith(".ts"),
    )
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).not.toContain(
      ["@esotericsoftware", "spine-pixi-v8"].join("/"),
    );
    expect(source).toContain("createGameLoading");
    expect(source).toContain("prepareSlotGameLiveSession");
    expect(source).toContain("createSymbolManifestAnimationResolver");
    expect(source).toContain("createSpineBackgroundPlayer");
    for (const gameSpecificAnimation of ["BG_FG", "FG_BG"]) {
      expect(source).not.toContain(gameSpecificAnimation);
    }
  });

  it("keeps game-owned win rules out of the shared carousel and ReelSet internals out of the app", () => {
    const appSource = readSourceTree(join(APP_ROOT, "src"));
    const repoRoot = resolve(APP_ROOT, "../..");
    const carouselRoot = join(
      repoRoot,
      "packages/rendercore/src/symbol-win-carousel",
    );
    const carouselSource = readSourceTree(carouselRoot);

    expect(carouselSource).not.toMatch(/bg-win|bg-wins|GAME002_|GAME003_/);
    expect(carouselSource).not.toMatch(
      /RenderReelSet|RenderGridCellReelSet|instanceof\s+Render/,
    );
    expect(appSource).not.toMatch(
      /getComponentWinResultGroups|parseWinResultPositions/,
    );
    expect(appSource).not.toMatch(/\.children[\s\S]{0,80}requestState/);
  });

  it("keeps CN tier selection generic and generated from the manifest", () => {
    const repoRoot = resolve(APP_ROOT, "../..");
    const sharedSource = readSourceTree(
      join(repoRoot, "packages/rendercore/src/symbol-value-presentation"),
    );
    const handwrittenAppSource = listFiles(
      join(APP_ROOT, "src"),
      (file) =>
        file.endsWith(".ts") && !file.includes(`${join("src", "generated")}`),
    )
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(sharedSource).not.toMatch(/bg-gencoins|GAME002_CN|CN_[0-9]/);
    expect(sharedSource).not.toMatch(/RenderGridCellReelSet|RenderReelSet/);
    expect(handwrittenAppSource).not.toMatch(/CN_[1-4]|CN_\$\{/);
    expect(handwrittenAppSource).not.toMatch(/\[10,\s*100,\s*1000\]/);
  });

  it("keeps cascade choreography generic in rendercore and Pixi-owned in the app", () => {
    const repoRoot = resolve(APP_ROOT, "../..");
    const sharedSource = [
      readSourceTree(join(repoRoot, "packages/rendercore/src/symbol-cascade")),
      readSourceTree(join(repoRoot, "packages/rendercore/src/symbol")),
    ].join("\n");
    const appSource = readSourceTree(join(APP_ROOT, "src"));

    expect(sharedSource).not.toMatch(
      /\bCN\b|bg-win|Win_Start|\bCollect\b|GAME002_|coinWin64|cashWin64/,
    );
    expect(sharedSource).not.toMatch(/"winStart"|"winLoop"|"collect"/);
    expect(appSource).not.toMatch(
      /cashWin64[\s\S]{0,40}coin|cashWin[\s\S]{0,40}coin/,
    );
    const summarySource = [
      readFileSync(join(APP_ROOT, "src/cascade-win-summary-config.ts"), "utf8"),
      readFileSync(join(APP_ROOT, "src/cascade-sequence.ts"), "utf8"),
    ].join("\n");
    expect(summarySource).not.toMatch(/querySelector|document\.|\.children\[/);
    expect(appSource).not.toContain("@esotericsoftware/spine-pixi-v8");
  });
});

function readSourceTree(directory: string): string {
  return listFiles(directory, (file) => file.endsWith(".ts"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

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
