import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const DIST_ROOT = join(APP_ROOT, "dist");
const ASSETS_ROOT = join(DIST_ROOT, "assets");
const INDEX_HTML = join(DIST_ROOT, "index.html");
const GAME_STATIC_YAML = join(APP_ROOT, "config/game-static.yaml");
const GENERATED_STATIC_CONFIG = join(
  APP_ROOT,
  "src/generated/game-static.generated.ts",
);
const GENERATED_LOADING_CONFIG = join(
  APP_ROOT,
  "src/generated/game-loading.generated.ts",
);
const SOURCE_MANIFEST = join(
  REPO_ROOT,
  "assets/game003-s1/symbol-state-textures.manifest.json",
);
const SOURCE_SYMBOL_ASSET_ROOT = join(REPO_ROOT, "assets/game003-s1");
const SOURCE_WIN_AMOUNT_ROOT = join(REPO_ROOT, "assets/game003-s1/win-amount");
const SOURCE_WIN_AMOUNT_ASSET_ROOT = join(SOURCE_WIN_AMOUNT_ROOT, "assets");
const SOURCE_WIN_AMOUNT_MANIFEST = join(
  SOURCE_WIN_AMOUNT_ROOT,
  "win-amount.manifest.json",
);

const DISPLAY_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "CO",
  "CL",
  "SC",
]);

const SPINE_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "CL",
  "SC",
]);
const SPINE_NORMAL_FALLBACK_APPEAR_SYMBOLS = Object.freeze([
  "H2",
  "H3",
  "H4",
  "H5",
]);
const OUT_OF_SCOPE_SPINE_JSON_SYMBOLS = Object.freeze([
  ["B", "N"].join(""),
  ["C", "N"].join(""),
  ["E", "S"].join(""),
  ["M", "P", "2"].join(""),
  ["R", "S"].join(""),
  ["Reel", "_", "Near", "Win"].join(""),
  ["U", "P"].join(""),
  ["U", "P", "C", "N"].join(""),
]);
const SOURCE_SPINE_SKELETONS = Object.freeze([
  ...SPINE_SYMBOLS,
  ...OUT_OF_SCOPE_SPINE_JSON_SYMBOLS,
]);
const EXPECTED_SPINE_VERSION = "4.3.23";

const REQUIRED_SCENE_ASSETS = Object.freeze([
  { pattern: /^bg1-[A-Za-z0-9_-]+\.jpg$/, label: "bg1-*.jpg" },
  { pattern: /^bg2-[A-Za-z0-9_-]+\.jpg$/, label: "bg2-*.jpg" },
  {
    pattern: /^mainreelbg-[A-Za-z0-9_-]+\.png$/,
    label: "mainreelbg-*.png",
  },
  { pattern: /^conveyor1-[A-Za-z0-9_-]+\.png$/, label: "conveyor1-*.png" },
  { pattern: /^conveyor2-[A-Za-z0-9_-]+\.png$/, label: "conveyor2-*.png" },
  { pattern: /^minecart-[A-Za-z0-9_-]+\.png$/, label: "minecart-*.png" },
]);

const SENSITIVE_PATTERNS = Object.freeze([
  { label: "runtime env prefix", value: "VITE_GAME003_" },
  { label: "placeholder token", value: "SECRET" },
  { label: "README example host", value: "example.test" },
  { label: "old static env access", value: "import.meta.env" },
  { label: "serverUrl query example", value: "serverUrl=" },
]);

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
  assertFile(GAME_STATIC_YAML);
  assertFile(GENERATED_STATIC_CONFIG);
  assertFile(GENERATED_LOADING_CONFIG);
  assertDirectory(ASSETS_ROOT);
  assertFile(SOURCE_MANIFEST);
  assertFile(SOURCE_WIN_AMOUNT_MANIFEST);
  verifyGeneratedStaticConfigSync();
  if (existsSync(GENERATED_LOADING_CONFIG)) {
    verifyGeneratedLoadingConfigSource(
      readFileSync(GENERATED_LOADING_CONFIG, "utf8"),
    );
  }

  if (existsSync(INDEX_HTML)) {
    verifyIndexHtml(readFileSync(INDEX_HTML, "utf8"));
  }
  if (existsSync(ASSETS_ROOT)) {
    verifyAssets(readdirSync(ASSETS_ROOT).sort());
  }
  if (existsSync(SOURCE_MANIFEST)) {
    verifySourceManifest(JSON.parse(readFileSync(SOURCE_MANIFEST, "utf8")));
    verifySourceSpineResources();
  }
  if (existsSync(SOURCE_WIN_AMOUNT_MANIFEST)) {
    verifySourceWinAmountManifest(
      JSON.parse(readFileSync(SOURCE_WIN_AMOUNT_MANIFEST, "utf8")),
    );
  }
  if (existsSync(DIST_ROOT)) {
    const distFiles = listFiles(DIST_ROOT);
    verifyNoSensitiveStrings(distFiles);
    verifyNoJpgSymbolRuntimeReferences(distFiles);
    verifyNoLeoReactRuntime(distFiles);
  }
}

