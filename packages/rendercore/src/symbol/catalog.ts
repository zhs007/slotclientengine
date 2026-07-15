import type {
  GameConfigPaytableEntry,
  LogicGameConfig,
} from "@slotclientengine/logiccore";
import type { Texture } from "pixi.js";
import { createDefaultSymbolAnimationResolver } from "./animation-resolver.js";
import { SymbolAssetError } from "./errors.js";
import { RenderSymbol } from "./render-symbol.js";
import {
  createDefaultSymbolStatePreset,
  createSymbolDefinitionFromPreset,
  validateSymbolStatePreset,
} from "./state-machine.js";
import type {
  CreateCatalogRenderSymbolOptions,
  CreateSymbolCatalogOptions,
  SymbolAnimationResolver,
  SymbolAssetMap,
  SymbolCatalog,
  SymbolCatalogValidation,
  SymbolDefinition,
  SymbolLayerTextureSource,
  SymbolNormalTextureSource,
  SymbolStateId,
  SymbolTextureSet,
  SymbolStatePreset,
} from "./types.js";

type NormalizedTextureSet = SymbolTextureSet<Texture | string>;

export class SymbolCatalogModel implements SymbolCatalog {
  readonly #definitionsBySymbol: ReadonlyMap<string, SymbolDefinition>;
  readonly #paytableBySymbol: ReadonlyMap<string, GameConfigPaytableEntry>;
  readonly #textureSets: ReadonlyMap<string, NormalizedTextureSet>;
  readonly #validation: SymbolCatalogValidation;
  readonly #animationResolver: SymbolAnimationResolver;
  readonly #requiredStateTextures: readonly SymbolStateId[];
  readonly #symbolRenderPriorities: ReadonlyMap<string, number>;
  readonly #symbolAnimationCapabilities: Readonly<
    Record<string, readonly SymbolStateId[]>
  >;

