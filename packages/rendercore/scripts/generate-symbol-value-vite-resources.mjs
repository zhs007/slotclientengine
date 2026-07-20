import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "prettier";
import sharp from "sharp";

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
    const nestedByPath = new Map();
    for (const binding of presentation.imageStringBindings) {
      let nested = nestedByPath.get(binding.resource);
      if (!nested) {
        const manifestResource = await addResource(
          resources,
          seen,
          manifestRoot,
          "imageStringManifest",
          binding.resource,
        );
        nested = validateImageStringManifest(
          JSON.parse(await readFile(manifestResource.absolutePath, "utf8")),
          binding.resource,
        );
        nestedByPath.set(binding.resource, nested);
        for (const glyph of Object.values(nested.glyphs)) {
          const glyphManifestPath = resolveNestedManifestPath(
            binding.resource,
            glyph.path,
          );
          const glyphResource = await addResource(
            resources,
            seen,
            manifestRoot,
            "imageStringGlyph",
            glyphManifestPath,
          );
          await validateGlyphImageSize(glyphResource.absolutePath, glyph.size);
        }
      }
    }
    for (const value of presentation.defaultValues) {
      if (presentation.imageStringBindings.length === 0) break;
      const tierIndex = presentation.tiers.findIndex(
        (tier) => tier.maxExclusive === undefined || value < tier.maxExclusive,
      );
      const binding = presentation.imageStringBindings[tierIndex];
      const nested = binding && nestedByPath.get(binding.resource);
      if (!binding || !nested) {
        throw new Error(
          `${symbol} default value ${value} has no ImgNumber tier binding.`,
        );
      }
      validateImageStringText(
        String(value),
        nested,
        `${symbol} default value ${value}`,
      );
    }
  }
  const source = await format(renderGeneratedSource(resources, outPath), {
    parser: "typescript",
  });
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
    return {
      ...(tier.maxExclusive === undefined
        ? {}
        : { maxExclusive: tier.maxExclusive }),
      animation,
    };
  });
  const text = assertRecord(record.text, `${symbol}.valuePresentation.text`);
  const textType = text.type ?? "font";
  if (
    textType !== "font" &&
    textType !== "image" &&
    textType !== "image-string"
  ) {
    throw new Error(
      `${symbol} value text type must be font, image or image-string.`,
    );
  }
  assertOnlyKnownKeys(
    text,
    `${symbol}.valuePresentation.text`,
    textType === "image-string"
      ? ["type", "tiers"]
      : textType === "image"
        ? ["type", "slot", "x", "y", "prefix", "images"]
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
  if (textType !== "image-string") {
    if (typeof text.slot !== "string" || text.slot.trim().length === 0) {
      throw new Error(`${symbol} value text slot must be non-empty.`);
    }
    for (const key of ["x", "y"]) {
      if (typeof text[key] !== "number" || !Number.isFinite(text[key])) {
        throw new Error(`${symbol} value text ${key} must be finite.`);
      }
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
      ? validateValueImagePaths(symbol, text, defaultValues)
      : [];
  const imageStringBindings =
    textType === "image-string"
      ? validateImageStringBindings(symbol, text.tiers, tiers.length)
      : [];
  return {
    defaultValues,
    reelStateTextures,
    tiers,
    textImagePaths,
    imageStringBindings,
  };
}

function validateValueImagePaths(symbol, text, defaultValues) {
  if ((text.prefix === undefined) === (text.images === undefined)) {
    throw new Error(
      `${symbol} value image text must declare exactly one of prefix or images.`,
    );
  }
  if (text.prefix !== undefined) {
    const prefix = assertManifestPathPrefix(
      text.prefix,
      `${symbol} value text prefix`,
    );
    return defaultValues.map((candidate) => `${prefix}${candidate}.png`);
  }
  const images = assertRecord(text.images, `${symbol} value text images`);
  const expected = defaultValues.map(String).sort();
  const actual = Object.keys(images).sort();
  if (
    expected.length !== actual.length ||
    expected.some((key, index) => key !== actual[index])
  ) {
    throw new Error(`${symbol} value text images must match defaultValues.`);
  }
  return defaultValues.map((candidate) =>
    assertManifestImagePath(
      images[String(candidate)],
      `${symbol} value text images[${candidate}]`,
    ),
  );
}

function validateImageStringBindings(symbol, value, tierCount) {
  if (!Array.isArray(value) || value.length !== tierCount) {
    throw new Error(
      `${symbol} value text tiers length must equal valuePresentation tiers length (${tierCount}).`,
    );
  }
  return value.map((rawBinding, index) => {
    const label = `${symbol}.valuePresentation.text.tiers[${index}]`;
    const binding = assertRecord(rawBinding, label);
    assertOnlyKnownKeys(binding, label, [
      "resource",
      "slot",
      "anchor",
      "transform",
      "followSlotColor",
    ]);
    const resource = assertImageStringResourcePath(
      binding.resource,
      `${label}.resource`,
    );
    if (typeof binding.slot !== "string" || binding.slot.trim().length === 0) {
      throw new Error(`${label}.slot must be non-empty.`);
    }
    const anchor = assertRecord(binding.anchor, `${label}.anchor`);
    assertOnlyKnownKeys(anchor, `${label}.anchor`, ["x", "y"]);
    for (const key of ["x", "y"]) {
      if (
        typeof anchor[key] !== "number" ||
        !Number.isFinite(anchor[key]) ||
        anchor[key] < 0 ||
        anchor[key] > 1
      ) {
        throw new Error(`${label}.anchor.${key} must be within 0..1.`);
      }
    }
    const transform = assertRecord(binding.transform, `${label}.transform`);
    assertOnlyKnownKeys(transform, `${label}.transform`, ["x", "y", "scale"]);
    for (const key of ["x", "y"]) {
      if (
        typeof transform[key] !== "number" ||
        !Number.isFinite(transform[key])
      ) {
        throw new Error(`${label}.transform.${key} must be finite.`);
      }
    }
    if (
      typeof transform.scale !== "number" ||
      !Number.isFinite(transform.scale) ||
      transform.scale <= 0
    ) {
      throw new Error(`${label}.transform.scale must be positive.`);
    }
    if (typeof binding.followSlotColor !== "boolean") {
      throw new Error(`${label}.followSlotColor must be boolean.`);
    }
    return {
      resource,
      slot: binding.slot,
      anchor: { x: anchor.x, y: anchor.y },
      transform: { x: transform.x, y: transform.y, scale: transform.scale },
      followSlotColor: binding.followSlotColor,
    };
  });
}

function assertImageStringResourcePath(value, label) {
  if (
    typeof value !== "string" ||
    !value.startsWith("./") ||
    value.includes("\\") ||
    value.includes("../") ||
    !value.endsWith("/image-string.manifest.json")
  ) {
    throw new Error(
      `${label} must be a contained local path to image-string.manifest.json.`,
    );
  }
  return value;
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
  if (existingKind) {
    return {
      kind,
      manifestPath: manifestResourcePath,
      absolutePath: resolveManifestResource(
        manifestRoot,
        manifestResourcePath,
        kind,
      ),
    };
  }
  const absolutePath = resolveManifestResource(
    manifestRoot,
    manifestResourcePath,
    kind,
  );
  await access(absolutePath);
  seen.set(manifestResourcePath, kind);
  const resource = { kind, manifestPath: manifestResourcePath, absolutePath };
  resources.push(resource);
  return resource;
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
    imageStringManifest: ".json",
  }[kind];
  if (
    kind === "imageStringGlyph"
      ? ![".png", ".webp"].includes(extname(absolute))
      : extname(absolute) !== expected
  ) {
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
    imageStringManifest: [],
    imageStringGlyph: [],
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
    } else if (resource.kind === "imageStringManifest") {
      imports.push(`import ${name}Data from ${JSON.stringify(specifier)};`);
      imports.push(
        `import ${name}Url from ${JSON.stringify(`${specifier}?url`)};`,
      );
      entries.imageStringManifest.push(
        `  ${JSON.stringify(resource.manifestPath)}: ${name}Data,`,
      );
      loading.push(
        renderLoadingResource(
          resource.manifestPath,
          "image-string-manifest",
          name,
        ),
      );
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
              : resource.kind === "imageStringGlyph"
                ? "image-string-glyph"
                : "texture",
          name,
        ),
      );
    }
    index += 1;
  }
  return `${imports.join("\n")}${imports.length ? "\n\n" : ""}// 此文件由 generate-symbol-value-vite-resources.mjs 生成，禁止手改。\nexport const symbolValueSpineSkeletonModules = Object.freeze({\n${entries.skeleton.join("\n")}\n});\nexport const symbolValueSpineAtlasModules = Object.freeze({\n${entries.atlas.join("\n")}\n});\nexport const symbolValueSpineTextureModules = Object.freeze({\n${entries.texture.join("\n")}\n});\nexport const symbolValueReelStateTextureModules = Object.freeze({\n${entries.stateTexture.join("\n")}\n});\nexport const symbolValueTextImageModules = Object.freeze({\n${entries.textImage.join("\n")}\n});\nexport const symbolValueImageStringManifestModules = Object.freeze({\n${entries.imageStringManifest.join("\n")}\n});\nexport const symbolValueImageStringImageModules = Object.freeze({\n${entries.imageStringGlyph.join("\n")}\n});\nexport const symbolValueLoadingResources = Object.freeze([\n${loading.join("\n")}\n]);\n`;
}

