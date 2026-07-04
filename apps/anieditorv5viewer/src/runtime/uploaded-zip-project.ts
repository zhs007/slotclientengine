import { unzipSync } from "fflate";
import {
  assertVNIBundleManifest,
  assertVNIProject,
  resolveProjectAssetUrls,
  validateManifestProjectProfile,
  validateVNIBundleManifest,
  validateVNIProject,
  type AssetUrlManifest,
  type VNIBundleManifest,
  type VNIBundleManifestEntry,
  type VNIExportProfileConfig,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

export type UploadedVNIProjectPurpose = "editing" | "runtime" | "legacy";

export interface UploadedVNIProjectProfile {
  id: string;
  label: string;
  purpose: UploadedVNIProjectPurpose;
  assetScale: number;
  projectPath: string;
}

export interface UploadedInsertionAsset {
  path: string;
  label: string;
  url: string;
  sourcePath: string;
  projectAssetId?: string;
}

export interface LoadedUploadedVNIProject {
  projectId: string;
  bundleId: string;
  profileId: string;
  profilePurpose: UploadedVNIProjectPurpose;
  assetScale: number;
  sourcePath: string;
  project: VNIProjectConfig;
  assetUrls: AssetUrlManifest;
  insertionAssets: readonly UploadedInsertionAsset[];
  dispose: () => void;
}

export interface UploadedVNIProjectBundle {
  fileName: string;
  bundleId: string;
  profiles: readonly UploadedVNIProjectProfile[];
  defaultProfileId: string | null;
  loadProfile: (profileId: string) => LoadedUploadedVNIProject;
}

export interface UploadedVNIProjectBundleOptions {
  fileName?: string;
}

interface ZipFileEntry {
  path: string;
  data: Uint8Array;
}

interface ManifestProfileRecord {
  profile: UploadedVNIProjectProfile;
  entry: VNIBundleManifestEntry;
}

interface SingleProjectProfileRecord {
  profile: UploadedVNIProjectProfile;
}

const SUPPORTED_IMAGE_MIME_BY_EXTENSION = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

export async function openUploadedVNIProjectBundle(
  source: Blob | ArrayBuffer | Uint8Array,
  options: UploadedVNIProjectBundleOptions = {},
): Promise<UploadedVNIProjectBundle> {
  const fileName = options.fileName ?? getSourceFileName(source);
  const bytes =
    source instanceof Uint8Array
      ? source
      : source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : new Uint8Array(await source.arrayBuffer());
  return createUploadedVNIProjectBundle(bytes, fileName);
}

export function createUploadedVNIProjectBundle(
  bytes: Uint8Array,
  fileName = "uploaded.zip",
): UploadedVNIProjectBundle {
  const entries = readZipFileEntries(bytes);
  const bundleId = createUploadedBundleId(fileName);
  const manifestEntry = entries.get("manifest.json");
  if (manifestEntry) {
    return createManifestProjectBundle(entries, manifestEntry, {
      bundleId,
      fileName,
    });
  }
  return createSingleProjectBundle(entries, { bundleId, fileName });
}

function readZipFileEntries(
  bytes: Uint8Array,
): ReadonlyMap<string, ZipFileEntry> {
  const unzipped = unzipSync(bytes);
  const entries = new Map<string, ZipFileEntry>();
  const normalizedPaths = new Set<string>();

  for (const [rawPath, data] of Object.entries(unzipped)) {
    const normalized = normalizeZipEntryPath(rawPath);
    if (normalizedPaths.has(normalized.path)) {
      throw new Error(
        `Duplicate zip entry path after normalization: ${rawPath}`,
      );
    }
    normalizedPaths.add(normalized.path);
    if (isMacMetadataPath(normalized.path)) {
      continue;
    }
    if (normalized.directory) {
      continue;
    }
    entries.set(normalized.path, {
      path: normalized.path,
      data,
    });
  }

  return entries;
}

function createManifestProjectBundle(
  entries: ReadonlyMap<string, ZipFileEntry>,
  manifestEntry: ZipFileEntry,
  bundleInfo: { bundleId: string; fileName: string },
): UploadedVNIProjectBundle {
  const manifest = readManifestJson(manifestEntry);
  if (manifest.exports.length === 0) {
    throw new Error("VNI bundle manifest must include at least one export.");
  }
  const profileRecords = manifest.exports.map((entry) => {
    const projectPath = normalizeProjectRelativePath(
      entry.path,
      `manifest export "${entry.id}" path`,
    );
    const projectEntry = entries.get(projectPath);
    if (!projectEntry) {
      throw new Error(
        `VNI bundle export "${entry.id}" project file is missing from zip: ${projectPath}`,
      );
    }
    return {
      profile: Object.freeze({
        id: entry.id,
        label: entry.label ?? `${entry.id} (${entry.purpose})`,
        purpose: entry.purpose,
        assetScale: entry.assetScale,
        projectPath,
      }),
      entry,
    } satisfies ManifestProfileRecord;
  });
  const runtimeProfiles = profileRecords.filter(
    (record) => record.profile.purpose === "runtime",
  );
  const defaultProfileId =
    runtimeProfiles.length === 1 ? runtimeProfiles[0].profile.id : null;

  return Object.freeze({
    fileName: bundleInfo.fileName,
    bundleId: bundleInfo.bundleId,
    profiles: Object.freeze(profileRecords.map((record) => record.profile)),
    defaultProfileId,
    loadProfile(profileId: string): LoadedUploadedVNIProject {
      const record = profileRecords.find(
        (candidate) => candidate.profile.id === profileId,
      );
      if (!record) {
        throw new Error(`Unknown uploaded VNI profile: ${profileId}`);
      }
      return loadManifestProfile(entries, bundleInfo, record);
    },
  });
}

function createSingleProjectBundle(
  entries: ReadonlyMap<string, ZipFileEntry>,
  bundleInfo: { bundleId: string; fileName: string },
): UploadedVNIProjectBundle {
  const projectEntry = entries.get("project.json");
  const projectJsonEntries = [...entries.keys()].filter((path) =>
    path.endsWith(".json"),
  );
  if (!projectEntry) {
    throw new Error(
      projectJsonEntries.length > 0
        ? `Uploaded VNI zip without manifest.json must contain a root project.json; found ${projectJsonEntries.join(", ")}.`
        : "Uploaded VNI zip must contain either manifest.json or a root project.json.",
    );
  }
  const unexpectedProjectJsonEntries = projectJsonEntries.filter(
    (path) => path !== "project.json",
  );
  if (unexpectedProjectJsonEntries.length > 0) {
    throw new Error(
      `Uploaded single-project zip must contain only the root project.json; found extra JSON ${unexpectedProjectJsonEntries.join(", ")}.`,
    );
  }

  const project = readProjectJson(projectEntry);
  const exportProfile = requireSingleProjectExportProfile(project);
  const profile = Object.freeze({
    id: exportProfile.id,
    label:
      exportProfile.label ?? `${exportProfile.id} (${exportProfile.purpose})`,
    purpose: exportProfile.purpose,
    assetScale: exportProfile.assetScale,
    projectPath: "project.json",
  } satisfies UploadedVNIProjectProfile);
  const record = { profile } satisfies SingleProjectProfileRecord;

  return Object.freeze({
    fileName: bundleInfo.fileName,
    bundleId: bundleInfo.bundleId,
    profiles: Object.freeze([profile]),
    defaultProfileId: profile.id,
    loadProfile(profileId: string): LoadedUploadedVNIProject {
      if (profileId !== profile.id) {
        throw new Error(`Unknown uploaded VNI profile: ${profileId}`);
      }
      return loadSingleProjectProfile(entries, bundleInfo, record);
    },
  });
}

function loadManifestProfile(
  entries: ReadonlyMap<string, ZipFileEntry>,
  bundleInfo: { bundleId: string; fileName: string },
  record: ManifestProfileRecord,
): LoadedUploadedVNIProject {
  const projectEntry = requireZipFileEntry(entries, record.profile.projectPath);
  const project = readProjectJson(projectEntry);
  validateManifestProjectProfile(record.entry, project);
  return createLoadedProject(entries, bundleInfo, record.profile, project);
}

function loadSingleProjectProfile(
  entries: ReadonlyMap<string, ZipFileEntry>,
  bundleInfo: { bundleId: string; fileName: string },
  record: SingleProjectProfileRecord,
): LoadedUploadedVNIProject {
  const projectEntry = requireZipFileEntry(entries, record.profile.projectPath);
  const project = readProjectJson(projectEntry);
  const exportProfile = requireSingleProjectExportProfile(project);
  if (
    exportProfile.id !== record.profile.id ||
    exportProfile.purpose !== record.profile.purpose ||
    exportProfile.assetScale !== record.profile.assetScale
  ) {
    throw new Error(
      `Uploaded single-project profile mismatch: selected ${record.profile.id}/${record.profile.purpose}/${record.profile.assetScale}, project ${exportProfile.id}/${exportProfile.purpose}/${exportProfile.assetScale}.`,
    );
  }
  return createLoadedProject(entries, bundleInfo, record.profile, project);
}

function createLoadedProject(
  entries: ReadonlyMap<string, ZipFileEntry>,
  bundleInfo: { bundleId: string; fileName: string },
  profile: UploadedVNIProjectProfile,
  project: VNIProjectConfig,
): LoadedUploadedVNIProject {
  const createdUrls: string[] = [];
  const dispose = (): void => {
    for (const url of createdUrls.splice(0)) {
      URL.revokeObjectURL(url);
    }
  };

  try {
    const profileDirectory = dirname(profile.projectPath);
    const profileFileEntries = getProfileFileEntries(entries, profileDirectory);
    const profileAssetUrls: Record<string, string> = {};

    for (const asset of project.assets) {
      const assetPath = normalizeProjectRelativePath(
        asset.path,
        `asset "${asset.id}" path`,
      );
      const zipPath = joinZipPath(profileDirectory, assetPath);
      const entry = profileFileEntries.get(assetPath);
      if (!entry) {
        throw new Error(
          `Uploaded VNI asset is missing from zip: ${zipPath} (asset.path ${asset.path}).`,
        );
      }
      createProfileAssetUrl(profileAssetUrls, createdUrls, assetPath, entry);
    }

    const assetUrls = resolveProjectAssetUrls(project, profileAssetUrls);
    const insertionAssets = createUploadedInsertionAssets(
      project,
      profileAssetUrls,
      profileDirectory,
    );

    return Object.freeze({
      projectId: project.name,
      bundleId: bundleInfo.bundleId,
      profileId: profile.id,
      profilePurpose: profile.purpose,
      assetScale: profile.assetScale,
      sourcePath: `${bundleInfo.fileName}:${profile.projectPath}`,
      project,
      assetUrls,
      insertionAssets,
      dispose,
    });
  } catch (error) {
    dispose();
    throw error;
  }
}

function createProfileAssetUrl(
  profileAssetUrls: Record<string, string>,
  createdUrls: string[],
  assetPath: string,
  entry: ZipFileEntry,
): void {
  const mimeType = getSupportedImageMimeType(assetPath);
  const arrayBuffer = new ArrayBuffer(entry.data.byteLength);
  new Uint8Array(arrayBuffer).set(entry.data);
  const blob = new Blob([arrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  createdUrls.push(url);
  profileAssetUrls[assetPath] = url;
}

function createUploadedInsertionAssets(
  project: VNIProjectConfig,
  profileAssetUrls: AssetUrlManifest,
  profileDirectory: string,
): readonly UploadedInsertionAsset[] {
  const projectAssetByPath = new Map(
    project.assets.map((asset) => [asset.path, asset] as const),
  );
  return Object.freeze(
    Object.entries(profileAssetUrls)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, url]) => {
        const projectAsset = projectAssetByPath.get(path);
        const sourcePath = joinZipPath(profileDirectory, path);
        const insertionAsset = {
          path,
          label: projectAsset
            ? `${projectAsset.originalName} (${path})`
            : `${getPathFilename(path)} (${path})`,
          url,
          sourcePath,
        };
        return Object.freeze(
          projectAsset
            ? { ...insertionAsset, projectAssetId: projectAsset.id }
            : insertionAsset,
        );
      }),
  );
}

