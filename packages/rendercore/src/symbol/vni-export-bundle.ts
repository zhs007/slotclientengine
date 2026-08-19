import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import {
  assertUniqueEditorAssetKeys,
  basenameFromSourcePath,
} from "@slotclientengine/editorresource";
import {
  assertVNIBundleManifest,
  assertVNIProject,
  rewriteVNIProjectAssetPaths,
  validateManifestProjectProfile,
  validateVNIBundleManifest,
  validateVNIProject,
  type VNIBundleManifestEntry,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/data";

export interface SymbolVniBundleRuntimeProfile {
  readonly id: string;
  readonly label: string;
  readonly assetScale: number;
  readonly byteLength: number;
}

export interface SymbolVniBundleFile {
  readonly sourcePath: string;
  readonly key: string;
  readonly bytes: Uint8Array;
}

export interface MaterializedSymbolVniBundleRuntime {
  readonly profile: SymbolVniBundleRuntimeProfile;
  readonly project: SymbolVniBundleFile;
  readonly assets: readonly SymbolVniBundleFile[];
}

interface InspectedBundle {
  readonly entries: ReadonlyMap<string, Uint8Array>;
  readonly profiles: readonly SymbolVniBundleRuntimeProfile[];
  readonly runtimeEntries: ReadonlyMap<string, VNIBundleManifestEntry>;
  readonly projects: ReadonlyMap<string, VNIProjectConfig>;
}

export function inspectSymbolVniExportBundle(
  entries: ReadonlyMap<string, Uint8Array>,
): readonly SymbolVniBundleRuntimeProfile[] | null {
  return inspectBundle(entries)?.profiles ?? null;
}

export function materializeSymbolVniExportBundleRuntime(options: {
  readonly entries: ReadonlyMap<string, Uint8Array>;
  readonly selectedProfileId?: string;
}): MaterializedSymbolVniBundleRuntime {
  const inspected = inspectBundle(options.entries);
  if (!inspected)
    throw new Error("VNI bundle ZIP 根目录缺少合法 manifest.json。");
  if (inspected.profiles.length > 1 && !options.selectedProfileId) {
    throw new Error(
      `VNI bundle 声明多个 runtime，必须明确选择：${inspected.profiles.map(({ id }) => id).join(", ")}。`,
    );
  }
  const selectedProfileId =
    options.selectedProfileId ?? inspected.profiles[0]?.id;
  const profile = inspected.profiles.find(({ id }) => id === selectedProfileId);
  const entry = selectedProfileId
    ? inspected.runtimeEntries.get(selectedProfileId)
    : undefined;
  const project = selectedProfileId
    ? inspected.projects.get(selectedProfileId)
    : undefined;
  if (!profile || !entry || !project) {
    throw new Error(`VNI runtime 选择无效：${selectedProfileId ?? "未选择"}。`);
  }

  const projectKey = basenameFromSourcePath(entry.path);
  const assetSources = project.assets.map((asset) => ({
    asset,
    sourcePath: resolvePackagePath(entry.path, asset.path),
    key: basenameFromSourcePath(asset.path),
  }));
  assertUniqueEditorAssetKeys([
    projectKey,
    ...assetSources.map(({ key }) => key),
  ]);
  const assetKeyById = new Map(
    assetSources.map(({ asset, key }) => [asset.id, key] as const),
  );
  const rewrittenProject = rewriteVNIProjectAssetPaths(
    project,
    (_path, assetId) => required(assetKeyById, assetId, "VNI asset key"),
  );
  validateVNIProject(rewrittenProject);

  return Object.freeze({
    profile,
    project: Object.freeze({
      sourcePath: entry.path,
      key: projectKey,
      bytes: encodeStableJson(rewrittenProject),
    }),
    assets: Object.freeze(
      assetSources.map(({ sourcePath, key }) =>
        Object.freeze({
          sourcePath,
          key,
          bytes: required(
            inspected.entries,
            sourcePath,
            "VNI bundle asset",
          ).slice(),
        }),
      ),
    ),
  });
}

function inspectBundle(
  entries: ReadonlyMap<string, Uint8Array>,
): InspectedBundle | null {
  const manifestBytes = entries.get("manifest.json");
  if (!manifestBytes) return null;
  const rawManifest = parseJson(manifestBytes, "manifest.json");
  if (!isVniExportBundle(rawManifest)) return null;
  const manifest = assertVNIBundleManifest(rawManifest);
  validateVNIBundleManifest(manifest);

  const knownPaths = new Set(["manifest.json"]);
  const projects = new Map<string, VNIProjectConfig>();
  const runtimeEntries = new Map<string, VNIBundleManifestEntry>();
  const profiles: SymbolVniBundleRuntimeProfile[] = [];
  for (const entry of manifest.exports) {
    knownPaths.add(entry.path);
    const projectBytes = required(
      entries,
      entry.path,
      `VNI bundle export ${entry.id}`,
    );
    const project = assertVNIProject(parseJson(projectBytes, entry.path));
    validateManifestProjectProfile(entry, project);
    // Editing exports are archival authoring backups. They can retain editor
    // state that is intentionally absent from the runtime profile, so only a
    // runtime export is required to satisfy the Pixi runtime contract.
    if (entry.purpose === "runtime") validateVNIProject(project);
    projects.set(entry.id, project);
    let byteLength = projectBytes.byteLength;
    for (const asset of project.assets) {
      const assetPath = resolvePackagePath(entry.path, asset.path);
      knownPaths.add(assetPath);
      byteLength += required(
        entries,
        assetPath,
        `VNI bundle export ${entry.id} asset`,
      ).byteLength;
    }
    if (entry.purpose !== "runtime") continue;
    runtimeEntries.set(entry.id, entry);
    profiles.push(
      Object.freeze({
        id: entry.id,
        label:
          entry.label ?? `${entry.id} (runtime, scale ${entry.assetScale})`,
        assetScale: entry.assetScale,
        byteLength,
      }),
    );
  }
  const orphanPaths = [...entries.keys()].filter(
    (path) => !knownPaths.has(path),
  );
  if (orphanPaths.length) {
    throw new Error(
      `VNI bundle 包含 orphan 文件：${orphanPaths.sort((left, right) => left.localeCompare(right, "en")).join(", ")}。`,
    );
  }
  if (!profiles.length)
    throw new Error("VNI bundle 未声明 purpose=runtime 的运行发布包。");
  return Object.freeze({
    entries,
    profiles: Object.freeze(profiles),
    runtimeEntries,
    projects,
  });
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `${path} 不是合法 JSON：${error instanceof Error ? error.message : String(error)}。`,
    );
  }
}

function isVniExportBundle(value: unknown): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { readonly type?: unknown }).type === "vni_export_bundle",
  );
}

function required<K, V>(values: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = values.get(key);
  if (value === undefined) throw new Error(`${label} 缺少：${String(key)}。`);
  return value;
}

function encodeStableJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(sortValue(value), null, 2)}\n`,
  );
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