  constructor(options: CreateSymbolCatalogOptions) {
    const statePreset = options.statePreset ?? createDefaultSymbolStatePreset();
    const validatedPreset = validateSymbolStatePreset(statePreset);
    const textureSets = normalizeAssetMap(
      options.assets,
      validatedPreset.statesById,
    );
    const requiredStateTextures = normalizeRequiredStateTextures(
      options.texturePolicy?.requiredStateTextures ?? [],
      validatedPreset.statesById,
    );
    const paytableEntries = extractPaytableEntries(options.gameConfig);
    const assetSymbols = [...textureSets.keys()].sort();
    const assetSymbolSet = new Set(assetSymbols);
    const paytableSymbolSet = new Set(
      paytableEntries.map((entry) => entry.symbol),
    );
    const symbolRenderPriorities = normalizeSymbolRenderPriorities(
      options.symbolRenderPriorities ?? {},
      paytableSymbolSet,
    );
    const displayableEntries = paytableEntries.filter((entry) =>
      assetSymbolSet.has(entry.symbol),
    );
    const ignoredPaytableSymbolsWithoutAssets = paytableEntries
      .filter((entry) => !assetSymbolSet.has(entry.symbol))
      .map((entry) => entry.symbol);
    const ignoredAssetsWithoutPaytable = assetSymbols.filter(
      (symbol) => !paytableSymbolSet.has(symbol),
    );

    for (const entry of displayableEntries) {
      const textureSet = textureSets.get(entry.symbol);
      if (!textureSet) {
        throw new SymbolAssetError(
          `Symbol "${entry.symbol}" asset is missing.`,
        );
      }
      assertRequiredStateTextures(
        entry.symbol,
        textureSet,
        requiredStateTextures,
      );
    }

    this.#textureSets = textureSets;
    this.#animationResolver =
      options.animationResolver ?? createDefaultSymbolAnimationResolver();
    this.#requiredStateTextures = requiredStateTextures;
    this.#symbolRenderPriorities = symbolRenderPriorities;
    this.#symbolAnimationCapabilities = Object.freeze({
      ...(options.symbolAnimationCapabilities ?? {}),
    });
    this.#validation = Object.freeze({
      displayableSymbols: Object.freeze(
        displayableEntries.map((entry) => entry.symbol),
      ),
      ignoredPaytableSymbolsWithoutAssets: Object.freeze(
        ignoredPaytableSymbolsWithoutAssets,
      ),
      ignoredAssetsWithoutPaytable: Object.freeze(ignoredAssetsWithoutPaytable),
    });
    this.#paytableBySymbol = new Map(
      paytableEntries.map((entry) => [entry.symbol, entry]),
    );
    this.#definitionsBySymbol = new Map(
      displayableEntries.map((entry) => [
        entry.symbol,
        createSymbolDefinitionFromPreset({
          code: entry.code,
          symbol: entry.symbol,
          pays: entry.pays,
          preset: statePreset,
        }),
      ]),
    );
  }

  getValidation(): SymbolCatalogValidation {
    return Object.freeze({
      displayableSymbols: Object.freeze([
        ...this.#validation.displayableSymbols,
      ]),
      ignoredPaytableSymbolsWithoutAssets: Object.freeze([
        ...this.#validation.ignoredPaytableSymbolsWithoutAssets,
      ]),
      ignoredAssetsWithoutPaytable: Object.freeze([
        ...this.#validation.ignoredAssetsWithoutPaytable,
      ]),
    });
  }

  getDisplayableSymbols(): readonly string[] {
    return this.getValidation().displayableSymbols;
  }

  getDefinition(symbol: string): SymbolDefinition {
    const definition = this.#definitionsBySymbol.get(symbol);
    if (!definition) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" is not displayable by this catalog.`,
      );
    }
    return definition;
  }

  getPaytableEntry(symbol: string): GameConfigPaytableEntry {
    const entry = this.#paytableBySymbol.get(symbol);
    if (!entry) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" does not exist in paytable.`,
      );
    }
    return entry;
  }

  getAsset(symbol: string): Texture | string {
    const normal = this.getNormalTextureSource(symbol);
    if (normal.kind !== "single") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" is ${normal.kind}; use getTextureSet() or getNormalTextureSource() instead of getAsset().`,
      );
    }
    return normal.texture;
  }

  getTextureSet(symbol: string): SymbolTextureSet {
    this.getDefinition(symbol);
    const textureSet = this.#textureSets.get(symbol);
    if (!textureSet) {
      throw new SymbolAssetError(`Symbol "${symbol}" asset is missing.`);
    }
    return cloneTextureSet(textureSet);
  }

  getNormalTextureSource(symbol: string): SymbolNormalTextureSource {
    return cloneNormalTextureSource(this.getTextureSet(symbol).normal);
  }

  createRenderSymbol(
    symbol: string,
    options: CreateCatalogRenderSymbolOptions = {},
  ): RenderSymbol {
    const textureSet = this.getTextureSet(symbol);
    const asset = options.texture ?? textureSet.normal;
    const normalSource = assertLoadedNormalSource(symbol, asset);
    const stateTextures = options.stateTextures ?? textureSet.states ?? {};
    const loadedStateTextures = assertLoadedStateTextures(
      symbol,
      stateTextures,
    );

    return new RenderSymbol({
      definition: this.getDefinition(symbol),
      texture: normalSource,
      stateTextures: loadedStateTextures,
      requiredStateTextures: this.#requiredStateTextures,
      animationResolver: options.animationResolver ?? this.#animationResolver,
      renderPriority: normalizeSymbolRenderPriority(
        options.renderPriority ?? this.#symbolRenderPriorities.get(symbol) ?? 0,
        symbol,
      ),
      animationCapabilities: this.#symbolAnimationCapabilities[symbol] ?? [],
      valueControllerFactory: options.valueControllerFactory,
    });
  }
}

export function createSymbolCatalog(
  options: CreateSymbolCatalogOptions,
): SymbolCatalogModel {
  return new SymbolCatalogModel(options);
}

export function createSymbolAssetMapFromUrls(
  urlsBySymbol: Record<string, string>,
): SymbolAssetMap {
  return Object.freeze({ ...urlsBySymbol });
}

function normalizeAssetMap(
  assets: SymbolAssetMap,
  statesById: ReadonlyMap<SymbolStateId, unknown>,
): ReadonlyMap<string, NormalizedTextureSet> {
  const entries = Object.entries(assets).map(
    ([symbol, asset]) =>
      [symbol, normalizeTextureSet(symbol, asset, statesById)] as const,
  );
  return new Map(entries);
}

