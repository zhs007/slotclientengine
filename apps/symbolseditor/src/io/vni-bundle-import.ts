import {
  inspectSymbolVniExportBundle,
  materializeSymbolVniExportBundleRuntime,
  type SymbolVniBundleRuntimeProfile,
} from "@slotclientengine/rendercore/symbol";
import type { EditorImportSourceFile } from "@slotclientengine/editorresource";

export type SymbolVniRuntimeProfile = SymbolVniBundleRuntimeProfile;

export function inspectSymbolVniBundleProfiles(
  entries: ReadonlyMap<string, Uint8Array>,
): readonly SymbolVniRuntimeProfile[] | null {
  return inspectSymbolVniExportBundle(entries);
}

export function createSymbolVniBundleImportSources(options: {
  readonly entries: ReadonlyMap<string, Uint8Array>;
  readonly containerName: string;
  readonly selectedProfileId?: string;
}): readonly EditorImportSourceFile[] {
  const runtime = materializeSymbolVniExportBundleRuntime({
    entries: options.entries,
    ...(options.selectedProfileId
      ? { selectedProfileId: options.selectedProfileId }
      : {}),
  });
  return Object.freeze(
    [runtime.project, ...runtime.assets].map(({ sourcePath, key, bytes }) =>
      Object.freeze({
        sourcePath,
        key,
        bytes: bytes.slice(),
        container: "zip" as const,
        containerName: options.containerName,
      }),
    ),
  );
}
