import { validateOfficialSpineResource } from "../spine/runtime-player.js";
import { BackgroundManifestError } from "./errors.js";
import type {
  BackgroundRect,
  BackgroundSize,
  ParsedSpineBackgroundManifest,
  SpineBackgroundResource,
  SpineBackgroundStateSpec,
  SpineBackgroundTransform,
  SpineBackgroundTransitionSpec,
} from "./types.js";

const TOP_LEVEL_KEYS = Object.freeze([
  "version",
  "kind",
  "artSize",
  "adaptation",
  "resource",
  "initialState",
  "states",
  "transitions",
]);

export function parseSpineBackgroundManifest(
  value: unknown,
): ParsedSpineBackgroundManifest {
  const record = assertRecord(value, "background manifest");
  assertOnlyKnownKeys(record, "background manifest", TOP_LEVEL_KEYS);
  if (record.version !== 1) {
    throw new BackgroundManifestError("Background manifest version must be 1.");
  }
  if (record.kind !== "spine") {
    throw new BackgroundManifestError(
      'Background manifest kind must be "spine".',
    );
  }
  const artSize = parseSize(record.artSize, "background artSize");
  const adaptationRecord = assertRecord(
    record.adaptation,
    "background adaptation",
  );
  assertOnlyKnownKeys(adaptationRecord, "background adaptation", [
    "mode",
    "focusRect",
  ]);
  if (adaptationRecord.mode !== "maximized-focus") {
    throw new BackgroundManifestError(
      'Background adaptation.mode must be "maximized-focus".',
    );
  }
  const focusRect = parseRect(
    adaptationRecord.focusRect,
    "background adaptation.focusRect",
  );
  if (
    focusRect.x < 0 ||
    focusRect.y < 0 ||
    focusRect.x + focusRect.width > artSize.width ||
    focusRect.y + focusRect.height > artSize.height
  ) {
    throw new BackgroundManifestError(
      "Background adaptation.focusRect must fit inside artSize.",
    );
  }

  const resourceRecord = assertRecord(record.resource, "background resource");
  assertOnlyKnownKeys(resourceRecord, "background resource", [
    "skeleton",
    "atlas",
    "textures",
    "transform",
  ]);
  const skeleton = assertLocalPath(
    resourceRecord.skeleton,
    "background resource.skeleton",
    [".json"],
  );
  const atlas = assertLocalPath(
    resourceRecord.atlas,
    "background resource.atlas",
    [".atlas"],
  );
  const texturesRecord = assertRecord(
    resourceRecord.textures,
    "background resource.textures",
  );
  if (Object.keys(texturesRecord).length === 0) {
    throw new BackgroundManifestError(
      "Background resource.textures must not be empty.",
    );
  }
  const textures: Record<string, string> = {};
  const texturePaths = new Set<string>();
  for (const [page, pathValue] of Object.entries(texturesRecord)) {
    assertAtlasPageName(page, "background resource texture page");
    const path = assertLocalPath(
      pathValue,
      `background resource texture "${page}"`,
      [".png", ".jpg", ".jpeg", ".webp"],
    );
    if (getFileName(path) !== page) {
      throw new BackgroundManifestError(
        `Background texture path "${path}" must match atlas page "${page}".`,
      );
    }
    if (texturePaths.has(path)) {
      throw new BackgroundManifestError(
        `Background resource texture path is duplicated: ${path}.`,
      );
    }
    texturePaths.add(path);
    textures[page] = path;
  }
  const allResourcePaths = [skeleton, atlas, ...texturePaths];
  if (new Set(allResourcePaths).size !== allResourcePaths.length) {
    throw new BackgroundManifestError(
      "Background resource paths must be unique.",
    );
  }
  const transform = parseTransform(resourceRecord.transform);

  const statesRecord = assertRecord(record.states, "background states");
  if (Object.keys(statesRecord).length === 0) {
    throw new BackgroundManifestError("Background states must not be empty.");
  }
  const states: Record<string, SpineBackgroundStateSpec> = {};
  const animationNames = new Set<string>();
  for (const [state, rawState] of Object.entries(statesRecord)) {
    assertIdentifier(state, "background state id");
    const stateRecord = assertRecord(rawState, `background state "${state}"`);
    assertOnlyKnownKeys(stateRecord, `background state "${state}"`, [
      "animation",
    ]);
    const animation = assertNonEmptyString(
      stateRecord.animation,
      `background state "${state}" animation`,
    );
    assertUniqueAnimation(animation, animationNames);
    states[state] = Object.freeze({ animation });
  }
  const initialState = assertNonEmptyString(
    record.initialState,
    "background initialState",
  );
  if (!states[initialState]) {
    throw new BackgroundManifestError(
      `Background initialState "${initialState}" is not declared in states.`,
    );
  }

  if (!Array.isArray(record.transitions)) {
    throw new BackgroundManifestError(
      "Background transitions must be an array.",
    );
  }
  const transitions: SpineBackgroundTransitionSpec[] = [];
  const transitionPairs = new Set<string>();
  for (const [index, rawTransition] of record.transitions.entries()) {
    const transitionRecord = assertRecord(
      rawTransition,
      `background transition[${index}]`,
    );
    assertOnlyKnownKeys(transitionRecord, `background transition[${index}]`, [
      "from",
      "to",
      "animation",
    ]);
    const from = assertNonEmptyString(
      transitionRecord.from,
      `background transition[${index}].from`,
    );
    const to = assertNonEmptyString(
      transitionRecord.to,
      `background transition[${index}].to`,
    );
    if (!states[from] || !states[to]) {
      throw new BackgroundManifestError(
        `Background transition "${from}" -> "${to}" references an unknown state.`,
      );
    }
    if (from === to) {
      throw new BackgroundManifestError(
        `Background transition "${from}" -> "${to}" must not target itself.`,
      );
    }
    const pair = `${from}\u0000${to}`;
    if (transitionPairs.has(pair)) {
      throw new BackgroundManifestError(
        `Background transition "${from}" -> "${to}" is duplicated.`,
      );
    }
    transitionPairs.add(pair);
    const animation = assertNonEmptyString(
      transitionRecord.animation,
      `background transition[${index}].animation`,
    );
    assertUniqueAnimation(animation, animationNames);
    transitions.push(Object.freeze({ from, to, animation }));
  }

  return Object.freeze({
    version: 1,
    kind: "spine",
    artSize,
    adaptation: Object.freeze({
      mode: "maximized-focus",
      focusRect,
    }),
    resource: Object.freeze({
      skeleton,
      atlas,
      textures: Object.freeze(textures),
      transform,
    }),
    initialState,
    states: Object.freeze(states),
    transitions: Object.freeze(transitions),
  });
}

