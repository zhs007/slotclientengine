import {
  assertVNIProject,
  createAssetUrlManifest,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/core";
import {
  AtlasAttachmentLoader,
  SkeletonJson,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import type { ReelSymbolScaleMap } from "../reel/types.js";
import { SymbolAssetError } from "./errors.js";
import { createDefaultSymbolStatePreset } from "./state-machine.js";
import type {
  SymbolAssetInput,
  SymbolAssetMap,
  SymbolLayerTextureSource,
  SymbolNormalTextureSource,
  SymbolPlaybackKind,
  SymbolStateId,
} from "./types.js";

export interface SymbolManifestRangePlaybackSpec {
  readonly mode: "range";
  readonly startTime: number;
  readonly endTime: number;
  readonly loop: false;
}

export interface SymbolManifestBuiltinAnimationSpec {
  readonly kind: "builtin";
  readonly durationSeconds: number;
}

export interface SymbolManifestStaticAnimationSpec {
  readonly kind: "static";
  readonly durationSeconds: number;
}

export interface SymbolManifestVniAnimationSpec {
  readonly kind: "vni";
  readonly project: string;
  readonly playback: SymbolManifestRangePlaybackSpec;
}

export interface SymbolManifestAnimationPlaybackSpec {
  readonly mode: "animation";
  readonly animationName: string;
  readonly loop: boolean;
}

export interface SymbolManifestSpineAnimationTransform {
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
}

export interface SymbolManifestSpineAnimationSpec {
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly texture: string;
  readonly playback: SymbolManifestAnimationPlaybackSpec;
  readonly transform?: SymbolManifestSpineAnimationTransform;
}

export type SymbolManifestAnimationSpec =
  | SymbolManifestBuiltinAnimationSpec
  | SymbolManifestStaticAnimationSpec
  | SymbolManifestVniAnimationSpec
  | SymbolManifestSpineAnimationSpec;

export type SymbolManifestNormal =
  | string
  | SymbolManifestLayeredNormal
  | SymbolManifestTransparentNormal;

export interface SymbolManifestLayeredNormal {
  readonly kind: "layered";
  readonly layers: readonly SymbolManifestLayer[];
}

export interface SymbolManifestTransparentNormal {
  readonly kind: "transparent";
  readonly width: number;
  readonly height: number;
}

export interface SymbolManifestLayer {
  readonly index: number;
  readonly texture: string;
  readonly keyframes: readonly string[];
}

export interface ParsedSymbolManifestSymbol {
  readonly normal: SymbolManifestNormal;
  readonly states: Readonly<Record<SymbolStateId, string>>;
  readonly scale: number;
  readonly hasExplicitScale: boolean;
  readonly animations: Readonly<
    Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>>
  >;
}

export interface ParsedSymbolStateTextureManifest {
  readonly version: 1;
  readonly states: readonly SymbolStateId[];
  readonly symbols: Readonly<Record<string, ParsedSymbolManifestSymbol>>;
}

export interface ParseSymbolStateTextureManifestOptions {
  readonly requiredStates?: readonly SymbolStateId[];
  readonly animationStates?: readonly SymbolStateId[];
}

export interface CreateSymbolAssetMapFromManifestModulesOptions extends ParseSymbolStateTextureManifestOptions {
  readonly modules: Readonly<Record<string, string>>;
  readonly manifest: unknown;
  readonly displaySymbols?: readonly string[];
  readonly includeUnmanifestedNormalAssets?: boolean;
}

export interface CreateSymbolScaleMapFromManifestOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly displaySymbols?: readonly string[];
  readonly requireExplicitScale?: boolean;
}

export interface CreateSymbolVniAnimationResourcesOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly vniProjectModules: Readonly<Record<string, unknown>>;
  readonly vniAssetModules: Readonly<Record<string, string>>;
}

export interface CreateSymbolSpineAnimationResourcesOptions extends ParseSymbolStateTextureManifestOptions {
  readonly manifest: unknown;
  readonly spineSkeletonModules: Readonly<Record<string, unknown>>;
  readonly spineAtlasModules: Readonly<Record<string, string>>;
  readonly spineTextureModules: Readonly<Record<string, string>>;
}

