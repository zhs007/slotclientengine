import type { GameConfigPaytableEntry, LogicGameConfig } from "@slotclientengine/logiccore";
import type { Texture } from "pixi.js";
import { RenderSymbol } from "../symbol/render-symbol.js";
import {
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createSymbolDefinitionFromPreset,
  validateSymbolStatePreset
} from "../symbol/index.js";
import type {
  SymbolAnimationResolver,
  SymbolAssetMap,
  SymbolDefinition,
  SymbolStateId,
  SymbolTextureSet
} from "../symbol/index.js";
import { ReelAssetError } from "./errors.js";
import type {
  ReelCellSize,
  ReelSymbolRegistry,
  ReelSymbolRegistryEntry,
  ReelSymbolRegistryOptions,
  ReelSymbolRegistryValidation
} from "./types.js";

type NormalizedTextureSet = SymbolTextureSet<Texture>;

export class ReelSymbolRegistryModel implements ReelSymbolRegistry {
  readonly #entriesByCode: ReadonlyMap<number, ReelSymbolRegistryEntry>;
  readonly #entriesBySymbol: ReadonlyMap<string, ReelSymbolRegistryEntry>;
  readonly #definitionsByCode: ReadonlyMap<number, SymbolDefinition>;
  readonly #textureSetsByCode: ReadonlyMap<number, NormalizedTextureSet>;
  readonly #validation: ReelSymbolRegistryValidation;
  readonly #cellSize: ReelCellSize;
  readonly #animationResolver: SymbolAnimationResolver;
  readonly #requiredStateTextures: readonly SymbolStateId[];

