import { createGameConfig } from "@slotclientengine/logiccore";
import {
  createDefaultSymbolStatePreset,
  createSymbolCatalog,
  type SymbolAssetMap,
  type SymbolAssetInput,
  type SymbolCatalogModel,
  type SymbolLayerTextureSource,
  type SymbolNormalTextureSource
} from "@slotclientengine/rendercore";

export const SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES = ["spinBlur", "disabled"] as const;

type ParsedManifestNormal = string | ParsedLayeredManifestNormal;

interface ParsedLayeredManifestNormal {
  readonly kind: "layered";
  readonly layers: readonly string[];
}

type ParsedManifestSymbol = {
  readonly normal: ParsedManifestNormal;
} & Record<string, string | ParsedManifestNormal>;

export function createSymbolAssetMapFromModules(modules: Record<string, string>): SymbolAssetMap {
  const { normalAssets } = splitSymbolPngModules(modules, []);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(normalAssets).map(([symbol, url]) => [symbol, url])
    )
  );
}

export function createStatefulSymbolAssetMapFromModules(options: {
  readonly modules: Record<string, string>;
  readonly manifest: unknown;
  readonly requiredStates: readonly string[];
}): SymbolAssetMap {
  const requiredStates = Object.freeze([...options.requiredStates]);
  const { normalAssets, stateAssets, assetsByFileName } = splitSymbolPngModules(
    options.modules,
    requiredStates
  );
  const manifest = parseStateTextureManifest(options.manifest, requiredStates);
  const assets: Record<string, SymbolAssetInput> = {};

  for (const [symbol, manifestSymbol] of Object.entries(manifest.symbols)) {
    const normal = createNormalAssetFromManifest(symbol, manifestSymbol.normal, {
      normalAssets,
      assetsByFileName
    });
    for (const state of requiredStates) {
      const stateFileName = `${symbol}.${state}.png`;
      const manifestStatePath = assertString(manifestSymbol[state], `symbol "${symbol}" ${state} texture`);
      if (getFileNameFromManifestPath(manifestStatePath) !== stateFileName) {
        throw new Error(`Symbol "${symbol}" manifest texture for state "${state}" must be "./${stateFileName}".`);
      }
      if (!stateAssets[symbol]?.[state]) {
        throw new Error(`Symbol "${symbol}" is missing required state texture file "${stateFileName}".`);
      }
    }
    assets[symbol] = Object.freeze({
      normal,
      states: Object.freeze(
        Object.fromEntries(requiredStates.map((state) => [state, stateAssets[symbol]?.[state] as string]))
      )
    });
  }

  for (const [symbol, normal] of Object.entries(normalAssets)) {
    if (!manifest.symbols[symbol]) {
      assets[symbol] = Object.freeze({
        normal,
        states: Object.freeze({})
      });
    }
  }

  return Object.freeze(assets);
}

export function createSymbolsViewerCatalog(
  rawGameConfig: unknown,
  symbolAssets: SymbolAssetMap,
  requiredStateTextures: readonly string[] = SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES
): SymbolCatalogModel {
  return createSymbolCatalog({
    gameConfig: createGameConfig(rawGameConfig),
    assets: symbolAssets,
    statePreset: createDefaultSymbolStatePreset(),
    texturePolicy: {
      requiredStateTextures
    }
  });
}

export function getSymbolNameFromPath(modulePath: string): string {
  const filename = modulePath.split("/").at(-1);
  if (!filename) {
    throw new Error(`Cannot extract symbol name from path "${modulePath}".`);
  }

  const extensionIndex = filename.lastIndexOf(".");
  return extensionIndex === -1 ? filename : filename.slice(0, extensionIndex);
}

function splitSymbolPngModules(
  modules: Record<string, string>,
  allowedStates: readonly string[]
): {
  readonly normalAssets: Record<string, string>;
  readonly stateAssets: Record<string, Record<string, string>>;
  readonly assetsByFileName: Record<string, string>;
} {
  const normalAssets: Record<string, string> = {};
  const stateAssets: Record<string, Record<string, string>> = {};
  const assetsByFileName: Record<string, string> = {};
  const allowedStateSet = new Set(allowedStates);

  for (const [modulePath, url] of Object.entries(modules)) {
    const filename = getFileNameFromPath(modulePath);
    if (!filename.endsWith(".png")) {
      continue;
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
        throw new Error(`Symbol "${symbol}" declares texture for unknown state "${state}".`);
      }
      stateAssets[symbol] = stateAssets[symbol] ?? {};
      stateAssets[symbol][state] = url;
      continue;
    }

    throw new Error(`Cannot parse symbol texture filename "${filename}".`);
  }

  return {
    normalAssets,
    stateAssets,
    assetsByFileName
  };
}