export interface SymbolVniAnimationResource {
  readonly symbol: string;
  readonly state: SymbolStateId;
  readonly spec: SymbolManifestVniAnimationSpec;
  readonly project: VNIProjectConfig;
  readonly assetUrls: AssetUrlManifest;
}

export type SymbolVniAnimationResourceMap = Readonly<
  Record<
    string,
    Readonly<Partial<Record<SymbolStateId, SymbolVniAnimationResource>>>
  >
>;

export interface SymbolSpineAnimationResource {
  readonly symbol: string;
  readonly state: SymbolStateId;
  readonly spec: SymbolManifestSpineAnimationSpec;
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly textureUrl: string;
  readonly atlasPage: string;
}

export type SymbolSpineAnimationResourceMap = Readonly<
  Record<
    string,
    Readonly<Partial<Record<SymbolStateId, SymbolSpineAnimationResource>>>
  >
>;

interface SplitSymbolPngModulesResult {
  readonly normalAssets: Readonly<Record<string, string>>;
  readonly stateAssets: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
  readonly assetsByFileName: Readonly<Record<string, string>>;
}

const TOP_LEVEL_MANIFEST_KEYS = Object.freeze([
  "version",
  "states",
  "settings",
  "symbols",
]);

export function parseSymbolStateTextureManifest(
  manifest: unknown,
  options: ParseSymbolStateTextureManifestOptions = {},
): ParsedSymbolStateTextureManifest {
  const record = assertRecord(manifest, "symbol state texture manifest");
  assertOnlyKnownKeys(
    record,
    "symbol state texture manifest",
    TOP_LEVEL_MANIFEST_KEYS,
  );
  if (record.version !== 1) {
    throw new SymbolAssetError(
      "Symbol state texture manifest version must be 1.",
    );
  }
  if (!Array.isArray(record.states)) {
    throw new SymbolAssetError(
      "Symbol state texture manifest states must be an array.",
    );
  }

  const states = Object.freeze(
    record.states.map((state) => assertString(state, "manifest state")),
  );
  assertUniqueStrings(states, "symbol state texture manifest states");
  const stateSet = new Set(states);
  for (const state of options.requiredStates ?? []) {
    if (!stateSet.has(state)) {
      throw new SymbolAssetError(
        `Symbol state texture manifest is missing required state "${state}".`,
      );
    }
  }
  if (options.requiredStates) {
    const requiredStateSet = new Set(options.requiredStates);
    for (const state of states) {
      if (!requiredStateSet.has(state)) {
        throw new SymbolAssetError(
          `Symbol state texture manifest declares unknown state "${state}".`,
        );
      }
    }
  }

  const animationStateSet = new Set(
    options.animationStates ?? getDefaultSymbolStateIds(),
  );
  const rawSymbols = assertRecord(
    record.symbols,
    "symbol state texture manifest symbols",
  );
  const symbols: Record<string, ParsedSymbolManifestSymbol> = {};
  for (const [symbol, rawSymbol] of Object.entries(rawSymbols)) {
    const rawSymbolRecord = assertRecord(
      rawSymbol,
      `symbol state texture manifest symbol "${symbol}"`,
    );
    const allowedKeys = ["normal", "scale", "animations", ...states];
    assertOnlyKnownKeys(
      rawSymbolRecord,
      `symbol "${symbol}" manifest`,
      allowedKeys,
    );
    const hasExplicitScale = Object.prototype.hasOwnProperty.call(
      rawSymbolRecord,
      "scale",
    );
    const parsedStates: Record<SymbolStateId, string> = {};
    for (const state of states) {
      parsedStates[state] = assertString(
        rawSymbolRecord[state],
        `symbol "${symbol}" ${state} texture`,
      );
    }
    symbols[symbol] = Object.freeze({
      normal: parseManifestNormal(rawSymbolRecord.normal, symbol),
      states: Object.freeze(parsedStates),
      scale: parseManifestScale(rawSymbolRecord.scale, symbol),
      hasExplicitScale,
      animations: parseManifestAnimations(
        rawSymbolRecord.animations,
        symbol,
        animationStateSet,
      ),
    });
  }

  return Object.freeze({
    version: 1,
    states,
    symbols: Object.freeze(symbols),
  });
}

