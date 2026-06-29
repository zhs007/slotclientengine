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

const REQUIRED_SKIN_ASSETS = Object.freeze([
  {
    id: "skin 1",
    symbolDirectory: "symbols001",
    background: {
      pattern: /^bg-[A-Za-z0-9_-]+\.jpg$/,
      label: "bg-*.jpg",
      width: 2000,
      height: 2000,
      minimumMatches: 2,
    },
    inlineSymbols: Object.freeze(["BN"]),
    manifestScale: 0.8,
    symbolWidth: 200,
    symbolHeight: 200,
    symbols: Object.freeze([
      "WL",
      "H1",
      "H2",
      "L1",
      "L2",
      "L3",
      "L4",
      "CN",
      "BN",
    ]),
  },
  {
    id: "skin 2",
    symbolDirectory: "symbols002",
    background: {
      pattern: /^bgfull-[A-Za-z0-9_-]+\.jpg$/,
      label: "bgfull-*.jpg",
      width: 2000,
      height: 2000,
    },
    manifestScale: 1,
    symbolWidth: 200,
    symbolHeight: 200,
    symbols: Object.freeze([
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
    ]),
  },
  {
    id: "skin 3",
    symbolDirectory: "symbols003",
    background: {
      pattern: /^bg-[A-Za-z0-9_-]+\.jpg$/,
      label: "bg-*.jpg",
      width: 2000,
      height: 2000,
      minimumMatches: 2,
    },
    manifestScale: 1,
    symbolWidth: 180,
    symbolHeight: 180,
    symbols: Object.freeze([
      "WL",
      "H1",
      "H2",
      "L1",
      "L2",
      "L3",
      "L4",
      "CN",
      "CO",
    ]),
  },
  {
    id: "skin 4",
    symbolDirectory: "game002-s2",
    background: {
      pattern: /^bg-[A-Za-z0-9_-]+\.png$/,
      label: "bg-*.png",
      width: 2000,
      height: 2000,
    },
    manifestScale: 1,
    symbolWidth: 200,
    symbolHeight: 200,
    symbols: Object.freeze([
      "WL",
      "H1",
      "H2",
      "L1",
      "L2",
      "L3",
      "L4",
      "CN",
      "CO",
    ]),
  },
  {
    id: "skin 5",
    symbolDirectory: "game002-s3",
    background: {
      pattern: /^bg-[A-Za-z0-9_-]+\.jpg$/,
      label: "bg-*.jpg",
      width: 2000,
      height: 2000,
      minimumMatches: 3,
    },
    manifestScale: 1,
    symbolWidth: 200,
    symbolHeight: 200,
    symbols: Object.freeze([
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
    ]),
  },
]);

const REQUIRED_SYMBOL_STATES = Object.freeze([
  "normal",
  "disabled",
  "spinBlur",
]);

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
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

  const bundledJavaScript = readBundledJavaScript(assetNames);
  const inlinePngBindings = findInlinePngBindings(bundledJavaScript);

  for (const skin of REQUIRED_SKIN_ASSETS) {
    assertBundledSkinSourceReferences(skin, bundledJavaScript);
    assertAssetWithSize(
      assetNames,
      skin.background.pattern,
      `${skin.id} ${skin.background.label}`,
      skin.background.width,
      skin.background.height,
      skin.background.minimumMatches,
    );
    for (const symbol of skin.symbols) {
      assertSourceManifestScale(skin, symbol);
      for (const state of REQUIRED_SYMBOL_STATES) {
        assertSymbolStateAsset(
          assetNames,
          skin,
          symbol,
          state,
          bundledJavaScript,
          inlinePngBindings,
        );
      }
    }
  }
}

function assertBundledSkinSourceReferences(skin, bundledJavaScript) {
  const sourceDirectory = `../../../assets/${skin.symbolDirectory}/`;
  if (!bundledJavaScript.includes(sourceDirectory)) {
    failures.push(
      `${skin.id} bundle does not reference source directory ${sourceDirectory}.`,
    );
  }
}

