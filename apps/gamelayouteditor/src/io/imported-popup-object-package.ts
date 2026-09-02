import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  decodeEditorAssetsMap,
  normalizeEditorPackageZipEntries,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import {
  collectPopupObjectPackagePaths,
  createPopupObjectPackageResource,
  namespaceMappedPopupObjectPackageFiles,
  parsePopupObjectManifest,
  resolvePopupObjectPackageFiles,
  type PopupObjectManifestV1,
} from "@slotclientengine/rendercore/popup/editor";
import { LAYOUT_ZIP_LIMITS } from "./imported-layout-zip.js";
import { packageKeyPrefix } from "./package-key-prefix.js";

export interface ImportedPopupObjectPackage {
  readonly manifest: PopupObjectManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly rootKey: string;
}

export async function importPopupObjectPackageZip(
  bytes: Uint8Array,
): Promise<ImportedPopupObjectPackage> {
  const files = normalizeEditorPackageZipEntries(
    extractBoundedZip(bytes, { limits: LAYOUT_ZIP_LIMITS }),
    ["popup-object.manifest.json"],
  );
  const root = files.get("popup-object.manifest.json");
  if (!root)
    throw new Error(
      "Popup Object ZIP 缺少根 popup-object.manifest.json sentinel。",
    );
  const sourceManifest = parsePopupObjectManifest(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(root)),
  );
  if (files.has(EDITOR_ASSETS_MAP_PATH))
    await validateEditorAssetsMapPackage({
      map: decodeEditorAssetsMap(files.get(EDITOR_ASSETS_MAP_PATH)!),
      files,
      allowControlPaths: ["popup-object.manifest.json"],
    });
  else collectPopupObjectPackagePaths({ manifest: sourceManifest, files });
  const resolved = await resolvePopupObjectPackageFiles({
    manifest: sourceManifest,
    files,
  });
  collectPopupObjectPackagePaths({ manifest: sourceManifest, files: resolved });
  const prepared = await createPopupObjectPackageResource({
    manifest: sourceManifest,
    files,
  });
  await prepared.resource.destroy();
  const namespaced = namespaceMappedPopupObjectPackageFiles({
    manifest: sourceManifest,
    files: resolved,
    keyPrefix: packageKeyPrefix(sourceManifest.name),
  });
  return Object.freeze({
    manifest: namespaced.manifest,
    rootKey: namespaced.rootKey,
    files: new Map(
      [...namespaced.files].map(
        ([path, payload]) => [path, payload.slice()] as const,
      ),
    ),
  });
}
