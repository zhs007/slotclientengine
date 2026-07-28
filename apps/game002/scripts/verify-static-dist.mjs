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
const EXTENSION_ROOT = join(REPO_ROOT, "assets/game002-s3");
const EXTENSION_REEL_MANIFEST = join(EXTENSION_ROOT, "reel.manifest.json");
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
const EXTENSION_EFFECTS = Object.freeze([
  { id: "anticipation", skeleton: "Nearwin1.json" },
  { id: "refillSweep", skeleton: "Nearwin2.json" },
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
  verifyPresentationExtensionSourceContract();
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
  const physicalPaths = new Set();
  for (const [key, asset] of Object.entries(map.files ?? {})) {
    if (
      typeof asset.path !== "string" ||
      typeof asset.sha256 !== "string" ||
      !asset.path.startsWith(`assets/${asset.sha256}.`) ||
      !Number.isSafeInteger(asset.byteLength)
    ) {
      failures.push(`Crave assets.map.json entry "${key}" is invalid.`);
      continue;
    }
    physicalPaths.add(asset.path);
    const path = join(CRAVE_ROOT, asset.path);
    assertFile(path);
    if (existsSync(path) && statSync(path).size !== asset.byteLength) {
      failures.push(`Crave mapped payload "${asset.path}" length drifted.`);
    }
  }
  const actual = listFiles(join(CRAVE_ROOT, "assets"))
    .map((path) => relative(CRAVE_ROOT, path).split("\\").join("/"))
    .sort();
  const expected = [...physicalPaths].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      "Crave mapped payload folder must exactly match assets.map.json physical paths.",
    );
  }
}

function verifyPresentationExtensionSourceContract() {
  assertFile(EXTENSION_REEL_MANIFEST);
  assertFile(join(EXTENSION_ROOT, "Symbol.atlas"));
  assertFile(join(EXTENSION_ROOT, "Symbol.png"));
  if (!existsSync(EXTENSION_REEL_MANIFEST)) return;
  const manifest = JSON.parse(readFileSync(EXTENSION_REEL_MANIFEST, "utf8"));
  if (manifest.version !== 1) {
    failures.push("game002 reel presentation extension must use version=1.");
  }
  for (const effect of EXTENSION_EFFECTS) {
    const entry = manifest.spin?.cellEffects?.[effect.id];
    if (
      entry?.skeleton !== `./${effect.skeleton}` ||
      entry.atlas !== "./Symbol.atlas" ||
      entry.texture !== "./Symbol.png" ||
      entry.animation !== "Loop"
    ) {
      failures.push(
        `game002 reel presentation extension "${effect.id}" binding drifted.`,
      );
    }
    const skeletonPath = join(EXTENSION_ROOT, effect.skeleton);
    assertFile(skeletonPath);
    if (!existsSync(skeletonPath)) continue;
    const skeleton = JSON.parse(readFileSync(skeletonPath, "utf8"));
    if (!/^4\.3(?:\.|$)/.test(skeleton.skeleton?.spine ?? "")) {
      failures.push(`${effect.skeleton} must declare Spine 4.3.x.`);
    }
    if (!skeleton.animations?.Loop) {
      failures.push(`${effect.skeleton} is missing exact Loop animation.`);
    }
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
  verifyCraveDistClosure(assetNames);
  verifyPresentationExtensionDistClosure(assetNames);
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

function verifyCraveDistClosure(assetNames) {
  if (!existsSync(CRAVE_MAP_PATH)) return;
  const map = JSON.parse(readFileSync(CRAVE_MAP_PATH, "utf8"));
  const files = [
    CRAVE_LAYOUT_PATH,
    CRAVE_MAP_PATH,
    ...new Set(
      Object.values(map.files ?? {}).map((asset) =>
        join(CRAVE_ROOT, asset.path),
      ),
    ),
  ];
  for (const file of files) {
    assertDistContainsSourceAssetContent(assetNames, file);
  }
}

function verifyPresentationExtensionDistClosure(assetNames) {
  for (const file of [
    join(EXTENSION_ROOT, "Symbol.atlas"),
    join(EXTENSION_ROOT, "Symbol.png"),
    ...EXTENSION_EFFECTS.map((effect) => join(EXTENSION_ROOT, effect.skeleton)),
  ]) {
    assertDistContainsSourceAssetContent(assetNames, file);
  }
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

function assertDistContainsSourceAssetContent(assetNames, sourcePath) {
  const source = readFileSync(sourcePath);
  if (
    !assetNames.some((name) =>
      readFileSync(join(DIST_ASSETS, name)).equals(source),
    )
  ) {
    failures.push(
      `dist/assets is missing source asset content for ${relative(REPO_ROOT, sourcePath)}.`,
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
