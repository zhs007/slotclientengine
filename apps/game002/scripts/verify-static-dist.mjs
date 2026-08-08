import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const DIST_ROOT = join(APP_ROOT, "dist");
const DIST_ASSETS = join(DIST_ROOT, "assets");
const INDEX_HTML = join(DIST_ROOT, "index.html");
const CRAVE_ROOT = join(REPO_ROOT, "assets/crave");
const CRAVE_MAP_PATH = join(CRAVE_ROOT, "assets.map.json");
const CRAVE_LAYOUT_PATH = join(CRAVE_ROOT, "layout.manifest.json");
const REEL_MANIFEST = join(APP_ROOT, "config/reel-presentation.manifest.json");
const LEO_UI_ASSET_ROOT = join(REPO_ROOT, "packages/game-ui-leo/src/assets");
const LEO_UI_ASSETS = Object.freeze([
  "font/Anton-Regular.woff2",
  "font/NotoSansR.woff2",
  "controls/addbet.png",
  "controls/removbet.png",
  "controls/image-play.png",
  "controls/image-autoplay.png",
  "controls/image-fastplays.png",
  "controls/image-fasplays-off.png",
  "controls/image-background-music.png",
  "controls/image-background-music-off.png",
]);
const SENSITIVE_VALUES = Object.freeze([
  ["VITE", "GAME002"].join("_"),
  ["7a82f5ca", "45b5aa32", "46b2ad01", "23272295"].join(""),
  ["065P8N", "OEgwd", "SXFTB6uDqX"].join(""),
]);
const failures = [];

