import JSZip from "jszip";
import {
  buildExportJsonFilename,
  DEFAULT_EXPORT_ZIP_FILENAME,
  VNI_VERSION,
} from "./constants";
import { toExportProject, type V5GExportProjectPurpose } from "./project_state";
import type {
  V5GAssetConfig,
  V5GBundleManifest,
  V5GBundleManifestEntry,
  V5GEditorState,
  V5GExportProfileConfig,
  V5GProjectConfig,
  V5GRuntimeAsset,
} from "./types";

const BUNDLE_MANIFEST_FILENAME = "manifest.json";
const IMPORT_CANDIDATE_JSON_PATTERN = /\.json$/i;

export interface ImportedV5GZipProject {
  project: V5GProjectConfig;
  runtimeAssets: V5GRuntimeAsset[];
  importNote?: string;
}

export interface ExportV5GZipOptions {
  assetScale?: number;
}

interface PreparedExportAsset {
  asset: V5GAssetConfig;
  file: File | Blob;
}

async function compactDuplicateProjectAssetsForExport(
  state: V5GEditorState,
  project: V5GProjectConfig,
): Promise<void> {
  const canonicalBySource = new Map<string, V5GAssetConfig>();
  const assetIdRemap = new Map<string, string>();
  const uniqueAssets: V5GAssetConfig[] = [];

  for (const asset of project.assets) {
    const sourceKey = await getExportAssetSourceKey(state, asset);
    const canonical = canonicalBySource.get(sourceKey);
    if (!canonical) {
      canonicalBySource.set(sourceKey, asset);
      uniqueAssets.push(asset);
      continue;
    }
    assetIdRemap.set(asset.id, canonical.id);
  }

  if (assetIdRemap.size === 0) return;

  for (const layer of project.layers) {
    if (layer.assetId && assetIdRemap.has(layer.assetId)) {
      layer.assetId = assetIdRemap.get(layer.assetId) ?? layer.assetId;
    }
  }
  for (const particle of project.particles) {
    if (particle.assetId && assetIdRemap.has(particle.assetId)) {
      particle.assetId = assetIdRemap.get(particle.assetId) ?? particle.assetId;
    }
  }
  project.assets = uniqueAssets;
}

async function getExportAssetSourceKey(
  state: V5GEditorState,
  asset: V5GAssetConfig,
): Promise<string> {
  const runtimeAsset = state.runtimeAssets.find((item) => item.id === asset.id);
  if (!runtimeAsset) {
    return `asset:${asset.originalName}:${asset.width}x${asset.height}:${asset.path}`;
  }
  return `file:${runtimeAsset.file.name}:${runtimeAsset.file.size}:${runtimeAsset.file.lastModified}:${await hashBlob(runtimeAsset.file)}`;
}

async function hashBlob(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return `${blob.size}:${blob.type}`;
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function buildProjectJson(state: V5GEditorState): string {
  return JSON.stringify(toExportProject(state.project, "runtime"), null, 2);
}

export function downloadText(
  filename: string,
  text: string,
  mimeType: string,
): void {
  const blob = new Blob([text], { type: mimeType });
  downloadBlob(filename, blob);
}

export async function exportProjectZip(
  state: V5GEditorState,
  filename = DEFAULT_EXPORT_ZIP_FILENAME,
  options: ExportV5GZipOptions = {},
): Promise<void> {
  const assetScale = normalizeAssetScale(options.assetScale ?? 1);
  const zip = new JSZip();
  const jsonFilename = `${buildExportJsonFilename(state.project.name)}.json`;
  const runtimeProfileId = `runtime_${Math.round(assetScale * 100)}`;
  const manifest: V5GBundleManifest = {
    type: "vni_export_bundle",
    version: VNI_VERSION,
    exports: [
      {
        id: "edit_full",
        purpose: "editing",
        assetScale: 1,
        path: `edit_full/${jsonFilename}`,
        label: "100% 完整编辑备份",
      },
      {
        id: runtimeProfileId,
        purpose: "runtime",
        assetScale,
        path: `${runtimeProfileId}/${jsonFilename}`,
        label: `${Math.round(assetScale * 100)}% 运行发布包`,
      },
    ],
  };
  zip.file(BUNDLE_MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));
  await addProjectProfileToZip(zip, state, "edit_full/", {
    id: "edit_full",
    purpose: "editing",
    assetScale: 1,
    includeExportProfile: true,
    projectPurpose: "editing",
  });
  await addProjectProfileToZip(zip, state, `${runtimeProfileId}/`, {
    id: runtimeProfileId,
    purpose: "runtime",
    assetScale,
    includeExportProfile: true,
    projectPurpose: "runtime",
  });

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(ensureZipExtension(filename), blob);
}