export function getSymbolDisplaySymbolsFromManifest(
  manifest: unknown,
  options: ParseSymbolStateTextureManifestOptions = {},
): readonly string[] {
  const parsed = parseSymbolStateTextureManifest(manifest, options);
  return Object.freeze(Object.keys(parsed.symbols));
}

export function createSymbolAssetMapFromManifestModules(
  options: CreateSymbolAssetMapFromManifestModulesOptions,
): SymbolAssetMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const requiredStates = Object.freeze([
    ...(options.requiredStates ?? manifest.states),
  ]);
  const displaySymbols = Object.freeze([
    ...(options.displaySymbols ?? Object.keys(manifest.symbols)),
  ]);
  const split = splitSymbolPngModules(options.modules, manifest.states);
  const assets: Record<string, SymbolAssetInput> = {};

  for (const symbol of displaySymbols) {
    const manifestSymbol = manifest.symbols[symbol];
    if (!manifestSymbol) {
      throw new SymbolAssetError(
        `Symbol state texture manifest is missing "${symbol}".`,
      );
    }
    const normal = createNormalAssetFromManifest(
      symbol,
      manifestSymbol.normal,
      {
        normalAssets: split.normalAssets,
        assetsByFileName: split.assetsByFileName,
      },
    );
    const states: Record<string, string> = {};
    for (const state of requiredStates) {
      const manifestStatePath = manifestSymbol.states[state];
      if (!manifestStatePath) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" manifest is missing state "${state}".`,
        );
      }
      const stateFileName = `${symbol}.${state}.png`;
      if (getFileNameFromManifestPath(manifestStatePath) !== stateFileName) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" manifest texture for state "${state}" must be "./${stateFileName}".`,
        );
      }
      const stateAsset = split.stateAssets[symbol]?.[state];
      if (!stateAsset) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" is missing required state texture file "${stateFileName}".`,
        );
      }
      states[state] = stateAsset;
    }
    assets[symbol] = Object.freeze({
      normal,
      states: Object.freeze(states),
    });
  }

  if (options.includeUnmanifestedNormalAssets) {
    for (const [symbol, normal] of Object.entries(split.normalAssets)) {
      if (!manifest.symbols[symbol]) {
        assets[symbol] = Object.freeze({
          normal,
          states: Object.freeze({}),
        });
      }
    }
  }

  return Object.freeze(assets);
}

export function createSymbolScaleMapFromManifest(
  options: CreateSymbolScaleMapFromManifestOptions,
): ReelSymbolScaleMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const displaySymbols = Object.freeze([
    ...(options.displaySymbols ?? Object.keys(manifest.symbols)),
  ]);
  const entries = displaySymbols.map((symbol) => {
    const manifestSymbol = manifest.symbols[symbol];
    if (!manifestSymbol) {
      throw new SymbolAssetError(
        `Symbol state texture manifest is missing "${symbol}".`,
      );
    }
    if (options.requireExplicitScale && !manifestSymbol.hasExplicitScale) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" manifest must explicitly declare scale.`,
      );
    }
    return [symbol, manifestSymbol.scale] as const;
  });
  return Object.freeze(
    Object.fromEntries(entries),
  ) satisfies ReelSymbolScaleMap;
}

export function createSymbolVniAnimationResourcesFromManifest(
  options: CreateSymbolVniAnimationResourcesOptions,
): SymbolVniAnimationResourceMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const projectModules = createManifestPathModuleMap(
    options.vniProjectModules,
    "VNI project",
  );
  const assetUrlManifest = createAssetUrlManifest({
    ...options.vniAssetModules,
  });
  const resources: Record<
    string,
    Partial<Record<SymbolStateId, SymbolVniAnimationResource>>
  > = {};

  for (const [symbol, manifestSymbol] of Object.entries(manifest.symbols)) {
    for (const [state, animation] of Object.entries(
      manifestSymbol.animations,
    )) {
      if (!animation || animation.kind !== "vni") {
        continue;
      }
      const rawProject = projectModules.get(animation.project);
      if (rawProject === undefined) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" ${state} VNI project is missing from modules: ${animation.project}.`,
        );
      }
      const project = assertVNIProject(rawProject);
      const assetUrls = resolveProjectAssetUrls(project, assetUrlManifest);
      resources[symbol] = resources[symbol] ?? {};
      resources[symbol][state] = Object.freeze({
        symbol,
        state,
        spec: animation,
        project,
        assetUrls,
      });
    }
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(resources).map(([symbol, states]) => [
        symbol,
        Object.freeze({ ...states }),
      ]),
    ),
  );
}