verify();

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`game002 static dist check failed: ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("game002 static dist check passed.");
}

function verify() {
  assertFile(INDEX_HTML);
  assertAbsent(join(DIST_ROOT, "visual-fixture.html"));
  assertDirectory(DIST_ASSETS);
  if (!existsSync(INDEX_HTML) || !existsSync(DIST_ASSETS)) return;

  const assetNames = readdirSync(DIST_ASSETS).sort();
  const indexHtml = readFileSync(INDEX_HTML, "utf8");
  const bundledJavaScript = assetNames
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(join(DIST_ASSETS, name), "utf8"))
    .join("\n");

  verifyIndexHtml(indexHtml);
  verifyChunkBoundaries(indexHtml, assetNames);
  verifyCraveSourceContract();
  verifyReelPresentationSourceContract();
  verifyDistAssets(assetNames, bundledJavaScript);
  verifySensitiveValues(listFiles(DIST_ROOT));
}

function verifyIndexHtml(indexHtml) {
  if (indexHtml.includes("/src/main.ts")) {
    failures.push("dist/index.html still references /src/main.ts.");
  }
  const refs = [...indexHtml.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const builtRefs = refs.filter((ref) => /\.(?:js|css)(?:$|\?)/.test(ref));
  if (!builtRefs.some((ref) => /^\.\/assets\/index-.+\.js$/.test(ref))) {
    failures.push("dist/index.html does not reference ./assets/index-*.js.");
  }
  if (!builtRefs.some((ref) => /^\.\/assets\/index-.+\.css$/.test(ref))) {
    failures.push("dist/index.html does not reference ./assets/index-*.css.");
  }
  for (const ref of builtRefs) {
    if (!ref.startsWith("./assets/")) {
      failures.push(`dist/index.html asset URL must be relative: ${ref}.`);
    }
  }
}

function verifyChunkBoundaries(indexHtml, assetNames) {
  const initialMatch = /\.\/assets\/(index-[^"']+\.js)/.exec(indexHtml);
  const bootstrapNames = assetNames.filter((name) =>
    /^game002-bootstrap-.+\.js$/.test(name),
  );
  const runtimeNames = assetNames.filter((name) =>
    /^game-entry-.+\.js$/.test(name),
  );
  if (
    !initialMatch ||
    bootstrapNames.length !== 1 ||
    runtimeNames.length !== 1
  ) {
    failures.push(
      `expected initial/bootstrap/runtime chunks, got ${Boolean(initialMatch)}/${bootstrapNames.length}/${runtimeNames.length}.`,
    );
    return;
  }
  const initial = readFileSync(join(DIST_ASSETS, initialMatch[1]), "utf8");
  const bootstrap = readFileSync(join(DIST_ASSETS, bootstrapNames[0]), "utf8");
  const runtime = readFileSync(join(DIST_ASSETS, runtimeNames[0]), "utf8");
  for (const marker of [
    "launcher.rgstest.slammerstudios.com",
    "GameDB",
    "slot-leo-ui-root",
    "react-dom",
  ]) {
    if (initial.includes(marker)) {
      failures.push(`initial loading chunk unexpectedly contains ${marker}.`);
    }
  }
  for (const marker of ["launcher.rgstest.slammerstudios.com", "GameDB"]) {
    if (!bootstrap.includes(marker)) {
      failures.push(`bootstrap chunk is missing ${marker}.`);
    }
  }
  if (!runtime.includes("slot-leo-ui-root")) {
    failures.push("formal runtime chunk is missing the Leo game UI marker.");
  }
}

function verifyCraveSourceContract() {
  assertFile(CRAVE_LAYOUT_PATH);
  assertFile(CRAVE_MAP_PATH);
  if (!existsSync(CRAVE_LAYOUT_PATH) || !existsSync(CRAVE_MAP_PATH)) return;
  const layout = JSON.parse(readFileSync(CRAVE_LAYOUT_PATH, "utf8"));
  const map = JSON.parse(readFileSync(CRAVE_MAP_PATH, "utf8"));
  if (layout.version !== 1 || layout.kind !== "scene-layout") {
    failures.push("Crave layout must declare scene-layout version=1.");
  }
  if (map.version !== 1 || map.kind !== "editor-assets") {
    failures.push(
      "Crave assets.map.json must declare editor-assets version=1.",
    );
  }
  for (const [key, asset] of Object.entries(map.files ?? {})) {
    if (!isRecord(asset) || typeof asset.path !== "string") continue;
    if (!isSafeArtPath(asset.path))
      failures.push(
        `Crave assets.map.json entry "${key}" has an unsafe physical path.`,
      );
  }
}

function verifyReelPresentationSourceContract() {
  assertFile(REEL_MANIFEST);
  if (!existsSync(REEL_MANIFEST)) return;
  const manifest = JSON.parse(readFileSync(REEL_MANIFEST, "utf8"));
  if (manifest.version !== 1) {
    failures.push("game002 reel presentation extension must use version=1.");
  }
  for (const [id, key] of [
    ["anticipation", "nearwin1"],
    ["refillSweep", "nearwin2"],
  ]) {
    const entry = manifest.spin?.cellEffects?.[id];
    if (
      entry?.skeleton !== `./${key}` ||
      entry.atlas !== "./symbol.atlas" ||
      entry.texture !== "./symbol.png" ||
      entry.animation !== "Loop"
    )
      failures.push(`game002 reel presentation "${id}" binding drifted.`);
  }
}

function verifyDistAssets(assetNames, bundledJavaScript) {
  assertOne(assetNames, /^index-[A-Za-z0-9_-]+\.js$/, "index JS");
  assertOne(assetNames, /^index-[A-Za-z0-9_-]+\.css$/, "index CSS");
  for (const [pattern, label] of [
    [/^loading2-[A-Za-z0-9_-]+\.gif$/, "loading2-*.gif"],
    [/^logo_1-[A-Za-z0-9_-]+\.webp$/, "logo_1-*.webp"],
    [/^a2-[A-Za-z0-9_-]+\.webp$/, "a2-*.webp"],
    [/^a3-[A-Za-z0-9_-]+\.webp$/, "a3-*.webp"],
  ]) {
    assertOne(assetNames, pattern, label);
  }
  verifyCraveDistClosure();
  verifyLeoGameUiClosure(assetNames, bundledJavaScript);
  if (bundledJavaScript.includes("__game002VisualFixture")) {
    failures.push("production bundle must not include the visual fixture.");
  }
  for (const legacyPattern of [
    /^background\.manifest-/,
    /^win-amount\.manifest-/,
    /^symbol-state-textures\.manifest-/,
    /^BG-[A-Za-z0-9_-]+\.(?:json|atlas)$/,
  ]) {
    if (assetNames.some((name) => legacyPattern.test(name))) {
      failures.push(
        `skin2-only dist unexpectedly contains legacy asset matching ${legacyPattern}.`,
      );
    }
  }
  for (const excluded of ["Nearwin3", "WM_Fx"]) {
    if (assetNames.some((name) => name.startsWith(`${excluded}-`))) {
      failures.push(
        `dist unexpectedly contains excluded resource ${excluded}.`,
      );
    }
  }
}

function verifyCraveDistClosure() {
  if (!existsSync(CRAVE_MAP_PATH)) return;
  const map = JSON.parse(readFileSync(CRAVE_MAP_PATH, "utf8"));
  const files = [
    CRAVE_LAYOUT_PATH,
    CRAVE_MAP_PATH,
    ...collectPresentArtFiles(CRAVE_ROOT, map),
  ];
  for (const file of files) {
    assertDistContainsCraveFile(file);
  }
}

function assertDistContainsCraveFile(sourcePath) {
  const relativePath = relative(CRAVE_ROOT, sourcePath);
  const distPath = join(DIST_ROOT, relativePath);
  if (!existsSync(distPath) || !statSync(distPath).isFile()) {
    failures.push(`dist is missing unpacked Crave file ${relativePath}.`);
    return;
  }
  if (!readFileSync(distPath).equals(readFileSync(sourcePath))) {
    failures.push(`dist Crave file content drifted: ${relativePath}.`);
  }
}

function collectPresentArtFiles(root, map) {
  const files = new Set();
  for (const asset of Object.values(map.files ?? {})) {
    if (!isRecord(asset) || typeof asset.path !== "string") continue;
    if (!isSafeArtPath(asset.path)) continue;
    const path = join(root, asset.path);
    if (existsSync(path) && statSync(path).isFile()) files.add(path);
  }
  return [...files];
}

function isSafeArtPath(path) {
  return (
    path.startsWith("assets/") &&
    !path.startsWith("/") &&
    !path.endsWith("/") &&
    !path.includes("\\") &&
    !path
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function verifyLeoGameUiClosure(assetNames, bundledJavaScript) {
  for (const relativePath of LEO_UI_ASSETS) {
    assertDistContainsAssetExactlyOnce(
      assetNames,
      join(LEO_UI_ASSET_ROOT, relativePath),
      `Leo UI ${relativePath}`,
    );
  }
  if (
    !bundledJavaScript.includes("slot-leo-ui-root") ||
    !bundledJavaScript.includes("slot-leo-ui-mount")
  ) {
    failures.push("game runtime chunks are missing the Leo UI contract.");
  }
  const reactChunks = assetNames.filter((name) => {
    if (!name.endsWith(".js")) return false;
    const content = readFileSync(join(DIST_ASSETS, name), "utf8");
    return (
      content.includes("slot-leo-ui-root") ||
      content.includes("Minified React error") ||
      content.includes("react-dom")
    );
  });
  if (reactChunks.length !== 1 || !/^game-entry-.+\.js$/.test(reactChunks[0])) {
    failures.push(
      `React and Leo UI must exist in exactly one game-entry chunk, got ${reactChunks.join(",") || "none"}.`,
    );
  }
}

function verifySensitiveValues(files) {
  for (const file of files) {
    const content = readFileSync(file);
    for (const value of SENSITIVE_VALUES) {
      if (content.includes(Buffer.from(value))) {
        failures.push(
          `production dist contains forbidden value in ${relative(DIST_ROOT, file)}.`,
        );
      }
    }
  }
}

function assertDistContainsAssetExactlyOnce(assetNames, sourcePath, label) {
  const source = readFileSync(sourcePath);
  const matches = assetNames.filter((name) =>
    readFileSync(join(DIST_ASSETS, name)).equals(source),
  );
  if (matches.length !== 1) {
    failures.push(
      `dist/assets must contain ${label} content exactly once, got ${matches.length}.`,
    );
  }
}

function assertOne(assetNames, pattern, label) {
  const matches = assetNames.filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    failures.push(
      `dist/assets must contain exactly one ${label}, got ${matches.length}.`,
    );
  }
}

function assertFile(path) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    failures.push(`missing file ${relative(REPO_ROOT, path)}.`);
  }
}

function assertDirectory(path) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    failures.push(`missing directory ${relative(REPO_ROOT, path)}.`);
  }
}

function assertAbsent(path) {
  if (existsSync(path)) {
    failures.push(`unexpected path ${relative(REPO_ROOT, path)}.`);
  }
}

function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}
