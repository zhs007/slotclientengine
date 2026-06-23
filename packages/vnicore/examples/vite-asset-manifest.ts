import {
  createAssetUrlManifest,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

const assetModules = import.meta.glob("./assets/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export const assetUrlManifest: AssetUrlManifest =
  createAssetUrlManifest(assetModules);

export function resolveExampleAssetUrls(
  project: VNIProjectConfig,
): AssetUrlManifest {
  return resolveProjectAssetUrls(project, assetUrlManifest);
}
