import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  createSymbolPackageResource,
  parseSymbolPackageManifest,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore/symbol";
import {
  createFromImportedPackage,
  exportSnapshot,
  type SymbolEditorProject,
} from "../model/editor-project.js";

export const SYMBOL_ZIP_LIMITS = Object.freeze({
  maxEntries: 1024,
  maxCompressedBytes: 100 * 1024 * 1024,
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
});

export interface ImportedSymbolEditorPackage {
  readonly project: SymbolEditorProject;
  readonly resource: SymbolPackageResource;
  destroy(): void;
}

export async function importSymbolPackageZip(
  bytes: Uint8Array,
  options: { readonly loadTextures?: boolean } = {},
): Promise<ImportedSymbolEditorPackage> {
  const files = extractBoundedZip(bytes, { limits: SYMBOL_ZIP_LIMITS });
  const manifestBytes = files.get("symbols.package.json");
  if (!manifestBytes)
    throw new Error("zip 根目录必须包含 symbols.package.json。");
  const rawPackageManifest = parseJson(manifestBytes, "symbols.package.json");
  const packageManifest = parseSymbolPackageManifest(rawPackageManifest);
  const resource = await createSymbolPackageResource({
    packageManifest,
    files,
    loadTextures: options.loadTextures,
  });
  try {
    const project = createFromImportedPackage({
      packageManifest,
      rawGameConfig: resource.rawGameConfig,
      rawSymbolManifest: resource.rawSymbolManifest,
      assets: resource.assets,
    });
    let destroyed = false;
    return Object.freeze({
      project,
      resource,
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        resource.destroy();
      },
    });
  } catch (error) {
    resource.destroy();
    throw error;
  }
}

export async function exportSymbolPackageZip(
  project: SymbolEditorProject,
  options: { readonly loadTextures?: boolean } = {},
): Promise<{
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly blob: Blob;
}> {
  const snapshot = exportSnapshot(project);
  const files = createSnapshotFiles(snapshot);
  const validationResource = await createSymbolPackageResource({
    packageManifest: snapshot.packageManifest,
    files,
    loadTextures: options.loadTextures,
  });
  validationResource.destroy();
  const bytes = createDeterministicZip(files);
  return Object.freeze({
    fileName: `${snapshot.packageManifest.id}-symbols.zip`,
    bytes,
    blob: new Blob([bytes as BlobPart], { type: "application/zip" }),
  });
}

export function createSnapshotFiles(
  snapshot: ReturnType<typeof exportSnapshot>,
): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set("symbols.package.json", encodeStableJson(snapshot.packageManifest));
  files.set(
    snapshot.packageManifest.entrypoints.gameConfig,
    encodeStableJson(snapshot.rawGameConfig),
  );
  files.set(
    snapshot.packageManifest.entrypoints.symbolManifest,
    encodeStableJson(snapshot.symbolManifest),
  );
  for (const [path, bytes] of snapshot.assets) files.set(path, bytes.slice());
  return files;
}

export function encodeStableJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(sortValue(value), null, 2)}\n`,
  );
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `${path} 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}
