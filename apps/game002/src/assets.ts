import { Assets, type Texture } from "pixi.js";
import type {
  SymbolAssetInput,
  SymbolAssetMap,
  SymbolNormalTextureSource,
  SymbolTextureSet,
} from "@slotclientengine/rendercore";

export const GAME002_REQUIRED_STATE_TEXTURES = [
  "spinBlur",
  "disabled",
] as const;

export const GAME002_DISPLAY_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
]);

export const GAME002_EMPTY_SYMBOLS = Object.freeze(["BN"]);

type ParsedManifestSymbol = {
  readonly normal: string;
} & Record<string, string>;

export function createGame002SymbolAssetMapFromModules(options: {
  readonly modules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly requiredStates?: readonly string[];
  readonly displaySymbols?: readonly string[];
  readonly emptySymbols?: readonly string[];
}): SymbolAssetMap {
  const requiredStates = Object.freeze([
    ...(options.requiredStates ?? GAME002_REQUIRED_STATE_TEXTURES),
  ]);
  const displaySymbols = Object.freeze([
    ...(options.displaySymbols ?? GAME002_DISPLAY_SYMBOLS),
  ]);
  const emptySymbols = new Set(options.emptySymbols ?? GAME002_EMPTY_SYMBOLS);
  for (const symbol of displaySymbols) {
    if (emptySymbols.has(symbol)) {
      throw new Error(`Display symbol "${symbol}" must not be empty.`);
    }
  }

  const manifest = parseStateTextureManifest(
    options.stateTextureManifest,
    requiredStates,
  );
  const { normalAssets, stateAssets } = splitSymbolPngModules(
    options.modules,
    manifest.states,
  );
  const assets: Record<string, SymbolAssetInput> = {};

  for (const symbol of displaySymbols) {
    const manifestSymbol = manifest.symbols[symbol];
    if (!manifestSymbol) {
      throw new Error(`Symbol state texture manifest is missing "${symbol}".`);
    }

    const normalFileName = `${symbol}.png`;
    if (getFileNameFromManifestPath(manifestSymbol.normal) !== normalFileName) {
      throw new Error(
        `Symbol "${symbol}" manifest normal texture must be "./${normalFileName}".`,
      );
    }
    const normal = normalAssets[symbol];
    if (!normal) {
      throw new Error(
        `Symbol "${symbol}" is missing normal texture "${normalFileName}".`,
      );
    }

    const states: Record<string, string> = {};
    for (const state of requiredStates) {
      const stateFileName = `${symbol}.${state}.png`;
      const manifestStatePath = assertString(
        manifestSymbol[state],
        `symbol "${symbol}" ${state} texture`,
      );
      if (getFileNameFromManifestPath(manifestStatePath) !== stateFileName) {
        throw new Error(
          `Symbol "${symbol}" manifest texture for state "${state}" must be "./${stateFileName}".`,
        );
      }
      const stateAsset = stateAssets[symbol]?.[state];
      if (!stateAsset) {
        throw new Error(
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

  return Object.freeze(assets);
}

export async function loadGame002SymbolTextures(
  assetUrls: SymbolAssetMap,
): Promise<SymbolAssetMap> {
  const entries = await Promise.all(
    Object.entries(assetUrls).map(
      async ([symbol, asset]) =>
        [symbol, await loadSymbolAssetInput(asset)] as const,
    ),
  );

  return Object.freeze(Object.fromEntries(entries));
}

function splitSymbolPngModules(
  modules: Record<string, string>,
  allowedStates: readonly string[],
): {
  readonly normalAssets: Record<string, string>;
  readonly stateAssets: Record<string, Record<string, string>>;
} {
  const normalAssets: Record<string, string> = {};
  const stateAssets: Record<string, Record<string, string>> = {};
  const allowedStateSet = new Set(allowedStates);

  for (const [modulePath, url] of Object.entries(modules)) {
    const filename = getFileNameFromPath(modulePath);
    if (!filename.endsWith(".png")) {
      continue;
    }

    const stem = filename.slice(0, -".png".length);
    const parts = stem.split(".");
    if (parts.length === 1) {
      normalAssets[parts[0]] = url;
      continue;
    }

    if (parts.length === 2) {
      const [symbol, state] = parts;
      if (!allowedStateSet.has(state)) {
        throw new Error(
          `Symbol "${symbol}" declares texture for unknown state "${state}".`,
        );
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
  };
}

function parseStateTextureManifest(
  manifest: unknown,
  requiredStates: readonly string[],
): {
  readonly version: 1;
  readonly states: readonly string[];
  readonly symbols: Record<string, ParsedManifestSymbol>;
} {
  const manifestRecord = assertRecord(
    manifest,
    "symbol state texture manifest",
  );
  if (manifestRecord.version !== 1) {
    throw new Error("Symbol state texture manifest version must be 1.");
  }
  if (!Array.isArray(manifestRecord.states)) {
    throw new Error("Symbol state texture manifest states must be an array.");
  }
  const states = manifestRecord.states.map((state) =>
    assertString(state, "manifest state"),
  );
  for (const state of requiredStates) {
    if (!states.includes(state)) {
      throw new Error(
        `Symbol state texture manifest is missing required state "${state}".`,
      );
    }
  }

  const rawSymbols = assertRecord(
    manifestRecord.symbols,
    "symbol state texture manifest symbols",
  );
  const symbols: Record<string, ParsedManifestSymbol> = {};
  for (const [symbol, rawSymbol] of Object.entries(rawSymbols)) {
    const rawSymbolRecord = assertRecord(
      rawSymbol,
      `symbol state texture manifest symbol "${symbol}"`,
    );
    const parsedSymbol: ParsedManifestSymbol = {
      normal: assertString(
        rawSymbolRecord.normal,
        `symbol "${symbol}" normal texture`,
      ),
    };
    for (const state of requiredStates) {
      parsedSymbol[state] = assertString(
        rawSymbolRecord[state],
        `symbol "${symbol}" ${state} texture`,
      );
    }
    symbols[symbol] = parsedSymbol;
  }

  return {
    version: 1,
    states,
    symbols,
  };
}

async function loadSymbolAssetInput(
  asset: SymbolAssetInput,
): Promise<SymbolAssetInput> {
  if (typeof asset === "string") {
    return Assets.load<Texture>(asset);
  }

  if (isSymbolTextureSet(asset)) {
    const stateEntries = await Promise.all(
      Object.entries(asset.states ?? {}).map(
        async ([state, stateAsset]) =>
          [
            state,
            await loadAssetTexture(stateAsset as Texture | string),
          ] as const,
      ),
    );
    return Object.freeze({
      normal: await loadNormalTextureSource(asset.normal),
      states: Object.freeze(Object.fromEntries(stateEntries)),
    });
  }

  return asset;
}

async function loadNormalTextureSource(
  normal: SymbolTextureSet["normal"],
): Promise<Texture | SymbolNormalTextureSource<Texture>> {
  if (isSymbolNormalTextureSource(normal)) {
    if (normal.kind === "single") {
      return Object.freeze({
        kind: "single",
        texture: await loadAssetTexture(normal.texture),
      });
    }
    const layers = await Promise.all(
      normal.layers.map(async (layer) =>
        Object.freeze({
          index: layer.index,
          texture: await loadAssetTexture(layer.texture),
          ...(layer.keyframes
            ? {
                keyframes: Object.freeze(
                  await Promise.all(
                    layer.keyframes.map((keyframe) =>
                      loadAssetTexture(keyframe),
                    ),
                  ),
                ),
              }
            : {}),
        }),
      ),
    );
    return Object.freeze({
      kind: "layered",
      layers: Object.freeze(layers),
    });
  }
  return loadAssetTexture(normal);
}

async function loadAssetTexture(asset: Texture | string): Promise<Texture> {
  return typeof asset === "string" ? Assets.load<Texture>(asset) : asset;
}

function isSymbolTextureSet(
  asset: SymbolAssetInput,
): asset is SymbolTextureSet {
  return typeof asset === "object" && asset !== null && "normal" in asset;
}

function isSymbolNormalTextureSource(
  normal: SymbolTextureSet["normal"],
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
    throw new Error(
      `Cannot extract file name from manifest path "${manifestPath}".`,
    );
  }
  return filename;
}