function normalizeTextureSet(
  symbol: string,
  asset: SymbolAssetMap[string],
  statesById: ReadonlyMap<SymbolStateId, unknown>,
): NormalizedTextureSet {
  if (isSymbolTextureSet(asset)) {
    if (asset.normal === undefined || asset.normal === null) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" texture set must include a normal texture.`,
      );
    }
    return Object.freeze({
      normal: normalizeNormalTextureSource(symbol, asset.normal),
      states: normalizeTextureStates(symbol, asset.states ?? {}, statesById),
    });
  }

  if (asset === undefined || asset === null) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" asset must include a normal texture.`,
    );
  }
  return Object.freeze({
    normal: normalizeNormalTextureSource(symbol, asset),
    states: Object.freeze({}),
  });
}

function normalizeNormalTextureSource(
  symbol: string,
  normal: Texture | string | SymbolNormalTextureSource<Texture | string>,
): SymbolNormalTextureSource<Texture | string> {
  if (isSymbolNormalTextureSource(normal)) {
    if (normal.kind === "single") {
      if (normal.texture === undefined || normal.texture === null) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" single normal texture must exist.`,
        );
      }
      return Object.freeze({
        kind: "single",
        texture: normal.texture,
      });
    }
    if (normal.kind === "transparent") {
      return Object.freeze({
        kind: "transparent",
        width: assertPositiveDimension(
          normal.width,
          `Symbol "${symbol}" transparent normal width`,
        ),
        height: assertPositiveDimension(
          normal.height,
          `Symbol "${symbol}" transparent normal height`,
        ),
      });
    }
    return normalizeLayeredTextureSource(symbol, normal.layers);
  }

  if (normal === undefined || normal === null) {
    throw new SymbolAssetError(`Symbol "${symbol}" normal texture must exist.`);
  }
  return Object.freeze({
    kind: "single",
    texture: normal,
  });
}

function normalizeLayeredTextureSource(
  symbol: string,
  layers: readonly SymbolLayerTextureSource<Texture | string>[],
): SymbolNormalTextureSource<Texture | string> {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layered normal texture must include layers.`,
    );
  }

  const sortedLayers = [...layers].sort(
    (left, right) => left.index - right.index,
  );
  const seen = new Set<number>();
  let width: number | null = null;
  let height: number | null = null;
  const normalizedLayers = sortedLayers.map((layer, expectedIndex) => {
    if (!Number.isInteger(layer.index) || layer.index < 0) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" layer index must be a non-negative integer.`,
      );
    }
    if (seen.has(layer.index)) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" declares duplicate layer index ${layer.index}.`,
      );
    }
    seen.add(layer.index);
    if (layer.index !== expectedIndex) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" layered normal texture must use consecutive indexes from 0.`,
      );
    }
    if (
      layer.texture === undefined ||
      layer.texture === null ||
      layer.texture === ""
    ) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" layer ${layer.index} texture must exist.`,
      );
    }
    const keyframes = normalizeLayerKeyframes(symbol, layer);
    if (typeof layer.texture !== "string") {
      const layerWidth = getTextureWidth(layer.texture);
      const layerHeight = getTextureHeight(layer.texture);
      if (layerWidth <= 0 || layerHeight <= 0) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" layer ${layer.index} texture must have positive dimensions.`,
        );
      }
      width ??= layerWidth;
      height ??= layerHeight;
      if (width !== layerWidth || height !== layerHeight) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" layered textures must have identical dimensions.`,
        );
      }
      for (const keyframe of keyframes) {
        if (typeof keyframe !== "string") {
          const keyframeWidth = getTextureWidth(keyframe);
          const keyframeHeight = getTextureHeight(keyframe);
          if (keyframeWidth !== layerWidth || keyframeHeight !== layerHeight) {
            throw new SymbolAssetError(
              `Symbol "${symbol}" layer ${layer.index} keyframe textures must match the layer texture dimensions.`,
            );
          }
        }
      }
    }
    return Object.freeze({
      index: layer.index,
      texture: layer.texture,
      keyframes,
    });
  });

  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(normalizedLayers),
  });
}

