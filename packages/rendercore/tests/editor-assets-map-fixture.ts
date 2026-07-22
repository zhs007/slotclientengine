import {
  allocateContentAddressedPath,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  canonicalExtensionOfEditorAssetKey,
  serializeEditorAssetsMap,
  type EditorAssetsMapV1,
} from "@slotclientengine/editorresource";

export async function createMappedPackageFiles(options: {
  readonly controls: ReadonlyMap<string, Uint8Array>;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}): Promise<{
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly map: EditorAssetsMapV1;
}> {
  const entries: Record<string, unknown> = {};
  const files = new Map<string, Uint8Array>(
    [...options.controls].map(
      ([path, bytes]) => [path, bytes.slice()] as const,
    ),
  );
  for (const [key, bytes] of options.assets) {
    const sha256 = await sha256Hex(bytes);
    const path = allocateContentAddressedPath({
      digest: sha256,
      extension: canonicalExtensionOfEditorAssetKey(key),
    });
    entries[key] = {
      path,
      sha256,
      mediaType: mediaType(key),
      byteLength: bytes.byteLength,
    };
    if (!files.has(path)) files.set(path, bytes.slice());
  }
  const map = {
    version: 1,
    kind: "editor-assets",
    files: entries,
  } as unknown as EditorAssetsMapV1;
  files.set("assets.map.json", serializeEditorAssetsMap(map));
  return { files, map };
}

function mediaType(key: string): string {
  const extension = canonicalExtensionOfEditorAssetKey(key);
  if (extension === "png") return "image/png";
  if (extension === "jpg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "json") return "application/json";
  if (extension === "atlas") return "text/plain";
  if (extension === "mp4") return "video/mp4";
  return "application/octet-stream";
}
