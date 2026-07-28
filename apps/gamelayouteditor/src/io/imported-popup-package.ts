import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  decodeEditorAssetsMap,
  EDITOR_ASSETS_MAP_PATH,
  normalizeEditorPackageZipEntries,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import {
  collectPopupPackagePaths,
  createPopupPackageResource,
  flattenPopupPackageFiles,
  parsePopupManifest,
  resolvePopupPackageFiles,
} from "@slotclientengine/rendercore/popup";
import { LAYOUT_ZIP_LIMITS } from "./imported-layout-zip.js";

export interface ImportedPopupPackage {
  readonly manifest: ReturnType<typeof parsePopupManifest>;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export async function importPopupPackageZip(
  bytes: Uint8Array,
  options: {
    readonly decodeImage?: (
      blob: Blob,
    ) => Promise<{ width: number; height: number }>;
  } = {},
): Promise<ImportedPopupPackage> {
  const files = normalizeEditorPackageZipEntries(
    extractBoundedZip(bytes, {
      limits: LAYOUT_ZIP_LIMITS,
    }),
    ["popup.manifest.json"],
  );
  const root = files.get("popup.manifest.json");
  if (!root) throw new Error("Popup ZIP 缺少根 popup.manifest.json sentinel。");
  const manifest = parsePopupManifest(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(root)),
  );
  const assetsMap = files.get(EDITOR_ASSETS_MAP_PATH);
  if (assetsMap)
    await validateEditorAssetsMapPackage({
      map: decodeEditorAssetsMap(assetsMap),
      files,
      allowControlPaths: ["popup.manifest.json"],
    });
  const virtual = await resolvePopupPackageFiles({ manifest, files });
  collectPopupPackagePaths({ manifest, files: virtual });
  const resource = await createPopupPackageResource({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
  });
  await resource.destroy();
  const flattened = flattenPopupPackageFiles({ manifest, files: virtual });
  return Object.freeze({
    manifest: flattened.manifest,
    files: new Map(
      [...flattened.files].map(
        ([path, payload]) => [path, payload.slice()] as const,
      ),
    ),
  });
}
