import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
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
const DEFAULT_SYMBOL_SCALE = 1;

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
    if (arg === "--scale") {
      options.scale = parseScale(readOptionValue(args, index));
      index += 1;
      continue;
    }
    if (arg.startsWith("--scale=")) {
      options.scale = parseScale(arg.slice("--scale=".length));
      continue;
    }
    throw new Error(`Unknown argument "${arg}".`);
  }

  return Object.freeze(options);
}

export async function generateSymbolStateTextures(options = {}) {
  const inputDir = resolveRepoPath(options.inputDir, DEFAULT_SYMBOLS_DIR);
  const outputDir = resolveRepoPath(options.outputDir, inputDir);
  const scale = normalizeScale(options.scale);
  const explicitComposites = Boolean(options.composites);
  const compositesPath = resolveRepoPath(
    options.composites,
    join(inputDir, "symbol-composites.json"),
  );
  const composites = await loadCompositeConfig(
    compositesPath,
    explicitComposites,
  );
  const sourceFiles = await discoverNormalSymbolFiles(inputDir);
  const selectedSymbols = selectSymbols(
    sourceFiles,
    composites,
    options.symbols,
  );
  const manifestPath = join(outputDir, MANIFEST_FILE_NAME);
  const preservedMetadata = await loadPreservedManifestMetadata(
    manifestPath,
    selectedSymbols,
  );

  await mkdir(outputDir, { recursive: true });
  await cleanupGeneratedFiles(outputDir);

  const generatedFiles = [];
  for (const symbol of selectedSymbols) {
    const input = composites.has(symbol)
      ? await createCompositeSymbolBuffer(symbol, composites.get(symbol))
      : sourceFiles.get(symbol);
    if (!input) {
      throw new Error(
        `Symbol "${symbol}" source PNG was not found in "${inputDir}".`,
      );
    }
    const spinBlurFile = join(outputDir, `${symbol}.${SPIN_BLUR_STATE}.png`);
    const disabledFile = join(outputDir, `${symbol}.${DISABLED_STATE}.png`);
    await generateSpinBlurPng(input, spinBlurFile);
    await generateDisabledPng(input, disabledFile);
    generatedFiles.push(spinBlurFile, disabledFile);
  }

  const manifest = createManifest(
    selectedSymbols,
    composites,
    scale,
    preservedMetadata,
  );
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  return Object.freeze({
    symbols: Object.freeze([...selectedSymbols]),
    manifestPath,
    files: Object.freeze([...generatedFiles, manifestPath]),
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
    .map((fileName) => [
      fileName.slice(0, -".png".length),
      join(inputDir, fileName),
    ]);

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
    if (
      !Array.isArray(symbolRecord.layers) ||
      symbolRecord.layers.length === 0
    ) {
      throw new Error(
        `Symbol "${symbol}" composite layers must be a non-empty array.`,
      );
    }
    const layers = symbolRecord.layers.map((layer) =>
      parseCompositeLayer(symbol, layer, baseDir),
    );
    composites.set(
      symbol,
      Object.freeze(validateCompositeLayers(symbol, layers)),
    );
  }
  return composites;
}

function parseCompositeLayer(symbol, layer, baseDir) {
  if (typeof layer === "string") {
    if (layer.length === 0) {
      throw new Error(
        `Symbol "${symbol}" composite layer path must be a non-empty string.`,
      );
    }
    const fileName = basename(layer);
    const match = fileName.match(/^(.+)-(\d+)\.png$/u);
    if (!match || match[1] !== symbol) {
      throw new Error(
        `Symbol "${symbol}" composite layer file "${fileName}" must match ${symbol}-{index}.png.`,
      );
    }
    return Object.freeze({
      index: Number.parseInt(match[2], 10),
      manifestPath: normalizeManifestPath(layer),
      filePath: resolve(baseDir, layer),
    });
  }

  const record = assertRecord(layer, `symbol "${symbol}" composite layer`);
  if (!Number.isInteger(record.index) || record.index < 0) {
    throw new Error(
      `Symbol "${symbol}" composite layer index must be a non-negative integer.`,
    );
  }
  const texturePath = assertNonEmptyString(
    record.texture,
    `Symbol "${symbol}" composite layer texture`,
  );
  const manifestPath = normalizeManifestPath(texturePath);
  const rawKeyframes = record.keyframes;
  let keyframes = undefined;
  let keyframeFilePaths = undefined;
  if (rawKeyframes !== undefined) {
    if (!Array.isArray(rawKeyframes) || rawKeyframes.length === 0) {
      throw new Error(
        `Symbol "${symbol}" composite layer ${record.index} keyframes must be a non-empty array.`,
      );
    }
    const keyframePaths = rawKeyframes.map((keyframe) =>
      assertNonEmptyString(
        keyframe,
        `Symbol "${symbol}" composite layer ${record.index} keyframe`,
      ),
    );
    keyframes = Object.freeze(
      keyframePaths.map((keyframePath) => normalizeManifestPath(keyframePath)),
    );
    keyframeFilePaths = Object.freeze(
      keyframePaths.map((keyframePath) => resolve(baseDir, keyframePath)),
    );
    if (keyframes[0] !== manifestPath) {
      throw new Error(
        `Symbol "${symbol}" composite layer ${record.index} keyframes must start with the layer texture.`,
      );
    }
  }

  return Object.freeze({
    index: record.index,
    manifestPath,
    filePath: resolve(baseDir, texturePath),
    keyframes,
    keyframeFilePaths,
  });
}

function validateCompositeLayers(symbol, layers) {
  const sortedLayers = [...layers].sort(
    (left, right) => left.index - right.index,
  );
  const seen = new Set();
  for (const [expectedIndex, layer] of sortedLayers.entries()) {
    if (seen.has(layer.index)) {
      throw new Error(
        `Symbol "${symbol}" composite declares duplicate layer index ${layer.index}.`,
      );
    }
    seen.add(layer.index);
    if (layer.index !== expectedIndex) {
      throw new Error(
        `Symbol "${symbol}" composite layers must be consecutive from 0.`,
      );
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
      throw new Error(
        `Symbol "${symbol}" layer ${layer.index} must have readable dimensions.`,
      );
    }
    width ??= metadata.width;
    height ??= metadata.height;
    if (metadata.width !== width || metadata.height !== height) {
      throw new Error(
        `Symbol "${symbol}" composite layers must have identical dimensions.`,
      );
    }
    await assertLayerKeyframeDimensions(
      symbol,
      layer,
      metadata.width,
      metadata.height,
    );
    compositeInputs.push({
      input: await image.png().toBuffer(),
    });
  }

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(compositeInputs)
    .png()
    .toBuffer();
}

async function assertLayerKeyframeDimensions(symbol, layer, width, height) {
  for (const keyframeFilePath of layer.keyframeFilePaths ?? []) {
    const metadata = await sharp(keyframeFilePath).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(
        `Symbol "${symbol}" layer ${layer.index} keyframe must have readable dimensions.`,
      );
    }
    if (metadata.width !== width || metadata.height !== height) {
      throw new Error(
        `Symbol "${symbol}" layer ${layer.index} keyframe textures must match the layer texture dimensions.`,
      );
    }
  }
}

