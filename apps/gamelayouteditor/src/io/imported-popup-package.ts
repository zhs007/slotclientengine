import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  collectPopupPackagePaths,
  createPopupPackageResource,
  parsePopupManifest,
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
  const files = extractBoundedZip(bytes, {
    limits: LAYOUT_ZIP_LIMITS,
    pathPolicy: { requireLowercase: true },
  });
  const root = files.get("popup.manifest.json");
  if (!root) throw new Error("Popup ZIP 缺少根 popup.manifest.json sentinel。");
  const manifest = parsePopupManifest(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(root)),
  );
  collectPopupPackagePaths({ manifest, files });
  const resource = await createPopupPackageResource({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
  });
  await resource.destroy();
  return Object.freeze({
    manifest,
    files: new Map(
      [...files].map(([path, payload]) => [path, payload.slice()] as const),
    ),
  });
}
