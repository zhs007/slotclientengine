import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../..");
const DEFAULT_SYMBOLS_DIR = resolve(REPO_ROOT, "assets/symbols");
const DEFAULT_COMPOSITES_FILE = resolve(DEFAULT_SYMBOLS_DIR, "symbol-composites.json");
const MANIFEST_FILE_NAME = "symbol-state-textures.manifest.json";
const SPIN_BLUR_STATE = "spinBlur";
const DISABLED_STATE = "disabled";
const REQUIRED_STATES = Object.freeze([SPIN_BLUR_STATE, DISABLED_STATE]);
const SPIN_BLUR_KERNEL_WIDTH = 3;
const SPIN_BLUR_KERNEL_HEIGHT = 21;
const DISABLED_BRIGHTNESS = 0.72;

export function parseGenerateSymbolStateTextureArgs(argv) {
  const args = [...argv];
  while (args[0] === "--") {
    args.shift();
  }

  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--symbols") {
      options.symbols = parseSymbols(readOptionValue(args, index));
      index += 1;
      continue;
    }
    if (arg.startsWith("--symbols=")) {
      options.symbols = parseSymbols(arg.slice("--symbols=".length));
      continue;
    }
    if (arg === "--input-dir") {
      options.inputDir = readOptionValue(args, index);
      index += 1;
      continue;
    }
    if (arg.startsWith("--input-dir=")) {
      options.inputDir = arg.slice("--input-dir=".length);
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readOptionValue(args, index);
      index += 1;
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--composites") {
      options.composites = readOptionValue(args, index);
      index += 1;
      continue;
    }
    if (arg.startsWith("--composites=")) {
      options.composites = arg.slice("--composites=".length);
      continue;
    }
    throw new Error(`Unknown argument "${arg}".`);
  }

  return Object.freeze(options);
}

export async function generateSymbolStateTextures(options = {}) {
  const inputDir = resolveRepoPath(options.inputDir, DEFAULT_SYMBOLS_DIR);
  const outputDir = resolveRepoPath(options.outputDir, inputDir);
  const compositesPath = resolveRepoPath(options.composites, DEFAULT_COMPOSITES_FILE);
  const composites = await loadCompositeConfig(compositesPath, Boolean(options.composites));
  const sourceFiles = await discoverNormalSymbolFiles(inputDir);
  const selectedSymbols = selectSymbols(sourceFiles, composites, options.symbols);

  await mkdir(outputDir, { recursive: true });
  await cleanupGeneratedFiles(outputDir);

  const generatedFiles = [];
  for (const symbol of selectedSymbols) {
    const input = composites.has(symbol)
      ? await createCompositeSymbolBuffer(symbol, composites.get(symbol))
      : sourceFiles.get(symbol);
    if (!input) {
      throw new Error(`Symbol "${symbol}" source PNG was not found in "${inputDir}".`);
    }
    const spinBlurFile = join(outputDir, `${symbol}.${SPIN_BLUR_STATE}.png`);
    const disabledFile = join(outputDir, `${symbol}.${DISABLED_STATE}.png`);
    await generateSpinBlurPng(input, spinBlurFile);
    await generateDisabledPng(input, disabledFile);
    generatedFiles.push(spinBlurFile, disabledFile);
  }

  const manifest = createManifest(selectedSymbols, composites);
  const manifestPath = join(outputDir, MANIFEST_FILE_NAME);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return Object.freeze({
    symbols: Object.freeze([...selectedSymbols]),
    manifestPath,
    files: Object.freeze([...generatedFiles, manifestPath])
  });
}

function resolveRepoPath(value, defaultPath) {
  if (!value) {
    return defaultPath;
  }
  return resolve(REPO_ROOT, value);
}

async function discoverNormalSymbolFiles(inputDir) {
  const dirents = await readdir(inputDir, { withFileTypes: true });
  const entries = dirents
    .filter((dirent) => dirent.isFile())
    .map((dirent) => dirent.name)
    .filter(isNormalPngFile)
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => [fileName.slice(0, -".png".length), join(inputDir, fileName)]);

  return new Map(entries);
}

function selectSymbols(sourceFiles, composites, requestedSymbols) {
  if (requestedSymbols) {
    const unique = [...new Set(requestedSymbols)];
    for (const symbol of unique) {
      if (!sourceFiles.has(symbol) && !composites.has(symbol)) {
        throw new Error(`Symbol "${symbol}" source PNG was not found.`);
      }
    }
    return Object.freeze(unique);
  }

  const discovered = [...sourceFiles.keys()];
  if (discovered.length === 0) {
    throw new Error("No normal symbol PNG files were found.");
  }
  return Object.freeze(discovered);
}