export async function importProjectZip(
  file: File,
): Promise<ImportedV5GZipProject> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file(BUNDLE_MANIFEST_FILENAME);
  if (manifestEntry) {
    return importBundleZip(zip, manifestEntry);
  }

  const discoveredProject = findImportProjectEntry(zip);
  if (!discoveredProject) {
    throw new Error("ZIP 中缺少有效项目 JSON 文件；请确认 ZIP 包含项目文件。");
  }
  const imported = await importSingleProjectZip(
    zip,
    discoveredProject.path,
    discoveredProject.basePath,
  );
  return imported;
}

export function sanitizeZipFilename(value: string): string {
  const withoutExt = value.replace(/\.zip$/i, "");
  const safe = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ensureZipExtension(safe || DEFAULT_EXPORT_ZIP_FILENAME);
}

async function addProjectProfileToZip(
  zip: JSZip,
  state: V5GEditorState,
  prefix: string,
  profile: V5GExportProfileConfig & {
    includeExportProfile: boolean;
    projectPurpose?: V5GExportProjectPurpose;
  },
): Promise<void> {
  const project = toExportProject(
    state.project,
    profile.projectPurpose ?? profile.purpose,
  );
  await compactDuplicateProjectAssetsForExport(state, project);
  const preparedAssets = await prepareExportAssets(
    state,
    project,
    profile.assetScale,
  );
  project.schemaVersion = VNI_VERSION;
  project.editor.version = VNI_VERSION;
  project.assets = preparedAssets.map((item) => item.asset);
  if (profile.includeExportProfile) {
    project.exportProfile = {
      id: profile.id,
      purpose: profile.purpose,
      assetScale: profile.assetScale,
      label: profile.label,
    };
  } else {
    delete project.exportProfile;
  }
  const jsonFilename = `${buildExportJsonFilename(state.project.name)}.json`;
  zip.file(`${prefix}${jsonFilename}`, JSON.stringify(project, null, 2));
  for (const prepared of preparedAssets) {
    zip.file(`${prefix}${prepared.asset.path}`, prepared.file);
  }
}

async function prepareExportAssets(
  state: V5GEditorState,
  project: V5GProjectConfig,
  requestedScale: number,
): Promise<PreparedExportAsset[]> {
  const prepared: PreparedExportAsset[] = [];
  const exportedBySource = new Map<string, PreparedExportAsset>();
  for (const asset of project.assets) {
    const sourceKey = await getExportAssetSourceKey(state, asset);
    const existing = exportedBySource.get(sourceKey);
    if (existing) {
      prepared.push({
        asset: {
          ...normalizeAssetMetadata(asset, existing.asset.fileScale),
          path: existing.asset.path,
          fileWidth: existing.asset.fileWidth,
          fileHeight: existing.asset.fileHeight,
          fileScale: existing.asset.fileScale,
        },
        file: existing.file,
      });
      continue;
    }
    const next = await prepareExportAsset(state, asset, requestedScale);
    exportedBySource.set(sourceKey, next);
    prepared.push(next);
  }
  return prepared;
}

async function prepareExportAsset(
  state: V5GEditorState,
  asset: V5GAssetConfig,
  requestedScale: number,
): Promise<PreparedExportAsset> {
  const runtimeAsset = state.runtimeAssets.find((item) => item.id === asset.id);
  if (!runtimeAsset) {
    return { asset: normalizeAssetMetadata(asset), file: new Blob([]) };
  }
  const currentScale = getAssetFileScale(asset);
  const targetScale = Math.min(
    normalizeAssetScale(requestedScale),
    currentScale,
  );
  if (
    targetScale >= currentScale - 0.0001 ||
    !canResizeImage(runtimeAsset.file)
  ) {
    const normalized = normalizeAssetMetadata(asset, currentScale);
    return { asset: normalized, file: runtimeAsset.file };
  }

  const logicalWidth = getPositiveNumber(asset.width, asset.fileWidth ?? 1);
  const logicalHeight = getPositiveNumber(asset.height, asset.fileHeight ?? 1);
  const targetWidth = Math.max(1, Math.round(logicalWidth * targetScale));
  const targetHeight = Math.max(1, Math.round(logicalHeight * targetScale));
  const blob = await resizeImageFile(
    runtimeAsset.file,
    targetWidth,
    targetHeight,
  );
  return {
    asset: {
      ...asset,
      width: logicalWidth,
      height: logicalHeight,
      fileWidth: targetWidth,
      fileHeight: targetHeight,
      fileScale: roundScale(targetScale),
    },
    file: blob,
  };
}

