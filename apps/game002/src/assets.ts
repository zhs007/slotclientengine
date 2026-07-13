import { Assets, type Texture } from "pixi.js";
import {
  createSymbolAssetMapFromManifestModules,
  createSymbolRenderPriorityMapFromManifest,
  createSymbolScaleMapFromManifest,
  getSymbolDisplaySymbolsFromManifest,
  type ReelSymbolRenderPriorityMap,
  type ReelSymbolScaleMap,
  type SymbolAssetInput,
  type SymbolAssetMap,
  type SymbolLayerTextureSource,
  type SymbolNormalTextureSource,
  type SymbolTextureSet,
} from "@slotclientengine/rendercore";

export const GAME002_REQUIRED_STATE_TEXTURES = [
  "spinBlur",
  "disabled",
] as const;

const GAME002_EXPECTED_DISPLAY_SYMBOLS = Object.freeze([
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
  "BN",
] as const);

export const GAME002_EMPTY_SYMBOLS = Object.freeze([] as const);

export function getGame002DisplaySymbolsFromManifest(
  stateTextureManifest: unknown,
): readonly string[] {
  const symbols = getSymbolDisplaySymbolsFromManifest(stateTextureManifest, {
    requiredStates: GAME002_REQUIRED_STATE_TEXTURES,
  });
  if (
    symbols.length !== GAME002_EXPECTED_DISPLAY_SYMBOLS.length ||
    symbols.some(
      (symbol, index) => symbol !== GAME002_EXPECTED_DISPLAY_SYMBOLS[index],
    )
  ) {
    throw new Error(
      `game002-s3 manifest symbols must be ${GAME002_EXPECTED_DISPLAY_SYMBOLS.join(",")}, got ${symbols.join(",")}.`,
    );
  }
  return symbols;
}

export function createGame002SymbolAssetMapFromModules(options: {
  readonly modules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols?: readonly string[];
}): SymbolAssetMap {
  return createSymbolAssetMapFromManifestModules({
    modules: options.modules,
    manifest: options.stateTextureManifest,
    requiredStates: GAME002_REQUIRED_STATE_TEXTURES,
    displaySymbols:
      options.displaySymbols ??
      getGame002DisplaySymbolsFromManifest(options.stateTextureManifest),
  });
}

export function createGame002SymbolScaleMapFromManifest(options: {
  readonly stateTextureManifest: unknown;
  readonly displaySymbols?: readonly string[];
  readonly requireExplicitScale?: boolean;
}): ReelSymbolScaleMap {
  return createSymbolScaleMapFromManifest({
    manifest: options.stateTextureManifest,
    displaySymbols:
      options.displaySymbols ??
      getGame002DisplaySymbolsFromManifest(options.stateTextureManifest),
    requiredStates: GAME002_REQUIRED_STATE_TEXTURES,
    requireExplicitScale: options.requireExplicitScale,
  });
}

export function createGame002SymbolRenderPriorityMapFromManifest(options: {
  readonly stateTextureManifest: unknown;
  readonly displaySymbols?: readonly string[];
}): ReelSymbolRenderPriorityMap {
  return createSymbolRenderPriorityMapFromManifest({
    manifest: options.stateTextureManifest,
    displaySymbols:
      options.displaySymbols ??
      getGame002DisplaySymbolsFromManifest(options.stateTextureManifest),
    requiredStates: GAME002_REQUIRED_STATE_TEXTURES,
  });
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

async function loadSymbolAssetInput(
  asset: SymbolAssetInput,
): Promise<SymbolAssetInput> {
  if (typeof asset === "string") {
    return Assets.load<Texture>(asset);
  }
  if (!isSymbolTextureSet(asset)) {
    return asset;
  }
  const [normal, states] = await Promise.all([
    loadNormalTextureSource(asset.normal),
    Promise.all(
      Object.entries(asset.states ?? {}).map(async ([state, texture]) => [
        state,
        typeof texture === "string"
          ? await Assets.load<Texture>(texture)
          : texture,
      ]),
    ),
  ]);
  return Object.freeze({
    normal,
    states: Object.freeze(Object.fromEntries(states)),
  });
}

async function loadNormalTextureSource(
  normal: SymbolTextureSet["normal"],
): Promise<Texture | SymbolNormalTextureSource<Texture>> {
  if (typeof normal === "string") {
    return Assets.load<Texture>(normal);
  }
  if (!isSymbolNormalTextureSource(normal)) {
    return normal;
  }
  if (normal.kind === "single") {
    return Object.freeze({
      kind: "single",
      texture:
        typeof normal.texture === "string"
          ? await Assets.load<Texture>(normal.texture)
          : normal.texture,
    });
  }
  if (normal.kind === "transparent") {
    return normal;
  }
  const layers = await Promise.all(
    normal.layers.map(async (layer) => loadLayerTextureSource(layer)),
  );
  return Object.freeze({ kind: "layered", layers: Object.freeze(layers) });
}

async function loadLayerTextureSource(
  layer: SymbolLayerTextureSource<string | Texture>,
): Promise<SymbolLayerTextureSource<Texture>> {
  const texture =
    typeof layer.texture === "string"
      ? await Assets.load<Texture>(layer.texture)
      : layer.texture;
  const keyframes = await Promise.all(
    (layer.keyframes ?? []).map((keyframe) =>
      typeof keyframe === "string" ? Assets.load<Texture>(keyframe) : keyframe,
    ),
  );
  return Object.freeze({
    index: layer.index,
    texture,
    ...(keyframes.length > 0 ? { keyframes: Object.freeze(keyframes) } : {}),
  });
}

function isSymbolTextureSet(
  asset: SymbolAssetInput,
): asset is SymbolTextureSet {
  return (
    typeof asset === "object" &&
    asset !== null &&
    "normal" in asset &&
    !("source" in asset)
  );
}

function isSymbolNormalTextureSource(
  normal: SymbolTextureSet["normal"],
): normal is SymbolNormalTextureSource<string | Texture> {
  return (
    typeof normal === "object" &&
    normal !== null &&
    "kind" in normal &&
    (normal.kind === "single" ||
      normal.kind === "layered" ||
      normal.kind === "transparent")
  );
}