function getProfileFileEntries(
  entries: ReadonlyMap<string, ZipFileEntry>,
  profileDirectory: string,
): ReadonlyMap<string, ZipFileEntry> {
  const profileFileEntries = new Map<string, ZipFileEntry>();
  const prefix = profileDirectory.length > 0 ? `${profileDirectory}/` : "";
  for (const entry of entries.values()) {
    if (profileDirectory.length > 0 && !entry.path.startsWith(prefix)) {
      continue;
    }
    const relativePath =
      profileDirectory.length > 0
        ? entry.path.slice(prefix.length)
        : entry.path;
    if (relativePath.length === 0 || relativePath === "manifest.json") {
      continue;
    }
    if (relativePath.endsWith(".json")) {
      continue;
    }
    profileFileEntries.set(relativePath, entry);
  }
  return profileFileEntries;
}

function readManifestJson(entry: ZipFileEntry): VNIBundleManifest {
  const manifest = assertVNIBundleManifest(readJsonEntry(entry));
  validateVNIBundleManifest(manifest);
  return manifest;
}

function readProjectJson(entry: ZipFileEntry): VNIProjectConfig {
  const project = assertVNIProject(readJsonEntry(entry));
  validateVNIProject(project);
  return project;
}

function readJsonEntry(entry: ZipFileEntry): unknown {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const text = decoder.decode(entry.data);
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON in uploaded zip entry ${entry.path}: ${message}`,
    );
  }
}

function requireSingleProjectExportProfile(
  project: VNIProjectConfig,
): VNIExportProfileConfig {
  if (!project.exportProfile) {
    throw new Error(
      `Uploaded single-project VNI project "${project.name}" is missing exportProfile.`,
    );
  }
  return project.exportProfile;
}

function requireZipFileEntry(
  entries: ReadonlyMap<string, ZipFileEntry>,
  path: string,
): ZipFileEntry {
  const entry = entries.get(path);
  if (!entry) {
    throw new Error(`Uploaded VNI zip entry is missing: ${path}`);
  }
  return entry;
}

function normalizeZipEntryPath(rawPath: string): {
  readonly path: string;
  readonly directory: boolean;
} {
  if (rawPath.length === 0) {
    throw new Error("Zip entry path must not be empty.");
  }
  if (rawPath.startsWith("/") || rawPath.includes("\\")) {
    throw new Error(`Zip entry path must be a relative POSIX path: ${rawPath}`);
  }
  const directory = rawPath.endsWith("/");
  const normalizedPath = directory ? rawPath.replace(/\/+$/u, "") : rawPath;
  if (normalizedPath.length === 0) {
    throw new Error(`Zip entry path must not be empty: ${rawPath}`);
  }
  const parts = normalizedPath.split("/");
  if (
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(
      `Zip entry path must not contain empty, current, or parent segments: ${rawPath}`,
    );
  }
  return { path: parts.join("/"), directory };
}

function normalizeProjectRelativePath(path: string, label: string): string {
  if (path.length === 0 || path.startsWith("/") || path.includes("\\")) {
    throw new Error(`${label} must be a relative POSIX path.`);
  }
  const parts = path.split("/");
  if (
    parts.some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(
      `${label} must not contain empty, current, or parent segments.`,
    );
  }
  return parts.join("/");
}

function isMacMetadataPath(path: string): boolean {
  if (path === "__MACOSX" || path.startsWith("__MACOSX/")) {
    return true;
  }
  return path
    .split("/")
    .some((part) => part === ".DS_Store" || part.startsWith("._"));
}

function getSourceFileName(source: Blob | ArrayBuffer | Uint8Array): string {
  if (source instanceof Blob && "name" in source) {
    const fileName = (source as File).name;
    if (typeof fileName === "string" && fileName.length > 0) {
      return fileName;
    }
  }
  return "uploaded.zip";
}

function createUploadedBundleId(fileName: string): string {
  const baseName = getPathFilename(fileName).replace(/\.zip$/iu, "");
  const safeName = baseName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[._-]+|[._-]+$/gu, "");
  return `uploaded:${safeName || "zip"}`;
}

function getSupportedImageMimeType(path: string): string {
  const extension = getPathExtension(path);
  const mimeType = SUPPORTED_IMAGE_MIME_BY_EXTENSION.get(extension);
  if (!mimeType) {
    throw new Error(
      `Unsupported uploaded VNI image asset extension for ${path}. Supported extensions: .png, .jpg, .jpeg, .webp.`,
    );
  }
  return mimeType;
}

function getPathExtension(path: string): string {
  const filename = getPathFilename(path);
  const index = filename.lastIndexOf(".");
  return index >= 0 ? filename.slice(index).toLowerCase() : "";
}

function getPathFilename(path: string): string {
  const filename = path.split(/[\\/]/u).at(-1);
  if (!filename) {
    throw new Error(`Cannot parse uploaded VNI path: ${path}`);
  }
  return filename;
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index) : "";
}

function joinZipPath(directory: string, path: string): string {
  return directory.length > 0 ? `${directory}/${path}` : path;
}