function verifyNoLeoReactRuntime(files) {
  const markers = [
    "slot-leo-ui-",
    "react-dom",
    "Minified React error",
    "useSyncExternalStore",
    "launcher.rgstest.slammerstudios.com",
    "leo-setting-unavailable",
    "GameDB",
  ];
  for (const file of files.filter((candidate) => candidate.endsWith(".js"))) {
    const content = readFileSync(file, "utf8");
    for (const marker of markers) {
      if (content.includes(marker)) {
        failures.push(
          `${file.slice(DIST_ROOT.length + 1)} unexpectedly contains ${marker}.`,
        );
      }
    }
  }
}

function verifySourceSpineResources() {
  const expectedAppearAnimations = new Map([
    ["WL", "start"],
    ["H1", "Start"],
    ["CL", "Start"],
    ["SC", "Start"],
  ]);
  for (const symbol of SOURCE_SPINE_SKELETONS) {
    const skeletonPath = join(SOURCE_SYMBOL_ASSET_ROOT, `${symbol}.json`);
    if (!existsSync(skeletonPath)) {
      continue;
    }
    const skeleton = JSON.parse(readFileSync(skeletonPath, "utf8"));
    if (skeleton.skeleton?.spine !== EXPECTED_SPINE_VERSION) {
      failures.push(
        `source Spine skeleton ${symbol} must be version ${EXPECTED_SPINE_VERSION}.`,
      );
    }
  }

  for (const symbol of SPINE_SYMBOLS) {
    const skeletonPath = join(SOURCE_SYMBOL_ASSET_ROOT, `${symbol}.json`);
    if (!existsSync(skeletonPath)) {
      continue;
    }
    const skeleton = JSON.parse(readFileSync(skeletonPath, "utf8"));
    for (const animationName of ["Idle", "Win"]) {
      if (!skeleton.animations?.[animationName]) {
        failures.push(
          `source Spine skeleton ${symbol} is missing animation ${animationName}.`,
        );
      }
    }
    const appearAnimation = expectedAppearAnimations.get(symbol);
    if (appearAnimation && !skeleton.animations?.[appearAnimation]) {
      failures.push(
        `source Spine skeleton ${symbol} is missing animation ${appearAnimation}.`,
      );
    }
    if (
      SPINE_NORMAL_FALLBACK_APPEAR_SYMBOLS.includes(symbol) &&
      (skeleton.animations?.Start || skeleton.animations?.start)
    ) {
      failures.push(
        `source Spine skeleton ${symbol} unexpectedly contains Start/start.`,
      );
    }
  }

  const atlasPath = join(SOURCE_SYMBOL_ASSET_ROOT, "Symbol.atlas");
  if (!existsSync(atlasPath)) {
    return;
  }
  const atlasText = readFileSync(atlasPath, "utf8");
  if (!/^Symbol\.png\s*$/mu.test(atlasText)) {
    failures.push("source Spine atlas page must be Symbol.png.");
  }
  if (!/^bounds:\d+,\d+,\d+,\d+\s*$/mu.test(atlasText)) {
    failures.push("source Spine 4.3 atlas must contain bounds fields.");
  }
  if (!/^rotate:90\s*$/mu.test(atlasText)) {
    failures.push("source Spine 4.3 atlas must contain rotate:90 fields.");
  }
}

