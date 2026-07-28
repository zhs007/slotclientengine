import { readFile } from "node:fs/promises";
import {
  extractBoundedZip,
  type BoundedZipLimits,
} from "@slotclientengine/browserartifactio";
import {
  decodeEditorAssetsMap,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import {
  collectSceneLayoutAssetPaths,
  collectSceneLayoutPackagePaths,
  parseSceneLayoutManifest,
  SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS,
} from "@slotclientengine/rendercore/scene-layout";
import type { ValidatedLayoutPackage } from "./types.js";

const ROOT_MANIFEST = "layout.manifest.json";
const ASSETS_MAP = "assets.map.json";

export async function readAndValidateLayoutPackage(
  inputPath: string,
): Promise<ValidatedLayoutPackage> {
  return validateLayoutPackageBytes(new Uint8Array(await readFile(inputPath)));
}

export async function validateLayoutPackageBytes(
  zipBytes: Uint8Array,
  limits: BoundedZipLimits = SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS,
): Promise<ValidatedLayoutPackage> {
  let entries: Map<string, Uint8Array>;
  try {
    entries = extractBoundedZip(zipBytes, {
      limits,
      pathPolicy: { requireLowercase: true },
    });
  } catch (error) {
    throw new Error(`Scene Layout ZIP 无效：${formatError(error)}`);
  }
  const manifestBytes = entries.get(ROOT_MANIFEST);
  if (!manifestBytes)
    throw new Error(`Scene Layout ZIP 缺少根 ${ROOT_MANIFEST}。`);
  const mapBytes = entries.get(ASSETS_MAP);
  if (!mapBytes)
    throw new Error(
      "只支持当前 filename-key Scene Layout ZIP；缺少 assets.map.json。",
    );
  const manifest = parseSceneLayoutManifest(
    parseJson(manifestBytes, ROOT_MANIFEST),
  );
  if (!manifest.gameModes || manifest.gameModes.modes.length === 0)
    throw new Error("Scene Layout ZIP 必须声明非空 gameModes 和 initialMode。");
  const direct = collectSceneLayoutAssetPaths(manifest);
  if (direct.some((key) => key.includes("/")))
    throw new Error(
      "只支持 filename-key Scene Layout ZIP，不支持 legacy direct-path package。",
    );
  const assetsMap = decodeEditorAssetsMap(mapBytes);
  const resolved = await validateEditorAssetsMapPackage({
    map: assetsMap,
    files: entries,
    allowControlPaths: [ROOT_MANIFEST],
  });
  const files = new Map<string, Uint8Array>([
    [ROOT_MANIFEST, manifestBytes.slice()],
  ]);
  const sourceEntries = new Map<
    string,
    (typeof assetsMap.files)[string] & { readonly bytes: Uint8Array }
  >();
  for (const [key, asset] of resolved) {
    files.set(key, asset.bytes.slice());
    sourceEntries.set(
      key,
      Object.freeze({
        path: asset.path,
        sha256: asset.sha256,
        mediaType: asset.mediaType,
        byteLength: asset.byteLength,
        bytes: asset.bytes.slice(),
      }),
    );
  }
  collectSceneLayoutPackagePaths({ manifest, files });
  return Object.freeze({
    zipBytes: zipBytes.slice(),
    manifest,
    assetsMap,
    files: readonlyMap(files),
    sourceEntries: readonlyMap(sourceEntries),
  });
}

export function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${label} JSON 无效：${formatError(error)}`);
  }
}

function readonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const copy = new Map(source);
  for (const method of ["set", "delete", "clear"] as const)
    Object.defineProperty(copy, method, {
      value: () => {
        throw new Error("validated package map 不可修改。");
      },
    });
  return copy;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
