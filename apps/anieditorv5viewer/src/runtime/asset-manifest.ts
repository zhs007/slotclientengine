import type { V5GProjectConfig } from "../v5g/types";

export type AssetUrlManifest = Readonly<Record<string, string>>;

const bundledAssetModules = import.meta.glob("../assets/assets/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const export2EditFullAssetModules = import.meta.glob(
  "../assets/export2/edit_full/assets/*",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
) as Record<string, string>;

const export2Runtime50AssetModules = import.meta.glob(
  "../assets/export2/runtime_50/assets/*",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
) as Record<string, string>;

export const legacyAssetUrlManifest =
  createAssetUrlManifest(bundledAssetModules);
export const bundledAssetUrlManifest = legacyAssetUrlManifest;
export const export2EditFullAssetUrlManifest = createAssetUrlManifest(
  export2EditFullAssetModules,
);
export const export2Runtime50AssetUrlManifest = createAssetUrlManifest(
  export2Runtime50AssetModules,
);

export function createAssetUrlManifest(
  modules: Record<string, string>,
): AssetUrlManifest {
  const entries = Object.entries(modules).map(([modulePath, url]) => {
    const filename = getFilename(modulePath);
    return [`assets/${filename}`, url] as const;
  });
  return Object.freeze(Object.fromEntries(entries));
}

export function resolveProjectAssetUrls(
  project: V5GProjectConfig,
  manifest: AssetUrlManifest,
): AssetUrlManifest {
  const resolved: Record<string, string> = {};
  for (const asset of project.assets) {
    const url = manifest[asset.path];
    if (!url) {
      throw new Error(`V5G asset path is missing from manifest: ${asset.path}`);
    }
    resolved[asset.path] = url;
  }
  return Object.freeze(resolved);
}

function getFilename(path: string): string {
  const parts = path.split(/[\\/]/u);
  const filename = parts.at(-1);
  if (!filename) {
    throw new Error(`Cannot parse V5G asset module path: ${path}`);
  }
  return filename;
}
