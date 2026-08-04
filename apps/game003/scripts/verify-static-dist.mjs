import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const DIST_ROOT = join(APP_ROOT, "dist");
const DIST_ASSETS = join(DIST_ROOT, "assets");
const INDEX_HTML = join(DIST_ROOT, "index.html");
const MINECART2_ROOT = join(REPO_ROOT, "assets/minecart2");
const MINECART2_LAYOUT = join(MINECART2_ROOT, "layout.manifest.json");
const MINECART2_MAP = join(MINECART2_ROOT, "assets.map.json");
const RUNTIME_CONFIG = join(APP_ROOT, "config/game-runtime.manifest.json");
const REMOVED_LEGACY_ROOT = join(REPO_ROOT, "assets", "game003-s1");
const failures = [];

verify();
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`game003 static dist check failed: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("game003 static dist check passed.");
}

function verify() {
  assertFile(INDEX_HTML);
  assertDirectory(DIST_ASSETS);
  assertFile(MINECART2_LAYOUT);
  assertFile(MINECART2_MAP);
  assertFile(RUNTIME_CONFIG);
  if (existsSync(REMOVED_LEGACY_ROOT)) {
    failures.push("legacy game003 asset directory still exists.");
  }
  verifyRuntimeConfig();
  const packageFiles = verifyMinecart2SourceContract();
  if (!existsSync(INDEX_HTML) || !existsSync(DIST_ASSETS)) return;

  const indexHtml = readFileSync(INDEX_HTML, "utf8");
  if (indexHtml.includes("/src/main.ts")) {
    failures.push("dist/index.html still references /src/main.ts.");
  }
  const refs = [...indexHtml.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(
    (match) => match[1],
  );
  if (!refs.some((ref) => /^\.\/assets\/index-.+\.js$/u.test(ref))) {
    failures.push("dist/index.html is missing its built JS entry.");
  }
  if (!refs.some((ref) => /^\.\/assets\/index-.+\.css$/u.test(ref))) {
    failures.push("dist/index.html is missing its built CSS entry.");
  }

  const distFiles = listFiles(DIST_ROOT);
  verifySensitiveStrings(distFiles);
  const distHashes = new Set(distFiles.map(hashFile));
  for (const file of packageFiles) {
    if (!distHashes.has(hashFile(file))) {
      failures.push(
        `dist is missing Minecart2 package content ${relative(MINECART2_ROOT, file)}.`,
      );
    }
  }
}

function verifyRuntimeConfig() {
  if (!existsSync(RUNTIME_CONFIG)) return;
  const config = JSON.parse(readFileSync(RUNTIME_CONFIG, "utf8"));
  if (config.version !== 1 || config.brandLabel !== "minecart2") {
    failures.push("game003 runtime config identity is invalid.");
  }
  if (config.reel?.kind !== "normal") {
    failures.push("game003 runtime config must use normal reels.");
  }
  if (Object.hasOwn(config.appExtensions ?? {}, "game003MinecartInteraction")) {
    failures.push(
      "game003 runtime config still declares minecart interaction.",
    );
  }
}

function verifyMinecart2SourceContract() {
  if (!existsSync(MINECART2_LAYOUT) || !existsSync(MINECART2_MAP)) return [];
  const layout = JSON.parse(readFileSync(MINECART2_LAYOUT, "utf8"));
  const map = JSON.parse(readFileSync(MINECART2_MAP, "utf8"));
  if (layout.version !== 1 || layout.kind !== "scene-layout") {
    failures.push("Minecart2 layout must be scene-layout version 1.");
  }
  if (map.version !== 1 || map.kind !== "editor-assets") {
    failures.push("Minecart2 asset map must be editor-assets version 1.");
  }

  const physicalPaths = new Set();
  for (const [logicalPath, entry] of Object.entries(map.files ?? {})) {
    if (
      typeof entry.path !== "string" ||
      typeof entry.sha256 !== "string" ||
      !entry.path.startsWith(`assets/${entry.sha256}.`) ||
      !Number.isSafeInteger(entry.byteLength)
    ) {
      failures.push(`Minecart2 map entry "${logicalPath}" is invalid.`);
      continue;
    }
    physicalPaths.add(entry.path);
    const file = join(MINECART2_ROOT, entry.path);
    assertFile(file);
    if (!existsSync(file)) continue;
    if (statSync(file).size !== entry.byteLength) {
      failures.push(`Minecart2 payload "${entry.path}" length drifted.`);
    }
    if (hashFile(file) !== entry.sha256) {
      failures.push(`Minecart2 payload "${entry.path}" hash drifted.`);
    }
  }
  const actual = listFiles(join(MINECART2_ROOT, "assets"))
    .map((file) => relative(MINECART2_ROOT, file).replaceAll("\\", "/"))
    .sort();
  const expected = [...physicalPaths].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      "Minecart2 physical payload closure differs from assets.map.json.",
    );
  }
  return [
    MINECART2_LAYOUT,
    MINECART2_MAP,
    ...actual.map((path) => join(MINECART2_ROOT, path)),
  ];
}

function verifySensitiveStrings(files) {
  for (const file of files.filter((path) => /\.(?:html|js|css)$/u.test(path))) {
    const content = readFileSync(file, "utf8");
    for (const marker of [
      "VITE_GAME003_",
      "serverUrl=",
      "game003MinecartInteraction",
      "createGame003BgBarRuntime",
    ]) {
      if (content.includes(marker)) {
        failures.push(`${relative(DIST_ROOT, file)} contains ${marker}.`);
      }
    }
  }
}

function assertFile(path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    failures.push(`missing file ${path}.`);
  }
}

function assertDirectory(path) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    failures.push(`missing directory ${path}.`);
  }
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
