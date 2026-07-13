import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const DIST_ROOT = join(APP_ROOT, "dist");
const DIST_ASSETS = join(DIST_ROOT, "assets");
const SOURCE_ROOT = join(REPO_ROOT, "assets/game002-s3");
const INDEX_HTML = join(DIST_ROOT, "index.html");
const MANIFEST_PATH = join(SOURCE_ROOT, "symbol-state-textures.manifest.json");
const SYMBOLS = Object.freeze([
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
  "BN",
]);
const SPINE_SYMBOLS = Object.freeze(
  SYMBOLS.filter((symbol) => symbol !== "CN"),
);
const EXCLUDED_RESOURCE_PREFIXES = Object.freeze([
  "CN_1",
  "CN_2",
  "CN_3",
  "CN_4",
  "Nearwin1",
  "Nearwin2",
  "Nearwin3",
  "WM_Fx",
]);
const OLD_SOURCE_DIRECTORIES = Object.freeze([
  ["assets", "symbols" + "001", ""].join("/"),
  ["assets", "symbols" + "002", ""].join("/"),
  ["assets", "symbols" + "003", ""].join("/"),
  ["assets", "game002" + "-s1", ""].join("/"),
  ["assets", "game002" + "-s2", ""].join("/"),
  ["assets", "game003" + "-s1", ""].join("/"),
]);
const SENSITIVE_VALUES = Object.freeze([
  ["VITE", "GAME002"].join("_"),
  ["7a82f5ca", "45b5aa32", "46b2ad01", "23272295"].join(""),
  ["065P8N", "OEgwd", "SXFTB6uDqX"].join(""),
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
  assertDirectory(DIST_ASSETS);
  if (!existsSync(INDEX_HTML) || !existsSync(DIST_ASSETS)) {
    return;
  }

  const assetNames = readdirSync(DIST_ASSETS).sort();
  const indexHtml = readFileSync(INDEX_HTML, "utf8");
  const bundledJavaScript = assetNames
    .filter((name) => name.endsWith(".js"))
    .map((name) => readFileSync(join(DIST_ASSETS, name), "utf8"))
    .join("\n");

  verifyIndexHtml(indexHtml);
  verifySourceContract();
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

function verifySourceContract() {
  assertImageSize(join(SOURCE_ROOT, "bg.jpg"), 2000, 2000);
  assertFile(MANIFEST_PATH);
  assertFile(join(SOURCE_ROOT, "Symbol.atlas"));
  assertFile(join(SOURCE_ROOT, "Symbol.png"));
  if (!existsSync(MANIFEST_PATH)) {
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const manifestSymbols = Object.keys(manifest.symbols ?? {});
  if (JSON.stringify(manifestSymbols) !== JSON.stringify(SYMBOLS)) {
    failures.push(
      `source manifest symbol order must be ${SYMBOLS.join(",")}, got ${manifestSymbols.join(",")}.`,
    );
  }
  for (const symbol of SYMBOLS) {
    const entry = manifest.symbols?.[symbol];
    if (!entry) {
      failures.push(`source manifest is missing ${symbol}.`);
      continue;
    }
    if (entry.scale !== 1) {
      failures.push(`source manifest ${symbol} scale must be 1.`);
    }
    for (const [state, suffix] of [
      ["normal", ""],
      ["spinBlur", ".spinBlur"],
      ["disabled", ".disabled"],
    ]) {
      const configuredPath = entry[state];
      const expectedPath = `./${symbol}${suffix}.png`;
      if (configuredPath !== expectedPath) {
        failures.push(
          `source manifest ${symbol}.${state} must be ${expectedPath}.`,
        );
      }
      assertFile(join(SOURCE_ROOT, `${symbol}${suffix}.png`));
    }
  }
  for (const symbol of SPINE_SYMBOLS) {
    const skeletonPath = join(SOURCE_ROOT, `${symbol}.json`);
    assertFile(skeletonPath);
    if (!existsSync(skeletonPath)) {
      continue;
    }
    const skeleton = JSON.parse(readFileSync(skeletonPath, "utf8"));
    if (!/^4\.3(?:\.|$)/.test(skeleton.skeleton?.spine ?? "")) {
      failures.push(`${symbol}.json must declare Spine 4.3.x.`);
    }
  }
  const atlasFirstLine = readFileSync(join(SOURCE_ROOT, "Symbol.atlas"), "utf8")
    .split(/\r?\n/)
    .find((line) => line.trim() !== "");
  if (atlasFirstLine !== "Symbol.png") {
    failures.push(
      `Symbol.atlas page must be Symbol.png, got ${atlasFirstLine}.`,
    );
  }
}

function verifyDistAssets(assetNames, bundledJavaScript) {
  assertOne(assetNames, /^index-[A-Za-z0-9_-]+\.js$/, "index JS");
  assertOne(assetNames, /^index-[A-Za-z0-9_-]+\.css$/, "index CSS");
  assertOne(assetNames, /^bg-[A-Za-z0-9_-]+\.jpg$/, "game002-s3 background");
  assertOne(assetNames, /^Symbol-[A-Za-z0-9_-]+\.atlas$/, "Spine atlas");
  assertOne(assetNames, /^Symbol-[A-Za-z0-9_-]+\.png$/, "Spine texture");
  assertOne(
    assetNames,
    /^symbol-state-textures\.manifest-[A-Za-z0-9_-]+\.json$/,
    "symbol manifest",
  );
  assertOne(
    assetNames,
    /^win-amount\.manifest-[A-Za-z0-9_-]+\.json$/,
    "win-amount manifest",
  );

  for (const symbol of SYMBOLS) {
    assertOne(
      assetNames,
      hashedAssetPattern(symbol, "png"),
      `${symbol} normal PNG`,
    );
    assertOne(
      assetNames,
      hashedAssetPattern(`${symbol}.spinBlur`, "png"),
      `${symbol} spinBlur PNG`,
    );
    assertOne(
      assetNames,
      hashedAssetPattern(`${symbol}.disabled`, "png"),
      `${symbol} disabled PNG`,
    );
  }
  for (const symbol of SPINE_SYMBOLS) {
    assertOne(
      assetNames,
      hashedAssetPattern(symbol, "json"),
      `${symbol} skeleton`,
    );
  }
  for (const project of ["bigwin", "superwin", "megawin"]) {
    assertOne(
      assetNames,
      hashedAssetPattern(project, "json"),
      `${project} project`,
    );
  }
  for (const assetName of readWinAmountAssetNames()) {
    assertDistContainsSourceAsset(
      assetNames,
      join(SOURCE_ROOT, "win-amount/assets", assetName),
    );
  }

  if (!bundledJavaScript.includes("../../../assets/game002-s3/")) {
    failures.push("bundle does not reference assets/game002-s3.");
  }
  for (const oldDirectory of OLD_SOURCE_DIRECTORIES) {
    if (bundledJavaScript.includes(oldDirectory)) {
      failures.push(
        `bundle still references old source directory ${oldDirectory}.`,
      );
    }
  }
  for (const excluded of EXCLUDED_RESOURCE_PREFIXES) {
    if (assetNames.some((name) => name.startsWith(`${excluded}-`))) {
      failures.push(
        `dist unexpectedly contains excluded resource ${excluded}.`,
      );
    }
  }
}

function readWinAmountAssetNames() {
  const names = new Set();
  for (const project of ["bigwin", "superwin", "megawin"]) {
    const data = JSON.parse(
      readFileSync(join(SOURCE_ROOT, `win-amount/${project}.json`), "utf8"),
    );
    for (const asset of data.assets ?? []) {
      const filename = asset.path?.split("/").at(-1);
      if (!filename) {
        failures.push(`${project}.json contains an invalid asset path.`);
        continue;
      }
      names.add(filename);
    }
  }
  return [...names].sort();
}

function hashedAssetPattern(stem, extension) {
  return new RegExp(
    `^${escapeRegExp(stem)}-[A-Za-z0-9_-]+\\.${escapeRegExp(extension)}$`,
  );
}

function assertOne(names, pattern, label) {
  const matches = names.filter((name) => pattern.test(name));
  if (matches.length !== 1) {
    failures.push(
      `dist/assets must contain exactly one ${label}, got ${matches.length}.`,
    );
  }
}

function assertDistContainsSourceAsset(assetNames, sourceFile) {
  assertFile(sourceFile);
  if (!existsSync(sourceFile)) {
    return;
  }
  const sourceBytes = readFileSync(sourceFile);
  const extension = sourceFile.split(".").at(-1);
  const matchingContent = assetNames.some((name) => {
    if (!name.endsWith(`.${extension}`)) {
      return false;
    }
    return readFileSync(join(DIST_ASSETS, name)).equals(sourceBytes);
  });
  if (!matchingContent) {
    failures.push(
      `dist/assets is missing win-amount asset content for ${relative(SOURCE_ROOT, sourceFile)}.`,
    );
  }
}

function verifySensitiveValues(files) {
  for (const file of files) {
    const content = readFileSync(file);
    for (const value of SENSITIVE_VALUES) {
      if (content.includes(Buffer.from(value))) {
        failures.push(
          `${relative(APP_ROOT, file)} contains a forbidden default value.`,
        );
      }
    }
  }
}

function assertImageSize(file, width, height) {
  assertFile(file);
  if (!existsSync(file)) {
    return;
  }
  const size = readImageSize(file);
  if (size.width !== width || size.height !== height) {
    failures.push(`${relative(APP_ROOT, file)} must be ${width} x ${height}.`);
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
    if (statSync(file).isDirectory()) {
      files.push(...listFiles(file));
    } else {
      files.push(file);
    }
  }
  return files.sort();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readImageSize(file) {
  const bytes = readFileSync(file);
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }
  throw new Error(`${relative(APP_ROOT, file)} is not a supported PNG/JPEG.`);
}
