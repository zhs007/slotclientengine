import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { TextDecoder, TextEncoder } from "node:util";
import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  assertNoEditorAssetKeyAliases,
  basenameFromSourcePath,
  decodeEditorAssetsMap,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import {
  collectSymbolManifestResourcePaths,
  createSymbolPackageResource,
  materializeMappedSymbolPackageContents,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol";
import { loadGameStaticYamlConfig } from "../../buildgamestatic/dist/yaml-loader.js";

const ZIP_LIMITS = Object.freeze({
  maxEntries: 1024,
  maxCompressedBytes: 100 * 1024 * 1024,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
});
const workspace = resolve(import.meta.dirname, "../../..");
const artifactPath = resolve(
  workspace,
  "tasks/artifacts/152/game003-s1-symbols.zip",
);
const check = parseCheckArgument(process.argv.slice(2));

const first = await buildArtifact();
const second = await buildArtifact();
assertEqualBytes(first.bytes, second.bytes, "task 152 repeated build");

if (check) {
  const existing = new Uint8Array(await readFile(artifactPath));
  assertEqualBytes(existing, first.bytes, "task 152 checked artifact");
} else {
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, first.bytes);
}

process.stdout.write(
  `${JSON.stringify({
    artifactPath,
    checked: check,
    byteLength: first.bytes.byteLength,
    sha256: sha256(first.bytes),
    logicalKeyCount: first.logicalKeyCount,
    physicalPayloadCount: first.physicalPayloadCount,
    displaySymbolCount: first.displaySymbolCount,
    cellSize: first.cellSize,
  })}\n`,
);

async function buildArtifact() {
  const config = loadGameStaticYamlConfig({
    rootDir: workspace,
    inputPath: "apps/game003/config/game-static.yaml",
  });
  if (config.gameId !== "game003") {
    throw new Error(
      `Task 152 expects gameId=game003; received ${config.gameId}.`,
    );
  }
  const skin = config.skins["1"];
  if (!skin) throw new Error("Task 152 requires game003 skin 1.");
  const manifestPath = skin.symbols.manifest;
  const assetRoot = dirname(resolve(workspace, manifestPath));
  const manifestFileName = relative(
    assetRoot,
    resolve(workspace, manifestPath),
  ).replaceAll("\\", "/");
  if (manifestFileName !== "symbol-state-textures.manifest.json") {
    throw new Error(
      `Task 152 expects the canonical symbol manifest filename; received ${manifestFileName}.`,
    );
  }
  const availableFiles = await readDirectoryFiles(assetRoot);
  const rawSymbolManifest = parseJson(
    requiredBytes(availableFiles, manifestFileName),
    manifestPath,
  );
  const resources = collectSymbolManifestResourcePaths({
    symbolManifest: rawSymbolManifest,
    symbolManifestPath: manifestFileName,
    files: availableFiles,
  });
  const packageManifest = parseSymbolPackageManifest({
    version: 1,
    kind: "symbol-package",
    id: `${config.gameId}-s1`,
    cellSize: {
      width: skin.art.reelAreaInMainReelBackground.cellWidth,
      height: skin.art.reelAreaInMainReelBackground.cellHeight,
    },
    entrypoints: {
      gameConfig: "gameconfig.json",
      symbolManifest: manifestFileName,
    },
    resources,
  });
  const sourceFiles = new Map();
  sourceFiles.set("symbols.package.json", encodeJson(packageManifest));
  sourceFiles.set(
    packageManifest.entrypoints.gameConfig,
    new Uint8Array(await readFile(resolve(workspace, config.gameConfig))),
  );
  sourceFiles.set(
    packageManifest.entrypoints.symbolManifest,
    requiredBytes(availableFiles, manifestFileName),
  );
  for (const path of resources) {
    sourceFiles.set(path, requiredBytes(availableFiles, path));
  }

  const sourceResource = await createSymbolPackageResource({
    packageManifest,
    files: sourceFiles,
    loadTextures: false,
  });
  let materialized;
  try {
    materialized = await materializeMappedSymbolPackageContents({
      packageManifest: sourceResource.packageManifest,
      rawGameConfig: sourceResource.rawGameConfig,
      rawSymbolManifest: sourceResource.rawSymbolManifest,
      assets: sourceResource.assets,
    });
  } finally {
    sourceResource.destroy();
  }
  const bytes = createDeterministicZip(materialized.files);
  const validation = await validateArtifact({
    bytes,
    sourceResources: resources,
    expectedCellSize: packageManifest.cellSize,
  });

  const mappedResource = await createSymbolPackageResource({
    packageManifest: materialized.packageManifest,
    files: materialized.files,
    loadTextures: false,
  });
  try {
    const rematerialized = await materializeMappedSymbolPackageContents({
      packageManifest: mappedResource.packageManifest,
      rawGameConfig: mappedResource.rawGameConfig,
      rawSymbolManifest: mappedResource.rawSymbolManifest,
      assets: mappedResource.assets,
    });
    const roundTripBytes = createDeterministicZip(rematerialized.files);
    assertEqualBytes(bytes, roundTripBytes, "task 152 mapped round-trip");
  } finally {
    mappedResource.destroy();
  }
  return {
    bytes,
    logicalKeyCount: validation.logicalKeys.length,
    physicalPayloadCount: validation.physicalPayloadCount,
    displaySymbolCount: validation.displaySymbolCount,
    cellSize: packageManifest.cellSize,
  };
}

