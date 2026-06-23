import {
  createAssetUrlManifest,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
} from "@slotclientengine/vnicore/core";

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

export { resolveProjectAssetUrls, type AssetUrlManifest };