export function createSymbolSpineAnimationResourcesFromManifest(
  options: CreateSymbolSpineAnimationResourcesOptions,
): SymbolSpineAnimationResourceMap {
  const manifest = parseSymbolStateTextureManifest(options.manifest, options);
  const skeletonModules = createManifestPathModuleMap(
    options.spineSkeletonModules,
    "Spine skeleton",
  );
  const atlasModules = createManifestPathModuleMap(
    options.spineAtlasModules,
    "Spine atlas",
  );
  const textureModules = createManifestPathModuleMap(
    options.spineTextureModules,
    "Spine texture",
  );
  const resources: Record<
    string,
    Partial<Record<SymbolStateId, SymbolSpineAnimationResource>>
  > = {};

  for (const [symbol, manifestSymbol] of Object.entries(manifest.symbols)) {
    for (const [state, animation] of Object.entries(
      manifestSymbol.animations,
    )) {
      if (!animation || animation.kind !== "spine") {
        continue;
      }
      const skeleton = skeletonModules.get(animation.skeleton);
      if (skeleton === undefined) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" ${state} Spine skeleton is missing from modules: ${animation.skeleton}.`,
        );
      }
      const atlas = atlasModules.get(animation.atlas);
      if (atlas === undefined) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" ${state} Spine atlas is missing from modules: ${animation.atlas}.`,
        );
      }
      if (typeof atlas !== "string" || atlas.trim().length === 0) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" ${state} Spine atlas module must be raw text.`,
        );
      }
      const texture = textureModules.get(animation.texture);
      if (typeof texture !== "string" || texture.trim().length === 0) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" ${state} Spine texture is missing from modules: ${animation.texture}.`,
        );
      }

      const atlasPage = validateSpineAtlasAndSkeleton({
        symbol,
        state,
        spec: animation,
        skeleton,
        atlasText: atlas,
      });
      resources[symbol] = resources[symbol] ?? {};
      resources[symbol][state] = Object.freeze({
        symbol,
        state,
        spec: animation,
        skeleton,
        atlasText: atlas,
        textureUrl: texture,
        atlasPage,
      });
    }
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(resources).map(([symbol, states]) => [
        symbol,
        Object.freeze({ ...states }),
      ]),
    ),
  );
}

function splitSymbolPngModules(
  modules: Readonly<Record<string, string>>,
  allowedStates: readonly string[],
): SplitSymbolPngModulesResult {
  const normalAssets: Record<string, string> = {};
  const stateAssets: Record<string, Record<string, string>> = {};
  const assetsByFileName: Record<string, string> = {};
  const allowedStateSet = new Set(allowedStates);

  for (const [modulePath, url] of Object.entries(modules)) {
    const filename = getFileNameFromPath(modulePath);
    if (!filename.endsWith(".png")) {
      continue;
    }
    if (assetsByFileName[filename] !== undefined) {
      throw new SymbolAssetError(
        `Duplicate symbol texture filename in modules: ${filename}.`,
      );
    }
    assetsByFileName[filename] = url;

    const stem = filename.slice(0, -".png".length);
    if (isLayerFileStem(stem)) {
      continue;
    }

    const parts = stem.split(".");
    if (parts.length === 1) {
      normalAssets[parts[0]] = url;
      continue;
    }

    if (parts.length === 2) {
      const [symbol, state] = parts;
      if (!allowedStateSet.has(state)) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" declares texture for unknown state "${state}".`,
        );
      }
      stateAssets[symbol] = stateAssets[symbol] ?? {};
      stateAssets[symbol][state] = url;
      continue;
    }

    throw new SymbolAssetError(
      `Cannot parse symbol texture filename "${filename}".`,
    );
  }

  return Object.freeze({
    normalAssets: Object.freeze(normalAssets),
    stateAssets: Object.freeze(
      Object.fromEntries(
        Object.entries(stateAssets).map(([symbol, states]) => [
          symbol,
          Object.freeze(states),
        ]),
      ),
    ),
    assetsByFileName: Object.freeze(assetsByFileName),
  });
}

