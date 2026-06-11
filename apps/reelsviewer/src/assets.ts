import { Assets, type Texture } from "pixi.js";
import type {
  SymbolAssetInput,
  SymbolAssetMap,
  SymbolLayerTextureSource,
  SymbolNormalTextureSource,
  SymbolTextureSet
} from "@slotclientengine/rendercore";

type ParsedManifestNormal = string | ParsedLayeredManifestNormal;

interface ParsedLayeredManifestNormal {
  readonly kind: "layered";
  readonly layers: readonly ParsedManifestLayer[];
}

interface ParsedManifestLayer {
  readonly index: number;
  readonly texture: string;
  readonly keyframes: readonly string[];
}

type ParsedManifestSymbol = {
  readonly normal: ParsedManifestNormal;
} & Record<string, string | ParsedManifestNormal>;

export function createStatefulReelAssetMapFromModules(options: {
  readonly modules: Record<string, string>;
  readonly manifest: unknown;
  readonly requiredStates: readonly string[];
}): SymbolAssetMap {
  const requiredStates = Object.freeze([...options.requiredStates]);
  const manifest = parseStateTextureManifest(options.manifest, requiredStates);
  const { normalAssets, stateAssets, assetsByFileName } = splitSymbolPngModules(
    options.modules,
    manifest.states
  );
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

export async function loadReelSymbolTextures(assetUrls: SymbolAssetMap): Promise<SymbolAssetMap> {
  const entries = await Promise.all(
    Object.entries(assetUrls).map(async ([symbol, asset]) => [
      symbol,
      await loadSymbolAssetInput(asset)
    ] as const)
  );

  return Object.freeze(Object.fromEntries(entries));
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
  for (const state of requiredStates) {
    if (!states.includes(state)) {
      throw new Error(`Symbol state texture manifest is missing required state "${state}".`);
    }
  }

  const rawSymbols = assertRecord(manifestRecord.symbols, "symbol state texture manifest symbols");
  const symbols: Record<string, ParsedManifestSymbol> = {};
  for (const [symbol, rawSymbol] of Object.entries(rawSymbols)) {
    const rawSymbolRecord = assertRecord(rawSymbol, `symbol state texture manifest symbol "${symbol}"`);
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

  const layers = normal.layers.map((layer) =>
    createLayerAssetFromManifestLayer(symbol, layer, sources.assetsByFileName)
  );
  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(layers)
  });
}

