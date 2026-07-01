import { Assets, type Texture } from "pixi.js";
import {
  createSymbolAssetMapFromManifestModules,
  createSymbolScaleMapFromManifest,
  getSymbolDisplaySymbolsFromManifest,
  type ReelSymbolScaleMap,
  type SymbolAssetInput,
  type SymbolAssetMap,
  type SymbolLayerTextureSource,
  type SymbolNormalTextureSource,
  type SymbolTextureSet,
} from "@slotclientengine/rendercore";

export const GAME003_REQUIRED_STATE_TEXTURES = [
  "spinBlur",
  "disabled",
] as const;

export const GAME003_DISPLAY_SYMBOLS = Object.freeze([
  "WL",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "CO",
  "CL",
  "SC",
]);

export const GAME003_EMPTY_SYMBOLS = Object.freeze([] as const);

export function getGame003DisplaySymbolsFromManifest(
  stateTextureManifest: unknown,
  requiredStates: readonly string[] = GAME003_REQUIRED_STATE_TEXTURES,
): readonly string[] {
  return getSymbolDisplaySymbolsFromManifest(stateTextureManifest, {
    requiredStates,
  });
}

export function createGame003SymbolAssetMapFromModules(options: {
  readonly modules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly requiredStates?: readonly string[];
  readonly displaySymbols?: readonly string[];
}): SymbolAssetMap {
  return createSymbolAssetMapFromManifestModules({
    modules: options.modules,
    manifest: options.stateTextureManifest,
    requiredStates: options.requiredStates ?? GAME003_REQUIRED_STATE_TEXTURES,
    displaySymbols: options.displaySymbols ?? GAME003_DISPLAY_SYMBOLS,
  });
}

export function createGame003SymbolScaleMapFromManifest(options: {
  readonly stateTextureManifest: unknown;
  readonly displaySymbols?: readonly string[];
  readonly requiredStates?: readonly string[];
  readonly requireExplicitScale?: boolean;
}): ReelSymbolScaleMap {
  return createSymbolScaleMapFromManifest({
    manifest: options.stateTextureManifest,
    displaySymbols: options.displaySymbols ?? GAME003_DISPLAY_SYMBOLS,
    requiredStates: options.requiredStates ?? GAME003_REQUIRED_STATE_TEXTURES,
    requireExplicitScale: options.requireExplicitScale,
  });
}

export async function loadGame003SymbolTextures(
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
    return loadTexture(asset);
  }
  if (isSymbolTextureSet(asset)) {
    return loadSymbolTextureSet(asset);
  }
  return asset;
}

async function loadSymbolTextureSet(
  asset: SymbolTextureSet,
): Promise<SymbolTextureSet<Texture>> {
  const [normal, states] = await Promise.all([
    loadNormalTextureSource(asset.normal),
    loadStateTextures(asset.states ?? {}),
  ]);
  return Object.freeze({
    normal,
    states,
  });
}

async function loadNormalTextureSource(
  normal: SymbolTextureSet["normal"],
): Promise<Texture | SymbolNormalTextureSource<Texture>> {
  if (typeof normal === "string") {
    return loadTexture(normal);
  }
  if (isSymbolNormalTextureSource(normal)) {
    if (normal.kind === "single") {
      return Object.freeze({
        kind: "single",
        texture:
          typeof normal.texture === "string"
            ? await loadTexture(normal.texture)
            : normal.texture,
      });
    }
    const layers = await Promise.all(
      normal.layers.map(async (layer) => loadLayerTextureSource(layer)),
    );
    return Object.freeze({
      kind: "layered",
      layers: Object.freeze(layers),
    });
  }
  return normal;
}

async function loadLayerTextureSource(
  layer: SymbolLayerTextureSource<string | Texture>,
): Promise<SymbolLayerTextureSource<Texture>> {
  const texture =
    typeof layer.texture === "string"
      ? await loadTexture(layer.texture)
      : layer.texture;
  const keyframes = await Promise.all(
    (layer.keyframes ?? []).map((keyframe) =>
      typeof keyframe === "string" ? loadTexture(keyframe) : keyframe,
    ),
  );
  return Object.freeze({
    index: layer.index,
    texture,
    ...(keyframes.length > 0 ? { keyframes: Object.freeze(keyframes) } : {}),
  });
}

async function loadStateTextures(
  states: Readonly<Partial<Record<string, Texture | string>>>,
): Promise<Readonly<Partial<Record<string, Texture>>>> {
  const entries = await Promise.all(
    Object.entries(states).map(async ([state, texture]) => [
      state,
      typeof texture === "string" ? await loadTexture(texture) : texture,
    ]),
  );
  return Object.freeze(Object.fromEntries(entries));
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
    (normal.kind === "single" || normal.kind === "layered")
  );
}

async function loadTexture(url: string): Promise<Texture> {
  return Assets.load<Texture>(url);
}