function createNormalAssetFromManifest(
  symbol: string,
  normal: SymbolManifestNormal,
  sources: {
    readonly normalAssets: Readonly<Record<string, string>>;
    readonly assetsByFileName: Readonly<Record<string, string>>;
  },
): string | SymbolNormalTextureSource<string> {
  if (typeof normal === "string") {
    const normalFileName = `${symbol}.png`;
    if (getFileNameFromManifestPath(normal) !== normalFileName) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" manifest normal texture must be "./${normalFileName}".`,
      );
    }
    const asset = sources.normalAssets[symbol];
    if (!asset) {
      throw new SymbolAssetError(
        `Symbol state texture manifest references missing normal texture "${symbol}".`,
      );
    }
    return asset;
  }

  if (normal.kind === "transparent") {
    return normal;
  }

  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(
      normal.layers.map((layer) =>
        createLayerAssetFromManifestLayer(
          symbol,
          layer,
          sources.assetsByFileName,
        ),
      ),
    ),
  });
}

function createLayerAssetFromManifestLayer(
  symbol: string,
  layer: SymbolManifestLayer,
  assetsByFileName: Readonly<Record<string, string>>,
): SymbolLayerTextureSource<string> {
  const fileName = getFileNameFromManifestPath(layer.texture);
  const texture = assetsByFileName[fileName];
  if (!texture) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" is missing layered texture file "${fileName}".`,
    );
  }
  const keyframes = layer.keyframes.map((keyframePath) => {
    const keyframeFileName = getFileNameFromManifestPath(keyframePath);
    const keyframe = assetsByFileName[keyframeFileName];
    if (!keyframe) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" is missing layer ${layer.index} keyframe file "${keyframeFileName}".`,
      );
    }
    return keyframe;
  });
  return Object.freeze({
    index: layer.index,
    texture,
    ...(keyframes.length > 0 ? { keyframes: Object.freeze(keyframes) } : {}),
  });
}

function parseManifestNormal(
  normal: unknown,
  symbol: string,
): SymbolManifestNormal {
  if (typeof normal === "string") {
    return normal;
  }
  const record = assertRecord(normal, `symbol "${symbol}" normal texture`);
  if (record.kind === "transparent") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" transparent normal`, [
      "kind",
      "width",
      "height",
    ]);
    return Object.freeze({
      kind: "transparent",
      width: assertFinitePositiveNumber(
        record.width,
        `symbol "${symbol}" transparent normal.width`,
      ),
      height: assertFinitePositiveNumber(
        record.height,
        `symbol "${symbol}" transparent normal.height`,
      ),
    });
  }

  assertOnlyKnownKeys(record, `symbol "${symbol}" layered normal`, [
    "kind",
    "layers",
  ]);
  if (record.kind !== "layered") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" manifest normal texture must be a string, layered normal or transparent normal.`,
    );
  }
  if (!Array.isArray(record.layers) || record.layers.length === 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layered normal texture must include layers.`,
    );
  }
  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(
      record.layers.map((layer, index) =>
        parseManifestLayer(layer, symbol, index),
      ),
    ),
  });
}

function parseManifestLayer(
  value: unknown,
  symbol: string,
  index: number,
): SymbolManifestLayer {
  if (typeof value === "string") {
    return Object.freeze({
      index: parseLayerIndexFromManifestPath(symbol, value),
      texture: value,
      keyframes: Object.freeze([]),
    });
  }
  const record = assertRecord(
    value,
    `symbol "${symbol}" normal layer ${index}`,
  );
  assertOnlyKnownKeys(record, `symbol "${symbol}" normal layer ${index}`, [
    "index",
    "texture",
    "keyframes",
  ]);
  if (!Number.isInteger(record.index) || (record.index as number) < 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layer index must be a non-negative integer.`,
    );
  }
  const keyframes =
    record.keyframes === undefined
      ? []
      : assertStringArray(
          record.keyframes,
          `symbol "${symbol}" layer keyframes`,
        );
  const texture = assertString(
    record.texture,
    `symbol "${symbol}" layer texture`,
  );
  if (keyframes.length > 0 && keyframes[0] !== texture) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layer ${record.index} keyframes must start with the layer texture.`,
    );
  }
  return Object.freeze({
    index: record.index as number,
    texture,
    keyframes: Object.freeze(keyframes),
  });
}

function parseLayerIndexFromManifestPath(symbol: string, path: string): number {
  const fileName = getFileNameFromManifestPath(path);
  const match = fileName.match(
    new RegExp(`^${escapeRegExp(symbol)}-(\\d+)\\.png$`, "u"),
  );
  if (!match) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" composite layer file "${fileName}" must match ${symbol}-{index}.png.`,
    );
  }
  return Number.parseInt(match[1], 10);
}

