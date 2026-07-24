import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const ROOT_MANIFEST = "layout.manifest.json";
const ASSETS_MAP = "assets.map.json";

export function parseSceneLayoutResourceArgs(argv) {
  const args = [...argv];
  while (args[0] === "--") args.shift();
  const options = { check: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") {
      options.check = true;
      continue;
    }
    if (arg === "--manifest" || arg === "--out") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument "${arg}".`);
  }
  if (!options.manifest || !options.out) {
    throw new Error("--manifest and --out are required.");
  }
  return Object.freeze(options);
}

export async function generateSceneLayoutViteResources(options) {
  const manifestPath = resolve(REPO_ROOT, options.manifest);
  const packageRoot = dirname(manifestPath);
  const outPath = resolve(REPO_ROOT, options.out);
  if (manifestPath !== resolve(packageRoot, ROOT_MANIFEST)) {
    throw new Error(`Scene layout manifest must be named ${ROOT_MANIFEST}.`);
  }
  const mapPath = resolve(packageRoot, ASSETS_MAP);
  const map = validateAssetsMap(JSON.parse(await readFile(mapPath, "utf8")));
  JSON.parse(await readFile(manifestPath, "utf8"));

  const physicalPaths = [
    ...new Set(Object.values(map.files).map((asset) => asset.path)),
  ].sort(comparePaths);
  const expectedDiskPaths = new Set([
    ROOT_MANIFEST,
    ASSETS_MAP,
    ...physicalPaths,
  ]);
  const diskPaths = await collectFiles(packageRoot);
  const unexpected = diskPaths.filter((path) => !expectedDiskPaths.has(path));
  const missing = [...expectedDiskPaths].filter(
    (path) => !diskPaths.includes(path),
  );
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `Scene layout mapped folder must exactly match assets.map.json; missing=${missing.join(",")}, unexpected=${unexpected.join(",")}.`,
    );
  }

  for (const [key, asset] of Object.entries(map.files)) {
    const bytes = await readFile(resolve(packageRoot, asset.path));
    if (bytes.byteLength !== asset.byteLength) {
      throw new Error(
        `assets.map.json file "${key}" byteLength mismatch for "${asset.path}".`,
      );
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== asset.sha256) {
      throw new Error(
        `assets.map.json file "${key}" sha256 mismatch for "${asset.path}".`,
      );
    }
  }

  const source = await format(
    renderSource({
      outPath,
      packageRoot,
      physicalPaths: [ROOT_MANIFEST, ASSETS_MAP, ...physicalPaths],
    }),
    { parser: "typescript" },
  );
  if (options.check) {
    let current;
    try {
      current = await readFile(outPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(
          `Generated scene layout resource file is missing: ${outPath}.`,
        );
      }
      throw error;
    }
    if (current !== source) {
      throw new Error(
        `Generated scene layout resource file is stale: ${outPath}.`,
      );
    }
  } else {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, source, "utf8");
  }
  return Object.freeze({
    outPath,
    resourceCount: physicalPaths.length + 2,
  });
}

function validateAssetsMap(value) {
  const map = assertRecord(value, ASSETS_MAP);
  assertKeys(map, ["version", "kind", "files"], ASSETS_MAP);
  if (map.version !== 1) throw new Error("assets.map.json version must be 1.");
  if (map.kind !== "editor-assets") {
    throw new Error('assets.map.json kind must be "editor-assets".');
  }
  const rawFiles = assertRecord(map.files, "assets.map.json files");
  const files = {};
  for (const [key, rawAsset] of Object.entries(rawFiles)) {
    assertCanonicalPath(key, `assets.map.json key "${key}"`);
    const asset = assertRecord(rawAsset, `assets.map.json file "${key}"`);
    assertKeys(
      asset,
      ["path", "sha256", "mediaType", "byteLength"],
      `assets.map.json file "${key}"`,
    );
    assertCanonicalPath(asset.path, `assets.map.json file "${key}".path`);
    if (!asset.path.startsWith("assets/")) {
      throw new Error(
        `assets.map.json file "${key}".path must be below assets/.`,
      );
    }
    if (
      typeof asset.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(asset.sha256)
    ) {
      throw new Error(
        `assets.map.json file "${key}".sha256 must be lowercase SHA-256.`,
      );
    }
    if (
      !asset.path.startsWith(`assets/${asset.sha256}.`) &&
      asset.path !== `assets/${asset.sha256}`
    ) {
      throw new Error(
        `assets.map.json file "${key}".path must be content-addressed by sha256.`,
      );
    }
    if (typeof asset.mediaType !== "string" || asset.mediaType.length === 0) {
      throw new Error(
        `assets.map.json file "${key}".mediaType must be non-empty.`,
      );
    }
    if (!Number.isSafeInteger(asset.byteLength) || asset.byteLength < 0) {
      throw new Error(
        `assets.map.json file "${key}".byteLength must be a non-negative safe integer.`,
      );
    }
    files[key] = Object.freeze({
      path: asset.path,
      sha256: asset.sha256,
      mediaType: asset.mediaType,
      byteLength: asset.byteLength,
    });
  }
  if (Object.keys(files).length === 0) {
    throw new Error("assets.map.json files must not be empty.");
  }
  return Object.freeze({ files: Object.freeze(files) });
}

function renderSource(options) {
  const imports = options.physicalPaths.map((path, index) => {
    const absolute = resolve(options.packageRoot, path);
    const specifier = toImportSpecifier(
      relative(dirname(options.outPath), absolute),
    );
    return `import resource${index}Url from ${JSON.stringify(`${specifier}?url`)};`;
  });
  const entries = options.physicalPaths.map(
    (path, index) => `  ${JSON.stringify(path)}: resource${index}Url,`,
  );
  return [
    "// Generated by generate-scene-layout-vite-resources.mjs. Do not edit.",
    ...imports,
    "",
    "export const craveSceneLayoutPhysicalResourceUrls = Object.freeze({",
    ...entries,
    "});",
    "",
  ].join("\n");
}

async function collectFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(relative(root, absolute).split(sep).join("/"));
      } else {
        throw new Error(
          `Scene layout mapped folder contains non-file "${absolute}".`,
        );
      }
    }
  }
  await access(root);
  await visit(root);
  return files.sort(comparePaths);
}

function assertRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertKeys(record, expected, label) {
  const actual = Object.keys(record).sort(comparePaths);
  const wanted = [...expected].sort(comparePaths);
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(
      `${label} keys must be exactly ${wanted.join(",")}; received ${actual.join(",")}.`,
    );
  }
}

function assertCanonicalPath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value
      .split("/")
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} must be a canonical relative package path.`);
  }
}

function toImportSpecifier(value) {
  const normalized = value.split(sep).join("/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function comparePaths(left, right) {
  return left.localeCompare(right);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseSceneLayoutResourceArgs(process.argv.slice(2));
  generateSceneLayoutViteResources(options)
    .then(({ outPath, resourceCount }) => {
      console.log(
        `${options.check ? "Checked" : "Generated"} ${resourceCount} scene layout resources: ${outPath}`,
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
