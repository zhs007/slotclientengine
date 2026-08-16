import type { V5GProjectConfig } from "./types.js";
import { assertVNIProject } from "./validation.js";

export type AssetUrlManifest = Readonly<Record<string, string>>;

export function createAssetUrlManifest(
  modules: Record<string, string>,
): AssetUrlManifest {
  const entries = Object.entries(modules).map(([modulePath, url]) => {
    const filename = getFilename(modulePath);
    return [`assets/${filename}`, url] as const;
  });
  return Object.freeze(Object.fromEntries(entries));
}

export function resolveProjectAssetUrls(
  project: V5GProjectConfig,
  manifest: AssetUrlManifest,
): AssetUrlManifest {
  const resolved: Record<string, string> = {};
  for (const asset of project.assets) {
    const url = manifest[asset.path];
    if (!url) {
      throw new Error(`V5G asset path is missing from manifest: ${asset.path}`);
    }
    resolved[asset.path] = url;
  }
  return Object.freeze(resolved);
}

/** Rewrites only schema-declared VNI asset references. */
export function rewriteVNIProjectAssetPaths(
  value: unknown,
  rewrite: (path: string, assetId: string) => string,
): V5GProjectConfig {
  assertVNIProject(value);
  const project = structuredClone(value) as V5GProjectConfig;
  for (const asset of project.assets) {
    const next = rewrite(asset.path, asset.id);
    if (typeof next !== "string" || next.length === 0) {
      throw new Error(
        `VNI asset "${asset.id}" rewrite returned an empty path.`,
      );
    }
    asset.path = next;
  }
  assertVNIProject(project);
  return project;
}

function getFilename(path: string): string {
  const parts = path.split(/[\\/]/u);
  const filename = parts.at(-1);
  if (!filename) {
    throw new Error(`Cannot parse V5G asset module path: ${path}`);
  }
  return filename;
}
