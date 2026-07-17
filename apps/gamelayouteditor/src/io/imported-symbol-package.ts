import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import {
  createSymbolPackageResource,
  parseSymbolPackageManifest,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore/symbol";

export const SYMBOL_ZIP_LIMITS = Object.freeze({
  maxEntries: 1024,
  maxCompressedBytes: 100 * 1024 * 1024,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
});

export async function importSymbolsZip(
  zipBytes: Uint8Array,
  options: { readonly loadTextures?: boolean } = {},
): Promise<SymbolPackageResource> {
  const files = extractBoundedZip(zipBytes, { limits: SYMBOL_ZIP_LIMITS });
  const manifestBytes = files.get("symbols.package.json");
  if (!manifestBytes) {
    throw new Error("symbols ZIP 根目录必须包含 symbols.package.json。");
  }
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
    );
  } catch (error) {
    throw new Error(
      `symbols.package.json 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const packageManifest = parseSymbolPackageManifest(rawManifest);
  return createSymbolPackageResource({
    packageManifest,
    files,
    loadTextures: options.loadTextures,
  });
}
