import type {
  GameConfigPaytableEntry,
  LogicGameConfig,
} from "@slotclientengine/logiccore";
import { SymbolAssetError } from "./errors.js";
import { SymbolCatalogModel } from "./catalog.js";
import type {
  CreateCatalogRenderSymbolOptions,
  CreateStandaloneSymbolCatalogOptions,
  StandaloneSymbolCatalog,
} from "./types.js";

export function createStandaloneSymbolCatalog(
  options: CreateStandaloneSymbolCatalogOptions,
): StandaloneSymbolCatalog {
  const displaySymbols = normalizeDisplaySymbols(options.displaySymbols);
  const assetSymbolSet = new Set(Object.keys(options.assets));
  for (const symbol of displaySymbols) {
    if (!assetSymbolSet.has(symbol)) {
      throw new SymbolAssetError(
        `Standalone symbol catalog is missing asset for "${symbol}".`,
      );
    }
  }
  const symbolScales = normalizeSymbolScales(
    options.symbolScales ?? {},
    new Set(displaySymbols),
  );
  const symbolRenderPriorities = normalizeSymbolRenderPriorities(
    options.symbolRenderPriorities ?? {},
    new Set(displaySymbols),
  );
  const base = new SymbolCatalogModel({
    gameConfig: createStandaloneGameConfig(displaySymbols),
    assets: options.assets,
    symbolRenderPriorities: options.symbolRenderPriorities,
    statePreset: options.statePreset,
    animationResolver: options.animationResolver,
    texturePolicy: options.texturePolicy,
    symbolAnimationCapabilities: options.symbolAnimationCapabilities,
  });
  for (const symbol of displaySymbols) {
    base.getDefinition(symbol);
  }

  return Object.freeze({
    getValidation: () => base.getValidation(),
    getDisplayableSymbols: () => base.getDisplayableSymbols(),
    getDefinition: (symbol: string) => base.getDefinition(symbol),
    getPaytableEntry: (symbol: string) => base.getPaytableEntry(symbol),
    getAsset: (symbol: string) => base.getAsset(symbol),
    getTextureSet: (symbol: string) => base.getTextureSet(symbol),
    getNormalTextureSource: (symbol: string) =>
      base.getNormalTextureSource(symbol),
    createRenderSymbol: (
      symbol: string,
      renderOptions: CreateCatalogRenderSymbolOptions = {},
    ) => {
      const renderSymbol = base.createRenderSymbol(symbol, {
        ...renderOptions,
        renderPriority:
          renderOptions.renderPriority ??
          symbolRenderPriorities.get(symbol) ??
          0,
      });
      renderSymbol.scale.set(symbolScales.get(symbol) ?? 1);
      return renderSymbol;
    },
  });
}

function normalizeDisplaySymbols(
  displaySymbols: readonly string[],
): readonly string[] {
  if (!Array.isArray(displaySymbols) || displaySymbols.length === 0) {
    throw new SymbolAssetError(
      "Standalone symbol catalog displaySymbols must be a non-empty array.",
    );
  }
  const seen = new Set<string>();
  return Object.freeze(
    displaySymbols.map((symbol, index) => {
      if (typeof symbol !== "string" || symbol.trim().length === 0) {
        throw new SymbolAssetError(
          `Standalone symbol catalog displaySymbols[${index}] must be a non-empty string.`,
        );
      }
      if (seen.has(symbol)) {
        throw new SymbolAssetError(
          `Standalone symbol catalog displaySymbols must not contain duplicate "${symbol}".`,
        );
      }
      seen.add(symbol);
      return symbol;
    }),
  );
}

function normalizeSymbolScales(
  symbolScales: Readonly<Record<string, number>>,
  displaySymbolSet: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const normalized = new Map<string, number>();
  for (const [symbol, scale] of Object.entries(symbolScales)) {
    if (!displaySymbolSet.has(symbol)) {
      throw new SymbolAssetError(
        `Standalone symbol scale for "${symbol}" does not exist in displaySymbols.`,
      );
    }
    if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
      throw new SymbolAssetError(
        `Standalone symbol "${symbol}" scale must be a finite positive number.`,
      );
    }
    normalized.set(symbol, scale);
  }
  return normalized;
}

function normalizeSymbolRenderPriorities(
  symbolRenderPriorities: Readonly<Record<string, number>>,
  displaySymbolSet: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const normalized = new Map<string, number>();
  for (const [symbol, renderPriority] of Object.entries(
    symbolRenderPriorities,
  )) {
    if (!displaySymbolSet.has(symbol)) {
      throw new SymbolAssetError(
        `Standalone symbol renderPriority for "${symbol}" does not exist in displaySymbols.`,
      );
    }
    if (
      typeof renderPriority !== "number" ||
      !Number.isSafeInteger(renderPriority) ||
      renderPriority < 0
    ) {
      throw new SymbolAssetError(
        `Standalone symbol "${symbol}" renderPriority must be a non-negative safe integer.`,
      );
    }
    normalized.set(symbol, renderPriority);
  }
  return normalized;
}

function createStandaloneGameConfig(
  displaySymbols: readonly string[],
): LogicGameConfig {
  const paytableEntries = displaySymbols.map((symbol, index) =>
    Object.freeze({
      code: index,
      symbol,
      pays: Object.freeze([]),
    }),
  );
  const paytableByCode = new Map(
    paytableEntries.map((entry) => [entry.code, entry]),
  );
  const symbolCodes: Readonly<Record<string, number>> = Object.freeze(
    Object.fromEntries(
      paytableEntries.map((entry) => [entry.symbol, entry.code]),
    ),
  );
  const rawConfig = Object.freeze({
    paytable: Object.freeze(
      Object.fromEntries(
        paytableEntries.map((entry) => [
          String(entry.code),
          Object.freeze({
            code: entry.code,
            symbol: entry.symbol,
            pays: entry.pays,
          }),
        ]),
      ),
    ),
    symbolCodes,
    reels: Object.freeze({}),
  });

  return Object.freeze({
    getRawConfig: () => rawConfig,
    getPaytableEntry: (code: number): GameConfigPaytableEntry | undefined =>
      paytableByCode.get(code),
    getSymbolCode: (symbol: string): number | undefined => symbolCodes[symbol],
    getReelNames: () => Object.freeze([]),
    getNumberWeightTableNames: () => Object.freeze([]),
    getNumberWeightTable: (name: string) => {
      throw new RangeError(
        `Standalone symbol catalog does not provide number weight table "${name}".`,
      );
    },
    getReels: () => {
      throw new SymbolAssetError(
        "Standalone symbol catalog does not provide reels.",
      );
    },
    getStopYCoordinates: () => {
      throw new SymbolAssetError(
        "Standalone symbol catalog does not provide reel stops.",
      );
    },
    getSpinStartYCoordinates: () => {
      throw new SymbolAssetError(
        "Standalone symbol catalog does not provide spin starts.",
      );
    },
  });
}