function createLayerAssetFromManifestLayer(
  symbol: string,
  layer: ParsedManifestLayer,
  assetsByFileName: Record<string, string>
): SymbolLayerTextureSource<string> {
  const fileName = getFileNameFromManifestPath(layer.texture);
  const texture = assetsByFileName[fileName];
  if (!texture) {
    throw new Error(`Symbol "${symbol}" is missing layered texture file "${fileName}".`);
  }
  const keyframes = layer.keyframes.map((keyframePath) => {
    const keyframeFileName = getFileNameFromManifestPath(keyframePath);
    const keyframe = assetsByFileName[keyframeFileName];
    if (!keyframe) {
      throw new Error(`Symbol "${symbol}" is missing layer ${layer.index} keyframe file "${keyframeFileName}".`);
    }
    return keyframe;
  });
  return Object.freeze({
    index: layer.index,
    texture,
    ...(keyframes.length > 0 ? { keyframes: Object.freeze(keyframes) } : {})
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
  const layers = record.layers.map((layer) => parseManifestLayer(symbol, layer));
  assertConsecutiveManifestLayers(symbol, layers);
  return Object.freeze({
    kind: "layered",
    layers: Object.freeze(layers)
  });
}

function parseManifestLayer(symbol: string, layer: unknown): ParsedManifestLayer {
  if (typeof layer === "string") {
    const fileName = getFileNameFromManifestPath(layer);
    const match = fileName.match(/^(.+)-(\d+)\.png$/u);
    if (!match || match[1] !== symbol) {
      throw new Error(`Symbol "${symbol}" manifest layer file "${fileName}" must match ${symbol}-{index}.png.`);
    }
    return Object.freeze({
      index: Number.parseInt(match[2], 10),
      texture: layer,
      keyframes: Object.freeze([])
    });
  }

  const record = assertRecord(layer, `symbol "${symbol}" manifest layer`);
  const index = record.index;
  if (!Number.isInteger(index) || (index as number) < 0) {
    throw new Error(`Symbol "${symbol}" manifest layer index must be a non-negative integer.`);
  }
  const layerIndex = index as number;
  const texture = assertString(record.texture, `symbol "${symbol}" manifest layer ${layerIndex} texture`);
  const keyframes =
    record.keyframes === undefined
      ? []
      : parseManifestLayerKeyframes(symbol, layerIndex, texture, record.keyframes);

  return Object.freeze({
    index: layerIndex,
    texture,
    keyframes: Object.freeze(keyframes)
  });
}

function parseManifestLayerKeyframes(
  symbol: string,
  index: number,
  texture: string,
  keyframes: unknown
): readonly string[] {
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    throw new Error(`Symbol "${symbol}" manifest layer ${index} keyframes must be a non-empty array.`);
  }
  const parsed = keyframes.map((keyframe) =>
    assertString(keyframe, `symbol "${symbol}" manifest layer ${index} keyframe`)
  );
  if (parsed[0] !== texture) {
    throw new Error(`Symbol "${symbol}" manifest layer ${index} keyframes must start with the layer texture.`);
  }
  return Object.freeze(parsed);
}

function assertConsecutiveManifestLayers(symbol: string, layers: readonly ParsedManifestLayer[]): void {
  const sorted = [...layers].sort((left, right) => left.index - right.index);
  for (const [expectedIndex, layer] of sorted.entries()) {
    if (layer.index !== expectedIndex) {
      throw new Error(`Symbol "${symbol}" manifest layered normal must use consecutive indexes from 0.`);
    }
  }
}

async function loadSymbolAssetInput(asset: SymbolAssetInput): Promise<SymbolAssetInput> {
  if (typeof asset === "string") {
    return Assets.load<Texture>(asset);
  }

  if (isSymbolTextureSet(asset)) {
    const stateEntries = await Promise.all(
      Object.entries(asset.states ?? {}).map(async ([state, stateAsset]) => [
        state,
        await loadAssetTexture(stateAsset as Texture | string)
      ] as const)
    );
    return Object.freeze({
      normal: await loadNormalTextureSource(asset.normal),
      states: Object.freeze(Object.fromEntries(stateEntries))
    });
  }

  return asset;
}

async function loadNormalTextureSource(
  normal: SymbolTextureSet["normal"]
): Promise<Texture | SymbolNormalTextureSource<Texture>> {
  if (isSymbolNormalTextureSource(normal)) {
    if (normal.kind === "single") {
      return Object.freeze({
        kind: "single",
        texture: await loadAssetTexture(normal.texture)
      });
    }
    const layers = await Promise.all(
      normal.layers.map(async (layer) => {
        const keyframes = await Promise.all(
          (layer.keyframes ?? []).map((keyframe) => loadAssetTexture(keyframe))
        );
        return Object.freeze({
          index: layer.index,
          texture: await loadAssetTexture(layer.texture),
          ...(keyframes.length > 0 ? { keyframes: Object.freeze(keyframes) } : {})
        });
      })
    );
    return Object.freeze({
      kind: "layered",
      layers: Object.freeze(layers)
    });
  }
  return loadAssetTexture(normal);
}

async function loadAssetTexture(asset: Texture | string): Promise<Texture> {
  return typeof asset === "string" ? Assets.load<Texture>(asset) : asset;
}

function isSymbolTextureSet(asset: SymbolAssetInput): asset is SymbolTextureSet {
  return typeof asset === "object" && asset !== null && "normal" in asset;
}

function isSymbolNormalTextureSource(
  normal: SymbolTextureSet["normal"]
): normal is SymbolNormalTextureSource<Texture | string> {
  return (
    typeof normal === "object" &&
    normal !== null &&
    "kind" in normal &&
    (normal.kind === "single" || normal.kind === "layered")
  );
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
  return /-\d+(?:-|$)/u.test(stem);
}
