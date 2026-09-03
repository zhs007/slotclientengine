import {
  collectSceneLayoutAssetPaths,
  type SceneLayoutManifest,
} from "@slotclientengine/rendercore/scene-layout/data";
import type { EditorProject } from "../model/editor-project.js";
import { editorResourcePaths } from "../model/editor-resource.js";

export function collectLayoutPreviewAssetPaths(
  project: EditorProject,
  manifest: SceneLayoutManifest,
): ReadonlySet<string> {
  const paths = new Set(collectSceneLayoutAssetPaths(manifest));
  for (const node of manifest.nodes) {
    if (!("resource" in node)) continue;
    if (node.resource.kind !== "image-string" && node.resource.kind !== "vni")
      continue;
    const manifestPath =
      node.resource.kind === "image-string"
        ? node.resource.manifest
        : node.resource.project;
    const resource = [...project.resources.values()].find(
      (candidate) =>
        (candidate.kind === "image-string" &&
          candidate.manifestPath === manifestPath) ||
        (candidate.kind === "vni" && candidate.projectPath === manifestPath),
    );
    if (resource)
      for (const path of editorResourcePaths(resource)) paths.add(path);
  }
  for (const spec of Object.values(manifest.runtimeResources ?? {})) {
    if (spec.kind !== "image-string" && spec.kind !== "vni") continue;
    const root = spec.kind === "image-string" ? spec.manifest : spec.project;
    const resource = [...project.resources.values()].find(
      (candidate) =>
        (candidate.kind === "image-string" &&
          candidate.manifestPath === root) ||
        (candidate.kind === "vni" && candidate.projectPath === root),
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
  if (
    (manifest.version === 7 || manifest.version === 8) &&
    manifest.tapInfoObject
  ) {
    const dependency = [...project.popupObjectDependencies.values()].find(
      (candidate) => candidate.rootKey === manifest.tapInfoObject!.manifest,
    );
    if (!dependency)
      throw new Error(
        `预览缺少 Tap info Popup Object dependency：${manifest.tapInfoObject.manifest}`,
      );
    for (const key of dependency.keys) paths.add(key);
  }
  return paths;
}
