import {
  collectSceneLayoutPackagePaths,
  inspectSceneLayoutRuntimeEventCatalog,
  type GameLayoutRuntimeEventCatalog,
} from "@slotclientengine/rendercore/scene-layout/editor";
import type { SceneLayoutManifest } from "@slotclientengine/rendercore/scene-layout/data";

/**
 * Inspects one manifest from the Editor's larger authoring workspace.
 * Unreferenced library assets remain in the workspace but are not package files.
 */
export function inspectEditorWorkspaceRuntimeEventCatalog(options: {
  readonly manifest: SceneLayoutManifest;
  readonly workspaceFiles: ReadonlyMap<string, Uint8Array>;
}): GameLayoutRuntimeEventCatalog {
  const closurePaths = collectSceneLayoutPackagePaths({
    manifest: options.manifest,
    files: options.workspaceFiles,
    allowExtraFiles: true,
  });
  return inspectSceneLayoutRuntimeEventCatalog({
    manifest: options.manifest,
    files: new Map(
      closurePaths.map(
        (path) => [path, options.workspaceFiles.get(path)!] as const,
      ),
    ),
  });
}
