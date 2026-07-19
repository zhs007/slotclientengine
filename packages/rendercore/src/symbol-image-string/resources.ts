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
import type { SymbolImageStringResourceMap } from "./types.js";

export async function createSymbolImageStringResources(options: {
  readonly manifest: ParsedSymbolStateTextureManifest;
  readonly symbolManifestPath: string;
  readonly imageStringManifests: Readonly<Record<string, unknown>>;
  readonly imageModules: Readonly<Record<string, string>>;
}): Promise<{
  readonly resources: SymbolImageStringResourceMap;
  readonly sharedResources: readonly ImageStringResource[];
}> {
  const shared = new Map<string, ImageStringResource>();
  const bySymbol: Record<
    string,
    SymbolImageStringResourceMap[string][number][]
  > = {};
  try {
    for (const [symbol, entry] of Object.entries(options.manifest.symbols)) {
      for (const spec of entry.imageStringNodes) {
        const manifestPath = resolvePackagePath(
          options.symbolManifestPath,
          spec.resource,
        );
        let resource = shared.get(manifestPath);
        if (!resource) {
          const rawManifest = options.imageStringManifests[manifestPath];
          if (rawManifest === undefined) {
            throw new SymbolAssetError(
              `Image-string manifest is missing: ${manifestPath}.`,
            );
          }
          const parsed = parseImageStringManifest(rawManifest);
          const modules = Object.fromEntries(
            collectImageStringAssetPaths(parsed).map((path) => {
              const packagePath = resolvePackagePath(manifestPath, path);
              const module = options.imageModules[packagePath];
              if (!module) {
                throw new SymbolAssetError(
                  `Image-string glyph is missing: ${packagePath}.`,
                );
              }
              return [path, module];
            }),
          );
          resource = await createImageStringResource({
            manifest: parsed,
            imageModules: modules,
            ownTextures: false,
          });
          for (const [character, glyph] of Object.entries(parsed.glyphs)) {
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
          shared.set(manifestPath, resource);
        }
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
    return Object.freeze({
      resources: Object.freeze(
        Object.fromEntries(
          Object.entries(bySymbol).map(([symbol, nodes]) => [
            symbol,
            Object.freeze(nodes),
          ]),
        ),
      ),
      sharedResources: Object.freeze([...shared.values()]),
    });
  } catch (error) {
    await Promise.allSettled(
      [...shared.values()].map((resource) => resource.destroy()),
    );
    throw error;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
