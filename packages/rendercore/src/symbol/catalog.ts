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
  SymbolStatePreset
} from "./types.js";

export class SymbolCatalogModel implements SymbolCatalog {
  readonly #definitionsBySymbol: ReadonlyMap<string, SymbolDefinition>;
  readonly #paytableBySymbol: ReadonlyMap<string, GameConfigPaytableEntry>;
  readonly #assets: SymbolAssetMap;
  readonly #validation: SymbolCatalogValidation;
  readonly #animationResolver: SymbolAnimationResolver;

  constructor(options: CreateSymbolCatalogOptions) {
    const statePreset = options.statePreset ?? createDefaultSymbolStatePreset();
    validateSymbolStatePreset(statePreset);
    const paytableEntries = extractPaytableEntries(options.gameConfig);
    const assetSymbols = Object.keys(options.assets).sort();
    const assetSymbolSet = new Set(assetSymbols);
    const paytableSymbolSet = new Set(paytableEntries.map((entry) => entry.symbol));
    const displayableEntries = paytableEntries.filter((entry) => assetSymbolSet.has(entry.symbol));
    const ignoredPaytableSymbolsWithoutAssets = paytableEntries
      .filter((entry) => !assetSymbolSet.has(entry.symbol))
      .map((entry) => entry.symbol);
    const ignoredAssetsWithoutPaytable = assetSymbols.filter((symbol) => !paytableSymbolSet.has(symbol));

    this.#assets = Object.freeze({ ...options.assets });
    this.#animationResolver = options.animationResolver ?? createDefaultSymbolAnimationResolver();
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
    this.getDefinition(symbol);
    return this.#assets[symbol];
  }

  createRenderSymbol(symbol: string, options: CreateCatalogRenderSymbolOptions = {}): RenderSymbol {
    const asset = options.texture ?? this.getAsset(symbol);
    if (typeof asset === "string") {
      throw new SymbolAssetError(
        `Symbol "${symbol}" asset is a URL string; pass a loaded Texture to createRenderSymbol().`
      );
    }

    return new RenderSymbol({
      definition: this.getDefinition(symbol),
      texture: asset,
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