function renderLoadingResource(path, kind, name) {
  return `  Object.freeze({\n    path: ${JSON.stringify(path)},\n    kind: ${JSON.stringify(kind)},\n    url: ${name}Url,\n  }),`;
}

function resolveNestedManifestPath(manifestPath, assetPath) {
  if (
    typeof assetPath !== "string" ||
    assetPath.startsWith("/") ||
    assetPath.includes("\\") ||
    assetPath.split("/").includes("..")
  ) {
    throw new Error(`Invalid nested image-string asset path: ${assetPath}.`);
  }
  const base = dirname(manifestPath.slice(2));
  return `./${base}/${assetPath}`;
}

function validateImageStringManifest(value, label) {
  const root = assertRecord(value, `${label} image-string manifest`);
  assertExactKeys(root, `${label} image-string manifest`, [
    "version",
    "kind",
    "id",
    "metrics",
    "glyphs",
    "fixedAdvanceGroups",
  ]);
  if (root.version !== 1 || root.kind !== "image-string") {
    throw new Error(`${label} must be an image-string v1 manifest.`);
  }
  if (
    typeof root.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(root.id)
  ) {
    throw new Error(`${label} image-string id must be kebab-case.`);
  }
  const metrics = assertRecord(root.metrics, `${label}.metrics`);
  assertExactKeys(metrics, `${label}.metrics`, ["lineHeight", "letterSpacing"]);
  if (
    typeof metrics.lineHeight !== "number" ||
    !Number.isFinite(metrics.lineHeight) ||
    metrics.lineHeight <= 0 ||
    typeof metrics.letterSpacing !== "number" ||
    !Number.isFinite(metrics.letterSpacing) ||
    metrics.letterSpacing < 0
  ) {
    throw new Error(`${label} image-string metrics are invalid.`);
  }
  const rawGlyphs = assertRecord(root.glyphs, `${label}.glyphs`);
  if (Object.keys(rawGlyphs).length === 0) {
    throw new Error(`${label} image-string glyphs must be non-empty.`);
  }
  const glyphs = {};
  const assetPaths = new Set();
  for (const [character, rawGlyph] of Object.entries(rawGlyphs)) {
    if (
      Array.from(character).length !== 1 ||
      character.normalize("NFC") !== character
    ) {
      throw new Error(
        `${label} has invalid glyph character ${JSON.stringify(character)}.`,
      );
    }
    const glyph = assertRecord(
      rawGlyph,
      `${label}.glyphs.${JSON.stringify(character)}`,
    );
    assertExactKeys(glyph, `${label}.glyphs.${JSON.stringify(character)}`, [
      "path",
      "size",
      "offset",
    ]);
    if (
      typeof glyph.path !== "string" ||
      !/^assets\/[a-z0-9][a-z0-9/_.-]*\.(?:png|webp)$/u.test(glyph.path) ||
      glyph.path.includes("..")
    ) {
      throw new Error(
        `${label} glyph ${JSON.stringify(character)} path is invalid.`,
      );
    }
    if (assetPaths.has(glyph.path)) {
      throw new Error(`${label} image-string glyph paths must be unique.`);
    }
    assetPaths.add(glyph.path);
    const size = assertRecord(glyph.size, `${label} glyph size`);
    assertExactKeys(size, `${label} glyph size`, ["width", "height"]);
    if (
      !Number.isSafeInteger(size.width) ||
      size.width <= 0 ||
      !Number.isSafeInteger(size.height) ||
      size.height <= 0
    ) {
      throw new Error(
        `${label} glyph ${JSON.stringify(character)} size is invalid.`,
      );
    }
    const offset = assertRecord(glyph.offset, `${label} glyph offset`);
    assertExactKeys(offset, `${label} glyph offset`, ["x", "y"]);
    if (
      typeof offset.x !== "number" ||
      !Number.isFinite(offset.x) ||
      typeof offset.y !== "number" ||
      !Number.isFinite(offset.y) ||
      offset.y < 0 ||
      offset.y + size.height > metrics.lineHeight
    ) {
      throw new Error(
        `${label} glyph ${JSON.stringify(character)} offset is invalid.`,
      );
    }
    glyphs[character] = {
      path: glyph.path,
      size: { width: size.width, height: size.height },
      offset: { x: offset.x, y: offset.y },
    };
  }
  if (!Array.isArray(root.fixedAdvanceGroups)) {
    throw new Error(`${label}.fixedAdvanceGroups must be an array.`);
  }
  const assigned = new Set();
  const groupIds = new Set();
  for (const [index, rawGroup] of root.fixedAdvanceGroups.entries()) {
    const groupLabel = `${label}.fixedAdvanceGroups[${index}]`;
    const group = assertRecord(rawGroup, groupLabel);
    assertExactKeys(group, groupLabel, [
      "id",
      "characters",
      "advanceWidth",
      "align",
    ]);
    if (
      typeof group.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(group.id) ||
      groupIds.has(group.id)
    ) {
      throw new Error(`${groupLabel}.id is invalid.`);
    }
    groupIds.add(group.id);
    if (!Array.isArray(group.characters) || group.characters.length === 0) {
      throw new Error(`${groupLabel}.characters must be non-empty.`);
    }
    if (
      typeof group.advanceWidth !== "number" ||
      !Number.isFinite(group.advanceWidth) ||
      group.advanceWidth <= 0 ||
      !["start", "center", "end"].includes(group.align)
    ) {
      throw new Error(`${groupLabel} layout is invalid.`);
    }
    for (const character of group.characters) {
      if (
        typeof character !== "string" ||
        !glyphs[character] ||
        assigned.has(character)
      ) {
        throw new Error(
          `${groupLabel} references an invalid or duplicate glyph.`,
        );
      }
      assigned.add(character);
      const glyph = glyphs[character];
      const alignOffset =
        group.align === "start"
          ? 0
          : group.align === "center"
            ? (group.advanceWidth - glyph.size.width) / 2
            : group.advanceWidth - glyph.size.width;
      if (
        alignOffset + glyph.offset.x < 0 ||
        alignOffset + glyph.offset.x + glyph.size.width > group.advanceWidth
      ) {
        throw new Error(
          `${groupLabel} cannot contain glyph ${JSON.stringify(character)}.`,
        );
      }
    }
  }
  return { metrics, glyphs };
}

