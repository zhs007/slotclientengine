import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export function parseSymbolValueResourceArgs(argv) {
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

export async function generateSymbolValueViteResources(options) {
  const manifestPath = resolve(REPO_ROOT, options.manifest);
  const outPath = resolve(REPO_ROOT, options.out);
  const manifestRoot = dirname(manifestPath);
  const manifest = assertRecord(
    JSON.parse(await readFile(manifestPath, "utf8")),
    "symbol manifest",
  );
  assertOnlyKnownKeys(manifest, "symbol manifest", [
    "version",
    "states",
    "settings",
    "symbols",
  ]);
  if (manifest.version !== 1)
    throw new Error("Symbol manifest version must be 1.");
  if (!Array.isArray(manifest.states)) {
    throw new Error("Symbol manifest states must be an array.");
  }
  const symbols = assertRecord(manifest.symbols, "symbol manifest symbols");
  const resources = [];
  const seen = new Map();
  for (const [symbol, rawSymbol] of Object.entries(symbols)) {
    const symbolRecord = assertRecord(rawSymbol, `symbol "${symbol}"`);
    assertOnlyKnownKeys(symbolRecord, `symbol "${symbol}"`, [
      "normal",
      "scale",
      "renderPriority",
      "animations",
      "valuePresentation",
      "cascadeWinPresentation",
      ...manifest.states,
    ]);
    if (symbolRecord.valuePresentation === undefined) continue;
    const presentation = validatePresentation(
      symbol,
      symbolRecord.valuePresentation,
      manifest.states,
    );
    if (symbolRecord.normal !== undefined) {
      throw new Error(
        `${symbol}.valuePresentation symbols must not declare top-level normal.`,
      );
    }
    for (const state of manifest.states) {
      if (symbolRecord[state] !== undefined) {
        throw new Error(
          `${symbol}.valuePresentation symbols must not declare top-level ${state}.`,
        );
      }
    }
    for (const manifestResourcePath of Object.values(
      presentation.reelStateTextures,
    )) {
      await addResource(
        resources,
        seen,
        manifestRoot,
        "stateTexture",
        manifestResourcePath,
      );
    }
    for (const tier of presentation.tiers) {
      for (const [kind, manifestResourcePath] of [
        ["skeleton", tier.animation.skeleton],
        ["atlas", tier.animation.atlas],
        ["texture", tier.animation.texture],
      ]) {
        await addResource(
          resources,
          seen,
          manifestRoot,
          kind,
          manifestResourcePath,
        );
      }
    }
    for (const manifestResourcePath of presentation.textImagePaths) {
      await addResource(
        resources,
        seen,
        manifestRoot,
        "textImage",
        manifestResourcePath,
      );
    }
  }
  const source = renderGeneratedSource(resources, outPath);
  if (options.check) {
    let current;
    try {
      current = await readFile(outPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(
          `Generated symbol value resource file is missing: ${outPath}.`,
        );
      }
      throw error;
    }
    if (current !== source) {
      throw new Error(
        `Generated symbol value resource file is stale: ${outPath}.`,
      );
    }
  } else {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, source, "utf8");
  }
  return Object.freeze({ outPath, resourceCount: resources.length });
}

