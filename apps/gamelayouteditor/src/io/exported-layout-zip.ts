import {
  collectSceneLayoutAssetPaths,
  collectSceneLayoutPackagePaths,
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
} from "@slotclientengine/rendercore/scene-layout";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string";
import {
  collectSymbolPackageEntryPaths,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol";
import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { assertCanonicalPackagePath } from "./filename-policy.js";
import { validateLayoutAssets } from "./imported-layout-zip.js";

export async function exportLayoutZip(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly symbolFiles?: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: (
    url: string,
  ) => Promise<{ readonly width: number; readonly height: number }>;
}): Promise<{
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly blob: Blob;
}> {
  const manifest = parseSceneLayoutManifest(options.manifest);
  if (manifest.id !== manifest.id.toLowerCase())
    throw new Error("project id 必须为小写。");
  const closure = new Map<string, Uint8Array>();
  const add = (path: string, source = options.assets) => {
    assertCanonicalPackagePath(path);
    const bytes = source.get(path);
    if (!bytes) throw new Error(`导出资源闭包缺少 bytes：${path}`);
    closure.set(path, bytes.slice());
  };
  for (const path of collectSceneLayoutAssetPaths(manifest)) {
    if (
      path === manifest.symbolPackage?.manifest ||
      manifest.nodes.some(
        (node) =>
          node.resource.kind === "image-string" &&
          node.resource.manifest === path,
      )
    )
      continue;
    add(path);
  }
  for (const node of manifest.nodes) {
    if (
      node.resource.kind !== "image-string" ||
      closure.has(node.resource.manifest)
    )
      continue;
    add(node.resource.manifest);
    const nested = parseImageStringManifest(
      parseJson(
        options.assets.get(node.resource.manifest),
        node.resource.manifest,
      ),
    );
    const directory = node.resource.manifest.slice(
      0,
      node.resource.manifest.lastIndexOf("/"),
    );
    for (const path of collectImageStringAssetPaths(nested))
      add(`${directory}/${path}`);
  }
  if (manifest.symbolPackage) {
    const files = options.symbolFiles;
    if (!files)
      throw new Error("manifest 绑定 symbols package，但未提供 symbolFiles。");
    const nested = parseSymbolPackageManifest(
      parseJson(files.get("symbols.package.json"), "symbols.package.json"),
    );
    if (nested.id !== manifest.symbolPackage.manifest.split("/").at(-2))
      throw new Error("symbols package id 与 layout binding 目录不一致。");
    const directory = manifest.symbolPackage.manifest.slice(
      0,
      manifest.symbolPackage.manifest.lastIndexOf("/"),
    );
    for (const path of collectSymbolPackageEntryPaths(nested)) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`symbols dependency 缺少 bytes：${path}`);
      closure.set(`${directory}/${path}`, bytes.slice());
    }
  }
  collectSceneLayoutPackagePaths({ manifest, files: closure });
  const validated = await validateLayoutAssets(manifest, closure, {
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
  });
  validated.destroy();
  const entries: Record<string, Uint8Array> = {
    "layout.manifest.json": new TextEncoder().encode(
      stableManifestJson(manifest),
    ),
  };
  for (const path of [...closure.keys()].sort())
    entries[path] = closure.get(path)!.slice();
  const bytes = createDeterministicZip(entries, {
    level: 6,
    pathPolicy: { requireLowercase: true },
  });
  return Object.freeze({
    fileName: `${manifest.id}-layout.zip`,
    bytes,
    blob: new Blob([bytes as BlobPart], { type: "application/zip" }),
  });
}

export function stableManifestJson(
  manifestValue: SceneLayoutManifestV1,
): string {
  const manifest = parseSceneLayoutManifest(manifestValue);
  return `${JSON.stringify(sortValue(manifest), null, 2)}\n`;
}

function parseJson(bytes: Uint8Array | undefined, path: string): unknown {
  if (!bytes) throw new Error(`缺少 JSON：${path}`);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
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
