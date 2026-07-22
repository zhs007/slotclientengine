import { extractBoundedZip } from "@slotclientengine/browserartifactio";
import { normalizeEditorPackageZipEntries } from "@slotclientengine/editorresource";
import {
  createSymbolPackageResource,
  materializeMappedSymbolPackageContents,
  parseSymbolPackageManifest,
  resolveSymbolPackageFiles,
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
  const files = normalizeEditorPackageZipEntries(
    extractBoundedZip(zipBytes, { limits: SYMBOL_ZIP_LIMITS }),
    ["symbols.package.json"],
  );
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
  const sourceResource = await createSymbolPackageResource({
    packageManifest,
    files,
    loadTextures: false,
  });
  const materialized = await materializeMappedSymbolPackageContents({
    packageManifest: sourceResource.packageManifest,
    rawGameConfig: sourceResource.rawGameConfig,
    rawSymbolManifest: sourceResource.rawSymbolManifest,
    assets: sourceResource.assets,
  });
  sourceResource.destroy();
  const resource = await createSymbolPackageResource({
    packageManifest: materialized.packageManifest,
    files: materialized.files,
    loadTextures: options.loadTextures,
  });
  const virtual = await resolveSymbolPackageFiles({
    packageManifest: materialized.packageManifest,
    files: materialized.files,
  });
  return Object.freeze({
    resource,
    files: new Map(
      [...virtual].map(([path, bytes]) => [path, bytes.slice()] as const),
    ),
  });
}

export function assertStrictSymbolsPackagePaths(
  _files: ReadonlyMap<string, Uint8Array>,
): void {
  // Kept as a compatibility export. Filename keys deliberately preserve case.
}

export async function importSymbolsZip(
  zipBytes: Uint8Array,
  options: { readonly loadTextures?: boolean } = {},
): Promise<SymbolPackageResource> {
  return (await importSymbolsZipWithFiles(zipBytes, options)).resource;
}