export function createSpineBackgroundResource(options: {
  readonly manifest: unknown;
  readonly skeletonModules: Readonly<Record<string, unknown>>;
  readonly atlasModules: Readonly<Record<string, string>>;
  readonly textureModules: Readonly<Record<string, string>>;
}): SpineBackgroundResource {
  const manifest = parseSpineBackgroundManifest(options.manifest);
  const skeletonModules = createModuleMap(
    options.skeletonModules,
    "background skeleton",
  );
  const atlasModules = createModuleMap(
    options.atlasModules,
    "background atlas",
  );
  const textureModules = createModuleMap(
    options.textureModules,
    "background texture",
  );
  const skeleton = requireModule(
    skeletonModules,
    manifest.resource.skeleton,
    "background skeleton",
  );
  const atlasText = requireStringModule(
    atlasModules,
    manifest.resource.atlas,
    "background atlas",
  );
  const textureUrls: Record<string, string> = {};
  const seenTextureUrls = new Set<string>();
  for (const [page, path] of Object.entries(manifest.resource.textures)) {
    const textureUrl = requireStringModule(
      textureModules,
      path,
      `background texture "${page}"`,
    );
    if (seenTextureUrls.has(textureUrl)) {
      throw new BackgroundManifestError(
        `Background texture URL is used by more than one atlas page: ${textureUrl}.`,
      );
    }
    seenTextureUrls.add(textureUrl);
    textureUrls[page] = textureUrl;
  }
  assertNoExtraModules(
    skeletonModules,
    [manifest.resource.skeleton],
    "background skeleton",
  );
  assertNoExtraModules(
    atlasModules,
    [manifest.resource.atlas],
    "background atlas",
  );
  assertNoExtraModules(
    textureModules,
    Object.values(manifest.resource.textures),
    "background texture",
  );

  let validation;
  try {
    validation = validateOfficialSpineResource({
      resource: {
        skeleton,
        atlasText,
        textureUrls,
      },
      requiredAnimations: [
        ...Object.values(manifest.states).map((state) => state.animation),
        ...manifest.transitions.map((transition) => transition.animation),
      ],
    });
  } catch (error) {
    throw new BackgroundManifestError(
      `Background Spine resource is invalid: ${formatError(error)}`,
    );
  }
  return Object.freeze({
    manifest,
    skeleton,
    atlasText,
    textureUrls: Object.freeze(textureUrls),
    atlasPages: validation.atlasPages,
  });
}

