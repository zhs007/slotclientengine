import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  createEditorAssetsMapFromWorkspace,
  materializeEditorAssetPayloads,
  serializeEditorAssetsMap,
} from "@slotclientengine/editorresource";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string/data";
import { validateImageStringPackageContents } from "@slotclientengine/rendercore/image-string/editor";
import {
  collectMappedPopupAssetKeys,
  parsePopupManifest,
} from "@slotclientengine/rendercore/popup/data";
import { collectPopupPackagePaths } from "@slotclientengine/rendercore/popup/editor";
import {
  inspectSymbolSpineAtlas,
  inspectSymbolSpineSkeleton,
  parseSymbolPackageManifest,
  validateSymbolPackageGameConfig,
} from "@slotclientengine/rendercore/symbol/data";
import {
  createSymbolPackageResource,
  materializeMappedSymbolPackageContents,
} from "@slotclientengine/rendercore/symbol/editor";
import { collectSceneLayoutPackagePaths } from "@slotclientengine/rendercore/scene-layout/editor";
import {
  assertVNIProject,
  validateVNIProject,
} from "@slotclientengine/vnicore/data";
import type {
  EditorAssetCatalog,
  EditorAssetExportArtifact,
  EditorAssetRoot,
  EditorAssetsSnapshot,
} from "../data/index.js";
import { materializeEditorGameLayoutRoot } from "./game-layout-events.js";

const ZIP_MEDIA_TYPE = "application/zip";

export async function exportDefaultEditorAsset<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  rootKey: string,
): Promise<EditorAssetExportArtifact> {
  const root = requiredRoot(snapshot.catalog, rootKey);
  if (["image", "audio", "video", "text", "binary"].includes(root.kind)) {
    const entry = requiredEntry(snapshot, root.key);
    return artifact(root.key, entry.mediaType, entry.bytes);
  }
  if (root.kind === "spine") return exportSpine(snapshot, root);
  if (root.kind === "vni") return exportVni(snapshot, root);
  if (root.kind === "image-string") return exportImageString(snapshot, root);
  if (root.kind === "popup") return exportPopup(snapshot, root);
  if (root.kind === "symbols") return exportSymbols(snapshot, root);
  if (root.kind === "game-layout") return exportGameLayout(snapshot, root);
  throw new Error(`不支持导出 asset kind：${String(root.kind)}`);
}

function exportSpine<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  root: EditorAssetRoot,
): EditorAssetExportArtifact {
  const skeletonBytes = requiredEntry(snapshot, root.key).bytes;
  const skeleton = parseJson(skeletonBytes, root.key);
  inspectSymbolSpineSkeleton(skeleton);
  const atlasEdge = snapshot.catalog.relations.find(
    ({ kind, from }) =>
      kind === "uses-atlas" && reachableFromRoot(snapshot.catalog, root, from),
  );
  if (!atlasEdge)
    throw new Error(`Spine root 缺少 atlas relation：${root.key}`);
  const atlasNode = snapshot.catalog.nodes.get(atlasEdge.to);
  if (!atlasNode) throw new Error(`Spine atlas node 不存在：${atlasEdge.to}`);
  const atlasBytes = requiredEntry(snapshot, atlasNode.key).bytes;
  const atlas = inspectSymbolSpineAtlas(decodeText(atlasBytes, atlasNode.key));
  const textureEdges = snapshot.catalog.relations.filter(
    ({ kind, from }) => kind === "uses-texture" && from === atlasNode.id,
  );
  const byPage = new Map(textureEdges.map((edge) => [edge.label, edge]));
  const entries = new Map<string, Uint8Array>([
    [root.key, skeletonBytes.slice()],
    [atlasNode.key, atlasBytes.slice()],
  ]);
  for (const page of atlas.pageNames) {
    const edge = byPage.get(page);
    if (!edge)
      throw new Error(`Spine atlas page 缺少 texture relation：${page}`);
    const node = snapshot.catalog.nodes.get(edge.to);
    if (!node) throw new Error(`Spine texture node 不存在：${edge.to}`);
    if (entries.has(page)) throw new Error(`Spine ZIP path 冲突：${page}`);
    entries.set(page, requiredEntry(snapshot, node.key).bytes.slice());
  }
  return zipArtifact(`${stem(root.key)}-spine.zip`, entries);
}