function validateImageStringText(text, manifest, label) {
  for (const character of Array.from(text)) {
    if (!manifest.glyphs[character]) {
      throw new Error(
        `${label} is missing glyph ${JSON.stringify(character)}.`,
      );
    }
  }
}

async function validateGlyphImageSize(path, expected) {
  let metadata;
  try {
    metadata = await sharp(path).metadata();
  } catch (error) {
    throw new Error(
      `Image-string glyph cannot be decoded ${path}: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
  const { width, height } = metadata;
  if (!width || !height) {
    throw new Error(`Image-string glyph has no decoded dimensions: ${path}.`);
  }
  if (width !== expected.width || height !== expected.height) {
    throw new Error(
      `Image-string glyph size mismatch ${path}: declared ${expected.width}x${expected.height}, actual ${width}x${height}.`,
    );
  }
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

function assertExactKeys(record, label, allowed) {
  assertOnlyKnownKeys(record, label, allowed);
  for (const key of allowed) {
    if (!(key in record))
      throw new Error(`${label} is missing field "${key}".`);
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

function assertManifestImagePath(value, label) {
  if (
    typeof value !== "string" ||
    !value.startsWith("./") ||
    value.includes("\\") ||
    value.includes("../") ||
    !/\.(?:png|jpe?g|webp)$/u.test(value)
  ) {
    throw new Error(`${label} must be a local raster path.`);
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
