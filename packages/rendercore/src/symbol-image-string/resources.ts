import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import {
  collectImageStringAssetPaths,
  createImageStringResource,
  parseImageStringManifest,
  validateImageStringText,
  type ImageStringManifestV1,
  type ImageStringResource,
} from "../image-string/index.js";
import { SymbolAssetError } from "../symbol/errors.js";
import type { ParsedSymbolStateTextureManifest } from "../symbol/manifest.js";
import type {
  SymbolImageStringResourceMap,
  SymbolImageStringResourcePool,
} from "./types.js";
import { Assets, type Texture } from "pixi.js";
import type { SymbolImageStringSpecialValueImageSpec } from "../symbol/manifest.js";
import type { SymbolImageStringSpecialImageResource } from "./mapped-display.js";

export async function createSymbolImageStringResourcePool(options: {
  readonly symbolManifestPath: string;
  readonly resourcePaths: readonly string[];
  readonly imageStringManifests: Readonly<Record<string, unknown>>;
  readonly imageModules: Readonly<Record<string, string>>;
  readonly specialImagePaths?: readonly string[];
}): Promise<SymbolImageStringResourcePool> {
  const shared = new Map<string, ImageStringResource>();
  const specialImages = new Map<string, Texture>();
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
    for (const imagePath of options.specialImagePaths ?? []) {
      const packagePath = resolvePackagePath(
        options.symbolManifestPath,
        imagePath,
      );
      if (specialImages.has(packagePath)) continue;
      const module = findModule(options.imageModules, packagePath);
      if (typeof module !== "string" || module.length === 0) {
        throw new SymbolAssetError(
          `Image-string special value image is missing: ${packagePath}.`,
        );
      }
      const texture = (await Assets.load({
        src: module,
        parser: "loadTextures",
      })) as Texture | null | undefined;
      if (!texture?.source) {
        throw new SymbolAssetError(
          `Image-string special value image failed to load: ${packagePath}.`,
        );
      }
      specialImages.set(packagePath, texture);
    }
    return Object.freeze({
      resources: shared,
      specialImages,
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
      getSpecialImage(imagePath: string): Texture {
        if (destroyed) {
          throw new SymbolAssetError(
            "Image-string resource pool is destroyed.",
          );
        }
        const packagePath = resolvePackagePath(
          options.symbolManifestPath,
          imagePath,
        );
        const texture = specialImages.get(packagePath);
        if (!texture) {
          throw new SymbolAssetError(
            `Image-string special value image is not prepared: ${packagePath}.`,
          );
        }
        return texture;
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
    (entry) =>
      entry.imageStringNodes.flatMap((spec) => [
        spec.resource,
        ...(spec.spinBlurProfile ? [spec.spinBlurProfile.resource] : []),
      ]),
  );
  const specialImagePaths = Object.values(options.manifest.symbols).flatMap(
    (entry) =>
      entry.imageStringNodes.flatMap((spec) =>
        [
          ...(spec.specialValueImages ?? []),
          ...(spec.spinBlurProfile?.specialValueImages ?? []),
        ].map((mapping) => mapping.image),
      ),
  );
  const pool = await createSymbolImageStringResourcePool({
    symbolManifestPath: options.symbolManifestPath,
    resourcePaths,
    imageStringManifests: options.imageStringManifests,
    imageModules: options.imageModules,
    specialImagePaths,
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
    const spineStates = new Set(
      [
        ...(options.manifest.statePreset?.states.map((state) => state.id) ??
          []),
        ...Object.keys(entry.animations ?? {}),
        ...(entry.valuePresentation ? ["normal"] : []),
      ].filter((state) => {
        const animation = entry.animations?.[state];
        return (
          animation?.kind === "spine" ||
          animation?.kind === "activeSpine" ||
          (state === "normal" && entry.valuePresentation !== undefined)
        );
      }),
    );
    for (const spec of entry.imageStringNodes) {
      const resource = options.pool.get(spec.resource);
      const spinBlurResource = spec.spinBlurProfile
        ? options.pool.get(spec.spinBlurProfile.resource)
        : undefined;
      if (spinBlurResource) {
        assertCompatibleSymbolImageStringLayouts({
          normal: resource.manifest,
          spinBlur: spinBlurResource.manifest,
          label: `Symbol "${symbol}" image-string node "${spec.name}"`,
        });
      }
      try {
        validateMappedImageStringText(
          spec.initialText,
          resource,
          spec.specialValueImages ?? [],
        );
      } catch (error) {
        throw new SymbolAssetError(
          `Symbol "${symbol}" image-string node "${spec.name}" initialText is invalid: ${formatError(error)}.`,
        );
      }
      if (spec.spinBlurProfile && spinBlurResource) {
        try {
          validateMappedImageStringText(
            spec.initialText,
            spinBlurResource,
            spec.spinBlurProfile.specialValueImages ?? [],
          );
        } catch (error) {
          throw new SymbolAssetError(
            `Symbol "${symbol}" image-string node "${spec.name}" spinBlur initialText is invalid: ${formatError(error)}.`,
          );
        }
      }
      bySymbol[symbol] ??= [];
      bySymbol[symbol].push(
        Object.freeze({
          spec,
          spineStates,
          resource,
          specialValueImages: createSymbolImageStringSpecialValueImageMap(
            spec.specialValueImages ?? [],
            options.pool,
          ),
          ...(spec.spinBlurProfile && spinBlurResource
            ? {
                spinBlurProfile: Object.freeze({
                  resource: spinBlurResource,
                  specialValueImages:
                    createSymbolImageStringSpecialValueImageMap(
                      spec.spinBlurProfile.specialValueImages ?? [],
                      options.pool,
                    ),
                }),
              }
            : {}),
        }),
      );
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

export function assertCompatibleSymbolImageStringLayouts(options: {
  readonly normal: ImageStringManifestV1;
  readonly spinBlur: ImageStringManifestV1;
  readonly label: string;
}): void {
  const comparable = (manifest: ImageStringManifestV1) => ({
    metrics: manifest.metrics,
    glyphs: Object.fromEntries(
      Object.entries(manifest.glyphs)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([character, glyph]) => [
          character,
          { size: glyph.size, offset: glyph.offset },
        ]),
    ),
    fixedAdvanceGroups: manifest.fixedAdvanceGroups,
  });
  if (
    JSON.stringify(comparable(options.normal)) !==
    JSON.stringify(comparable(options.spinBlur))
  ) {
    throw new SymbolAssetError(
      `${options.label} spinBlur ImgNumber layout must match its normal resource.`,
    );
  }
}

export function createSymbolImageStringSpecialValueImageMap(
  mappings: readonly SymbolImageStringSpecialValueImageSpec[],
  pool: SymbolImageStringResourcePool,
): Readonly<Record<string, SymbolImageStringSpecialImageResource>> {
  return Object.freeze(
    Object.fromEntries(
      mappings.map((mapping) => [
        String(mapping.value),
        Object.freeze({
          path: mapping.image,
          texture: pool.getSpecialImage(mapping.image),
        }),
      ]),
    ),
  );
}

function validateMappedImageStringText(
  text: string,
  resource: ImageStringResource,
  mappings: readonly SymbolImageStringSpecialValueImageSpec[],
): void {
  validateImageStringText(text);
  if (mappings.some((mapping) => String(mapping.value) === text)) return;
  validateImageStringText(text, resource.manifest);
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
