import type { GameConfigPaytableEntry, LogicGameConfig } from "@slotclientengine/logiccore";
import type { Texture } from "pixi.js";
import { createDefaultSymbolAnimationResolver } from "./animation-resolver.js";
import { SymbolAssetError } from "./errors.js";
import { RenderSymbol } from "./render-symbol.js";
import {
  createDefaultSymbolStatePreset,
  createSymbolDefinitionFromPreset,
  validateSymbolStatePreset
} from "./state-machine.js";
import type {
  CreateCatalogRenderSymbolOptions,
  CreateSymbolCatalogOptions,
  SymbolAnimationResolver,
  SymbolAssetMap,
  SymbolCatalog,
  SymbolCatalogValidation,
  SymbolDefinition,
  SymbolStateId,
  SymbolTextureSet,
  SymbolStatePreset
} from "./types.js";

type NormalizedTextureSet = SymbolTextureSet<Texture | string>;

export class SymbolCatalogModel implements SymbolCatalog {
  readonly #definitionsBySymbol: ReadonlyMap<string, SymbolDefinition>;
  readonly #paytableBySymbol: ReadonlyMap<string, GameConfigPaytableEntry>;
  readonly #textureSets: ReadonlyMap<string, NormalizedTextureSet>;
  readonly #validation: SymbolCatalogValidation;
  readonly #animationResolver: SymbolAnimationResolver;
  readonly #requiredStateTextures: readonly SymbolStateId[];

