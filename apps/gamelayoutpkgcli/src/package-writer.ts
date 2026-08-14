import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  allocateContentAddressedPath,
  createDeterministicZip,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  canonicalExtensionOfEditorAssetKey,
  serializeEditorAssetsMap,
  type EditorAssetsMapEntry,
  type EditorAssetsMapV1,
} from "@slotclientengine/editorresource";
import type { SceneLayoutManifest } from "@slotclientengine/rendercore/scene-layout";
import { validateLayoutPackageBytes } from "./package-reader.js";
import { encodeStableJson } from "./reference-rewriter.js";
import type {
  OptimizedLogicalAsset,
  WrittenOptimizedPackage,
} from "./types.js";

export async function buildOptimizedPackage(options: {
  readonly manifest: SceneLayoutManifest;
  readonly assets: ReadonlyMap<string, OptimizedLogicalAsset>;
}): Promise<WrittenOptimizedPackage> {
  const mapEntries: Record<string, EditorAssetsMapEntry> = {};
  const payloads = new Map<string, Uint8Array>();
  for (const [key, asset] of [...options.assets].sort(([left], [right]) =>
    compare(left, right),
  )) {
    const sha256 = await sha256Hex(asset.bytes);
    const path = allocateContentAddressedPath({
      digest: sha256,
      extension: getPhysicalExtension(key, asset.mediaType),
    });
    mapEntries[key] = Object.freeze({
      path,
      sha256,
      mediaType: asset.mediaType,
      byteLength: asset.bytes.byteLength,
    });
    putPayload(payloads, path, asset.bytes);
  }
  const assetsMap: EditorAssetsMapV1 = Object.freeze({
    version: 1,
    kind: "editor-assets",
    files: Object.freeze(mapEntries),
  });
  const entries = new Map(payloads);
  entries.set("layout.manifest.json", encodeStableJson(options.manifest));
  entries.set("assets.map.json", serializeEditorAssetsMap(assetsMap));
  const zipBytes = createDeterministicZip(entries, {
    level: 6,
    pathPolicy: { requireLowercase: true },
  });
  await validateLayoutPackageBytes(zipBytes);
  return Object.freeze({
    zipBytes,
    assetsMap,
    assets: new Map(options.assets),
  });
}

function getPhysicalExtension(key: string, mediaType: string): string {
  if (mediaType === "image/webp") return "webp";
  return canonicalExtensionOfEditorAssetKey(key);
}

export async function commitOutputPair(options: {
  readonly outputPath: string;
  readonly zipBytes: Uint8Array;
  readonly assetsJsonPath: string;
  readonly assetsJsonBytes: Uint8Array;
}): Promise<void> {
  await ensureAbsent(options.outputPath);
  await ensureAbsent(options.assetsJsonPath);
  await mkdir(dirname(options.outputPath), { recursive: true });
  await mkdir(dirname(options.assetsJsonPath), { recursive: true });
  const zipStage = await mkdtemp(
    join(dirname(options.outputPath), ".gamelayoutpkg-"),
  );
  const jsonStage = await mkdtemp(
    join(dirname(options.assetsJsonPath), ".gamelayoutpkg-"),
  );
  const stagedZip = join(zipStage, "package.zip");
  const stagedJson = join(jsonStage, "asset-groups.json");
  let zipCommitted = false;
  try {
    await writeFile(stagedZip, options.zipBytes, {
      flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    });
    await writeFile(stagedJson, options.assetsJsonBytes, {
      flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    });
    await link(stagedZip, options.outputPath);
    zipCommitted = true;
    await link(stagedJson, options.assetsJsonPath);
  } catch (error) {
    if (zipCommitted) {
      try {
        await unlink(options.outputPath);
      } catch (rollbackError) {
        throw new Error(
          `输出提交失败且 ZIP rollback 失败：${formatError(error)}；rollback=${formatError(rollbackError)}`,
        );
      }
    }
    throw error;
  } finally {
    await rm(zipStage, { recursive: true, force: true });
    await rm(jsonStage, { recursive: true, force: true });
  }
}

function putPayload(
  payloads: Map<string, Uint8Array>,
  path: string,
  bytes: Uint8Array,
): void {
  const current = payloads.get(path);
  if (current && !sameBytes(current, bytes))
    throw new Error(`content-addressed payload collision：${path}`);
  if (!current) payloads.set(path, bytes.slice());
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

async function ensureAbsent(path: string): Promise<void> {
  try {
    await lstat(path);
  } catch (error) {
    const code = (error as { readonly code?: string }).code;
    if (code === "ENOENT") return;
    throw new Error(`无法检查输出目标 ${path}：${formatError(error)}`);
  }
  throw new Error(`输出目标已存在，拒绝覆盖：${path}`);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
