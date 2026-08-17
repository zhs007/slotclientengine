import {
  extractBoundedZip,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  decodeEditorAssetsMap,
  editorAssetKeyCollisionToken,
  EDITOR_ASSETS_MAP_PATH,
  normalizeEditorPackageZipEntries,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import {
  collectPopupPackagePaths,
  createPopupPackageResource,
  flattenPopupPackageFiles,
  namespaceMappedPopupPackageFiles,
  loadPopupManifest,
  parsePopupManifest,
  resolvePopupPackageFiles,
  type LatestPopupManifest,
} from "@slotclientengine/rendercore/popup/editor";
import { LAYOUT_ZIP_LIMITS } from "./imported-layout-zip.js";
import { packageKeyPrefix } from "./package-key-prefix.js";

export interface ImportedPopupPackage {
  readonly manifest: LatestPopupManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly rootKey: string;
  readonly sourceSpineAssets: readonly ImportedPopupSpineAsset[];
}

export interface ImportedPopupSpineAsset {
  readonly resourceKey: string;
  readonly kind: "atlas" | "texture";
  readonly key: string;
  readonly sha256: string;
}

export interface LayoutSpineAssetForPopupReview {
  readonly resourceId: string;
  readonly kind: "atlas" | "texture";
  readonly key: string;
  readonly bytes: Uint8Array;
}

export interface PopupSpineAssetConflict {
  readonly popupResourceKey: string;
  readonly popupAssetKey: string;
  readonly popupSha256: string;
  readonly layoutResourceId: string;
  readonly layoutAssetKey: string;
  readonly layoutSha256: string;
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
  const sourceManifest = parsePopupManifest(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(root)),
  );
  const assetsMap = files.get(EDITOR_ASSETS_MAP_PATH);
  if (assetsMap)
    await validateEditorAssetsMapPackage({
      map: decodeEditorAssetsMap(assetsMap),
      files,
      allowControlPaths: ["popup.manifest.json"],
    });
  const virtual = await resolvePopupPackageFiles({
    manifest: sourceManifest,
    files,
  });
  collectPopupPackagePaths({ manifest: sourceManifest, files: virtual });
  const resource = await createPopupPackageResource({
    manifest: sourceManifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
  });
  await resource.destroy();
  const manifest = loadPopupManifest(sourceManifest).manifest;
  const flattened = flattenPopupPackageFiles({ manifest, files: virtual });
  const sourceSpineAssets = await collectImportedPopupSpineAssets(flattened);
  const namespaced = namespaceMappedPopupPackageFiles({
    ...flattened,
    keyPrefix: packageKeyPrefix(flattened.manifest.id),
  });
  return Object.freeze({
    manifest: loadPopupManifest(namespaced.manifest).manifest,
    files: new Map(
      [...namespaced.files].map(
        ([path, payload]) => [path, payload.slice()] as const,
      ),
    ),
    rootKey: namespaced.rootKey,
    sourceSpineAssets,
  });
}

export async function findPopupSpineAssetConflicts(options: {
  readonly imported: ImportedPopupPackage;
  readonly layoutAssets: readonly LayoutSpineAssetForPopupReview[];
}): Promise<readonly PopupSpineAssetConflict[]> {
  const layout = await Promise.all(
    options.layoutAssets.map(async (asset) => ({
      ...asset,
      sha256: await sha256Hex(asset.bytes),
    })),
  );
  const conflicts: PopupSpineAssetConflict[] = [];
  for (const popupAsset of options.imported.sourceSpineAssets) {
    const token = editorAssetKeyCollisionToken(popupAsset.key);
    for (const layoutAsset of layout) {
      if (layoutAsset.kind !== popupAsset.kind) continue;
      if (editorAssetKeyCollisionToken(layoutAsset.key) !== token) continue;
      if (layoutAsset.sha256 === popupAsset.sha256) continue;
      conflicts.push(
        Object.freeze({
          popupResourceKey: popupAsset.resourceKey,
          popupAssetKey: popupAsset.key,
          popupSha256: popupAsset.sha256,
          layoutResourceId: layoutAsset.resourceId,
          layoutAssetKey: layoutAsset.key,
          layoutSha256: layoutAsset.sha256,
        }),
      );
    }
  }
  return Object.freeze(
    conflicts.sort((left, right) =>
      [left.layoutResourceId, left.layoutAssetKey, left.popupResourceKey]
        .join("\u0000")
        .localeCompare(
          [
            right.layoutResourceId,
            right.layoutAssetKey,
            right.popupResourceKey,
          ].join("\u0000"),
          "en",
        ),
    ),
  );
}

async function collectImportedPopupSpineAssets(options: {
  readonly manifest: ReturnType<typeof parsePopupManifest>;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): Promise<readonly ImportedPopupSpineAsset[]> {
  const assets: ImportedPopupSpineAsset[] = [];
  for (const [resourceKey, resource] of Object.entries(
    options.manifest.resources,
  )) {
    if (resource.kind !== "spine") continue;
    for (const [kind, key] of [
      ["atlas", resource.atlas],
      ...Object.values(resource.textures).map(
        (path) => ["texture", path] as const,
      ),
    ] as const) {
      const bytes = options.files.get(key);
      if (!bytes) throw new Error(`Popup Spine review 缺少资源：${key}`);
      assets.push(
        Object.freeze({
          resourceKey,
          kind,
          key,
          sha256: await sha256Hex(bytes),
        }),
      );
    }
  }
  return Object.freeze(
    assets.sort((left, right) =>
      [left.resourceKey, left.kind, left.key]
        .join("\u0000")
        .localeCompare(
          [right.resourceKey, right.kind, right.key].join("\u0000"),
          "en",
        ),
    ),
  );
}