function verifyGeneratedStaticConfigSync() {
  try {
    execFileSync(
      "pnpm",
      [
        "--dir",
        REPO_ROOT,
        "--filter",
        "buildgamestatic",
        "dev",
        "--",
        "--input",
        "apps/game003/config/game-static.yaml",
        "--out",
        "apps/game003/src/generated/game-static.generated.ts",
        "--loading-out",
        "apps/game003/src/generated/game-loading.generated.ts",
        "--game",
        "game003",
        "--check",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        stdio: "pipe",
      },
    );
  } catch (error) {
    const detail =
      error instanceof Error && "stderr" in error
        ? String(error.stderr)
        : error instanceof Error
          ? error.message
          : String(error);
    failures.push(`generated static config is not in sync: ${detail.trim()}`);
  }
}

function verifyGeneratedLoadingConfigSource(content) {
  for (const forbidden of [
    "rawGameConfig",
    "@slotclientengine/gameframeworks",
    "@slotclientengine/rendercore",
    "pixi.js",
    "serverUrl",
    "token",
    "cookie",
  ]) {
    if (content.includes(forbidden)) {
      failures.push(`generated loading config must not contain ${forbidden}.`);
    }
  }
}

function verifyIndexHtml(indexHtml) {
  if (indexHtml.includes("/src/main.ts")) {
    failures.push("dist/index.html still references /src/main.ts.");
  }

  const assetRefs = [...indexHtml.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const builtAssetRefs = assetRefs.filter((ref) =>
    /\.(?:js|css|jpg|png)(?:$|\?)/.test(ref),
  );

  if (builtAssetRefs.length === 0) {
    failures.push("dist/index.html does not reference built JS/CSS assets.");
  }

  for (const ref of builtAssetRefs) {
    if (ref.startsWith("/assets/")) {
      failures.push(`dist/index.html uses absolute asset URL ${ref}.`);
      continue;
    }
    if (!ref.startsWith("./assets/")) {
      failures.push(
        `dist/index.html asset URL must start with ./assets/: ${ref}.`,
      );
    }
  }

  if (!builtAssetRefs.some((ref) => /^\.\/assets\/index-.+\.js$/.test(ref))) {
    failures.push("dist/index.html does not reference ./assets/index-*.js.");
  }
  if (!builtAssetRefs.some((ref) => /^\.\/assets\/index-.+\.css$/.test(ref))) {
    failures.push("dist/index.html does not reference ./assets/index-*.css.");
  }
}

function verifyAssets(assetNames) {
  assertAsset(assetNames, /^index-[A-Za-z0-9_-]+\.js$/, "index-*.js");
  assertAsset(assetNames, /^index-[A-Za-z0-9_-]+\.css$/, "index-*.css");
  const distAssetHashes = createDistAssetHashMap(assetNames);
  const jsAssets = assetNames.filter((name) => /\.js$/.test(name));
  if (jsAssets.length < 2) {
    failures.push("dist/assets must contain multiple JS chunks.");
  }
  const entryChunk = assetNames.find((name) =>
    /^index-[A-Za-z0-9_-]+\.js$/.test(name),
  );
  if (entryChunk) {
    verifyEntryChunkIsLight(join(ASSETS_ROOT, entryChunk));
  }
  for (const forbiddenAsset of [
    /^loading2-[A-Za-z0-9_-]+\.gif$/,
    /^logo_1-[A-Za-z0-9_-]+\.webp$/,
    /^a2-[A-Za-z0-9_-]+\.webp$/,
    /^a3-[A-Za-z0-9_-]+\.webp$/,
  ]) {
    if (assetNames.some((name) => forbiddenAsset.test(name))) {
      failures.push(
        `dist unexpectedly contains Leo loading asset ${forbiddenAsset}.`,
      );
    }
  }

  for (const asset of REQUIRED_SCENE_ASSETS) {
    assertAsset(assetNames, asset.pattern, asset.label);
  }

  for (const symbol of DISPLAY_SYMBOLS) {
    assertSourceAssetBundled(
      distAssetHashes,
      join(SOURCE_SYMBOL_ASSET_ROOT, `${symbol}.png`),
      `${symbol}.png`,
    );
    assertSourceAssetBundled(
      distAssetHashes,
      join(SOURCE_SYMBOL_ASSET_ROOT, `${symbol}.spinBlur.png`),
      `${symbol}.spinBlur.png`,
    );
    assertSourceAssetBundled(
      distAssetHashes,
      join(SOURCE_SYMBOL_ASSET_ROOT, `${symbol}.disabled.png`),
      `${symbol}.disabled.png`,
    );
  }
  for (const symbol of SPINE_SYMBOLS) {
    assertSourceAssetBundled(
      distAssetHashes,
      join(SOURCE_SYMBOL_ASSET_ROOT, `${symbol}.json`),
      `${symbol}.json`,
    );
  }
  assertSourceAssetBundled(
    distAssetHashes,
    join(SOURCE_SYMBOL_ASSET_ROOT, "Symbol.atlas"),
    "Symbol.atlas",
  );
  assertSourceAssetBundled(
    distAssetHashes,
    join(SOURCE_SYMBOL_ASSET_ROOT, "Symbol.png"),
    "Symbol.png",
  );
  assertSourceAssetBundled(
    distAssetHashes,
    join(SOURCE_SYMBOL_ASSET_ROOT, "minecart.png"),
    "minecart.png",
  );
  assertSourceAssetBundled(
    distAssetHashes,
    SOURCE_WIN_AMOUNT_MANIFEST,
    "win-amount.manifest.json",
  );
  if (existsSync(SOURCE_WIN_AMOUNT_MANIFEST)) {
    verifyWinAmountAssetsBundled(
      distAssetHashes,
      JSON.parse(readFileSync(SOURCE_WIN_AMOUNT_MANIFEST, "utf8")),
    );
  }
}

function verifyEntryChunkIsLight(entryChunkPath) {
  const content = readFileSync(entryChunkPath, "utf8");
  for (const forbidden of [
    "game-adapter",
    "RenderReelSet",
    "pixi.js",
    "react",
    "zustand",
    "gameloading-ui-leo",
    "wildsheep",
    "spine-pixi",
    "createSlotGameFramework",
    "WebSocket",
  ]) {
    if (content.toLowerCase().includes(forbidden.toLowerCase())) {
      failures.push(`entry chunk contains game runtime marker ${forbidden}.`);
    }
  }
}

function verifySourceManifest(manifest) {
  if (manifest.version !== 1) {
    failures.push("source symbol manifest version must be 1.");
  }
  for (const state of ["spinBlur", "disabled"]) {
    if (!manifest.states?.includes(state)) {
      failures.push(`source symbol manifest is missing state ${state}.`);
    }
  }

  const names = Object.keys(manifest.symbols ?? {}).sort();
  const expectedNames = [...DISPLAY_SYMBOLS].sort();
  if (names.join(",") !== expectedNames.join(",")) {
    failures.push(
      `source symbol manifest symbols must be ${expectedNames.join(",")}, got ${names.join(",")}.`,
    );
  }

  for (const symbol of DISPLAY_SYMBOLS) {
    const entry = manifest.symbols?.[symbol];
    if (!entry) {
      continue;
    }
    if (entry.scale !== 1) {
      failures.push(`source symbol manifest ${symbol}.scale must be 1.`);
    }
    if (entry.normal !== `./${symbol}.png`) {
      failures.push(
        `source symbol manifest ${symbol}.normal must be ./${symbol}.png.`,
      );
    }
    if (entry.spinBlur !== `./${symbol}.spinBlur.png`) {
      failures.push(`source symbol manifest ${symbol}.spinBlur is invalid.`);
    }
    if (entry.disabled !== `./${symbol}.disabled.png`) {
      failures.push(`source symbol manifest ${symbol}.disabled is invalid.`);
    }
  }

  for (const symbol of SPINE_SYMBOLS) {
    const animations = manifest.symbols?.[symbol]?.animations ?? {};
    const normal = animations.normal;
    const win = animations.win;
    if (
      normal?.kind !== "spine" ||
      normal?.skeleton !== `./${symbol}.json` ||
      normal?.atlas !== "./Symbol.atlas" ||
      normal?.texture !== "./Symbol.png" ||
      normal?.playback?.animationName !== "Idle" ||
      normal?.playback?.loop !== true
    ) {
      failures.push(
        `source symbol manifest ${symbol}.normal Spine contract is invalid.`,
      );
    }
    if (
      win?.kind !== "spine" ||
      win?.skeleton !== `./${symbol}.json` ||
      win?.atlas !== "./Symbol.atlas" ||
      win?.texture !== "./Symbol.png" ||
      win?.playback?.animationName !== "Win" ||
      win?.playback?.loop !== false
    ) {
      failures.push(
        `source symbol manifest ${symbol}.win Spine contract is invalid.`,
      );
    }
  }
  for (const symbol of ["H1", "CL", "SC"]) {
    const appear = manifest.symbols?.[symbol]?.animations?.appear;
    if (
      appear?.kind !== "spine" ||
      appear?.skeleton !== `./${symbol}.json` ||
      appear?.playback?.animationName !== "Start" ||
      appear?.playback?.loop !== false
    ) {
      failures.push(
        `source symbol manifest ${symbol}.appear Spine contract is invalid.`,
      );
    }
  }
  const wlAppear = manifest.symbols?.WL?.animations?.appear;
  if (
    wlAppear?.kind !== "spine" ||
    wlAppear?.skeleton !== "./WL.json" ||
    wlAppear?.playback?.animationName !== "start" ||
    wlAppear?.playback?.loop !== false
  ) {
    failures.push(
      "source symbol manifest WL.appear Spine contract is invalid.",
    );
  }
  for (const symbol of SPINE_NORMAL_FALLBACK_APPEAR_SYMBOLS) {
    const appear = manifest.symbols?.[symbol]?.animations?.appear;
    if (appear !== undefined) {
      failures.push(
        `source symbol manifest ${symbol}.appear must be omitted for Spine normal fallback.`,
      );
    }
  }
  for (const symbol of OUT_OF_SCOPE_SPINE_JSON_SYMBOLS) {
    if (manifest.symbols?.[symbol]) {
      failures.push(
        `source symbol manifest must not include out-of-scope ${symbol}.`,
      );
    }
  }

  for (const name of ["bg1", "bg2", "mainreelbg", "conveyor1", "conveyor2"]) {
    if (manifest.symbols?.[name]) {
      failures.push(`source symbol manifest must not include ${name}.`);
    }
  }
}

function verifySourceWinAmountManifest(manifest) {
  if (manifest.version !== 1) {
    failures.push("source win amount manifest version must be 1.");
  }
  if (manifest.kind !== "vni-win-amount-tiers") {
    failures.push("source win amount manifest kind is invalid.");
  }
  if (manifest.projectGlob !== "./{bigwin,superwin,megawin}.json") {
    failures.push("source win amount manifest projectGlob is invalid.");
  }
  if (manifest.assetGlob !== "./assets/*.{png,jpg,jpeg,webp}") {
    failures.push("source win amount manifest assetGlob is invalid.");
  }
  const tiers = manifest.tiers ?? [];
  const expected = [
    ["bigwin", 15, "./bigwin.json"],
    ["superwin", 30, "./superwin.json"],
    ["megawin", 50, "./megawin.json"],
  ];
  if (tiers.length !== expected.length) {
    failures.push("source win amount manifest must contain three tiers.");
  }
  for (const [
    index,
    [id, thresholdMultiplier, project],
  ] of expected.entries()) {
    const tier = tiers[index];
    if (
      tier?.id !== id ||
      tier?.thresholdMultiplier !== thresholdMultiplier ||
      tier?.project !== project ||
      tier?.playback?.mode !== "segmented" ||
      tier?.playback?.durationSeconds !== 2.9 ||
      tier?.playback?.loopStartTime !== 1 ||
      tier?.playback?.loopEndTime !== 2.5 ||
      tier?.playback?.keepParticlesAlive !== true
    ) {
      failures.push(`source win amount manifest tier ${id} is invalid.`);
    }
  }
}

function verifyWinAmountAssetsBundled(distAssetHashes, manifest) {
  const referencedAssetNames = new Set();
  for (const tier of manifest.tiers ?? []) {
    if (typeof tier.project !== "string" || !tier.project.startsWith("./")) {
      failures.push(`invalid win amount tier project ${tier.project}.`);
      continue;
    }
    const projectName = tier.project.slice(2);
    const projectPath = join(SOURCE_WIN_AMOUNT_ROOT, projectName);
    assertSourceAssetBundled(distAssetHashes, projectPath, projectName);
    if (!existsSync(projectPath)) {
      continue;
    }
    const project = JSON.parse(readFileSync(projectPath, "utf8"));
    for (const asset of project.assets ?? []) {
      if (
        typeof asset.path !== "string" ||
        !/^assets[/][^/]+\.(?:png|jpg|jpeg|webp)$/u.test(asset.path)
      ) {
        failures.push(`${projectName} contains invalid asset path.`);
        continue;
      }
      const assetName = asset.path.slice("assets/".length);
      if (referencedAssetNames.has(assetName)) {
        failures.push(`duplicate win-amount asset basename ${assetName}.`);
        continue;
      }
      referencedAssetNames.add(assetName);
      assertSourceAssetBundled(
        distAssetHashes,
        join(SOURCE_WIN_AMOUNT_ROOT, asset.path),
        `win-amount/${asset.path}`,
      );
    }
  }
  if (!existsSync(SOURCE_WIN_AMOUNT_ASSET_ROOT)) {
    failures.push(
      `missing win-amount asset directory ${SOURCE_WIN_AMOUNT_ASSET_ROOT}.`,
    );
    return;
  }
  const sourceAssetNames = readdirSync(SOURCE_WIN_AMOUNT_ASSET_ROOT)
    .filter((name) => /\.(?:png|jpg|jpeg|webp)$/u.test(name))
    .sort();
  const expectedAssetNames = [...referencedAssetNames].sort();
  if (sourceAssetNames.join("\n") !== expectedAssetNames.join("\n")) {
    const orphanNames = sourceAssetNames.filter(
      (name) => !referencedAssetNames.has(name),
    );
    const missingNames = expectedAssetNames.filter(
      (name) => !sourceAssetNames.includes(name),
    );
    failures.push(
      `win-amount source asset closure is invalid; orphan=${orphanNames.join(",") || "none"}; missing=${missingNames.join(",") || "none"}.`,
    );
  }
}

function verifyNoSensitiveStrings(files) {
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of SENSITIVE_PATTERNS) {
      if (content.includes(pattern.value)) {
        failures.push(`${file} contains ${pattern.label}.`);
      }
    }
  }
}