async function validateArtifact(options) {
  const files = extractBoundedZip(options.bytes, { limits: ZIP_LIMITS });
  const map = decodeEditorAssetsMap(
    requiredBytes(files, EDITOR_ASSETS_MAP_PATH),
  );
  await validateEditorAssetsMapPackage({
    map,
    files,
    allowControlPaths: [
      "symbols.package.json",
      "gameconfig.json",
      "symbol-state-textures.manifest.json",
    ],
  });
  const expectedKeys = options.sourceResources.map(basenameFromSourcePath);
  assertNoEditorAssetKeyAliases(expectedKeys);
  assertStringSetsEqual(
    Object.keys(map.files),
    expectedKeys,
    "task 152 logical filename keys",
  );
  const logicalKeys = Object.keys(map.files).sort(compareText);
  if (logicalKeys.length !== 62) {
    throw new Error(
      `Task 152 expected 62 logical filename keys; received ${logicalKeys.length}.`,
    );
  }
  const payloadPaths = new Set(
    Object.values(map.files).map((entry) => entry.path),
  );
  if (payloadPaths.size !== 57) {
    throw new Error(
      `Task 152 expected 57 physical payloads; received ${payloadPaths.size}.`,
    );
  }
  assertExpectedSharedPayloadGroups(map.files);

  const rawPackageManifest = parseJson(
    requiredBytes(files, "symbols.package.json"),
    "symbols.package.json",
  );
  const packageManifest = parseSymbolPackageManifest(rawPackageManifest);
  if (
    packageManifest.id !== "game003-s1" ||
    packageManifest.cellSize.width !== options.expectedCellSize.width ||
    packageManifest.cellSize.height !== options.expectedCellSize.height
  ) {
    throw new Error(
      `Task 152 package identity/cell mismatch: ${JSON.stringify({
        id: packageManifest.id,
        cellSize: packageManifest.cellSize,
      })}.`,
    );
  }
  assertStringSetsEqual(
    packageManifest.resources,
    logicalKeys,
    "task 152 package resources",
  );
  const resource = await createSymbolPackageResource({
    packageManifest,
    files,
    loadTextures: false,
  });
  try {
    if (resource.displaySymbols.length !== 14) {
      throw new Error(
        `Task 152 expected 14 display symbols; received ${resource.displaySymbols.length}.`,
      );
    }
    return {
      logicalKeys,
      physicalPayloadCount: payloadPaths.size,
      displaySymbolCount: resource.displaySymbols.length,
    };
  } finally {
    resource.destroy();
  }
}

function assertExpectedSharedPayloadGroups(files) {
  const groups = new Map();
  for (const [key, entry] of Object.entries(files)) {
    const keys = groups.get(entry.path) ?? [];
    keys.push(key);
    groups.set(entry.path, keys);
  }
  const shared = [...groups.values()]
    .filter((keys) => keys.length > 1)
    .map((keys) => keys.sort(compareText));
  if (shared.length !== 5) {
    throw new Error(
      `Task 152 expected five shared-payload logical groups; received ${JSON.stringify(shared)}.`,
    );
  }
  for (const keys of shared) {
    if (
      keys.length !== 2 ||
      !keys.some((key) => /^L[1-5]\.png$/u.test(key)) ||
      !keys.some((key) => /_asset_image_[a-z0-9_]+\.png$/u.test(key))
    ) {
      throw new Error(
        `Task 152 unexpected shared-payload logical group: ${keys.join(", ")}.`,
      );
    }
  }
}

async function readDirectoryFiles(root) {
  const files = new Map();
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = resolve(entry.parentPath, entry.name);
    const path = relative(root, absolute).replaceAll("\\", "/");
    files.set(path, new Uint8Array(await readFile(absolute)));
  }
  return files;
}

function parseCheckArgument(args) {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  if (normalized.length === 0) return false;
  if (normalized.length === 1 && normalized[0] === "--check") return true;
  throw new Error(`Task 152 arguments are invalid: ${args.join(" ")}.`);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function encodeJson(value) {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function requiredBytes(files, path) {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`Task 152 required file is missing: ${path}.`);
  return bytes.slice();
}

function assertStringSetsEqual(actual, expected, label) {
  const sortedActual = [...actual].sort(compareText);
  const sortedExpected = [...expected].sort(compareText);
  if (
    sortedActual.length !== sortedExpected.length ||
    sortedActual.some((value, index) => value !== sortedExpected[index])
  ) {
    throw new Error(
      `${label} mismatch: expected=${sortedExpected.join(",")}; actual=${sortedActual.join(",")}.`,
    );
  }
}

function assertEqualBytes(actual, expected, label) {
  if (
    actual.byteLength !== expected.byteLength ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} bytes differ.`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareText(left, right) {
  return left.localeCompare(right, "en");
}