function parseManifestScale(scale: unknown, symbol: string): number {
  if (scale === undefined) {
    return 1;
  }
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" manifest scale must be a finite positive number.`,
    );
  }
  return scale;
}

function parseManifestAnimations(
  animations: unknown,
  symbol: string,
  animationStateSet: ReadonlySet<string>,
): Readonly<Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>>> {
  if (animations === undefined) {
    return Object.freeze({});
  }
  const record = assertRecord(animations, `symbol "${symbol}" animations`);
  const parsed: Partial<Record<SymbolStateId, SymbolManifestAnimationSpec>> =
    {};
  for (const [state, animation] of Object.entries(record)) {
    if (!animationStateSet.has(state)) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" declares animation for unknown state "${state}".`,
      );
    }
    parsed[state] = parseManifestAnimationSpec(animation, symbol, state);
  }
  return Object.freeze(parsed);
}

function parseManifestAnimationSpec(
  value: unknown,
  symbol: string,
  state: string,
): SymbolManifestAnimationSpec {
  const record = assertRecord(value, `symbol "${symbol}" ${state} animation`);
  if (record.kind === "builtin") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
      "kind",
      "durationSeconds",
    ]);
    return Object.freeze({
      kind: "builtin",
      durationSeconds: assertFinitePositiveNumber(
        record.durationSeconds,
        `symbol "${symbol}" ${state} animation.durationSeconds`,
      ),
    });
  }
  if (record.kind === "static") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
      "kind",
      "durationSeconds",
    ]);
    return Object.freeze({
      kind: "static",
      durationSeconds: assertFinitePositiveNumber(
        record.durationSeconds,
        `symbol "${symbol}" ${state} animation.durationSeconds`,
      ),
    });
  }
  if (record.kind === "spine") {
    assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
      "kind",
      "skeleton",
      "atlas",
      "texture",
      "playback",
      "transform",
    ]);
    const playback = parseAnimationPlayback(record.playback, symbol, state);
    if (getDefaultSymbolPlaybackKind(state) === "once" && playback.loop) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" ${state} Spine playback.loop must be false for once state "${state}".`,
      );
    }
    return Object.freeze({
      kind: "spine",
      skeleton: assertManifestLocalFilePath(
        record.skeleton,
        `symbol "${symbol}" ${state} Spine skeleton`,
        [".json"],
      ),
      atlas: assertManifestLocalFilePath(
        record.atlas,
        `symbol "${symbol}" ${state} Spine atlas`,
        [".atlas"],
      ),
      texture: assertManifestLocalFilePath(
        record.texture,
        `symbol "${symbol}" ${state} Spine texture`,
        [".png"],
      ),
      playback,
      ...(record.transform !== undefined
        ? {
            transform: parseSpineTransform(record.transform, symbol, state),
          }
        : {}),
    });
  }
  if (record.kind !== "vni") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} animation kind must be "builtin", "static", "vni" or "spine".`,
    );
  }
  assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} animation`, [
    "kind",
    "project",
    "playback",
  ]);
  return Object.freeze({
    kind: "vni",
    project: assertString(
      record.project,
      `symbol "${symbol}" ${state} VNI project`,
    ),
    playback: parseRangePlayback(record.playback, symbol, state),
  });
}