  constructor(options: ReelSymbolRegistryOptions) {
    const statePreset = options.statePreset ?? createDefaultSymbolStatePreset();
    const validatedPreset = validateSymbolStatePreset(statePreset);
    const requiredStateTextures = normalizeRequiredStateTextures(
      options.texturePolicy?.requiredStateTextures ?? [],
      validatedPreset.statesById
    );
    const animationResolver = options.animationResolver ?? createDefaultSymbolAnimationResolver();
    const configuredEmptySymbolSet = new Set(options.emptySymbols ?? []);
    const paytableEntries = extractPaytableEntries(options.gameConfig);
    const paytableSymbolSet = new Set(paytableEntries.map((entry) => entry.symbol));
    const assetSymbols = Object.keys(options.assets).sort();
    const assetSymbolSet = new Set(assetSymbols);

    const entriesByCode = new Map<number, ReelSymbolRegistryEntry>();
    const entriesBySymbol = new Map<string, ReelSymbolRegistryEntry>();
    const definitionsByCode = new Map<number, SymbolDefinition>();
    const textureSetsByCode = new Map<number, NormalizedTextureSet>();
    const texturedSymbols: string[] = [];
    const configuredEmptySymbolsWithAssets: string[] = [];
    const missingAssetEmptySymbols: string[] = [];

    for (const emptySymbol of configuredEmptySymbolSet) {
      if (!paytableSymbolSet.has(emptySymbol)) {
        throw new ReelAssetError(`Configured empty symbol "${emptySymbol}" does not exist in paytable.`);
      }
    }

    for (const entry of paytableEntries) {
      if (configuredEmptySymbolSet.has(entry.symbol)) {
        if (assetSymbolSet.has(entry.symbol)) {
          configuredEmptySymbolsWithAssets.push(entry.symbol);
        }
        this.addEntry(entriesByCode, entriesBySymbol, entry, "empty");
        continue;
      }

      if (!assetSymbolSet.has(entry.symbol)) {
        missingAssetEmptySymbols.push(entry.symbol);
        this.addEntry(entriesByCode, entriesBySymbol, entry, "empty");
        continue;
      }

      const textureSet = normalizeTextureSet(entry.symbol, options.assets[entry.symbol]);
      assertRequiredStateTextures(entry.symbol, textureSet, requiredStateTextures);
      this.addEntry(entriesByCode, entriesBySymbol, entry, "textured");
      definitionsByCode.set(
        entry.code,
        createSymbolDefinitionFromPreset({
          code: entry.code,
          symbol: entry.symbol,
          pays: entry.pays,
          preset: statePreset
        })
      );
      textureSetsByCode.set(entry.code, textureSet);
      texturedSymbols.push(entry.symbol);
    }

    if (texturedSymbols.length === 0) {
      throw new ReelAssetError("Reel symbol registry requires at least one textured symbol.");
    }

    const ignoredAssetsWithoutPaytable = assetSymbols.filter((symbol) => !paytableSymbolSet.has(symbol));
    this.#entriesByCode = entriesByCode;
    this.#entriesBySymbol = entriesBySymbol;
    this.#definitionsByCode = definitionsByCode;
    this.#textureSetsByCode = textureSetsByCode;
    this.#animationResolver = animationResolver;
    this.#requiredStateTextures = requiredStateTextures;
    this.#cellSize = calculateCellSize([...textureSetsByCode.values()]);
    this.#validation = Object.freeze({
      texturedSymbols: Object.freeze(texturedSymbols),
      configuredEmptySymbols: Object.freeze([...configuredEmptySymbolSet]),
      configuredEmptySymbolsWithAssets: Object.freeze(configuredEmptySymbolsWithAssets),
      missingAssetEmptySymbols: Object.freeze(missingAssetEmptySymbols),
      ignoredAssetsWithoutPaytable: Object.freeze(ignoredAssetsWithoutPaytable)
    });
  }

  getValidation(): ReelSymbolRegistryValidation {
    return Object.freeze({
      texturedSymbols: Object.freeze([...this.#validation.texturedSymbols]),
      configuredEmptySymbols: Object.freeze([...this.#validation.configuredEmptySymbols]),
      configuredEmptySymbolsWithAssets: Object.freeze([
        ...this.#validation.configuredEmptySymbolsWithAssets
      ]),
      missingAssetEmptySymbols: Object.freeze([...this.#validation.missingAssetEmptySymbols]),
      ignoredAssetsWithoutPaytable: Object.freeze([...this.#validation.ignoredAssetsWithoutPaytable])
    });
  }

  getEntryByCode(code: number): ReelSymbolRegistryEntry {
    const entry = this.#entriesByCode.get(code);
    if (!entry) {
      throw new ReelAssetError(`Symbol code ${code} does not exist in reel registry.`);
    }
    return entry;
  }

  getEntryBySymbol(symbol: string): ReelSymbolRegistryEntry {
    const entry = this.#entriesBySymbol.get(symbol);
    if (!entry) {
      throw new ReelAssetError(`Symbol "${symbol}" does not exist in reel registry.`);
    }
    return entry;
  }

  getCellSize(): ReelCellSize {
    return Object.freeze({ ...this.#cellSize });
  }

  createRenderSymbolByCode(code: number): RenderSymbol | null {
    const entry = this.getEntryByCode(code);
    if (entry.kind === "empty") {
      return null;
    }

    const definition = this.#definitionsByCode.get(code);
    const textureSet = this.#textureSetsByCode.get(code);
    if (!definition || !textureSet) {
      throw new ReelAssetError(`Textured symbol code ${code} is missing render assets.`);
    }

    return new RenderSymbol({
      definition,
      texture: textureSet.normal,
      stateTextures: textureSet.states,
      requiredStateTextures: this.#requiredStateTextures,
      animationResolver: this.#animationResolver
    });
  }

  private addEntry(
    entriesByCode: Map<number, ReelSymbolRegistryEntry>,
    entriesBySymbol: Map<string, ReelSymbolRegistryEntry>,
    entry: GameConfigPaytableEntry,
    kind: ReelSymbolRegistryEntry["kind"]
  ): void {
    const registryEntry = Object.freeze({
      code: entry.code,
      symbol: entry.symbol,
      kind
    });
    entriesByCode.set(entry.code, registryEntry);
    entriesBySymbol.set(entry.symbol, registryEntry);
  }
}

export function createReelSymbolRegistry(
  options: ReelSymbolRegistryOptions
): ReelSymbolRegistryModel {
  return new ReelSymbolRegistryModel(options);
}

function normalizeTextureSet(symbol: string, asset: SymbolAssetMap[string]): NormalizedTextureSet {
  if (asset === undefined || asset === null) {
    throw new ReelAssetError(`Symbol "${symbol}" asset must include a normal texture.`);
  }

  if (isSymbolTextureSet(asset)) {
    return Object.freeze({
      normal: assertLoadedTexture(symbol, "normal", asset.normal),
      states: normalizeTextureStates(symbol, asset.states ?? {})
    });
  }

  return Object.freeze({
    normal: assertLoadedTexture(symbol, "normal", asset),
    states: Object.freeze({})
  });
}

function normalizeTextureStates(
  symbol: string,
  states: Readonly<Partial<Record<string, Texture | string>>>
): Readonly<Partial<Record<SymbolStateId, Texture>>> {
  const normalized: Partial<Record<SymbolStateId, Texture>> = {};
  for (const [state, texture] of Object.entries(states)) {
    if (texture === undefined) {
      throw new ReelAssetError(`Symbol "${symbol}" texture for state "${state}" must exist.`);
    }
    normalized[state] = assertLoadedTexture(symbol, state, texture);
  }
  return Object.freeze(normalized);
}

function assertLoadedTexture(symbol: string, state: string, texture: Texture | string): Texture {
  if (typeof texture === "string") {
    throw new ReelAssetError(
      `Symbol "${symbol}" texture for state "${state}" is a URL string; pass a loaded Texture.`
    );
  }
  if (!texture || typeof texture !== "object") {
    throw new ReelAssetError(`Symbol "${symbol}" texture for state "${state}" must exist.`);
  }
  const width = getTextureWidth(texture);
  const height = getTextureHeight(texture);
  if (width <= 0 || height <= 0) {
    throw new ReelAssetError(
      `Symbol "${symbol}" texture for state "${state}" must have positive dimensions.`
    );
  }
  return texture;
}

function assertRequiredStateTextures(
  symbol: string,
  textureSet: NormalizedTextureSet,
  requiredStateTextures: readonly SymbolStateId[]
): void {
  for (const state of requiredStateTextures) {
    if (!textureSet.states?.[state]) {
      throw new ReelAssetError(`Symbol "${symbol}" is missing required texture for state "${state}".`);
    }
  }
}

function calculateCellSize(textureSets: readonly NormalizedTextureSet[]): ReelCellSize {
  let width = 0;
  let height = 0;
  for (const textureSet of textureSets) {
    width = Math.max(width, getTextureWidth(textureSet.normal));
    height = Math.max(height, getTextureHeight(textureSet.normal));
  }

  if (width <= 0 || height <= 0) {
    throw new ReelAssetError("Reel symbol registry cannot calculate cell size without textures.");
  }

  return Object.freeze({ width, height });
}

function getTextureWidth(texture: Texture): number {
  return Math.max(0, texture.width || texture.source?.width || texture.orig?.width || 0);
}

function getTextureHeight(texture: Texture): number {
  return Math.max(0, texture.height || texture.source?.height || texture.orig?.height || 0);
}

function isSymbolTextureSet(asset: SymbolAssetMap[string]): asset is SymbolTextureSet<Texture | string> {
  return typeof asset === "object" && asset !== null && "normal" in asset;
}

function normalizeRequiredStateTextures(
  requiredStateTextures: readonly SymbolStateId[],
  statesById: ReadonlyMap<SymbolStateId, unknown>
): readonly SymbolStateId[] {
  const unique: SymbolStateId[] = [];
  for (const state of requiredStateTextures) {
    if (!statesById.has(state)) {
      throw new ReelAssetError(`Required texture state "${state}" does not exist in state preset.`);
    }
    if (!unique.includes(state)) {
      unique.push(state);
    }
  }
  return Object.freeze(unique);
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
          throw new ReelAssetError(`Paytable entry code ${code} was not accepted by gameConfig.`);
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
    throw new ReelAssetError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