  constructor(options: CreateSymbolCatalogOptions) {
    const statePreset = options.statePreset ?? createDefaultSymbolStatePreset();
    const validatedPreset = validateSymbolStatePreset(statePreset);
    const textureSets = normalizeAssetMap(options.assets, validatedPreset.statesById);
    const requiredStateTextures = normalizeRequiredStateTextures(
      options.texturePolicy?.requiredStateTextures ?? [],
      validatedPreset.statesById
    );
    const paytableEntries = extractPaytableEntries(options.gameConfig);
    const assetSymbols = [...textureSets.keys()].sort();
    const assetSymbolSet = new Set(assetSymbols);
    const paytableSymbolSet = new Set(paytableEntries.map((entry) => entry.symbol));
    const displayableEntries = paytableEntries.filter((entry) => assetSymbolSet.has(entry.symbol));
    const ignoredPaytableSymbolsWithoutAssets = paytableEntries
      .filter((entry) => !assetSymbolSet.has(entry.symbol))
      .map((entry) => entry.symbol);
    const ignoredAssetsWithoutPaytable = assetSymbols.filter((symbol) => !paytableSymbolSet.has(symbol));

    for (const entry of displayableEntries) {
      const textureSet = textureSets.get(entry.symbol);
      if (!textureSet) {
        throw new SymbolAssetError(`Symbol "${entry.symbol}" asset is missing.`);
      }
      assertRequiredStateTextures(entry.symbol, textureSet, requiredStateTextures);
    }

    this.#textureSets = textureSets;
    this.#animationResolver = options.animationResolver ?? createDefaultSymbolAnimationResolver();
    this.#requiredStateTextures = requiredStateTextures;
    this.#validation = Object.freeze({
      displayableSymbols: Object.freeze(displayableEntries.map((entry) => entry.symbol)),
      ignoredPaytableSymbolsWithoutAssets: Object.freeze(ignoredPaytableSymbolsWithoutAssets),
      ignoredAssetsWithoutPaytable: Object.freeze(ignoredAssetsWithoutPaytable)
    });
    this.#paytableBySymbol = new Map(paytableEntries.map((entry) => [entry.symbol, entry]));
    this.#definitionsBySymbol = new Map(
      displayableEntries.map((entry) => [
        entry.symbol,
        createSymbolDefinitionFromPreset({
          code: entry.code,
          symbol: entry.symbol,
          pays: entry.pays,
          preset: statePreset
        })
      ])
    );
  }

  getValidation(): SymbolCatalogValidation {
    return Object.freeze({
      displayableSymbols: Object.freeze([...this.#validation.displayableSymbols]),
      ignoredPaytableSymbolsWithoutAssets: Object.freeze([
        ...this.#validation.ignoredPaytableSymbolsWithoutAssets
      ]),
      ignoredAssetsWithoutPaytable: Object.freeze([...this.#validation.ignoredAssetsWithoutPaytable])
    });
  }

  getDisplayableSymbols(): readonly string[] {
    return this.getValidation().displayableSymbols;
  }

  getDefinition(symbol: string): SymbolDefinition {
    const definition = this.#definitionsBySymbol.get(symbol);
    if (!definition) {
      throw new SymbolAssetError(`Symbol "${symbol}" is not displayable by this catalog.`);
    }
    return definition;
  }

  getPaytableEntry(symbol: string): GameConfigPaytableEntry {
    const entry = this.#paytableBySymbol.get(symbol);
    if (!entry) {
      throw new SymbolAssetError(`Symbol "${symbol}" does not exist in paytable.`);
    }
    return entry;
  }

  getAsset(symbol: string): Texture | string {
    return this.getTextureSet(symbol).normal;
  }

  getTextureSet(symbol: string): SymbolTextureSet {
    this.getDefinition(symbol);
    const textureSet = this.#textureSets.get(symbol);
    if (!textureSet) {
      throw new SymbolAssetError(`Symbol "${symbol}" asset is missing.`);
    }
    return cloneTextureSet(textureSet);
  }

  createRenderSymbol(symbol: string, options: CreateCatalogRenderSymbolOptions = {}): RenderSymbol {
    const textureSet = this.getTextureSet(symbol);
    const asset = options.texture ?? textureSet.normal;
    if (typeof asset === "string") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" asset is a URL string; pass a loaded Texture to createRenderSymbol().`
      );
    }
    const stateTextures = options.stateTextures ?? textureSet.states ?? {};
    const loadedStateTextures = assertLoadedStateTextures(symbol, stateTextures);

    return new RenderSymbol({
      definition: this.getDefinition(symbol),
      texture: asset,
      stateTextures: loadedStateTextures,
      requiredStateTextures: this.#requiredStateTextures,
      animationResolver: options.animationResolver ?? this.#animationResolver
    });
  }
}

export function createSymbolCatalog(options: CreateSymbolCatalogOptions): SymbolCatalogModel {
  return new SymbolCatalogModel(options);
}

export function createSymbolAssetMapFromUrls(urlsBySymbol: Record<string, string>): SymbolAssetMap {
  return Object.freeze({ ...urlsBySymbol });
}

function normalizeAssetMap(
  assets: SymbolAssetMap,
  statesById: ReadonlyMap<SymbolStateId, unknown>
): ReadonlyMap<string, NormalizedTextureSet> {
  const entries = Object.entries(assets).map(([symbol, asset]) => [
    symbol,
    normalizeTextureSet(symbol, asset, statesById)
  ] as const);
  return new Map(entries);
}

function normalizeTextureSet(
  symbol: string,
  asset: SymbolAssetMap[string],
  statesById: ReadonlyMap<SymbolStateId, unknown>
): NormalizedTextureSet {
  if (isSymbolTextureSet(asset)) {
    if (asset.normal === undefined || asset.normal === null) {
      throw new SymbolAssetError(`Symbol "${symbol}" texture set must include a normal texture.`);
    }
    return Object.freeze({
      normal: asset.normal,
      states: normalizeTextureStates(symbol, asset.states ?? {}, statesById)
    });
  }

  if (asset === undefined || asset === null) {
    throw new SymbolAssetError(`Symbol "${symbol}" asset must include a normal texture.`);
  }
  return Object.freeze({
    normal: asset,
    states: Object.freeze({})
  });
}

function normalizeTextureStates(
  symbol: string,
  states: Readonly<Partial<Record<SymbolStateId, Texture | string>>>,
  statesById: ReadonlyMap<SymbolStateId, unknown>
): Readonly<Partial<Record<SymbolStateId, Texture | string>>> {
  if (typeof states !== "object" || states === null || Array.isArray(states)) {
    throw new SymbolAssetError(`Symbol "${symbol}" texture states must be an object.`);
  }

  const normalized: Partial<Record<SymbolStateId, Texture | string>> = {};
  for (const [state, texture] of Object.entries(states)) {
    if (!statesById.has(state)) {
      throw new SymbolAssetError(`Symbol "${symbol}" declares texture for unknown state "${state}".`);
    }
    if (texture === undefined || texture === null) {
      throw new SymbolAssetError(`Symbol "${symbol}" texture for state "${state}" must exist.`);
    }
    normalized[state] = texture;
  }

  return Object.freeze(normalized);
}

function normalizeRequiredStateTextures(
  requiredStateTextures: readonly SymbolStateId[],
  statesById: ReadonlyMap<SymbolStateId, unknown>
): readonly SymbolStateId[] {
  const unique: SymbolStateId[] = [];
  for (const state of requiredStateTextures) {
    if (!statesById.has(state)) {
      throw new SymbolAssetError(`Required texture state "${state}" does not exist in state preset.`);
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
  requiredStateTextures: readonly SymbolStateId[]
): void {
  for (const state of requiredStateTextures) {
    if (!textureSet.states?.[state]) {
      throw new SymbolAssetError(`Symbol "${symbol}" is missing required texture for state "${state}".`);
    }
  }
}

function assertLoadedStateTextures(
  symbol: string,
  states: Readonly<Partial<Record<SymbolStateId, Texture | string>>>
): Readonly<Partial<Record<SymbolStateId, Texture>>> {
  const loaded: Partial<Record<SymbolStateId, Texture>> = {};
  for (const [state, texture] of Object.entries(states)) {
    if (typeof texture === "string") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" texture for state "${state}" is not loaded; pass a loaded Texture.`
      );
    }
    if (texture !== undefined) {
      loaded[state] = texture;
    }
  }
  return Object.freeze(loaded);
}

function cloneTextureSet(textureSet: NormalizedTextureSet): SymbolTextureSet {
  return Object.freeze({
    normal: textureSet.normal,
    states: Object.freeze({ ...(textureSet.states ?? {}) })
  });
}

function isSymbolTextureSet(asset: SymbolAssetMap[string]): asset is SymbolTextureSet {
  return typeof asset === "object" && asset !== null && "normal" in asset;
}

function extractPaytableEntries(gameConfig: LogicGameConfig): readonly GameConfigPaytableEntry[] {
  const rawConfig = gameConfig.getRawConfig();
  const rawConfigRecord = assertRecord(rawConfig, "gameConfig");
  const paytableRecord = assertRecord(rawConfigRecord.paytable, "gameConfig.paytable");

  return Object.freeze(
    Object.keys(paytableRecord)
      .map((codeKey) => Number.parseInt(codeKey, 10))
      .sort((left, right) => left - right)
      .map((code) => {
        const entry = gameConfig.getPaytableEntry(code);
        if (!entry) {
          throw new SymbolAssetError(`Paytable entry code ${code} was not accepted by gameConfig.`);
        }
        return Object.freeze({
          code: entry.code,
          symbol: entry.symbol,
          pays: Object.freeze([...entry.pays])
        });
      })
  );
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SymbolAssetError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