function parseRangePlayback(
  value: unknown,
  symbol: string,
  state: string,
): SymbolManifestRangePlaybackSpec {
  const record = assertRecord(value, `symbol "${symbol}" ${state} playback`);
  assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} playback`, [
    "mode",
    "startTime",
    "endTime",
    "loop",
  ]);
  if (record.mode !== "range") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} VNI playback mode must be "range".`,
    );
  }
  const startTime = assertFiniteNonNegativeNumber(
    record.startTime,
    `symbol "${symbol}" ${state} VNI playback.startTime`,
  );
  const endTime = assertFinitePositiveNumber(
    record.endTime,
    `symbol "${symbol}" ${state} VNI playback.endTime`,
  );
  if (endTime <= startTime) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} VNI playback.endTime must be greater than startTime.`,
    );
  }
  if (record.loop !== false) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} VNI playback.loop must be false.`,
    );
  }
  return Object.freeze({
    mode: "range",
    startTime,
    endTime,
    loop: false,
  });
}

function parseAnimationPlayback(
  value: unknown,
  symbol: string,
  state: string,
): SymbolManifestAnimationPlaybackSpec {
  const record = assertRecord(value, `symbol "${symbol}" ${state} playback`);
  assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} playback`, [
    "mode",
    "animationName",
    "loop",
  ]);
  if (record.mode !== "animation") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} Spine playback mode must be "animation".`,
    );
  }
  if (typeof record.loop !== "boolean") {
    throw new SymbolAssetError(
      `Symbol "${symbol}" ${state} Spine playback.loop must be a boolean.`,
    );
  }
  return Object.freeze({
    mode: "animation",
    animationName: assertString(
      record.animationName,
      `symbol "${symbol}" ${state} Spine playback.animationName`,
    ),
    loop: record.loop,
  });
}

function parseSpineTransform(
  value: unknown,
  symbol: string,
  state: string,
): SymbolManifestSpineAnimationTransform {
  const record = assertRecord(
    value,
    `symbol "${symbol}" ${state} Spine transform`,
  );
  assertOnlyKnownKeys(record, `symbol "${symbol}" ${state} Spine transform`, [
    "x",
    "y",
    "scale",
  ]);
  return Object.freeze({
    ...(record.x !== undefined
      ? {
          x: assertFiniteNumber(
            record.x,
            `symbol "${symbol}" ${state} Spine transform.x`,
          ),
        }
      : {}),
    ...(record.y !== undefined
      ? {
          y: assertFiniteNumber(
            record.y,
            `symbol "${symbol}" ${state} Spine transform.y`,
          ),
        }
      : {}),
    ...(record.scale !== undefined
      ? {
          scale: assertFinitePositiveNumber(
            record.scale,
            `symbol "${symbol}" ${state} Spine transform.scale`,
          ),
        }
      : {}),
  });
}

