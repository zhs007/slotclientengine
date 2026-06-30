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
const SOURCE_MANIFEST = join(
  REPO_ROOT,
  "assets/game003-s1/symbol-state-textures.manifest.json",
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

const REQUIRED_SCENE_ASSETS = Object.freeze([
  { pattern: /^bg1-[A-Za-z0-9_-]+\.jpg$/, label: "bg1-*.jpg" },
  { pattern: /^bg2-[A-Za-z0-9_-]+\.jpg$/, label: "bg2-*.jpg" },
  {
    pattern: /^mainreelbg-[A-Za-z0-9_-]+\.png$/,
    label: "mainreelbg-*.png",
  },
  { pattern: /^conveyor1-[A-Za-z0-9_-]+\.png$/, label: "conveyor1-*.png" },
  { pattern: /^conveyor2-[A-Za-z0-9_-]+\.png$/, label: "conveyor2-*.png" },
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
  assertDirectory(ASSETS_ROOT);
  assertFile(SOURCE_MANIFEST);
  verifyGeneratedStaticConfigSync();

  if (existsSync(INDEX_HTML)) {
    verifyIndexHtml(readFileSync(INDEX_HTML, "utf8"));
  }
  if (existsSync(ASSETS_ROOT)) {
    verifyAssets(readdirSync(ASSETS_ROOT).sort());
  }
  if (existsSync(SOURCE_MANIFEST)) {
    verifySourceManifest(JSON.parse(readFileSync(SOURCE_MANIFEST, "utf8")));
  }
  if (existsSync(DIST_ROOT)) {
    verifyNoSensitiveStrings(listFiles(DIST_ROOT));
    verifyNoJpgSymbolRuntimeReferences(listFiles(DIST_ROOT));
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

  for (const asset of REQUIRED_SCENE_ASSETS) {
    assertAsset(assetNames, asset.pattern, asset.label);
  }

  for (const symbol of DISPLAY_SYMBOLS) {
    assertAsset(
      assetNames,
      new RegExp(`^${escapeRegExp(symbol)}-[A-Za-z0-9_-]+\\.png$`),
      `${symbol}-*.png`,
    );
    assertAsset(
      assetNames,
      new RegExp(`^${escapeRegExp(symbol)}\\.spinBlur-[A-Za-z0-9_-]+\\.png$`),
      `${symbol}.spinBlur-*.png`,
    );
    assertAsset(
      assetNames,
      new RegExp(`^${escapeRegExp(symbol)}\\.disabled-[A-Za-z0-9_-]+\\.png$`),
      `${symbol}.disabled-*.png`,
    );
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

  for (const name of ["bg1", "bg2", "mainreelbg", "conveyor1", "conveyor2"]) {
    if (manifest.symbols?.[name]) {
      failures.push(`source symbol manifest must not include ${name}.`);
    }
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
