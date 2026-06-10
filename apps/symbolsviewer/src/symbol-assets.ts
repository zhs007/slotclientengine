import { createGameConfig } from "@slotclientengine/logiccore";
import {
  createDefaultSymbolStatePreset,
  createSymbolCatalog,
  type SymbolAssetMap,
  type SymbolCatalogModel
} from "@slotclientengine/rendercore";

export function createSymbolAssetMapFromModules(modules: Record<string, string>): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(modules).map(([modulePath, url]) => [getSymbolNameFromPath(modulePath), url])
    )
  );
}

export function createSymbolsViewerCatalog(
  rawGameConfig: unknown,
  symbolAssets: SymbolAssetMap
): SymbolCatalogModel {
  return createSymbolCatalog({
    gameConfig: createGameConfig(rawGameConfig),
    assets: symbolAssets,
    statePreset: createDefaultSymbolStatePreset()
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