async function cleanupGeneratedFiles(outputDir) {
  const dirents = await readdir(outputDir, { withFileTypes: true });
  await Promise.all(
    dirents
      .filter((dirent) => dirent.isFile())
      .map((dirent) => dirent.name)
      .filter(isGeneratedFile)
      .map((fileName) => rm(join(outputDir, fileName))),
  );
}

async function generateSpinBlurPng(inputFile, outputFile) {
  await sharp(inputFile)
    .ensureAlpha()
    .convolve({
      width: SPIN_BLUR_KERNEL_WIDTH,
      height: SPIN_BLUR_KERNEL_HEIGHT,
      kernel: createVerticalBoxBlurKernel(SPIN_BLUR_KERNEL_HEIGHT),
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

async function loadPreservedManifestMetadata(manifestPath, selectedSymbols) {
  let raw;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }

  const manifest = assertRecord(
    JSON.parse(raw),
    "existing symbol state texture manifest",
  );
  assertOnlyKnownKeys(manifest, "existing symbol state texture manifest", [
    "version",
    "states",
    "settings",
    "symbols",
  ]);
  if (manifest.version !== 1) {
    throw new Error(
      "Existing symbol state texture manifest version must be 1.",
    );
  }
  if (!Array.isArray(manifest.states)) {
    throw new Error(
      "Existing symbol state texture manifest states must be an array.",
    );
  }
  const stateSet = new Set(
    manifest.states.map((state) =>
      assertNonEmptyString(state, "existing manifest state"),
    ),
  );
  for (const state of REQUIRED_STATES) {
    if (!stateSet.has(state)) {
      throw new Error(
        `Existing symbol state texture manifest is missing required state "${state}".`,
      );
    }
  }
  const additionalStateDefinitions = validateAdditionalStateDefinitions(
    manifest.settings,
  );
  const animationStateIds = new Set([
    "normal",
    "appear",
    "win",
    "remove",
    "dropdown",
    ...additionalStateDefinitions.map((definition) => definition.id),
  ]);

  const symbols = assertRecord(
    manifest.symbols,
    "existing symbol state texture manifest symbols",
  );
  const selectedSymbolSet = new Set(selectedSymbols);
  const preserved = new Map();
  for (const [symbol, rawSymbol] of Object.entries(symbols)) {
    const symbolRecord = assertRecord(
      rawSymbol,
      `existing manifest symbol "${symbol}"`,
    );
    assertOnlyKnownKeys(symbolRecord, `existing manifest symbol "${symbol}"`, [
      "normal",
      "scale",
      "renderPriority",
      "animations",
      "valuePresentation",
      "cascadeWinPresentation",
      ...REQUIRED_STATES,
    ]);
    const hasRenderPriority = Object.prototype.hasOwnProperty.call(
      symbolRecord,
      "renderPriority",
    );
    const renderPriority = hasRenderPriority
      ? validatePreservedRenderPriority(symbol, symbolRecord.renderPriority)
      : undefined;
    if (!selectedSymbolSet.has(symbol)) {
      continue;
    }
    const metadata = {};
    if (symbolRecord.animations !== undefined) {
      metadata.animations = Object.freeze(
        validatePreservedAnimations(
          symbol,
          symbolRecord.animations,
          animationStateIds,
        ),
      );
    }
    if (symbolRecord.valuePresentation !== undefined) {
      metadata.valuePresentation = validatePreservedValuePresentation(
        symbol,
        symbolRecord.valuePresentation,
      );
    }
    if (hasRenderPriority) {
      metadata.renderPriority = renderPriority;
    }
    if (symbolRecord.cascadeWinPresentation !== undefined) {
      metadata.cascadeWinPresentation = freezeJsonValue(
        symbolRecord.cascadeWinPresentation,
        `${symbol}.cascadeWinPresentation`,
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(metadata, "animations") ||
      Object.prototype.hasOwnProperty.call(metadata, "renderPriority") ||
      Object.prototype.hasOwnProperty.call(metadata, "valuePresentation") ||
      Object.prototype.hasOwnProperty.call(metadata, "cascadeWinPresentation")
    ) {
      preserved.set(symbol, Object.freeze(metadata));
    }
  }
  preserved.additionalStateDefinitions = additionalStateDefinitions;
  return preserved;
}

function validateAdditionalStateDefinitions(settingsValue) {
  if (settingsValue === undefined) return Object.freeze([]);
  const settings = assertRecord(
    settingsValue,
    "existing symbol state texture manifest settings",
  );
  const raw = settings.additionalStateDefinitions;
  if (raw === undefined) return Object.freeze([]);
  if (!Array.isArray(raw)) {
    throw new Error("additionalStateDefinitions must be an array.");
  }
  const base = new Set([
    "normal",
    "spinBlur",
    "disabled",
    "appear",
    "win",
    "remove",
    "dropdown",
  ]);
  return Object.freeze(
    raw.map((value, index) => {
      const record = assertRecord(
        value,
        `additionalStateDefinitions[${index}]`,
      );
      assertOnlyKnownKeys(record, `additionalStateDefinitions[${index}]`, [
        "id",
        "phase",
        "playback",
      ]);
      const id = assertNonEmptyString(
        record.id,
        `additionalStateDefinitions[${index}].id`,
      );
      if (base.has(id)) throw new Error(`Duplicate symbol state "${id}".`);
      if (
        !(
          (record.phase === "once" && record.playback === "once") ||
          (record.phase === "stable" && record.playback === "loop")
        )
      ) {
        throw new Error(
          `Additional symbol state "${id}" must be once/once or stable/loop.`,
        );
      }
      base.add(id);
      return Object.freeze({
        id,
        phase: record.phase,
        playback: record.playback,
      });
    }),
  );
}

function validatePreservedValuePresentation(symbol, value) {
  const record = assertRecord(
    value,
    `existing manifest symbol "${symbol}" valuePresentation`,
  );
  assertOnlyKnownKeys(
    record,
    `existing manifest symbol "${symbol}" valuePresentation`,
    ["defaultValues", "reelStates", "tiers", "text"],
  );
  if (
    !Array.isArray(record.defaultValues) ||
    record.defaultValues.length === 0
  ) {
    throw new Error(
      `${symbol} valuePresentation defaultValues must be non-empty.`,
    );
  }
  const defaultValues = Object.freeze(
    record.defaultValues.map((candidate, index) => {
      if (!Number.isSafeInteger(candidate) || candidate <= 0) {
        throw new Error(
          `${symbol} valuePresentation defaultValues[${index}] must be a positive safe integer.`,
        );
      }
      return candidate;
    }),
  );
  if (new Set(defaultValues).size !== defaultValues.length) {
    throw new Error(
      `${symbol} valuePresentation defaultValues must be unique.`,
    );
  }
  const reelStates = assertRecord(
    record.reelStates,
    `${symbol}.valuePresentation.reelStates`,
  );
  assertOnlyKnownKeys(reelStates, `${symbol}.valuePresentation.reelStates`, [
    "normal",
    ...REQUIRED_STATES,
  ]);
  const reelNormal = assertRecord(
    reelStates.normal,
    `${symbol}.valuePresentation.reelStates.normal`,
  );
  assertOnlyKnownKeys(
    reelNormal,
    `${symbol}.valuePresentation.reelStates.normal`,
    ["kind", "width", "height"],
  );
  if (reelNormal.kind !== "transparent") {
    throw new Error(
      `${symbol} valuePresentation reel normal must be transparent.`,
    );
  }
  const preservedReelStates = {
    normal: Object.freeze({
      kind: "transparent",
      width: assertFinitePositiveNumber(
        reelNormal.width,
        `${symbol}.reelStates.normal.width`,
      ),
      height: assertFinitePositiveNumber(
        reelNormal.height,
        `${symbol}.reelStates.normal.height`,
      ),
    }),
  };
  for (const state of REQUIRED_STATES) {
    preservedReelStates[state] = validateLocalManifestFilePath(
      reelStates[state],
      `${symbol}.reelStates.${state}`,
      [".png"],
    );
  }
  if (!Array.isArray(record.tiers) || record.tiers.length === 0) {
    throw new Error(
      `Existing manifest symbol "${symbol}" valuePresentation tiers must be non-empty.`,
    );
  }
  let previousMax = 0;
  const tiers = Object.freeze(
    record.tiers.map((valueTier, index) => {
      const tier = assertRecord(
        valueTier,
        `existing manifest symbol "${symbol}" valuePresentation tier ${index}`,
      );
      assertOnlyKnownKeys(tier, `${symbol}.valuePresentation.tiers[${index}]`, [
        "maxExclusive",
        "animation",
      ]);
      const isLast = index === record.tiers.length - 1;
      if (isLast && tier.maxExclusive !== undefined) {
        throw new Error(
          `${symbol} final valuePresentation tier must be unbounded.`,
        );
      }
      if (!isLast && tier.maxExclusive === undefined) {
        throw new Error(
          `${symbol} bounded valuePresentation tier requires maxExclusive.`,
        );
      }
      if (
        tier.maxExclusive !== undefined &&
        (!Number.isSafeInteger(tier.maxExclusive) ||
          tier.maxExclusive <= previousMax)
      ) {
        throw new Error(
          `${symbol} valuePresentation maxExclusive must strictly increase as positive safe integers.`,
        );
      }
      if (tier.maxExclusive !== undefined) {
        previousMax = tier.maxExclusive;
      }
      const animation = validatePreservedAnimation(
        symbol,
        `valuePresentation.tiers[${index}]`,
        tier.animation,
      );
      if (animation.kind !== "spine" || animation.playback.loop !== true) {
        throw new Error(
          `${symbol} valuePresentation tier must use looping Spine.`,
        );
      }
      return Object.freeze({
        ...(tier.maxExclusive === undefined
          ? {}
          : { maxExclusive: tier.maxExclusive }),
        animation,
      });
    }),
  );
  const text = assertRecord(record.text, `${symbol}.valuePresentation.text`);
  const textType = text.type ?? "font";
  if (textType !== "font" && textType !== "image") {
    throw new Error(`${symbol}.valuePresentation.text.type is invalid.`);
  }
  assertOnlyKnownKeys(
    text,
    `${symbol}.valuePresentation.text`,
    textType === "image"
      ? ["type", "slot", "x", "y", "prefix"]
      : [
          "type",
          "slot",
          "x",
          "y",
          "fontFamily",
          "fontSize",
          "fontWeight",
          "fill",
          "stroke",
          "strokeWidth",
        ],
  );
  const textBase = {
    type: textType,
    slot: assertNonEmptyString(text.slot, `${symbol}.slot`),
    x: assertFiniteNumber(text.x, `${symbol}.text.x`),
    y: assertFiniteNumber(text.y, `${symbol}.text.y`),
  };
  const preservedText =
    textType === "image"
      ? Object.freeze({
          ...textBase,
          prefix: assertManifestPathPrefix(
            text.prefix,
            `${symbol}.text.prefix`,
          ),
        })
      : Object.freeze({
          ...textBase,
          fontFamily: assertNonEmptyString(
            text.fontFamily,
            `${symbol}.fontFamily`,
          ),
          fontSize: assertFinitePositiveNumber(
            text.fontSize,
            `${symbol}.fontSize`,
          ),
          fontWeight: assertNonEmptyString(
            text.fontWeight,
            `${symbol}.fontWeight`,
          ),
          fill: assertNonEmptyString(text.fill, `${symbol}.fill`),
          stroke: assertNonEmptyString(text.stroke, `${symbol}.stroke`),
          strokeWidth: assertFinitePositiveNumber(
            text.strokeWidth,
            `${symbol}.strokeWidth`,
          ),
        });
  return Object.freeze({
    defaultValues,
    reelStates: Object.freeze(preservedReelStates),
    tiers,
    text: preservedText,
  });
}

function validatePreservedRenderPriority(symbol, value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Existing manifest symbol "${symbol}" renderPriority must be a non-negative safe integer.`,
    );
  }
  return value;
}

function validatePreservedAnimations(symbol, value, allowedStateIds) {
  const animations = assertRecord(
    value,
    `existing manifest symbol "${symbol}" animations`,
  );
  const preserved = {};
  for (const [state, animation] of Object.entries(animations)) {
    if (!allowedStateIds.has(state)) {
      throw new Error(
        `Existing manifest symbol "${symbol}" declares animation for unknown state "${state}".`,
      );
    }
    preserved[state] = validatePreservedAnimation(symbol, state, animation);
  }
  return preserved;
}

function validatePreservedAnimation(symbol, state, value) {
  const animation = assertRecord(
    value,
    `existing manifest symbol "${symbol}" ${state} animation`,
  );
  if (animation.kind === "builtin" || animation.kind === "static") {
    assertOnlyKnownKeys(
      animation,
      `existing manifest symbol "${symbol}" ${state} animation`,
      ["kind", "durationSeconds"],
    );
    return Object.freeze({
      kind: animation.kind,
      durationSeconds: assertFinitePositiveNumber(
        animation.durationSeconds,
        `${symbol}.${state}.durationSeconds`,
      ),
    });
  }
  if (animation.kind === "spine") {
    assertOnlyKnownKeys(
      animation,
      `existing manifest symbol "${symbol}" ${state} animation`,
      ["kind", "skeleton", "atlas", "texture", "playback", "transform"],
    );
    return Object.freeze({
      kind: "spine",
      skeleton: validateLocalManifestFilePath(
        animation.skeleton,
        `${symbol}.${state}.skeleton`,
        [".json"],
      ),
      atlas: validateLocalManifestFilePath(
        animation.atlas,
        `${symbol}.${state}.atlas`,
        [".atlas"],
      ),
      texture: validateLocalManifestFilePath(
        animation.texture,
        `${symbol}.${state}.texture`,
        [".png"],
      ),
      playback: validatePreservedAnimationPlayback(
        symbol,
        state,
        animation.playback,
      ),
      ...(animation.transform !== undefined
        ? {
            transform: validatePreservedSpineTransform(
              symbol,
              state,
              animation.transform,
            ),
          }
        : {}),
    });
  }
  if (animation.kind === "activeSpine") {
    assertOnlyKnownKeys(
      animation,
      `existing manifest symbol "${symbol}" ${state} animation`,
      ["kind", "playback"],
    );
    return Object.freeze({
      kind: "activeSpine",
      playback: validatePreservedAnimationPlayback(
        symbol,
        state,
        animation.playback,
      ),
    });
  }
  assertOnlyKnownKeys(
    animation,
    `existing manifest symbol "${symbol}" ${state} animation`,
    ["kind", "project", "playback"],
  );
  if (animation.kind !== "vni") {
    throw new Error(
      `Existing manifest symbol "${symbol}" ${state} animation kind must be "builtin", "static", "vni", "spine" or "activeSpine".`,
    );
  }
  return Object.freeze({
    kind: "vni",
    project: normalizeManifestPath(
      assertNonEmptyString(
        animation.project,
        `existing manifest symbol "${symbol}" ${state} project`,
      ),
    ),
    playback: validatePreservedPlayback(symbol, state, animation.playback),
  });
}

function validatePreservedAnimationPlayback(symbol, state, value) {
  const playback = assertRecord(
    value,
    `existing manifest symbol "${symbol}" ${state} playback`,
  );
  assertOnlyKnownKeys(
    playback,
    `existing manifest symbol "${symbol}" ${state} playback`,
    ["mode", "animationName", "loop"],
  );
  if (playback.mode !== "animation") {
    throw new Error(
      `Existing manifest symbol "${symbol}" ${state} Spine playback mode must be "animation".`,
    );
  }
  if (typeof playback.loop !== "boolean") {
    throw new Error(
      `Existing manifest symbol "${symbol}" ${state} Spine playback loop must be boolean.`,
    );
  }
  if ((state === "appear" || state === "win") && playback.loop) {
    throw new Error(
      `Existing manifest symbol "${symbol}" ${state} Spine playback loop must be false for once states.`,
    );
  }
  return Object.freeze({
    mode: "animation",
    animationName: assertNonEmptyString(
      playback.animationName,
      `existing manifest symbol "${symbol}" ${state} animationName`,
    ),
    loop: playback.loop,
  });
}

function validatePreservedSpineTransform(symbol, state, value) {
  const transform = assertRecord(
    value,
    `existing manifest symbol "${symbol}" ${state} transform`,
  );
  assertOnlyKnownKeys(
    transform,
    `existing manifest symbol "${symbol}" ${state} transform`,
    ["x", "y", "scale"],
  );
  return Object.freeze({
    ...(transform.x !== undefined
      ? {
          x: assertFiniteNumber(transform.x, `${symbol}.${state}.transform.x`),
        }
      : {}),
    ...(transform.y !== undefined
      ? {
          y: assertFiniteNumber(transform.y, `${symbol}.${state}.transform.y`),
        }
      : {}),
    ...(transform.scale !== undefined
      ? {
          scale: assertFinitePositiveNumber(
            transform.scale,
            `${symbol}.${state}.transform.scale`,
          ),
        }
      : {}),
  });
}

function validatePreservedPlayback(symbol, state, value) {
  const playback = assertRecord(
    value,
    `existing manifest symbol "${symbol}" ${state} playback`,
  );
  assertOnlyKnownKeys(
    playback,
    `existing manifest symbol "${symbol}" ${state} playback`,
    ["mode", "startTime", "endTime", "loop"],
  );
  if (playback.mode !== "range") {
    throw new Error(
      `Existing manifest symbol "${symbol}" ${state} playback mode must be "range".`,
    );
  }
  const startTime = assertFiniteNonNegativeNumber(
    playback.startTime,
    `${symbol}.${state}.playback.startTime`,
  );
  const endTime = assertFinitePositiveNumber(
    playback.endTime,
    `${symbol}.${state}.playback.endTime`,
  );
  if (endTime <= startTime) {
    throw new Error(
      `Existing manifest symbol "${symbol}" ${state} playback endTime must be greater than startTime.`,
    );
  }
  if (playback.loop !== false) {
    throw new Error(
      `Existing manifest symbol "${symbol}" ${state} playback loop must be false.`,
    );
  }
  return Object.freeze({
    mode: "range",
    startTime,
    endTime,
    loop: false,
  });
}

function createManifest(symbols, composites, scale, preservedMetadata) {
  return Object.freeze({
    version: 1,
    states: REQUIRED_STATES,
    settings: Object.freeze({
      [SPIN_BLUR_STATE]: Object.freeze({
        kind: "verticalBoxBlur",
        kernelHeight: SPIN_BLUR_KERNEL_HEIGHT,
      }),
      [DISABLED_STATE]: Object.freeze({
        kind: "grayscale",
        brightness: DISABLED_BRIGHTNESS,
      }),
      ...(preservedMetadata.additionalStateDefinitions?.length
        ? {
            additionalStateDefinitions:
              preservedMetadata.additionalStateDefinitions,
          }
        : {}),
    }),
    symbols: Object.freeze(
      Object.fromEntries(
        symbols.map((symbol) => [
          symbol,
          Object.freeze({
            ...(preservedMetadata.get(symbol)?.valuePresentation === undefined
              ? {
                  normal: composites.has(symbol)
                    ? Object.freeze({
                        kind: "layered",
                        layers: Object.freeze(
                          composites
                            .get(symbol)
                            .map((layer) => createManifestLayer(layer)),
                        ),
                      })
                    : `./${symbol}.png`,
                  [SPIN_BLUR_STATE]: `./${symbol}.${SPIN_BLUR_STATE}.png`,
                  [DISABLED_STATE]: `./${symbol}.${DISABLED_STATE}.png`,
                }
              : {}),
            scale,
            ...(preservedMetadata.get(symbol)?.renderPriority !== undefined
              ? {
                  renderPriority: preservedMetadata.get(symbol).renderPriority,
                }
              : {}),
            ...(preservedMetadata.get(symbol)?.animations !== undefined
              ? { animations: preservedMetadata.get(symbol).animations }
              : {}),
            ...(preservedMetadata.get(symbol)?.valuePresentation !== undefined
              ? {
                  valuePresentation:
                    preservedMetadata.get(symbol).valuePresentation,
                }
              : {}),
            ...(preservedMetadata.get(symbol)?.cascadeWinPresentation !==
            undefined
              ? {
                  cascadeWinPresentation:
                    preservedMetadata.get(symbol).cascadeWinPresentation,
                }
              : {}),
          }),
        ]),
      ),
    ),
  });
}

function freezeJsonValue(value, label) {
  try {
    return deepFreeze(JSON.parse(JSON.stringify(value)));
  } catch (error) {
    throw new Error(`${label} must be JSON serializable.`, { cause: error });
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function createManifestLayer(layer) {
  if (!layer.keyframes) {
    return layer.manifestPath;
  }
  return Object.freeze({
    index: layer.index,
    texture: layer.manifestPath,
    keyframes: layer.keyframes,
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

function normalizeScale(value) {
  if (value === undefined) {
    return DEFAULT_SYMBOL_SCALE;
  }
  if (typeof value === "number") {
    return assertPositiveFiniteScale(value);
  }
  if (typeof value === "string") {
    return parseScale(value);
  }
  throw new Error("--scale must be a finite positive number.");
}

function parseScale(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("--scale must be a finite positive number.");
  }
  return assertPositiveFiniteScale(Number(value));
}

function assertPositiveFiniteScale(value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("--scale must be a finite positive number.");
  }
  return value;
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

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertManifestPathPrefix(value, label) {
  const prefix = assertNonEmptyString(value, label);
  if (
    !prefix.startsWith("./") ||
    prefix.includes("\\") ||
    prefix.includes("../") ||
    prefix.slice(2).includes("/")
  ) {
    throw new Error(`${label} must be a local ./basename prefix.`);
  }
  return prefix;
}

function assertOnlyKnownKeys(record, label, allowed) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new Error(`${label} contains unknown field "${key}".`);
    }
  }
}

function assertFiniteNonNegativeNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function assertFinitePositiveNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
  return value;
}

function normalizeManifestPath(value) {
  return value.startsWith("./") ? value : `./${basename(value)}`;
}

function validateLocalManifestFilePath(value, label, extensions) {
  const path = assertNonEmptyString(value, label);
  if (!path.startsWith("./") || path.includes("\\") || path.includes("../")) {
    throw new Error(`${label} must be a local ./ path: ${path}.`);
  }
  const suffix = path.slice("./".length);
  if (suffix.length === 0 || suffix.includes("/")) {
    throw new Error(`${label} must be a ./basename path: ${path}.`);
  }
  if (!extensions.some((extension) => suffix.endsWith(extension))) {
    throw new Error(
      `${label} must end with ${extensions.join(" or ")}: ${path}.`,
    );
  }
  return path;
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
  return (
    Boolean(entryPoint) &&
    import.meta.url === pathToFileURL(resolve(entryPoint)).href
  );
}

function assertRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

if (isDirectRun()) {
  generateSymbolStateTextures(
    parseGenerateSymbolStateTextureArgs(process.argv.slice(2)),
  ).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