async function importBundleZip(
  zip: JSZip,
  manifestEntry: JSZip.JSZipObject,
): Promise<ImportedV5GZipProject> {
  const rawManifest = await manifestEntry.async("string");
  const manifest = parseBundleManifest(rawManifest);
  const selected = selectImportManifestEntry(manifest.exports);
  if (!selected) {
    throw new Error("Bundle ZIP 中没有可导入的项目版本");
  }
  const basePath = getDirectoryFromPath(selected.path);
  const imported = await importSingleProjectZip(zip, selected.path, basePath);
  const percent = Math.round(selected.assetScale * 100);
  imported.importNote =
    selected.purpose === "editing" && selected.assetScale >= 0.999
      ? `检测到多版本 Bundle，已默认导入 100% 原图编辑包：${selected.id}。`
      : `检测到多版本 Bundle，已导入 ${percent}% ${selected.purpose === "runtime" ? "运行" : "编辑"}版本：${selected.id}。`;
  return imported;
}

async function importSingleProjectZip(
  zip: JSZip,
  projectPath: string,
  assetBasePath: string,
): Promise<ImportedV5GZipProject> {
  const projectEntry = zip.file(projectPath);
  if (!projectEntry) {
    throw new Error(`ZIP 中缺少 ${projectPath}`);
  }

  const rawProject = await projectEntry.async("string");
  const project = parseProjectConfig(rawProject);
  project.assets = project.assets.map((asset) => normalizeAssetMetadata(asset));
  const runtimeAssets = await Promise.all(
    project.assets.map(async (asset) => {
      const entryPath = `${assetBasePath}${asset.path}`;
      const entry = zip.file(entryPath);
      if (!entry) {
        throw new Error(`ZIP 中缺少资源文件：${entryPath}`);
      }
      const blob = await entry.async("blob");
      const assetFilename =
        asset.originalName || getFilenameFromPath(asset.path);
      const assetFile = new File([blob], assetFilename, {
        type: getMimeType(asset.path),
      });
      return {
        id: asset.id,
        file: assetFile,
        objectUrl: URL.createObjectURL(assetFile),
      } satisfies V5GRuntimeAsset;
    }),
  );

  const profile = project.exportProfile;
  const importNote =
    profile && profile.assetScale < 0.999
      ? `已导入 ${Math.round(profile.assetScale * 100)}% 资源包；画布会按原始设计尺寸还原显示，但清晰度无法恢复到 100%。`
      : undefined;
  return { project, runtimeAssets, importNote };
}

function parseProjectConfig(rawProject: string): V5GProjectConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawProject);
  } catch {
    throw new Error("项目 JSON 文件不是有效 JSON");
  }

  if (!isProjectConfig(parsed)) {
    throw new Error("项目 JSON 文件不是有效的 VNI 项目文件");
  }
  return parsed;
}

function parseBundleManifest(rawManifest: string): V5GBundleManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawManifest);
  } catch {
    throw new Error(`${BUNDLE_MANIFEST_FILENAME} 不是有效 JSON`);
  }
  if (!isBundleManifest(parsed)) {
    throw new Error(
      `${BUNDLE_MANIFEST_FILENAME} 不是有效的 VNI 多版本导出清单`,
    );
  }
  return parsed;
}

function isProjectConfig(value: unknown): value is V5GProjectConfig {
  if (!value || typeof value !== "object") return false;
  const project = value as V5GProjectConfig;
  return (
    typeof project.name === "string" &&
    !!project.stage &&
    typeof project.stage.width === "number" &&
    typeof project.stage.height === "number" &&
    typeof project.stage.duration === "number" &&
    Array.isArray(project.assets) &&
    Array.isArray(project.layers) &&
    Array.isArray(project.particles)
  );
}