function normalizeLayerKeyframes(
  symbol: string,
  layer: SymbolLayerTextureSource<Texture | string>,
): readonly (Texture | string)[] {
  if (layer.keyframes === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(layer.keyframes) || layer.keyframes.length === 0) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layer ${layer.index} keyframes must be a non-empty array.`,
    );
  }
  const keyframes = layer.keyframes.map((keyframe) => {
    if (keyframe === undefined || keyframe === null || keyframe === "") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" layer ${layer.index} keyframe texture must exist.`,
      );
    }
    return keyframe;
  });
  if (keyframes[0] !== layer.texture) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" layer ${layer.index} keyframes must start with the layer texture.`,
    );
  }
  return Object.freeze(keyframes);
}

function normalizeTextureStates(
  symbol: string,
  states: Readonly<Partial<Record<SymbolStateId, Texture | string>>>,
  statesById: ReadonlyMap<SymbolStateId, unknown>,
): Readonly<Partial<Record<SymbolStateId, Texture | string>>> {
  if (typeof states !== "object" || states === null || Array.isArray(states)) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" texture states must be an object.`,
    );
  }

  const normalized: Partial<Record<SymbolStateId, Texture | string>> = {};
  for (const [state, texture] of Object.entries(states)) {
    if (!statesById.has(state)) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" declares texture for unknown state "${state}".`,
      );
    }
    if (texture === undefined || texture === null) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" texture for state "${state}" must exist.`,
      );
    }
    normalized[state] = texture;
  }

  return Object.freeze(normalized);
}

function normalizeRequiredStateTextures(
  requiredStateTextures: readonly SymbolStateId[],
  statesById: ReadonlyMap<SymbolStateId, unknown>,
): readonly SymbolStateId[] {
  const unique: SymbolStateId[] = [];
  for (const state of requiredStateTextures) {
    if (!statesById.has(state)) {
      throw new SymbolAssetError(
        `Required texture state "${state}" does not exist in state preset.`,
      );
    }
    if (!unique.includes(state)) {
      unique.push(state);
    }
  }
  return Object.freeze(unique);
}

function assertRequiredStateTextures(
  symbol: string,
  textureSet: NormalizedTextureSet,
  requiredStateTextures: readonly SymbolStateId[],
): void {
  for (const state of requiredStateTextures) {
    if (!textureSet.states?.[state]) {
      throw new SymbolAssetError(
        `Symbol "${symbol}" is missing required texture for state "${state}".`,
      );
    }
  }
}

function assertLoadedStateTextures(
  symbol: string,
  states: Readonly<Partial<Record<SymbolStateId, Texture | string>>>,
): Readonly<Partial<Record<SymbolStateId, Texture>>> {
  const loaded: Partial<Record<SymbolStateId, Texture>> = {};
  for (const [state, texture] of Object.entries(states)) {
    if (typeof texture === "string") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" texture for state "${state}" is not loaded; pass a loaded Texture.`,
      );
    }
    if (texture !== undefined) {
      loaded[state] = texture;
    }
  }
  return Object.freeze(loaded);
}

function assertLoadedNormalSource(
  symbol: string,
  normal: Texture | string | SymbolNormalTextureSource<Texture | string>,
): SymbolNormalTextureSource<Texture> {
  const normalized = normalizeNormalTextureSource(symbol, normal);
  if (normalized.kind === "single") {
    if (typeof normalized.texture === "string") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" asset is a URL string; pass a loaded Texture to createRenderSymbol().`,
      );
    }
    return Object.freeze({
      kind: "single",
      texture: normalized.texture,
    });
  }
  if (normalized.kind === "transparent") {
    return Object.freeze({
      kind: "transparent",
      width: normalized.width,
      height: normalized.height,
    });
  }

  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(
      normalized.layers.map((layer) => {
        if (typeof layer.texture === "string") {
          throw new SymbolAssetError(
            `Symbol "${symbol}" layer ${layer.index} texture is a URL string; pass a loaded Texture.`,
          );
        }
        const keyframes = (layer.keyframes ?? []).map((keyframe) => {
          if (typeof keyframe === "string") {
            throw new SymbolAssetError(
              `Symbol "${symbol}" layer ${layer.index} keyframe texture is a URL string; pass a loaded Texture.`,
            );
          }
          return keyframe;
        });
        return Object.freeze({
          index: layer.index,
          texture: layer.texture,
          keyframes: Object.freeze(keyframes),
        });
      }),
    ),
  });
}

