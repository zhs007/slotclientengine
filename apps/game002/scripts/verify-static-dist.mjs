import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_ROOT = join(APP_ROOT, "dist");
const ASSETS_ROOT = join(DIST_ROOT, "assets");
const INDEX_HTML = join(DIST_ROOT, "index.html");

const SENSITIVE_PATTERNS = Object.freeze([
  {
    label: "old static build env prefix",
    value: ["VITE", "GAME002"].join("_"),
  },
  {
    label: "old default token",
    value: ["7a82f5ca", "45b5aa32", "46b2ad01", "23272295"].join(""),
  },
  {
    label: "old default gamecode",
    value: ["065P8N", "OEgwd", "SXFTB6uDqX"].join(""),
  },
  {
    label: "old default live server host",
    value: ["gameserv", "rgstest", "slammerstudios", "com"].join("."),
  },
]);

const REQUIRED_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
]);

const REQUIRED_SYMBOL_STATES = Object.freeze([
  "normal",
  "disabled",
  "spinBlur",
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
  assertDirectory(ASSETS_ROOT);

  if (existsSync(INDEX_HTML)) {
    verifyIndexHtml(readFileSync(INDEX_HTML, "utf8"));
  }
  if (existsSync(ASSETS_ROOT)) {
    verifyAssets(readdirSync(ASSETS_ROOT).sort());
  }
  if (existsSync(DIST_ROOT)) {
    verifyNoSensitiveStrings(listFiles(DIST_ROOT));
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
  assertAsset(assetNames, /^bgfull-[A-Za-z0-9_-]+\.jpg$/, "bgfull-*.jpg");

  for (const symbol of REQUIRED_SYMBOLS) {
    for (const state of REQUIRED_SYMBOL_STATES) {
      const pattern = createSymbolAssetPattern(symbol, state);
      assertAsset(assetNames, pattern, `${symbol} ${state} PNG`);
    }
  }
}

function createSymbolAssetPattern(symbol, state) {
  const prefix = state === "normal" ? symbol : `${symbol}.${state}`;
  return new RegExp(`^${escapeRegExp(prefix)}-[A-Za-z0-9_-]+\\.png$`);
}

function assertAsset(assetNames, pattern, label) {
  if (!assetNames.some((name) => pattern.test(name))) {
    failures.push(`dist/assets is missing ${label}.`);
  }
}

function verifyNoSensitiveStrings(files) {
  for (const file of files) {
    const content = readFileSync(file);
    for (const pattern of SENSITIVE_PATTERNS) {
      if (content.includes(Buffer.from(pattern.value))) {
        failures.push(
          `${relative(APP_ROOT, file)} contains ${pattern.label}; remove it from the static bundle.`,
        );
      }
    }
  }
}

function assertFile(file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    failures.push(`${relative(APP_ROOT, file)} is missing.`);
  }
}

function assertDirectory(directory) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    failures.push(`${relative(APP_ROOT, directory)} is missing.`);
  }
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const file = join(directory, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      files.push(...listFiles(file));
      continue;
    }
    files.push(file);
  }
  return files.sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
