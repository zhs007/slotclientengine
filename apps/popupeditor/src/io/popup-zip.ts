import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  commitEditorAssetImport,
  createEditorAssetsMapFromWorkspace,
  createEmptyEditorAssetWorkspace,
  decodeEditorAssetsMap,
  materializeEditorAssetPayloads,
  reviewEditorAssetImport,
  serializeEditorAssetsMap,
} from "@slotclientengine/editorresource";
import type { EditorAssetRewriteAdapter } from "@slotclientengine/editorresource";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string";
import {
  collectPopupPackagePaths,
  createPopupPackageResource,
  parsePopupManifest,
  resolvePopupPackageFiles,
} from "@slotclientengine/rendercore/popup";
import type {
  PopupManifestV1,
  PopupResourceSpec,
} from "@slotclientengine/rendercore/popup";
import { assertVNIProject } from "@slotclientengine/vnicore/core";
import {
  clonePopupEditorProject,
  createPopupEditorProject,
  projectToManifest,
} from "../model/project.js";
import type { PopupEditorProject } from "../model/project.js";
import { POPUP_ZIP_LIMITS } from "./resource-import.js";

const ROOT = "popup.manifest.json";

export async function exportPopupZip(
  project: PopupEditorProject,
  options: { readonly prepare?: boolean } = {},
) {
  const manifest = projectToManifest(project);
  const liveKeys = popupManifestAssetClosure(manifest, project.assets);
  const workspace = await projectWorkspace(project);
  const map = createEditorAssetsMapFromWorkspace(workspace, liveKeys);
  const entries = new Map(materializeEditorAssetPayloads(workspace, liveKeys));
  entries.set(EDITOR_ASSETS_MAP_PATH, serializeEditorAssetsMap(map));
  entries.set(ROOT, encodeStable(manifest));
  collectPopupPackagePaths({
    manifest,
    files: await resolvePopupPackageFiles({ manifest, files: entries }),
  });
  if (options.prepare !== false) {
    const resource = await createPopupPackageResource({
      manifest,
      files: entries,
    });
    await resource.destroy();
  }
  const bytes = createDeterministicZip(entries, { level: 6 });
  return Object.freeze({
    fileName: `${manifest.id}-popup.zip`,
    bytes,
    blob: new Blob([bytes.slice().buffer], { type: "application/zip" }),
  });
}

export async function importPopupZip(
  bytes: Uint8Array,
  options: { readonly prepare?: boolean } = {},
): Promise<PopupEditorProject> {
  const files = extractBoundedZip(bytes, { limits: POPUP_ZIP_LIMITS });
  const root = files.get(ROOT);
  if (!root) throw new Error(`popup package 缺少 root ${ROOT} sentinel。`);
  const manifest = parsePopupManifest(parseJson(root, ROOT));
  if (!files.has(EDITOR_ASSETS_MAP_PATH))
    throw new Error(
      "legacy popup package 必须先在统一导入审查中为资源指定 filename key。",
    );
  const virtual = await resolvePopupPackageFiles({ manifest, files });
  collectPopupPackagePaths({ manifest, files: virtual });
  if (options.prepare !== false) {
    const resource = await createPopupPackageResource({ manifest, files });
    await resource.destroy();
  }
  const map = decodeEditorAssetsMap(files.get(EDITOR_ASSETS_MAP_PATH)!);
  const project = createPopupEditorProject();
  project.id = manifest.id;
  project.designViewport = { ...manifest.designViewport };
  project.amountFormat = { ...manifest.amountFormat };
  project.resources.clear();
  project.assets.clear();
  for (const key of Object.keys(map.files)) {
    const entry = map.files[key]!;
    project.assets.set(key, {
      key,
      sha256: entry.sha256,
      payloadPath: entry.path,
      mediaType: entry.mediaType,
      byteLength: entry.byteLength,
      bytes: virtual.get(key)!.slice(),
    });
  }
  for (const [rootKey, spec] of Object.entries(manifest.resources))
    project.resources.set(rootKey, {
      rootKey,
      kind: spec.kind,
      spec: structuredClone(spec),
      keys: resourceClosure(spec, project.assets),
    });
  project.tiers.set("base", {
    countDurationSeconds: manifest.awardCelebration.base.countDurationSeconds,
    layers: structuredClone([...manifest.awardCelebration.base.layers]),
  });
  project.tiers.set("standard", {
    countDurationSeconds:
      manifest.awardCelebration.standard.countDurationSeconds,
    layers: structuredClone([...manifest.awardCelebration.standard.layers]),
  });
  for (const tier of manifest.awardCelebration.celebrationTiers)
    project.tiers.set(tier.id, {
      countDurationSeconds: tier.countDurationSeconds,
      layers: structuredClone([...tier.layers]),
      thresholdMultiplier: tier.thresholdMultiplier,
    });
  const closure = popupManifestAssetClosure(manifest, project.assets);
  if (closure.length !== project.assets.size)
    throw new Error("popup assets map 包含未引用 entry。");
  return clonePopupEditorProject(project);
}

function popupManifestAssetClosure(
  manifest: PopupManifestV1,
  assets: ReadonlyMap<string, { readonly bytes: Uint8Array }>,
) {
  const keys = new Set<string>();
  for (const spec of Object.values(manifest.resources))
    for (const key of resourceClosure(spec, assets)) keys.add(key);
  return Object.freeze([...keys].sort((a, b) => a.localeCompare(b, "en")));
}

function resourceClosure(
  spec: PopupResourceSpec,
  assets: ReadonlyMap<string, { readonly bytes: Uint8Array }>,
): readonly string[] {
  if (spec.kind === "image") return Object.freeze([spec.path]);
  if (spec.kind === "spine")
    return Object.freeze([
      spec.skeleton,
      spec.atlas,
      ...Object.values(spec.textures),
    ]);
  const root = spec.kind === "vni" ? spec.project : spec.manifest;
  const rootBytes = assets.get(root)?.bytes;
  if (!rootBytes) throw new Error(`popup asset bytes 缺失：${root}`);
  if (spec.kind === "vni") {
    const project = assertVNIProject(parseJson(rootBytes, root));
    return Object.freeze([root, ...project.assets.map(({ path }) => path)]);
  }
  const manifest = parseImageStringManifest(parseJson(rootBytes, root));
  return Object.freeze([root, ...collectImageStringAssetPaths(manifest)]);
}

async function projectWorkspace(project: PopupEditorProject) {
  const empty = createEmptyEditorAssetWorkspace();
  const review = await reviewEditorAssetImport({
    workspace: empty,
    incoming: [...project.assets.values()],
  });
  const adapter: EditorAssetRewriteAdapter<null> = {
    cloneProject: () => null,
    collectReferences: () => ({ references: [] }),
    renameReferences: () => null,
  };
  return (
    await commitEditorAssetImport({
      workspace: empty,
      project: null,
      review,
      adapter,
    })
  ).workspace;
}

function encodeStable(value: unknown) {
  return new TextEncoder().encode(`${JSON.stringify(sort(value), null, 2)}\n`);
}
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, child]) => [key, sort(child)]),
  );
}
function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${label} JSON 无效：${formatError(error)}`);
  }
}
function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
