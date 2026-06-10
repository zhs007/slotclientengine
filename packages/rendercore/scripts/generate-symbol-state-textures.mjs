import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../..");
const DEFAULT_SYMBOLS_DIR = resolve(REPO_ROOT, "assets/symbols");
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
    throw new Error(`Unknown argument "${arg}".`);
  }

  return Object.freeze(options);
}

export async function generateSymbolStateTextures(options = {}) {
  const inputDir = resolve(options.inputDir ?? DEFAULT_SYMBOLS_DIR);
  const outputDir = resolve(options.outputDir ?? inputDir);
  const sourceFiles = await discoverNormalSymbolFiles(inputDir);
  const selectedSymbols = selectSymbols(sourceFiles, options.symbols);

  await mkdir(outputDir, { recursive: true });
  await cleanupGeneratedFiles(outputDir);

  const generatedFiles = [];
  for (const symbol of selectedSymbols) {
    const inputFile = sourceFiles.get(symbol);
    if (!inputFile) {
      throw new Error(`Symbol "${symbol}" source PNG was not found in "${inputDir}".`);
    }
    const spinBlurFile = join(outputDir, `${symbol}.${SPIN_BLUR_STATE}.png`);
    const disabledFile = join(outputDir, `${symbol}.${DISABLED_STATE}.png`);
    await generateSpinBlurPng(inputFile, spinBlurFile);
    await generateDisabledPng(inputFile, disabledFile);
    generatedFiles.push(spinBlurFile, disabledFile);
  }

  const manifest = createManifest(selectedSymbols);
  const manifestPath = join(outputDir, MANIFEST_FILE_NAME);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return Object.freeze({
    symbols: Object.freeze([...selectedSymbols]),
    manifestPath,
    files: Object.freeze([...generatedFiles, manifestPath])
  });
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

function selectSymbols(sourceFiles, requestedSymbols) {
  if (requestedSymbols) {
    const unique = [...new Set(requestedSymbols)];
    for (const symbol of unique) {
      if (!sourceFiles.has(symbol)) {
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

function createManifest(symbols) {
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
            normal: `./${symbol}.png`,
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
  return !baseName.includes(".");
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

if (isDirectRun()) {
  generateSymbolStateTextures(parseGenerateSymbolStateTextureArgs(process.argv.slice(2))).catch(
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  );
}