function normalizeSymbolRenderPriorities(
  symbolRenderPriorities: Readonly<Record<string, number>>,
  paytableSymbolSet: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const normalized = new Map<string, number>();
  for (const [symbol, renderPriority] of Object.entries(
    symbolRenderPriorities,
  )) {
    if (!paytableSymbolSet.has(symbol)) {
      throw new SymbolAssetError(
        `Symbol renderPriority for "${symbol}" does not exist in paytable.`,
      );
    }
    normalized.set(
      symbol,
      normalizeSymbolRenderPriority(renderPriority, symbol),
    );
  }
  return normalized;
}

function normalizeSymbolRenderPriority(
  renderPriority: number,
  symbol: string,
): number {
  if (
    typeof renderPriority !== "number" ||
    !Number.isSafeInteger(renderPriority) ||
    renderPriority < 0
  ) {
    throw new SymbolAssetError(
      `Symbol "${symbol}" renderPriority must be a non-negative safe integer.`,
    );
  }
  return renderPriority;
}

function cloneTextureSet(textureSet: NormalizedTextureSet): SymbolTextureSet {
  return Object.freeze({
    normal: cloneNormalTextureSource(textureSet.normal),
    states: Object.freeze({ ...(textureSet.states ?? {}) }),
  });
}

function cloneNormalTextureSource(
  normal: Texture | string | SymbolNormalTextureSource<Texture | string>,
): SymbolNormalTextureSource {
  const normalized = isSymbolNormalTextureSource(normal)
    ? normal
    : normalizeNormalTextureSource("unknown", normal);
  if (normalized.kind === "single") {
    return Object.freeze({
      kind: "single",
      texture: normalized.texture,
    });
  }
  if (normalized.kind === "transparent") {
    return Object.freeze({
      kind: "transparent",
      width: normalized.width,
      height: normalized.height,
    });
  }
  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(
      normalized.layers.map((layer) =>
        Object.freeze({
          index: layer.index,
          texture: layer.texture,
          ...(layer.keyframes && layer.keyframes.length > 0
            ? { keyframes: Object.freeze([...layer.keyframes]) }
            : {}),
        }),
      ),
    ),
  });
}

function isSymbolTextureSet(
  asset: SymbolAssetMap[string],
): asset is SymbolTextureSet {
  return typeof asset === "object" && asset !== null && "normal" in asset;
}

function isSymbolNormalTextureSource(
  normal: Texture | string | SymbolNormalTextureSource<Texture | string>,
): normal is SymbolNormalTextureSource<Texture | string> {
  return (
    typeof normal === "object" &&
    normal !== null &&
    "kind" in normal &&
    (normal.kind === "single" ||
      normal.kind === "layered" ||
      normal.kind === "transparent")
  );
}

function getTextureWidth(texture: Texture): number {
  return Math.max(
    0,
    texture.width || texture.source?.width || texture.orig?.width || 0,
  );
}

function getTextureHeight(texture: Texture): number {
  return Math.max(
    0,
    texture.height || texture.source?.height || texture.orig?.height || 0,
  );
}

function extractPaytableEntries(
  gameConfig: LogicGameConfig,
): readonly GameConfigPaytableEntry[] {
  const rawConfig = gameConfig.getRawConfig();
  const rawConfigRecord = assertRecord(rawConfig, "gameConfig");
  const paytableRecord = assertRecord(
    rawConfigRecord.paytable,
    "gameConfig.paytable",
  );

  return Object.freeze(
    Object.keys(paytableRecord)
      .map((codeKey) => Number.parseInt(codeKey, 10))
      .sort((left, right) => left - right)
      .map((code) => {
        const entry = gameConfig.getPaytableEntry(code);
        if (!entry) {
          throw new SymbolAssetError(
            `Paytable entry code ${code} was not accepted by gameConfig.`,
          );
        }
        return Object.freeze({
          code: entry.code,
          symbol: entry.symbol,
          pays: Object.freeze([...entry.pays]),
        });
      }),
  );
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SymbolAssetError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertPositiveDimension(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new SymbolAssetError(`${label} must be a finite positive number.`);
  }
  return value;
}