function parseStateTextureManifest(
  manifest: unknown,
  requiredStates: readonly string[]
): {
  readonly version: 1;
  readonly states: readonly string[];
  readonly symbols: Record<string, ParsedManifestSymbol>;
} {
  const manifestRecord = assertRecord(manifest, "symbol state texture manifest");
  if (manifestRecord.version !== 1) {
    throw new Error("Symbol state texture manifest version must be 1.");
  }

  if (!Array.isArray(manifestRecord.states)) {
    throw new Error("Symbol state texture manifest states must be an array.");
  }
  const states = manifestRecord.states.map((state) => assertString(state, "manifest state"));
  const requiredStateSet = new Set(requiredStates);
  for (const state of requiredStates) {
    if (!states.includes(state)) {
      throw new Error(`Symbol state texture manifest is missing required state "${state}".`);
    }
  }
  for (const state of states) {
    if (!requiredStateSet.has(state)) {
      throw new Error(`Symbol state texture manifest declares unknown state "${state}".`);
    }
  }

  const rawSymbols = assertRecord(manifestRecord.symbols, "symbol state texture manifest symbols");
  const symbols: Record<string, ParsedManifestSymbol> = {};
  for (const [symbol, rawSymbol] of Object.entries(rawSymbols)) {
    const rawSymbolRecord = assertRecord(rawSymbol, `symbol state texture manifest symbol "${symbol}"`);
    for (const key of Object.keys(rawSymbolRecord)) {
      if (key !== "normal" && !requiredStateSet.has(key)) {
        throw new Error(`Symbol "${symbol}" manifest declares unknown state "${key}".`);
      }
    }
    const parsedSymbol: ParsedManifestSymbol = {
      normal: parseManifestNormal(rawSymbolRecord.normal, symbol)
    };
    for (const state of requiredStates) {
      parsedSymbol[state] = assertString(rawSymbolRecord[state], `symbol "${symbol}" ${state} texture`);
    }
    symbols[symbol] = parsedSymbol;
  }

  return {
    version: 1,
    states,
    symbols
  };
}

function createNormalAssetFromManifest(
  symbol: string,
  normal: ParsedManifestNormal,
  sources: {
    readonly normalAssets: Record<string, string>;
    readonly assetsByFileName: Record<string, string>;
  }
): string | SymbolNormalTextureSource<string> {
  if (typeof normal === "string") {
    const normalFileName = `${symbol}.png`;
    if (getFileNameFromManifestPath(normal) !== normalFileName) {
      throw new Error(`Symbol "${symbol}" manifest normal texture must be "./${normalFileName}".`);
    }
    const asset = sources.normalAssets[symbol];
    if (!asset) {
      throw new Error(`Symbol state texture manifest references missing normal texture "${symbol}".`);
    }
    return asset;
  }

  const layers = normal.layers.map((layerPath) =>
    createLayerAssetFromManifestPath(symbol, layerPath, sources.assetsByFileName)
  );
  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(layers)
  });
}

function createLayerAssetFromManifestPath(
  symbol: string,
  layerPath: string,
  assetsByFileName: Record<string, string>
): SymbolLayerTextureSource<string> {
  const fileName = getFileNameFromManifestPath(layerPath);
  const match = fileName.match(/^(.+)-(\d+)\.png$/u);
  if (!match || match[1] !== symbol) {
    throw new Error(`Symbol "${symbol}" manifest layer file "${fileName}" must match ${symbol}-{index}.png.`);
  }
  const texture = assetsByFileName[fileName];
  if (!texture) {
    throw new Error(`Symbol "${symbol}" is missing layered texture file "${fileName}".`);
  }
  return Object.freeze({
    index: Number.parseInt(match[2], 10),
    texture
  });
}

function parseManifestNormal(normal: unknown, symbol: string): ParsedManifestNormal {
  if (typeof normal === "string" && normal.length > 0) {
    return normal;
  }
  const record = assertRecord(normal, `symbol "${symbol}" normal texture`);
  if (record.kind !== "layered") {
    throw new Error(`Symbol "${symbol}" manifest normal texture kind must be "layered".`);
  }
  if (!Array.isArray(record.layers) || record.layers.length === 0) {
    throw new Error(`Symbol "${symbol}" manifest layered normal must include layers.`);
  }
  const layers = record.layers.map((layerPath) =>
    assertString(layerPath, `symbol "${symbol}" manifest layer texture`)
  );
  assertConsecutiveLayerPaths(symbol, layers);
  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(layers)
  });
}

function assertConsecutiveLayerPaths(symbol: string, layers: readonly string[]): void {
  const indexes = layers.map((layerPath) => {
    const fileName = getFileNameFromManifestPath(layerPath);
    const match = fileName.match(/^(.+)-(\d+)\.png$/u);
    if (!match || match[1] !== symbol) {
      throw new Error(`Symbol "${symbol}" manifest layer file "${fileName}" must match ${symbol}-{index}.png.`);
    }
    return Number.parseInt(match[2], 10);
  });
  const sorted = [...indexes].sort((left, right) => left - right);
  for (const [expectedIndex, index] of sorted.entries()) {
    if (index !== expectedIndex) {
      throw new Error(`Symbol "${symbol}" manifest layered normal must use consecutive indexes from 0.`);
    }
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function getFileNameFromPath(modulePath: string): string {
  const filename = modulePath.split("/").at(-1);
  if (!filename) {
    throw new Error(`Cannot extract file name from path "${modulePath}".`);
  }
  return filename;
}

function getFileNameFromManifestPath(manifestPath: string): string {
  const filename = manifestPath.split("/").at(-1);
  if (!filename) {
    throw new Error(`Cannot extract file name from manifest path "${manifestPath}".`);
  }
  return filename;
}

function isLayerFileStem(stem: string): boolean {
  return /-\d+$/u.test(stem);
}
