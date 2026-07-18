import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
} from "@slotclientengine/rendercore/scene-layout";
import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import { assertCanonicalPackagePath } from "./filename-policy.js";
import { validateLayoutAssets } from "./imported-layout-zip.js";

export async function exportLayoutZip(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: (
    url: string,
  ) => Promise<{ readonly width: number; readonly height: number }>;
}): Promise<{
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly blob: Blob;
}> {
  const manifest = parseSceneLayoutManifest(options.manifest);
  if (manifest.id !== manifest.id.toLowerCase()) {
    throw new Error("project id 必须为小写。");
  }
  for (const path of collectSceneLayoutAssetPaths(manifest)) {
    assertCanonicalPackagePath(path);
  }
  const closureAssets = new Map<string, Uint8Array>();
  for (const path of collectSceneLayoutAssetPaths(manifest)) {
    const bytes = options.assets.get(path);
    if (!bytes) throw new Error(`导出资源闭包缺少 bytes：${path}`);
    closureAssets.set(path, bytes.slice());
  }
  const validated = await validateLayoutAssets(manifest, closureAssets, {
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
  });
  validated.destroy();
  const entries: Record<string, Uint8Array> = {
    "layout.manifest.json": new TextEncoder().encode(
      stableManifestJson(manifest),
    ),
  };
  for (const path of [...closureAssets.keys()].sort()) {
    entries[path] = closureAssets.get(path)!.slice();
  }
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

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}