async function loadCompositeConfig(compositesPath, explicit) {
  let raw;
  try {
    raw = await readFile(compositesPath, "utf8");
  } catch (error) {
    if (!explicit && error?.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }

  const parsed = JSON.parse(raw);
  const record = assertRecord(parsed, "symbol composites");
  if (record.version !== 1) {
    throw new Error("Symbol composites version must be 1.");
  }
  const symbols = assertRecord(record.symbols, "symbol composites symbols");
  const baseDir = dirname(compositesPath);
  const composites = new Map();
  for (const [symbol, value] of Object.entries(symbols)) {
    const symbolRecord = assertRecord(value, `symbol composite "${symbol}"`);
    if (!Array.isArray(symbolRecord.layers) || symbolRecord.layers.length === 0) {
      throw new Error(`Symbol "${symbol}" composite layers must be a non-empty array.`);
    }
    const layers = symbolRecord.layers.map((layerPath) => {
      if (typeof layerPath !== "string" || layerPath.length === 0) {
        throw new Error(`Symbol "${symbol}" composite layer path must be a non-empty string.`);
      }
      const fileName = basename(layerPath);
      const match = fileName.match(/^(.+)-(\d+)\.png$/u);
      if (!match || match[1] !== symbol) {
        throw new Error(`Symbol "${symbol}" composite layer file "${fileName}" must match ${symbol}-{index}.png.`);
      }
      return Object.freeze({
        index: Number.parseInt(match[2], 10),
        manifestPath: layerPath.startsWith("./") ? layerPath : `./${fileName}`,
        filePath: resolve(baseDir, layerPath)
      });
    });
    composites.set(symbol, Object.freeze(validateCompositeLayers(symbol, layers)));
  }
  return composites;
}

function validateCompositeLayers(symbol, layers) {
  const sortedLayers = [...layers].sort((left, right) => left.index - right.index);
  const seen = new Set();
  for (const [expectedIndex, layer] of sortedLayers.entries()) {
    if (seen.has(layer.index)) {
      throw new Error(`Symbol "${symbol}" composite declares duplicate layer index ${layer.index}.`);
    }
    seen.add(layer.index);
    if (layer.index !== expectedIndex) {
      throw new Error(`Symbol "${symbol}" composite layers must be consecutive from 0.`);
    }
  }
  return Object.freeze(sortedLayers);
}

async function createCompositeSymbolBuffer(symbol, layers) {
  let width = null;
  let height = null;
  const compositeInputs = [];
  for (const layer of layers) {
    const image = sharp(layer.filePath).ensureAlpha();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(`Symbol "${symbol}" layer ${layer.index} must have readable dimensions.`);
    }
    width ??= metadata.width;
    height ??= metadata.height;
    if (metadata.width !== width || metadata.height !== height) {
      throw new Error(`Symbol "${symbol}" composite layers must have identical dimensions.`);
    }
    compositeInputs.push({
      input: await image.png().toBuffer()
    });
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();
}

async function cleanupGeneratedFiles(outputDir) {
  const dirents = await readdir(outputDir, { withFileTypes: true });
  await Promise.all(
    dirents
      .filter((dirent) => dirent.isFile())
      .map((dirent) => dirent.name)
      .filter(isGeneratedFile)
      .map((fileName) => rm(join(outputDir, fileName)))
  );
}

async function generateSpinBlurPng(inputFile, outputFile) {
  await sharp(inputFile)
    .ensureAlpha()
    .convolve({
      width: SPIN_BLUR_KERNEL_WIDTH,
      height: SPIN_BLUR_KERNEL_HEIGHT,
      kernel: createVerticalBoxBlurKernel(SPIN_BLUR_KERNEL_HEIGHT)
    })
    .png()
    .toFile(outputFile);
}

async function generateDisabledPng(inputFile, outputFile) {
  await sharp(inputFile)
    .ensureAlpha()
    .grayscale()
    .modulate({ brightness: DISABLED_BRIGHTNESS })
    .png()
    .toFile(outputFile);
}

function createManifest(symbols, composites) {
  return Object.freeze({
    version: 1,
    states: REQUIRED_STATES,
    settings: Object.freeze({
      [SPIN_BLUR_STATE]: Object.freeze({
        kind: "verticalBoxBlur",
        kernelHeight: SPIN_BLUR_KERNEL_HEIGHT
      }),
      [DISABLED_STATE]: Object.freeze({
        kind: "grayscale",
        brightness: DISABLED_BRIGHTNESS
      })
    }),
    symbols: Object.freeze(
      Object.fromEntries(
        symbols.map((symbol) => [
          symbol,
          Object.freeze({
            normal: composites.has(symbol)
              ? Object.freeze({
                  kind: "layered",
                  layers: Object.freeze(composites.get(symbol).map((layer) => layer.manifestPath))
                })
              : `./${symbol}.png`,
            [SPIN_BLUR_STATE]: `./${symbol}.${SPIN_BLUR_STATE}.png`,
            [DISABLED_STATE]: `./${symbol}.${DISABLED_STATE}.png`
          })
        ])
      )
    )
  });
}

function parseSymbols(value) {
  const symbols = value
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    throw new Error("--symbols must include at least one symbol.");
  }
  return Object.freeze(symbols);
}

function createVerticalBoxBlurKernel(height) {
  const centerColumn = Math.floor(SPIN_BLUR_KERNEL_WIDTH / 2);
  const kernel = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < SPIN_BLUR_KERNEL_WIDTH; x += 1) {
      kernel.push(x === centerColumn ? 1 / height : 0);
    }
  }
  return kernel;
}

function readOptionValue(args, index) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Argument "${args[index]}" requires a value.`);
  }
  return value;
}

function isNormalPngFile(fileName) {
  if (!fileName.endsWith(".png")) {
    return false;
  }
  const baseName = basename(fileName, ".png");
  return !baseName.includes(".") && !/-\d+$/u.test(baseName);
}

function isGeneratedFile(fileName) {
  return (
    fileName === MANIFEST_FILE_NAME ||
    fileName.endsWith(`.${SPIN_BLUR_STATE}.png`) ||
    fileName.endsWith(`.${DISABLED_STATE}.png`)
  );
}

function isDirectRun() {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && import.meta.url === pathToFileURL(resolve(entryPoint)).href;
}

function assertRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

if (isDirectRun()) {
  generateSymbolStateTextures(parseGenerateSymbolStateTextureArgs(process.argv.slice(2))).catch(
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  );
}
