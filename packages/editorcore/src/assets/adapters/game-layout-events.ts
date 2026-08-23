import {
  inspectSceneLayoutRuntimeEventCatalog,
  parseSceneLayoutManifestDocument,
  type GameLayoutRuntimeAddressDescriptor,
  type GameLayoutRuntimeAddress,
  type GameLayoutRuntimeEventCatalogEntry,
} from "@slotclientengine/rendercore/scene-layout/editor";
import type { EditorAssetRoot, EditorAssetsSnapshot } from "../data/index.js";

export interface EditorGameLayoutEventItem {
  readonly address: GameLayoutRuntimeAddress;
  readonly descriptor: GameLayoutRuntimeAddressDescriptor & {
    readonly kind: "event";
  };
}

export interface EditorGameLayoutEventGroup {
  readonly rootKey: string;
  readonly events: readonly EditorGameLayoutEventItem[];
}

export interface EditorGameLayoutEventCatalog {
  readonly rootKey: string;
  readonly entries: readonly GameLayoutRuntimeEventCatalogEntry[];
}

export interface MaterializedEditorGameLayoutRoot {
  readonly root: EditorAssetRoot;
  readonly manifestBytes: Uint8Array;
  readonly manifest: ReturnType<typeof parseSceneLayoutManifestDocument>;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

export function inspectEditorGameLayoutEventCatalog<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  rootKey: string,
): EditorGameLayoutEventCatalog {
  const materialized = materializeEditorGameLayoutRoot(snapshot, rootKey);
  const catalog = inspectSceneLayoutRuntimeEventCatalog({
    manifest: materialized.manifest,
    files: materialized.files,
  });
  return Object.freeze({
    rootKey,
    entries: catalog.entries,
  });
}

export function materializeEditorGameLayoutRoot<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  rootKey: string,
): MaterializedEditorGameLayoutRoot {
  const root = snapshot.catalog.roots.get(rootKey);
  if (!root) throw new Error(`Game Layout asset root 不存在：${rootKey}`);
  if (root.kind !== "game-layout")
    throw new Error(`asset root 不是 Game Layout：${rootKey}`);
  const manifestEntry = snapshot.workspace.entries.get(root.key);
  if (!manifestEntry)
    throw new Error(`asset workspace 缺少 entry：${root.key}`);
  const files = new Map<string, Uint8Array>();
  for (const key of root.exactKeys) {
    if (key === root.key) continue;
    const entry = snapshot.workspace.entries.get(key);
    if (!entry) throw new Error(`asset workspace 缺少 entry：${key}`);
    files.set(key, entry.bytes.slice());
  }
  const manifestBytes = manifestEntry.bytes.slice();
  const manifest = parseSceneLayoutManifestDocument(
    parseJson(manifestBytes, root.key),
  );
  return Object.freeze({
    root,
    manifestBytes,
    manifest,
    files,
  });
}

export function createEditorGameLayoutEventItem(
  entry: GameLayoutRuntimeEventCatalogEntry,
): EditorGameLayoutEventItem {
  return Object.freeze({
    address: entry.descriptor.address,
    descriptor: entry.descriptor,
  });
}

export function validateEditorGameLayoutEventGroup(
  catalog: EditorGameLayoutEventCatalog,
  group: EditorGameLayoutEventGroup,
): EditorGameLayoutEventGroup {
  if (group.rootKey !== catalog.rootKey)
    throw new Error(
      `event group 的 Game Layout root 不匹配：${group.rootKey} !== ${catalog.rootKey}`,
    );
  const available = new Map(
    catalog.entries.map((entry) => [entry.descriptor.address, entry]),
  );
  const seen = new Set<GameLayoutRuntimeAddress>();
  const events = group.events.map((item, index) => {
    const entry = available.get(item.address);
    if (!entry)
      throw new Error(
        `event group 第 ${index + 1} 项不属于当前 Game Layout ZIP：${item.address}`,
      );
    if (seen.has(item.address))
      throw new Error(`event group 包含重复 event：${item.address}`);
    seen.add(item.address);
    return createEditorGameLayoutEventItem(entry);
  });
  return Object.freeze({
    rootKey: group.rootKey,
    events: Object.freeze(events),
  });
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${label} JSON 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
