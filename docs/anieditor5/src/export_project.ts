import JSZip from "jszip";
import { DEFAULT_EXPORT_ZIP_FILENAME, EXPORT_JSON_FILENAME } from "./constants";
import { toExportProject } from "./project_state";
import type {
  V5GEditorState,
  V5GProjectConfig,
  V5GRuntimeAsset,
} from "./types";

export interface ImportedV5GZipProject {
  project: V5GProjectConfig;
  runtimeAssets: V5GRuntimeAsset[];
}

export function buildProjectJson(state: V5GEditorState): string {
  return JSON.stringify(toExportProject(state.project), null, 2);
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
): Promise<void> {
  const zip = new JSZip();
  zip.file(EXPORT_JSON_FILENAME, buildProjectJson(state));

  for (const asset of state.project.assets) {
    const runtimeAsset = state.runtimeAssets.find(
      (item) => item.id === asset.id,
    );
    if (runtimeAsset) {
      zip.file(asset.path, runtimeAsset.file);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(ensureZipExtension(filename), blob);
}

export async function importProjectZip(
  file: File,
): Promise<ImportedV5GZipProject> {
  const zip = await JSZip.loadAsync(file);
  const projectEntry = zip.file(EXPORT_JSON_FILENAME);
  if (!projectEntry) {
    throw new Error(`ZIP 中缺少 ${EXPORT_JSON_FILENAME}`);
  }

  const rawProject = await projectEntry.async("string");
  const project = parseProjectConfig(rawProject);
  const runtimeAssets = await Promise.all(
    project.assets.map(async (asset) => {
      const entry = zip.file(asset.path);
      if (!entry) {
        throw new Error(`ZIP 中缺少资源文件：${asset.path}`);
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

  return { project, runtimeAssets };
}

export function sanitizeZipFilename(value: string): string {
  const withoutExt = value.replace(/\.zip$/i, "");
  const safe = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ensureZipExtension(safe || DEFAULT_EXPORT_ZIP_FILENAME);
}

function parseProjectConfig(rawProject: string): V5GProjectConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawProject);
  } catch {
    throw new Error(`${EXPORT_JSON_FILENAME} 不是有效 JSON`);
  }

  if (!isProjectConfig(parsed)) {
    throw new Error(`${EXPORT_JSON_FILENAME} 不是有效的 V5G 项目文件`);
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

function ensureZipExtension(filename: string): string {
  return filename.toLowerCase().endsWith(".zip") ? filename : `${filename}.zip`;
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
