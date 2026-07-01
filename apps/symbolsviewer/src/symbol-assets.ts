import { createGameConfig } from "@slotclientengine/logiccore";
import {
  createDefaultSymbolStatePreset,
  createSymbolAssetMapFromManifestModules,
  createSymbolCatalog,
  createSymbolScaleMapFromManifest as createRendercoreSymbolScaleMapFromManifest,
  type ReelSymbolScaleMap,
  type SymbolAssetMap,
  type SymbolCatalogModel,
} from "@slotclientengine/rendercore";

export const SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES = [
  "spinBlur",
  "disabled",
] as const;

export function createSymbolAssetMapFromModules(
  modules: Record<string, string>,
): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(modules)
        .filter(([modulePath]) => {
          const filename = getFileNameFromPath(modulePath);
          const stem = filename.slice(0, -4);
          return (
            filename.endsWith(".png") &&
            !stem.includes(".") &&
            !/-\d+$/u.test(stem)
          );
        })
        .map(([modulePath, url]) => [getSymbolNameFromPath(modulePath), url]),
    ),
  );
}

export function createStatefulSymbolAssetMapFromModules(options: {
  readonly modules: Record<string, string>;
  readonly manifest: unknown;
  readonly requiredStates: readonly string[];
  readonly displaySymbols?: readonly string[];
}): SymbolAssetMap {
  return createSymbolAssetMapFromManifestModules({
    modules: options.modules,
    manifest: options.manifest,
    requiredStates: options.requiredStates,
    displaySymbols: options.displaySymbols,
  });
}

export function createSymbolScaleMapFromManifest(options: {
  readonly manifest: unknown;
  readonly displaySymbols: readonly string[];
  readonly requiredStates?: readonly string[];
  readonly requireExplicitScale?: boolean;
}): ReelSymbolScaleMap {
  return createRendercoreSymbolScaleMapFromManifest({
    manifest: options.manifest,
    displaySymbols: options.displaySymbols,
    requiredStates:
      options.requiredStates ?? SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
    requireExplicitScale: options.requireExplicitScale,
  });
}

export function createSymbolsViewerCatalog(
  rawGameConfig: unknown,
  symbolAssets: SymbolAssetMap,
  requiredStateTextures: readonly string[] = SYMBOL_VIEWER_REQUIRED_STATE_TEXTURES,
): SymbolCatalogModel {
  return createSymbolCatalog({
    gameConfig: createGameConfig(rawGameConfig),
    assets: symbolAssets,
    statePreset: createDefaultSymbolStatePreset(),
    texturePolicy: {
      requiredStateTextures,
    },
  });
}

export function getSymbolNameFromPath(modulePath: string): string {
  const filename = getFileNameFromPath(modulePath);
  const extensionIndex = filename.lastIndexOf(".");
  return extensionIndex === -1 ? filename : filename.slice(0, extensionIndex);
}

function getFileNameFromPath(modulePath: string): string {
  const filename = modulePath.split("/").at(-1);
  if (!filename) {
    throw new Error(`Cannot extract symbol name from path "${modulePath}".`);
  }
  return filename;
}