function isBundleManifest(value: unknown): value is V5GBundleManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as V5GBundleManifest;
  return (
    manifest.type === "vni_export_bundle" &&
    typeof manifest.version === "string" &&
    Array.isArray(manifest.exports) &&
    manifest.exports.every(isBundleManifestEntry)
  );
}

function isBundleManifestEntry(
  value: unknown,
): value is V5GBundleManifestEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as V5GBundleManifestEntry;
  return (
    typeof entry.id === "string" &&
    (entry.purpose === "editing" || entry.purpose === "runtime") &&
    typeof entry.assetScale === "number" &&
    typeof entry.path === "string"
  );
}

function selectImportManifestEntry(
  entries: V5GBundleManifestEntry[],
): V5GBundleManifestEntry | null {
  return (
    entries.find(
      (entry) => entry.purpose === "editing" && entry.assetScale >= 0.999,
    ) ??
    entries[0] ??
    null
  );
}

function findImportProjectEntry(
  zip: JSZip,
): { path: string; basePath: string } | null {
  const jsonEntries = zip.filter(
    (_relativePath, entry) =>
      !entry.dir && IMPORT_CANDIDATE_JSON_PATTERN.test(entry.name),
  );

  if (jsonEntries.length === 0) return null;

  const candidates = jsonEntries
    .map((entry) => entry.name)
    .sort((left, right) => {
      const leftScore = scoreProjectPath(left);
      const rightScore = scoreProjectPath(right);
      if (leftScore !== rightScore) return leftScore - rightScore;
      return left.localeCompare(right);
    });

  const selectedPath = candidates[0];
  if (!selectedPath) return null;
  return {
    path: selectedPath,
    basePath: getDirectoryFromPath(selectedPath),
  };
}

function scoreProjectPath(path: string): number {
  if (path.startsWith("edit_full/")) return 0;
  if (/^runtime_\d+\//.test(path)) return 1;
  if (path === "project.json") return 2;
  return 3;
}

function normalizeAssetMetadata(
  asset: V5GAssetConfig,
  forcedScale?: number,
): V5GAssetConfig {
  const width = getPositiveNumber(asset.width, asset.fileWidth ?? 1);
  const height = getPositiveNumber(asset.height, asset.fileHeight ?? 1);
  const fileScale = roundScale(forcedScale ?? getAssetFileScale(asset));
  return {
    ...asset,
    width,
    height,
    fileWidth: getPositiveNumber(
      asset.fileWidth,
      Math.round(width * fileScale),
    ),
    fileHeight: getPositiveNumber(
      asset.fileHeight,
      Math.round(height * fileScale),
    ),
    fileScale,
  };
}

function getAssetFileScale(asset: V5GAssetConfig): number {
  const explicit = normalizeAssetScale(asset.fileScale ?? 1);
  if (asset.fileWidth && asset.width) {
    return Math.min(
      explicit,
      normalizeAssetScale(asset.fileWidth / asset.width),
    );
  }
  return explicit;
}

function normalizeAssetScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(1, Math.max(0.01, value));
}

function roundScale(value: number): number {
  return Math.round(normalizeAssetScale(value) * 10000) / 10000;
}

function getPositiveNumber(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? value
    : fallback;
}

function canResizeImage(file: File): boolean {
  const type = file.type.toLowerCase();
  return type === "image/png" || type === "image/jpeg" || type === "image/webp";
}

async function resizeImageFile(
  file: File,
  width: number,
  height: number,
): Promise<Blob> {
  const image = await loadImageElement(file);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 Canvas 缩放导出");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);
  const mimeType = getCanvasMimeType(file.type);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片缩放导出失败"));
      },
      mimeType,
      mimeType === "image/jpeg" || mimeType === "image/webp" ? 0.92 : undefined,
    );
  });
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`图片无法读取：${file.name}`));
    };
    image.src = url;
  });
}

function getCanvasMimeType(inputType: string): string {
  const lower = inputType.toLowerCase();
  if (lower === "image/jpeg" || lower === "image/webp") return lower;
  return "image/png";
}

function ensureZipExtension(filename: string): string {
  return filename.toLowerCase().endsWith(".zip") ? filename : `${filename}.zip`;
}

function getDirectoryFromPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index + 1) : "";
}

function getFilenameFromPath(path: string): string {
  return path.split("/").pop() || "asset.png";
}

function getMimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