function verifyNoJpgSymbolRuntimeReferences(files) {
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const symbol of ["H1", "H2", "H3", "H4", "H5"]) {
      if (content.includes(`${symbol}.jpg`)) {
        failures.push(`${file} references runtime JPG symbol ${symbol}.jpg.`);
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

function assertAsset(assetNames, pattern, label) {
  if (!assetNames.some((name) => pattern.test(name))) {
    failures.push(`dist/assets is missing ${label}.`);
  }
}

function createDistAssetHashMap(assetNames) {
  const hashes = new Map();
  for (const name of assetNames) {
    if (!/\.(?:png|jpg|jpeg|webp|json|atlas)$/.test(name)) {
      continue;
    }
    const path = join(ASSETS_ROOT, name);
    const hash = hashFile(path);
    const names = hashes.get(hash) ?? [];
    names.push(name);
    hashes.set(hash, names);
  }
  return hashes;
}

function assertSourceAssetBundled(distAssetHashes, sourcePath, label) {
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    failures.push(`missing source asset ${label}.`);
    return;
  }

  const hash = hashFile(sourcePath);
  if (!distAssetHashes.has(hash)) {
    failures.push(`dist/assets is missing bundled content for ${label}.`);
  }
}

function hashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path));
      continue;
    }
    if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}