function validatePresentation(symbol, value, states) {
  const record = assertRecord(value, `${symbol}.valuePresentation`);
  assertOnlyKnownKeys(record, `${symbol}.valuePresentation`, [
    "defaultValues",
    "reelStates",
    "tiers",
    "text",
  ]);
  if (
    !Array.isArray(record.defaultValues) ||
    record.defaultValues.length === 0
  ) {
    throw new Error(
      `${symbol}.valuePresentation.defaultValues must be non-empty.`,
    );
  }
  const defaultValues = record.defaultValues.map((candidate, index) => {
    if (!Number.isSafeInteger(candidate) || candidate <= 0) {
      throw new Error(
        `${symbol}.valuePresentation.defaultValues[${index}] must be a positive safe integer.`,
      );
    }
    return candidate;
  });
  if (new Set(defaultValues).size !== defaultValues.length) {
    throw new Error(
      `${symbol}.valuePresentation.defaultValues must be unique.`,
    );
  }
  const reelStates = assertRecord(
    record.reelStates,
    `${symbol}.valuePresentation.reelStates`,
  );
  assertOnlyKnownKeys(reelStates, `${symbol}.valuePresentation.reelStates`, [
    "normal",
    ...states,
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
  if (
    reelNormal.kind !== "transparent" ||
    typeof reelNormal.width !== "number" ||
    !Number.isFinite(reelNormal.width) ||
    reelNormal.width <= 0 ||
    typeof reelNormal.height !== "number" ||
    !Number.isFinite(reelNormal.height) ||
    reelNormal.height <= 0
  ) {
    throw new Error(
      `${symbol} reelStates.normal must be positive transparent.`,
    );
  }
  const reelStateTextures = {};
  for (const state of states) {
    if (typeof reelStates[state] !== "string") {
      throw new Error(`${symbol}.reelStates.${state} must be a path.`);
    }
    reelStateTextures[state] = reelStates[state];
  }
  if (!Array.isArray(record.tiers) || record.tiers.length === 0) {
    throw new Error(`${symbol}.valuePresentation.tiers must be non-empty.`);
  }
  let previousMax = 0;
  const tiers = record.tiers.map((rawTier, index) => {
    const tier = assertRecord(
      rawTier,
      `${symbol}.valuePresentation.tiers[${index}]`,
    );
    assertOnlyKnownKeys(tier, `${symbol}.valuePresentation.tiers[${index}]`, [
      "maxExclusive",
      "animation",
    ]);
    const last = index === record.tiers.length - 1;
    if (last === (tier.maxExclusive !== undefined)) {
      throw new Error(
        `${symbol}.valuePresentation tier bound contract is invalid.`,
      );
    }
    if (tier.maxExclusive !== undefined) {
      if (
        !Number.isSafeInteger(tier.maxExclusive) ||
        tier.maxExclusive <= previousMax
      ) {
        throw new Error(
          `${symbol}.valuePresentation maxExclusive must strictly increase.`,
        );
      }
      previousMax = tier.maxExclusive;
    }
    const animation = assertRecord(tier.animation, `${symbol} tier animation`);
    assertOnlyKnownKeys(animation, `${symbol} tier animation`, [
      "kind",
      "skeleton",
      "atlas",
      "texture",
      "playback",
      "transform",
    ]);
    if (animation.kind !== "spine")
      throw new Error(`${symbol} tier must use Spine.`);
    const playback = assertRecord(
      animation.playback,
      `${symbol} tier playback`,
    );
    assertOnlyKnownKeys(playback, `${symbol} tier playback`, [
      "mode",
      "animationName",
      "loop",
    ]);
    if (
      playback.mode !== "animation" ||
      typeof playback.animationName !== "string" ||
      playback.animationName.trim().length === 0 ||
      playback.loop !== true
    ) {
      throw new Error(
        `${symbol} tier playback must be a named looping animation.`,
      );
    }
    if (animation.transform !== undefined) {
      const transform = assertRecord(
        animation.transform,
        `${symbol} tier transform`,
      );
      assertOnlyKnownKeys(transform, `${symbol} tier transform`, [
        "x",
        "y",
        "scale",
      ]);
      for (const key of ["x", "y"]) {
        if (
          transform[key] !== undefined &&
          (typeof transform[key] !== "number" ||
            !Number.isFinite(transform[key]))
        ) {
          throw new Error(`${symbol} tier transform.${key} must be finite.`);
        }
      }
      if (
        transform.scale !== undefined &&
        (typeof transform.scale !== "number" ||
          !Number.isFinite(transform.scale) ||
          transform.scale <= 0)
      ) {
        throw new Error(`${symbol} tier transform.scale must be positive.`);
      }
    }
    return { animation };
  });
  const text = assertRecord(record.text, `${symbol}.valuePresentation.text`);
  const textType = text.type ?? "font";
  if (textType !== "font" && textType !== "image") {
    throw new Error(`${symbol} value text type must be font or image.`);
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
  if (typeof text.slot !== "string" || text.slot.trim().length === 0) {
    throw new Error(`${symbol} value text slot must be non-empty.`);
  }
  for (const key of ["x", "y"]) {
    if (typeof text[key] !== "number" || !Number.isFinite(text[key])) {
      throw new Error(`${symbol} value text ${key} must be finite.`);
    }
  }
  if (textType === "font") {
    for (const key of ["fontFamily", "fontWeight", "fill", "stroke"]) {
      if (typeof text[key] !== "string" || text[key].trim().length === 0) {
        throw new Error(`${symbol} value text ${key} must be non-empty.`);
      }
    }
    for (const key of ["fontSize", "strokeWidth"]) {
      if (
        typeof text[key] !== "number" ||
        !Number.isFinite(text[key]) ||
        text[key] <= 0
      ) {
        throw new Error(`${symbol} value text ${key} must be positive.`);
      }
    }
  }
  const textImagePaths =
    textType === "image"
      ? defaultValues.map(
          (candidate) =>
            `${assertManifestPathPrefix(text.prefix, `${symbol} value text prefix`)}${candidate}.png`,
        )
      : [];
  return { reelStateTextures, tiers, textImagePaths };
}

async function addResource(
  resources,
  seen,
  manifestRoot,
  kind,
  manifestResourcePath,
) {
  const existingKind = seen.get(manifestResourcePath);
  if (existingKind && existingKind !== kind) {
    throw new Error(
      `Manifest resource "${manifestResourcePath}" is used as both ${existingKind} and ${kind}.`,
    );
  }
  if (existingKind) return;
  const absolutePath = resolveManifestResource(
    manifestRoot,
    manifestResourcePath,
    kind,
  );
  await access(absolutePath);
  seen.set(manifestResourcePath, kind);
  resources.push({ kind, manifestPath: manifestResourcePath, absolutePath });
}

function resolveManifestResource(root, value, kind) {
  if (
    typeof value !== "string" ||
    !value.startsWith("./") ||
    value.includes("\\")
  ) {
    throw new Error(`${kind} must be a local ./ manifest path.`);
  }
  const absolute = resolve(root, value);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`${kind} path escapes manifest root: ${value}.`);
  }
  const expected = {
    skeleton: ".json",
    atlas: ".atlas",
    texture: ".png",
    stateTexture: ".png",
    textImage: ".png",
  }[kind];
  if (extname(absolute) !== expected) {
    throw new Error(`${kind} path must end with ${expected}: ${value}.`);
  }
  return absolute;
}

function renderGeneratedSource(resources, outPath) {
  const imports = [];
  const entries = {
    skeleton: [],
    atlas: [],
    texture: [],
    stateTexture: [],
    textImage: [],
  };
  const loading = [];
  let index = 0;
  for (const resource of resources) {
    const specifier = toImportSpecifier(
      dirname(outPath),
      resource.absolutePath,
    );
    const name = `resource${index}`;
    if (resource.kind === "skeleton") {
      imports.push(`import ${name}Data from ${JSON.stringify(specifier)};`);
      imports.push(
        `import ${name}Url from ${JSON.stringify(`${specifier}?url`)};`,
      );
      entries.skeleton.push(
        `  ${JSON.stringify(resource.manifestPath)}: ${name}Data,`,
      );
      loading.push(
        renderLoadingResource(resource.manifestPath, "skeleton", name),
      );
    } else if (resource.kind === "atlas") {
      imports.push(
        `import ${name}Raw from ${JSON.stringify(`${specifier}?raw`)};`,
      );
      imports.push(
        `import ${name}Url from ${JSON.stringify(`${specifier}?url`)};`,
      );
      entries.atlas.push(
        `  ${JSON.stringify(resource.manifestPath)}: ${name}Raw,`,
      );
      loading.push(renderLoadingResource(resource.manifestPath, "atlas", name));
    } else {
      imports.push(
        `import ${name}Url from ${JSON.stringify(`${specifier}?url`)};`,
      );
      entries[resource.kind].push(
        `  ${JSON.stringify(resource.manifestPath)}: ${name}Url,`,
      );
      loading.push(
        renderLoadingResource(
          resource.manifestPath,
          resource.kind === "stateTexture"
            ? "state-texture"
            : resource.kind === "textImage"
              ? "value-image"
              : "texture",
          name,
        ),
      );
    }
    index += 1;
  }
  return `${imports.join("\n")}${imports.length ? "\n\n" : ""}// 此文件由 generate-symbol-value-vite-resources.mjs 生成，禁止手改。\nexport const symbolValueSpineSkeletonModules = Object.freeze({\n${entries.skeleton.join("\n")}\n});\nexport const symbolValueSpineAtlasModules = Object.freeze({\n${entries.atlas.join("\n")}\n});\nexport const symbolValueSpineTextureModules = Object.freeze({\n${entries.texture.join("\n")}\n});\nexport const symbolValueReelStateTextureModules = Object.freeze({\n${entries.stateTexture.join("\n")}\n});\nexport const symbolValueTextImageModules = Object.freeze({\n${entries.textImage.join("\n")}\n});\nexport const symbolValueLoadingResources = Object.freeze([\n${loading.join("\n")}\n]);\n`;
}

function renderLoadingResource(path, kind, name) {
  return `  Object.freeze({\n    path: ${JSON.stringify(path)},\n    kind: ${JSON.stringify(kind)},\n    url: ${name}Url,\n  }),`;
}

function toImportSpecifier(fromDir, absolutePath) {
  let path = relative(fromDir, absolutePath).split(sep).join("/");
  if (!path.startsWith(".")) path = `./${path}`;
  return path;
}

function assertRecord(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertOnlyKnownKeys(record, label, allowed) {
  const set = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!set.has(key))
      throw new Error(`${label} declares unknown field "${key}".`);
  }
}

function assertManifestPathPrefix(value, label) {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    !value.startsWith("./") ||
    value.includes("\\") ||
    value.includes("../") ||
    value.slice(2).includes("/")
  ) {
    throw new Error(`${label} must be a local ./basename prefix.`);
  }
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generateSymbolValueViteResources(
    parseSymbolValueResourceArgs(process.argv.slice(2)),
  )
    .then(({ outPath, resourceCount }) => {
      console.log(`symbol value resources: ${resourceCount} -> ${outPath}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
