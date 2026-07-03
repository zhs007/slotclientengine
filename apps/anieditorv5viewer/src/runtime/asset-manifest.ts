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

const game003S1AssetModules = import.meta.glob(
  "../../../../assets/game003-s1/assets/*",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
) as Record<string, string>;

export const legacyAssetUrlManifest =
  createAssetUrlManifest(bundledAssetModules);
export const bundledAssetUrlManifest = legacyAssetUrlManifest;
export const game003S1AssetUrlManifest = createAssetUrlManifest(
  game003S1AssetModules,
);

export { resolveProjectAssetUrls, type AssetUrlManifest };