function validateSpineAtlasAndSkeleton(options: {
  readonly symbol: string;
  readonly state: string;
  readonly spec: SymbolManifestSpineAnimationSpec;
  readonly skeleton: unknown;
  readonly atlasText: string;
}): string {
  let atlas: TextureAtlas;
  try {
    atlas = new TextureAtlas(options.atlasText);
  } catch (error) {
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine atlas failed to parse: ${formatUnknownError(error)}.`,
    );
  }
  if (atlas.pages.length !== 1) {
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine atlas must contain exactly one page.`,
    );
  }
  const atlasPage = atlas.pages[0]?.name;
  const textureFileName = getFileNameFromManifestPath(options.spec.texture);
  if (atlasPage !== textureFileName) {
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine atlas page "${atlasPage}" must match texture "${textureFileName}".`,
    );
  }

  try {
    const skeletonData = new SkeletonJson(
      new AtlasAttachmentLoader(atlas),
    ).readSkeletonData(options.skeleton);
    if (
      !skeletonData.findAnimation(options.spec.playback.animationName) ||
      !skeletonData.animations.some(
        (animation) => animation.name === options.spec.playback.animationName,
      )
    ) {
      throw new SymbolAssetError(
        `Symbol "${options.symbol}" ${options.state} Spine skeleton is missing animation "${options.spec.playback.animationName}".`,
      );
    }
  } catch (error) {
    if (error instanceof SymbolAssetError) {
      throw error;
    }
    throw new SymbolAssetError(
      `Symbol "${options.symbol}" ${options.state} Spine skeleton failed to parse: ${formatUnknownError(error)}.`,
    );
  }

  return atlasPage;
}

function createManifestPathModuleMap(
  modules: Readonly<Record<string, unknown>>,
  label: string,
): ReadonlyMap<string, unknown> {
  const entries = new Map<string, unknown>();
  for (const [modulePath, value] of Object.entries(modules)) {
    const key = `./${getFileNameFromPath(modulePath)}`;
    if (entries.has(key)) {
      throw new SymbolAssetError(`Duplicate ${label} module basename: ${key}.`);
    }
    entries.set(key, value);
  }
  return entries;
}

function getDefaultSymbolStateIds(): readonly SymbolStateId[] {
  return createDefaultSymbolStatePreset().states.map((state) => state.id);
}

function getDefaultSymbolPlaybackKind(stateId: string): SymbolPlaybackKind {
  const state = createDefaultSymbolStatePreset().states.find(
    (candidate) => candidate.id === stateId,
  );
  return state?.playback ?? "once";
}

function getFileNameFromPath(path: string): string {
  const fileName = path.split(/[\\/]/u).at(-1);
  if (!fileName) {
    throw new SymbolAssetError(`Cannot extract filename from path "${path}".`);
  }
  return fileName;
}

function getFileNameFromManifestPath(path: string): string {
  if (!path.startsWith("./") || path.includes("\\") || path.includes("../")) {
    throw new SymbolAssetError(
      `Manifest texture path must be a local ./ path: ${path}.`,
    );
  }
  return getFileNameFromPath(path);
}

function assertManifestLocalFilePath(
  value: unknown,
  label: string,
  extensions: readonly string[],
): string {
  const path = assertString(value, label);
  if (!path.startsWith("./") || path.includes("\\") || path.includes("../")) {
    throw new SymbolAssetError(`${label} must be a local ./ path: ${path}.`);
  }
  const suffix = path.slice("./".length);
  if (suffix.includes("/") || suffix.length === 0) {
    throw new SymbolAssetError(`${label} must be a ./basename path: ${path}.`);
  }
  if (!extensions.some((extension) => suffix.endsWith(extension))) {
    throw new SymbolAssetError(
      `${label} must end with ${extensions.join(" or ")}: ${path}.`,
    );
  }
  return path;
}

function isLayerFileStem(stem: string): boolean {
  return /^.+\.layer\d+(?:\.frame\d+)?$/u.test(stem);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SymbolAssetError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKnownKeys(
  record: Readonly<Record<string, unknown>>,
  label: string,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new SymbolAssetError(`${label} declares unknown field "${key}".`);
    }
  }
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SymbolAssetError(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) {
    throw new SymbolAssetError(`${label} must be an array.`);
  }
  return Object.freeze(
    value.map((item, index) => assertString(item, `${label}[${index}]`)),
  );
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new SymbolAssetError(
        `${label} contains duplicate value "${value}".`,
      );
    }
    seen.add(value);
  }
}

function assertFiniteNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SymbolAssetError(
      `${label} must be a finite non-negative number.`,
    );
  }
  return value;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SymbolAssetError(`${label} must be a finite number.`);
  }
  return value;
}

function assertFinitePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new SymbolAssetError(`${label} must be a finite positive number.`);
  }
  return value;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function getSymbolPlaybackKindForManifestAnimation(
  spec: SymbolManifestAnimationSpec,
): SymbolPlaybackKind {
  if (
    spec.kind === "builtin" ||
    spec.kind === "static" ||
    spec.kind === "vni" ||
    spec.kind === "spine"
  ) {
    return "once";
  }
  throw new SymbolAssetError(`Unsupported symbol manifest animation kind.`);
}