function parseSize(value: unknown, label: string): BackgroundSize {
  const record = assertRecord(value, label);
  assertOnlyKnownKeys(record, label, ["width", "height"]);
  return Object.freeze({
    width: assertPositiveNumber(record.width, `${label}.width`),
    height: assertPositiveNumber(record.height, `${label}.height`),
  });
}

function parseRect(value: unknown, label: string): BackgroundRect {
  const record = assertRecord(value, label);
  assertOnlyKnownKeys(record, label, ["x", "y", "width", "height"]);
  return Object.freeze({
    x: assertFiniteNumber(record.x, `${label}.x`),
    y: assertFiniteNumber(record.y, `${label}.y`),
    width: assertPositiveNumber(record.width, `${label}.width`),
    height: assertPositiveNumber(record.height, `${label}.height`),
  });
}

function parseTransform(value: unknown): SpineBackgroundTransform {
  const record = assertRecord(value, "background resource.transform");
  assertOnlyKnownKeys(record, "background resource.transform", [
    "x",
    "y",
    "scale",
  ]);
  return Object.freeze({
    x: assertFiniteNumber(record.x, "background resource.transform.x"),
    y: assertFiniteNumber(record.y, "background resource.transform.y"),
    scale: assertPositiveNumber(
      record.scale,
      "background resource.transform.scale",
    ),
  });
}

function createModuleMap(
  modules: Readonly<Record<string, unknown>>,
  label: string,
): ReadonlyMap<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [modulePath, value] of Object.entries(modules)) {
    const path = `./${getFileName(modulePath)}`;
    if (result.has(path)) {
      throw new BackgroundManifestError(`Duplicate ${label} module: ${path}.`);
    }
    result.set(path, value);
  }
  return result;
}

function requireModule(
  modules: ReadonlyMap<string, unknown>,
  path: string,
  label: string,
): unknown {
  if (!modules.has(path)) {
    throw new BackgroundManifestError(`${label} is missing: ${path}.`);
  }
  return modules.get(path);
}

function requireStringModule(
  modules: ReadonlyMap<string, unknown>,
  path: string,
  label: string,
): string {
  const value = requireModule(modules, path, label);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BackgroundManifestError(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertNoExtraModules(
  modules: ReadonlyMap<string, unknown>,
  expectedPaths: readonly string[],
  label: string,
): void {
  const expected = new Set(expectedPaths);
  for (const path of modules.keys()) {
    if (!expected.has(path)) {
      throw new BackgroundManifestError(
        `${label} modules contain unreferenced resource: ${path}.`,
      );
    }
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BackgroundManifestError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  label: string,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new BackgroundManifestError(
        `${label} declares unknown field "${key}".`,
      );
    }
  }
}

function assertLocalPath(
  value: unknown,
  label: string,
  extensions: readonly string[],
): string {
  const path = assertNonEmptyString(value, label);
  if (
    !path.startsWith("./") ||
    path.includes("\\") ||
    path.includes("../") ||
    path.slice(2).includes("/")
  ) {
    throw new BackgroundManifestError(
      `${label} must be a local ./basename path: ${path}.`,
    );
  }
  if (!extensions.some((extension) => path.endsWith(extension))) {
    throw new BackgroundManifestError(
      `${label} must end with ${extensions.join(" or ")}: ${path}.`,
    );
  }
  return path;
}

function assertAtlasPageName(value: string, label: string): void {
  if (
    value.trim().length === 0 ||
    value.includes("/") ||
    value.includes("\\") ||
    value === "." ||
    value === ".."
  ) {
    throw new BackgroundManifestError(`${label} is invalid: ${value}.`);
  }
}

function assertIdentifier(value: string, label: string): void {
  if (value.trim().length === 0 || value !== value.trim()) {
    throw new BackgroundManifestError(`${label} must be a non-empty id.`);
  }
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BackgroundManifestError(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BackgroundManifestError(`${label} must be a finite number.`);
  }
  return value;
}

function assertPositiveNumber(value: unknown, label: string): number {
  const number = assertFiniteNumber(value, label);
  if (number <= 0) {
    throw new BackgroundManifestError(`${label} must be positive.`);
  }
  return number;
}

function assertUniqueAnimation(
  animation: string,
  animationNames: Set<string>,
): void {
  if (animationNames.has(animation)) {
    throw new BackgroundManifestError(
      `Background animation "${animation}" is configured more than once.`,
    );
  }
  animationNames.add(animation);
}

function getFileName(path: string): string {
  const name = path.split(/[\\/]/u).at(-1);
  if (!name) {
    throw new BackgroundManifestError(
      `Cannot read resource filename: ${path}.`,
    );
  }
  return name;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
