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

export interface ImportedSymbolPackage {
  readonly resource: SymbolPackageResource;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export async function importSymbolsZipWithFiles(
  zipBytes: Uint8Array,
  options: { readonly loadTextures?: boolean } = {},
): Promise<ImportedSymbolPackage> {
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
  assertStrictSymbolsPackagePaths(files);
  const resource = await createSymbolPackageResource({
    packageManifest,
    files,
    loadTextures: options.loadTextures,
  });
  return Object.freeze({
    resource,
    files: new Map(
      [...files].map(([path, bytes]) => [path, bytes.slice()] as const),
    ),
  });
}

export function assertStrictSymbolsPackagePaths(
  files: ReadonlyMap<string, Uint8Array>,
): void {
  const legacyPath = [...files.keys()].find(
    (path) => path !== path.toLowerCase(),
  );
  if (legacyPath) {
    throw new Error(
      `旧版 symbols package 包含非小写路径 ${legacyPath}；请先在 Symbols Editor 中导入并重新导出，再导入 Game Layout Editor。`,
    );
  }
}

export async function importSymbolsZip(
  zipBytes: Uint8Array,
  options: { readonly loadTextures?: boolean } = {},
): Promise<SymbolPackageResource> {
  return (await importSymbolsZipWithFiles(zipBytes, options)).resource;
}
