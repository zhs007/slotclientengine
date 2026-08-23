import { loadPopupManifest } from "../../popup/data/index.js";
import {
  parseSymbolPackageManifest,
  parseSymbolStateTextureManifest,
} from "../../symbol/data/index.js";
import { SceneLayoutError } from "../errors.js";
import { parseSceneLayoutManifestDocument } from "../manifest.js";
import { upgradeSceneLayoutManifestToLatest } from "../manifest-v3.js";
import { collectSceneLayoutPackagePaths } from "../package-resource.js";
import {
  compileGameLayoutRuntimeEventCatalog,
  type GameLayoutRuntimeEventCatalog,
} from "../core/runtime-address-catalog.js";

export interface InspectSceneLayoutRuntimeEventCatalogOptions {
  readonly manifest: unknown;
  /** Logical package files after resolving the editor assets map. */
  readonly files: ReadonlyMap<string, Uint8Array>;
}

/**
 * Strictly inspects the event surface authored by one complete Game Layout
 * package without creating render objects or browser resources.
 */
export function inspectSceneLayoutRuntimeEventCatalog(
  options: InspectSceneLayoutRuntimeEventCatalogOptions,
): GameLayoutRuntimeEventCatalog {
  const sourceManifest = parseSceneLayoutManifestDocument(options.manifest);
  const manifest = upgradeSceneLayoutManifestToLatest(sourceManifest);
  collectSceneLayoutPackagePaths({
    manifest,
    files: options.files,
    allowExtraFiles: false,
  });

  const symbolPackages: Record<
    string,
    { readonly symbols: readonly string[]; readonly states: readonly string[] }
  > = {};
  for (const [id, binding] of symbolBindings(manifest)) {
    const packageManifest = parseSymbolPackageManifest(
      parseJson(
        requiredBytes(options.files, binding.manifest),
        binding.manifest,
      ),
    );
    const symbolManifest = parseSymbolStateTextureManifest(
      parseJson(
        requiredBytes(
          options.files,
          packageManifest.entrypoints.symbolManifest,
        ),
        packageManifest.entrypoints.symbolManifest,
      ),
    );
    symbolPackages[id] = Object.freeze({
      symbols: Object.freeze(Object.keys(symbolManifest.symbols)),
      states: Object.freeze(
        symbolManifest.statePreset.states.map((state) => state.id),
      ),
    });
  }

  const popupManifests = Object.fromEntries(
    Object.entries(manifest.popups ?? {}).map(([id, binding]) => [
      id,
      loadPopupManifest(
        parseJson(
          requiredBytes(options.files, binding.manifest),
          binding.manifest,
        ),
      ).manifest,
    ]),
  );

  return compileGameLayoutRuntimeEventCatalog({
    manifest,
    symbolPackages,
    popupManifests,
    audioMusicNames: Object.freeze(
      manifest.audio.music.map((binding) => binding.name),
    ),
  });
}

function symbolBindings(
  manifest: ReturnType<typeof upgradeSceneLayoutManifestToLatest>,
): readonly (readonly [string, { readonly manifest: string }])[] {
  if (manifest.symbolPackage) {
    const id = manifest.symbolPackage.manifest.split("/").at(-2);
    if (!id)
      throw new SceneLayoutError(
        `Cannot derive legacy symbol package id from: ${manifest.symbolPackage.manifest}.`,
      );
    return Object.freeze([[id, manifest.symbolPackage]] as const);
  }
  return Object.freeze(Object.entries(manifest.symbolPackages ?? {}));
}

function requiredBytes(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes)
    throw new SceneLayoutError(
      `Scene Layout package file is missing: ${path}.`,
    );
  return bytes;
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new SceneLayoutError(
      `Invalid JSON at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
