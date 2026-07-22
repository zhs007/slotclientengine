import {
  collectSceneLayoutAssetPaths,
  type SceneLayoutManifestV1,
} from "@slotclientengine/rendercore/scene-layout";
import type { EditorProject } from "../model/editor-project.js";
import { editorResourcePaths } from "../model/editor-resource.js";

export function collectLayoutPreviewAssetPaths(
  project: EditorProject,
  manifest: SceneLayoutManifestV1,
): ReadonlySet<string> {
  const paths = new Set(collectSceneLayoutAssetPaths(manifest));
  for (const node of manifest.nodes) {
    if (node.resource.kind !== "image-string") continue;
    const manifestPath = node.resource.manifest;
    const resource = [...project.resources.values()].find(
      (candidate) =>
        candidate.kind === "image-string" &&
        candidate.manifestPath === manifestPath,
    );
    if (resource)
      for (const path of editorResourcePaths(resource)) paths.add(path);
  }
  for (const id of Object.keys(manifest.symbolPackages ?? {})) {
    const dependency = project.symbolDependencies.get(id);
    if (!dependency) throw new Error(`预览缺少 Symbols dependency：${id}`);
    for (const key of dependency.keys) paths.add(key);
  }
  if (manifest.symbolPackage) {
    const dependency = [...project.symbolDependencies.values()].find(
      (candidate) => candidate.rootKey === manifest.symbolPackage!.manifest,
    );
    if (!dependency)
      throw new Error(
        `预览缺少 Symbols dependency：${manifest.symbolPackage.manifest}`,
      );
    for (const key of dependency.keys) paths.add(key);
  }
  for (const id of Object.keys(manifest.popups ?? {})) {
    const dependency = project.popupDependencies.get(id);
    if (!dependency) throw new Error(`预览缺少 Popup dependency：${id}`);
    for (const key of dependency.keys) paths.add(key);
  }
  return paths;
}