function exportVni<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  root: EditorAssetRoot,
): EditorAssetExportArtifact {
  const projectBytes = requiredEntry(snapshot, root.key).bytes;
  const project = assertVNIProject(parseJson(projectBytes, root.key));
  validateVNIProject(project);
  const expected = new Set([
    root.key,
    ...project.assets.map(({ path }) => path),
  ]);
  assertExactClosure(root, expected);
  const entries = new Map<string, Uint8Array>([
    [root.key, projectBytes.slice()],
  ]);
  for (const asset of project.assets)
    entries.set(asset.path, requiredEntry(snapshot, asset.path).bytes.slice());
  return zipArtifact(`${stem(root.key)}-vni.zip`, entries);
}

async function exportImageString<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  root: EditorAssetRoot,
): Promise<EditorAssetExportArtifact> {
  const manifestBytes = requiredEntry(snapshot, root.key).bytes;
  const manifest = parseImageStringManifest(parseJson(manifestBytes, root.key));
  const assetKeys = collectImageStringAssetPaths(manifest);
  assertExactClosure(root, new Set([root.key, ...assetKeys]));
  const logical = logicalFiles(snapshot, assetKeys);
  logical.set("image-string.manifest.json", manifestBytes.slice());
  validateImageStringPackageContents({ manifest, files: logical });
  return mappedZip(snapshot, root, {
    filename: `${manifest.id}-image-string.zip`,
    controls: new Map([["image-string.manifest.json", manifestBytes]]),
    assetKeys,
  });
}

async function exportPopup<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  root: EditorAssetRoot,
): Promise<EditorAssetExportArtifact> {
  const manifestBytes = requiredEntry(snapshot, root.key).bytes;
  const manifest = parsePopupManifest(parseJson(manifestBytes, root.key));
  const assetKeys = collectMappedPopupAssetKeys({
    manifest,
    files: logicalFiles(
      snapshot,
      root.exactKeys.filter((key) => key !== root.key),
    ),
  });
  assertExactClosure(root, new Set([root.key, ...assetKeys]));
  const output = mappedZip(snapshot, root, {
    filename: `${manifest.id}-popup.zip`,
    controls: new Map([["popup.manifest.json", manifestBytes]]),
    assetKeys,
  });
  collectPopupPackagePaths({
    manifest,
    files: logicalFiles(snapshot, assetKeys),
  });
  return output;
}

async function exportSymbols<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  root: EditorAssetRoot,
): Promise<EditorAssetExportArtifact> {
  const packageBytes = requiredEntry(snapshot, root.key).bytes;
  const packageManifest = parseSymbolPackageManifest(
    parseJson(packageBytes, root.key),
  );
  const gameConfigKey = packageManifest.entrypoints.gameConfig;
  const symbolManifestKey = packageManifest.entrypoints.symbolManifest;
  const gameConfigBytes = requiredEntry(snapshot, gameConfigKey).bytes;
  const symbolManifestBytes = requiredEntry(snapshot, symbolManifestKey).bytes;
  const rawGameConfig = parseJson(gameConfigBytes, gameConfigKey);
  const rawSymbolManifest = parseJson(symbolManifestBytes, symbolManifestKey);
  const assetKeys = root.exactKeys.filter(
    (key) => ![root.key, gameConfigKey, symbolManifestKey].includes(key),
  );
  const materialized = await materializeMappedSymbolPackageContents({
    packageManifest,
    rawGameConfig,
    rawSymbolManifest,
    assets: logicalFiles(snapshot, assetKeys),
  });
  validateSymbolPackageGameConfig({
    rawGameConfig: materialized.rawGameConfig,
    symbolManifest: materialized.rawSymbolManifest,
  });
  const resource = await createSymbolPackageResource({
    packageManifest: materialized.packageManifest,
    files: materialized.files,
    loadTextures: false,
  });
  resource.destroy();
  return zipArtifact(`${packageManifest.id}-symbols.zip`, materialized.files);
}

