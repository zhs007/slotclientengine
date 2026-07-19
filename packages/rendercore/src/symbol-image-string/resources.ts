import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import {
  collectImageStringAssetPaths,
  createImageStringResource,
  parseImageStringManifest,
  validateImageStringText,
  type ImageStringResource,
} from "../image-string/index.js";
import { SymbolAssetError } from "../symbol/errors.js";
import type { ParsedSymbolStateTextureManifest } from "../symbol/manifest.js";
import type {
  SymbolImageStringResourceMap,
  SymbolImageStringResourcePool,
} from "./types.js";

export async function createSymbolImageStringResourcePool(options: {
  readonly symbolManifestPath: string;
  readonly resourcePaths: readonly string[];
  readonly imageStringManifests: Readonly<Record<string, unknown>>;
  readonly imageModules: Readonly<Record<string, string>>;
}): Promise<SymbolImageStringResourcePool> {
  const shared = new Map<string, ImageStringResource>();
  let destroyed = false;
  let destroyPromise: Promise<void> | null = null;
  try {
    for (const resourcePath of options.resourcePaths) {
      const manifestPath = resolvePackagePath(
        options.symbolManifestPath,
        resourcePath,
      );
      if (shared.has(manifestPath)) continue;
      const rawManifest = findModule(
        options.imageStringManifests,
        manifestPath,
      );
      if (rawManifest === undefined) {
        throw new SymbolAssetError(
          `Image-string manifest is missing: ${manifestPath}.`,
        );
      }
      const parsed = parseImageStringManifest(rawManifest);
      const modules = Object.fromEntries(
        collectImageStringAssetPaths(parsed).map((path) => {
          const packagePath = resolvePackagePath(manifestPath, path);
          const module = findModule(options.imageModules, packagePath);
          if (typeof module !== "string" || module.length === 0) {
            throw new SymbolAssetError(
              `Image-string glyph is missing: ${packagePath}.`,
            );
          }
          return [path, module];
        }),
      );
      const resource = await createImageStringResource({
        manifest: parsed,
        imageModules: modules,
        ownTextures: false,
      });
      try {
        validateLoadedGlyphSizes(resource, manifestPath);
      } catch (error) {
        await resource.destroy();
        throw error;
      }
      shared.set(manifestPath, resource);
    }
    return Object.freeze({
      resources: shared,
      get(resourcePath: string): ImageStringResource {
        if (destroyed) {
          throw new SymbolAssetError(
            "Image-string resource pool is destroyed.",
          );
        }
        const manifestPath = resolvePackagePath(
          options.symbolManifestPath,
          resourcePath,
        );
        const resource = shared.get(manifestPath);
        if (!resource) {
          throw new SymbolAssetError(
            `Image-string resource is not prepared: ${manifestPath}.`,
          );
        }
        resource.assertUsable();
        return resource;
      },
      destroy(): Promise<void> {
        if (destroyPromise) return destroyPromise;
        destroyed = true;
        destroyPromise = Promise.allSettled(
          [...shared.values()].map((resource) => resource.destroy()),
        ).then(() => undefined);
        return destroyPromise;
      },
    });
  } catch (error) {
    await Promise.allSettled(
      [...shared.values()].map((resource) => resource.destroy()),
    );
    throw error;
  }
}

export async function createSymbolImageStringResources(options: {
  readonly manifest: ParsedSymbolStateTextureManifest;
  readonly symbolManifestPath: string;
  readonly imageStringManifests: Readonly<Record<string, unknown>>;
  readonly imageModules: Readonly<Record<string, string>>;
}): Promise<{
  readonly resources: SymbolImageStringResourceMap;
  readonly sharedResources: readonly ImageStringResource[];
}> {
  const resourcePaths = Object.values(options.manifest.symbols).flatMap(
    (entry) => entry.imageStringNodes.map((spec) => spec.resource),
  );
  const pool = await createSymbolImageStringResourcePool({
    symbolManifestPath: options.symbolManifestPath,
    resourcePaths,
    imageStringManifests: options.imageStringManifests,
    imageModules: options.imageModules,
  });
  try {
    const resources = createSymbolImageStringResourcesFromPool({
      manifest: options.manifest,
      pool,
    });
    return Object.freeze({
      resources,
      sharedResources: Object.freeze([...pool.resources.values()]),
    });
  } catch (error) {
    await pool.destroy();
    throw error;
  }
}

export function createSymbolImageStringResourcesFromPool(options: {
  readonly manifest: ParsedSymbolStateTextureManifest;
  readonly pool: SymbolImageStringResourcePool;
}): SymbolImageStringResourceMap {
  const bySymbol: Record<
    string,
    SymbolImageStringResourceMap[string][number][]
  > = {};
  for (const [symbol, entry] of Object.entries(options.manifest.symbols)) {
    for (const spec of entry.imageStringNodes) {
      const resource = options.pool.get(spec.resource);
      try {
        validateImageStringText(spec.initialText, resource.manifest);
      } catch (error) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" image-string node "${spec.name}" initialText is invalid: ${formatError(error)}.`,
        );
      }
      bySymbol[symbol] ??= [];
      bySymbol[symbol].push(Object.freeze({ spec, resource }));
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(bySymbol).map(([symbol, nodes]) => [
        symbol,
        Object.freeze(nodes),
      ]),
    ),
  );
}

function validateLoadedGlyphSizes(
  resource: ImageStringResource,
  manifestPath: string,
): void {
  for (const [character, glyph] of Object.entries(resource.manifest.glyphs)) {
    const texture = resource.textures[glyph.path];
    if (
      texture.width !== glyph.size.width ||
      texture.height !== glyph.size.height
    ) {
      throw new SymbolAssetError(
        `Image-string glyph ${JSON.stringify(character)} (${resolvePackagePath(
          manifestPath,
          glyph.path,
        )}) size mismatch: declared ${glyph.size.width}x${glyph.size.height}, loaded ${texture.width}x${texture.height}.`,
      );
    }
  }
}

function findModule<T>(
  modules: Readonly<Record<string, T>>,
  canonicalPath: string,
): T | undefined {
  return modules[canonicalPath] ?? modules[`./${canonicalPath}`];
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