function assertSourceManifestScale(skin, symbol) {
  const manifestPath = resolve(
    APP_ROOT,
    "..",
    "..",
    "assets",
    skin.symbolDirectory,
    "symbol-state-textures.manifest.json",
  );
  if (!existsSync(manifestPath)) {
    failures.push(
      `${skin.id} source manifest ${relative(APP_ROOT, manifestPath)} is missing.`,
    );
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifestSymbol = manifest.symbols?.[symbol];
  if (!manifestSymbol) {
    failures.push(`${skin.id} source manifest is missing ${symbol}.`);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(manifestSymbol, "scale")) {
    failures.push(`${skin.id} source manifest ${symbol} is missing scale.`);
    return;
  }
  if (manifestSymbol.scale !== skin.manifestScale) {
    failures.push(
      `${skin.id} source manifest ${symbol} scale must be ${skin.manifestScale}, got ${manifestSymbol.scale}.`,
    );
  }
}

function createSymbolAssetPattern(symbol, state) {
  const prefix = state === "normal" ? symbol : `${symbol}.${state}`;
  return new RegExp(`^${escapeRegExp(prefix)}-[A-Za-z0-9_-]+\\.png$`);
}

function createSymbolSourcePath(directory, symbol, state) {
  const prefix = state === "normal" ? symbol : `${symbol}.${state}`;
  return `../../../assets/${directory}/${prefix}.png`;
}

function assertAsset(assetNames, pattern, label) {
  if (!assetNames.some((name) => pattern.test(name))) {
    failures.push(`dist/assets is missing ${label}.`);
  }
}

function assertSymbolStateAsset(
  assetNames,
  skin,
  symbol,
  state,
  bundledJavaScript,
  inlinePngBindings,
) {
  const label = `${skin.id} ${symbol} ${state} PNG`;
  const matches = countAssetMatchesWithSize(
    assetNames,
    createSymbolAssetPattern(symbol, state),
    skin.symbolWidth,
    skin.symbolHeight,
  );
  pushAssetReadErrors(matches);

  if (matches.names.length > 0) {
    if (matches.matchingSizeCount === 0) {
      failures.push(
        `dist/assets is missing ${label} with size ${skin.symbolWidth} x ${skin.symbolHeight}.`,
      );
    }
    return;
  }

  const allowsInline =
    skin.inlineSymbols !== undefined && skin.inlineSymbols.includes(symbol);
  const sourcePath = createSymbolSourcePath(
    skin.symbolDirectory,
    symbol,
    state,
  );
  if (
    allowsInline &&
    hasInlineAssetBinding(bundledJavaScript, inlinePngBindings, sourcePath)
  ) {
    return;
  }

  if (allowsInline) {
    failures.push(
      `dist/assets is missing ${label}, and bundled JS does not inline ${sourcePath}.`,
    );
    return;
  }

  failures.push(`dist/assets is missing ${label}.`);
}

function assertAssetWithSize(
  assetNames,
  pattern,
  label,
  width,
  height,
  minimumMatches = 1,
) {
  const matches = countAssetMatchesWithSize(assetNames, pattern, width, height);
  pushAssetReadErrors(matches);

  if (matches.names.length === 0) {
    failures.push(`dist/assets is missing ${label}.`);
    return;
  }

  if (matches.matchingSizeCount < minimumMatches) {
    failures.push(
      `dist/assets is missing ${label} with size ${width} x ${height}; expected ${minimumMatches}, got ${matches.matchingSizeCount}.`,
    );
  }
}

function countAssetMatchesWithSize(assetNames, pattern, width, height) {
  const names = assetNames.filter((name) => pattern.test(name));
  let matchingSizeCount = 0;
  const readErrors = [];
  for (const name of names) {
    const file = join(ASSETS_ROOT, name);
    try {
      const size = readImageSize(file);
      if (size.width === width && size.height === height) {
        matchingSizeCount += 1;
      }
    } catch (error) {
      readErrors.push(
        `${relative(APP_ROOT, file)} size could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return Object.freeze({
    names: Object.freeze(names),
    matchingSizeCount,
    readErrors: Object.freeze(readErrors),
  });
}

function pushAssetReadErrors(matches) {
  for (const error of matches.readErrors) {
    failures.push(error);
  }
}

function readBundledJavaScript(assetNames) {
  return assetNames
    .filter((name) => /\.js$/.test(name))
    .map((name) => readFileSync(join(ASSETS_ROOT, name), "utf8"))
    .join("\n");
}

function findInlinePngBindings(bundledJavaScript) {
  const bindings = new Set();
  const pattern = /([A-Za-z_$][\w$]*)=`data:image\/png;base64,[^`]+`/g;
  for (const match of bundledJavaScript.matchAll(pattern)) {
    bindings.add(match[1]);
  }
  return bindings;
}

function hasInlineAssetBinding(
  bundledJavaScript,
  inlinePngBindings,
  sourcePath,
) {
  for (const binding of inlinePngBindings) {
    if (
      bundledJavaScript.includes(`${JSON.stringify(sourcePath)}:${binding}`)
    ) {
      return true;
    }
  }
  return false;
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

function readImageSize(file) {
  const bytes = readFileSync(file);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return readJpegSize(file, bytes);
  }
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return Object.freeze({
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    });
  }
  throw new Error(`${file} is not a supported JPEG or PNG file.`);
}

function readJpegSize(file, bytes) {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return Object.freeze({
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      });
    }
    offset += 2 + length;
  }
  throw new Error(`${file} does not contain a JPEG size marker.`);
}