async function exportGameLayout<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  root: EditorAssetRoot,
): Promise<EditorAssetExportArtifact> {
  const materialized = materializeEditorGameLayoutRoot(snapshot, root.key);
  const { manifest, manifestBytes } = materialized;
  const closure = collectSceneLayoutPackagePaths({
    manifest,
    files: materialized.files,
    allowExtraFiles: false,
  });
  assertExactClosure(root, new Set([root.key, ...closure]));
  return mappedZip(snapshot, root, {
    filename: `${manifest.id}-layout.zip`,
    controls: new Map([["layout.manifest.json", manifestBytes]]),
    assetKeys: closure,
  });
}

function mappedZip<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  root: EditorAssetRoot,
  options: {
    readonly filename: string;
    readonly controls: ReadonlyMap<string, Uint8Array>;
    readonly assetKeys: readonly string[];
  },
): EditorAssetExportArtifact {
  for (const key of options.assetKeys)
    if (!root.exactKeys.includes(key))
      throw new Error(`asset export 越过 root closure：${key}`);
  const entries = new Map(
    materializeEditorAssetPayloads(snapshot.workspace, options.assetKeys),
  );
  entries.set(
    EDITOR_ASSETS_MAP_PATH,
    serializeEditorAssetsMap(
      createEditorAssetsMapFromWorkspace(snapshot.workspace, options.assetKeys),
    ),
  );
  for (const [path, bytes] of options.controls) {
    if (entries.has(path))
      throw new Error(`asset ZIP control path 冲突：${path}`);
    entries.set(path, bytes.slice());
  }
  return zipArtifact(options.filename, entries);
}

function logicalFiles<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  keys: readonly string[],
): Map<string, Uint8Array> {
  return new Map(
    keys.map((key) => [key, requiredEntry(snapshot, key).bytes.slice()]),
  );
}

function assertExactClosure(
  root: EditorAssetRoot,
  expected: ReadonlySet<string>,
): void {
  const actual = new Set(root.exactKeys);
  const missing = [...expected].filter((key) => !actual.has(key));
  const orphan = [...actual].filter((key) => !expected.has(key));
  if (missing.length || orphan.length)
    throw new Error(
      `asset root ${root.key} closure 无效：missing [${missing.join(", ")}], orphan [${orphan.join(", ")}]`,
    );
}

function reachableFromRoot(
  catalog: EditorAssetCatalog,
  root: EditorAssetRoot,
  nodeId: string,
): boolean {
  const visited = new Set<string>();
  const pending = [root.nodeId];
  while (pending.length) {
    const current = pending.pop()!;
    if (current === nodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const relation of catalog.relations)
      if (relation.from === current) pending.push(relation.to);
  }
  return false;
}

function requiredRoot(
  catalog: EditorAssetCatalog,
  key: string,
): EditorAssetRoot {
  const root = catalog.roots.get(key);
  if (!root) throw new Error(`asset root 不存在：${key}`);
  return root;
}

function requiredEntry<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  key: string,
) {
  const entry = snapshot.workspace.entries.get(key);
  if (!entry) throw new Error(`asset workspace 缺少 entry：${key}`);
  return entry;
}

function artifact(
  filename: string,
  mediaType: string,
  bytes: Uint8Array,
): EditorAssetExportArtifact {
  return Object.freeze({ filename, mediaType, bytes: bytes.slice() });
}

function zipArtifact(
  filename: string,
  entries: ReadonlyMap<string, Uint8Array>,
): EditorAssetExportArtifact {
  return artifact(filename, ZIP_MEDIA_TYPE, createDeterministicZip(entries));
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(decodeText(bytes, label));
  } catch (error) {
    throw new Error(`${label} JSON 无效：${formatError(error)}`);
  }
}

function decodeText(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} UTF-8 无效：${formatError(error)}`);
  }
}

function stem(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
