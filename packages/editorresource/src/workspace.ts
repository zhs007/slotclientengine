import {
  allocateContentAddressedPath,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import { parseEditorAssetsMap, type EditorAssetsMapV1 } from "./assets-map.js";
import {
  assertEditorAssetKey,
  canonicalExtensionOfEditorAssetKey,
  editorAssetKeyCollisionToken,
  extensionOfEditorAssetKey,
  type EditorAssetKey,
} from "./key.js";

export interface EditorAssetEntry {
  readonly key: EditorAssetKey;
  readonly sha256: string;
  readonly payloadPath: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

export interface EditorAssetInput {
  readonly key: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface EditorAssetReference {
  readonly key: EditorAssetKey;
  readonly location: string;
  readonly kind?: string;
}

export interface EditorReferenceGraph {
  readonly references: readonly EditorAssetReference[];
}

export interface EditorAssetWorkspace {
  readonly entries: ReadonlyMap<EditorAssetKey, EditorAssetEntry>;
}

export type EditorImportAction =
  | "add"
  | "noop"
  | "overwrite"
  | "rename-required";

export interface EditorImportReviewItem {
  readonly incoming: EditorAssetEntry;
  readonly targetKey: EditorAssetKey;
  readonly action: EditorImportAction;
  readonly existing?: EditorAssetEntry;
  readonly references: readonly EditorAssetReference[];
  readonly sourceKeys: readonly string[];
  readonly errors: readonly string[];
}

export interface EditorImportReview {
  readonly items: readonly EditorImportReviewItem[];
  readonly blockingErrors: readonly string[];
  readonly canCommit: boolean;
}

export interface EditorAssetRewriteAdapter<TProject> {
  readonly collectReferences: (project: TProject) => EditorReferenceGraph;
  readonly renameReferences: (
    project: TProject,
    from: EditorAssetKey,
    to: EditorAssetKey,
  ) => TProject | Promise<TProject>;
  readonly validateProject?: (
    project: TProject,
    workspace: EditorAssetWorkspace,
  ) => void | Promise<void>;
  readonly cloneProject: (project: TProject) => TProject;
}

export function createEmptyEditorAssetWorkspace(): EditorAssetWorkspace {
  return Object.freeze({ entries: readonlyMap(new Map()) });
}

export function cloneEditorAssetWorkspace(
  workspace: EditorAssetWorkspace,
): EditorAssetWorkspace {
  return freezeWorkspace(workspace.entries.values());
}

export async function createEditorAssetEntry(
  input: EditorAssetInput,
): Promise<EditorAssetEntry> {
  const key = assertEditorAssetKey(input.key);
  if (!(input.bytes instanceof Uint8Array))
    throw new Error(`asset ${key} bytes 必须是 Uint8Array。`);
  assertMediaTypeMatchesExtension(key, input.mediaType);
  const bytes = input.bytes.slice();
  const sha256 = await sha256Hex(bytes);
  return Object.freeze({
    key,
    sha256,
    payloadPath: allocateContentAddressedPath({
      digest: sha256,
      extension: canonicalExtensionOfEditorAssetKey(key),
    }),
    mediaType: input.mediaType,
    byteLength: bytes.byteLength,
    bytes,
  });
}

export async function reviewEditorAssetImport(options: {
  readonly workspace: EditorAssetWorkspace;
  readonly incoming: readonly EditorAssetInput[];
  readonly references?: EditorReferenceGraph;
}): Promise<EditorImportReview> {
  const entries = await Promise.all(
    options.incoming.map(createEditorAssetEntry),
  );
  const existingByToken = tokenIndex(options.workspace.entries.values());
  const batchByToken = new Map<string, EditorImportReviewItem>();
  const items: EditorImportReviewItem[] = [];
  const blockingErrors: string[] = [];
  for (const incoming of entries) {
    const token = editorAssetKeyCollisionToken(incoming.key);
    const batch = batchByToken.get(token);
    if (batch) {
      if (sameEntryBytes(batch.incoming, incoming)) {
        const merged = Object.freeze({
          ...batch,
          sourceKeys: Object.freeze([...batch.sourceKeys, incoming.key]),
        });
        items[items.indexOf(batch)] = merged;
        batchByToken.set(token, merged);
      } else {
        const message = `导入批次抹平后同名但 bytes 不同：${batch.incoming.key} / ${incoming.key}`;
        blockingErrors.push(message);
        items.push(
          Object.freeze({
            incoming,
            targetKey: incoming.key,
            action: "rename-required" as const,
            references: Object.freeze([]),
            sourceKeys: Object.freeze([incoming.key]),
            errors: Object.freeze([message]),
          }),
        );
      }
      continue;
    }
    const existing = existingByToken.get(token);
    const targetKey = existing?.key ?? incoming.key;
    const references = Object.freeze(
      (options.references?.references ?? []).filter(
        ({ key }) => editorAssetKeyCollisionToken(key) === token,
      ),
    );
    const action: EditorImportAction = existing
      ? sameEntryBytes(existing, incoming)
        ? "noop"
        : "overwrite"
      : "add";
    const item = Object.freeze({
      incoming,
      targetKey,
      action,
      existing,
      references,
      sourceKeys: Object.freeze([incoming.key]),
      errors: Object.freeze([]),
    });
    batchByToken.set(token, item);
    items.push(item);
  }
  return Object.freeze({
    items: Object.freeze(items),
    blockingErrors: Object.freeze(blockingErrors),
    canCommit: blockingErrors.length === 0,
  });
}

export async function commitEditorAssetImport<TProject>(options: {
  readonly workspace: EditorAssetWorkspace;
  readonly project: TProject;
  readonly review: EditorImportReview;
  readonly adapter: EditorAssetRewriteAdapter<TProject>;
  readonly prepare?: (
    workspace: EditorAssetWorkspace,
    project: TProject,
  ) => void | Promise<void>;
}): Promise<{
  readonly workspace: EditorAssetWorkspace;
  readonly project: TProject;
}> {
  if (!options.review.canCommit || options.review.blockingErrors.length)
    throw new Error("import review 仍有 blocking error，不能提交。");
  const candidateEntries = new Map(options.workspace.entries);
  for (const item of options.review.items) {
    if (item.errors.length || item.action === "rename-required")
      throw new Error(`import item ${item.incoming.key} 尚未解决。`);
    if (item.action === "noop") continue;
    candidateEntries.set(
      item.targetKey,
      cloneEntry({ ...item.incoming, key: item.targetKey }),
    );
  }
  const workspace = freezeWorkspace(candidateEntries.values());
  const project = options.adapter.cloneProject(options.project);
  await options.adapter.validateProject?.(project, workspace);
  await options.prepare?.(workspace, project);
  return Object.freeze({ workspace, project });
}

export async function renameEditorAsset<TProject>(options: {
  readonly workspace: EditorAssetWorkspace;
  readonly project: TProject;
  readonly from: string;
  readonly to: string;
  readonly adapter: EditorAssetRewriteAdapter<TProject>;
}): Promise<{
  readonly workspace: EditorAssetWorkspace;
  readonly project: TProject;
}> {
  const from = resolveWorkspaceKey(options.workspace, options.from);
  const to = assertEditorAssetKey(options.to);
  const existingToken = tokenIndex(options.workspace.entries.values()).get(
    editorAssetKeyCollisionToken(to),
  );
  if (existingToken && existingToken.key !== from)
    throw new Error(`asset filename key 已存在：${to}`);
  const current = options.workspace.entries.get(from)!;
  assertMediaTypeMatchesExtension(to, current.mediaType);
  const sha256 = current.sha256;
  const renamed = cloneEntry({
    ...current,
    key: to,
    payloadPath: allocateContentAddressedPath({
      digest: sha256,
      extension: canonicalExtensionOfEditorAssetKey(to),
    }),
  });
  const entries = new Map(options.workspace.entries);
  entries.delete(from);
  entries.set(to, renamed);
  const workspace = freezeWorkspace(entries.values());
  const cloned = options.adapter.cloneProject(options.project);
  const project = await options.adapter.renameReferences(cloned, from, to);
  await options.adapter.validateProject?.(project, workspace);
  return Object.freeze({ workspace, project });
}

export function deleteEditorAsset<TProject>(options: {
  readonly workspace: EditorAssetWorkspace;
  readonly project: TProject;
  readonly key: string;
  readonly adapter: Pick<
    EditorAssetRewriteAdapter<TProject>,
    "collectReferences"
  >;
}): EditorAssetWorkspace {
  const key = resolveWorkspaceKey(options.workspace, options.key);
  const references = options.adapter
    .collectReferences(options.project)
    .references.filter(
      (reference) =>
        editorAssetKeyCollisionToken(reference.key) ===
        editorAssetKeyCollisionToken(key),
    );
  if (references.length)
    throw new Error(
      `asset ${key} 仍被引用：${references.map(({ location }) => location).join(", ")}`,
    );
  const entries = new Map(options.workspace.entries);
  entries.delete(key);
  return freezeWorkspace(entries.values());
}

export function createEditorAssetsMapFromWorkspace(
  workspace: EditorAssetWorkspace,
  keys: readonly string[] = [...workspace.entries.keys()],
): EditorAssetsMapV1 {
  const files: Record<string, unknown> = {};
  const emitted = new Set<string>();
  for (const requested of [...keys].sort((a, b) => a.localeCompare(b, "en"))) {
    const key = resolveWorkspaceKey(workspace, requested);
    if (emitted.has(key)) continue;
    emitted.add(key);
    const entry = workspace.entries.get(key)!;
    files[key] = {
      path: entry.payloadPath,
      sha256: entry.sha256,
      mediaType: entry.mediaType,
      byteLength: entry.byteLength,
    };
  }
  return parseEditorAssetsMap({ version: 1, kind: "editor-assets", files });
}

export function materializeEditorAssetPayloads(
  workspace: EditorAssetWorkspace,
  keys: readonly string[] = [...workspace.entries.keys()],
): ReadonlyMap<string, Uint8Array> {
  const output = new Map<string, Uint8Array>();
  for (const requested of keys) {
    const key = resolveWorkspaceKey(workspace, requested);
    const entry = workspace.entries.get(key)!;
    const current = output.get(entry.payloadPath);
    if (current && !bytesEqual(current, entry.bytes))
      throw new Error(`payload digest collision：${entry.payloadPath}`);
    if (!current) output.set(entry.payloadPath, entry.bytes.slice());
  }
  return readonlyMap(output);
}

export function exactEditorAssetClosure(
  workspace: EditorAssetWorkspace,
  graph: EditorReferenceGraph,
): readonly EditorAssetKey[] {
  const output = new Set<EditorAssetKey>();
  for (const reference of graph.references)
    output.add(resolveWorkspaceKey(workspace, reference.key));
  return Object.freeze([...output].sort((a, b) => a.localeCompare(b, "en")));
}

function resolveWorkspaceKey(
  workspace: EditorAssetWorkspace,
  requested: string,
): EditorAssetKey {
  assertEditorAssetKey(requested);
  const match = tokenIndex(workspace.entries.values()).get(
    editorAssetKeyCollisionToken(requested),
  );
  if (!match) throw new Error(`asset filename key 不存在：${requested}`);
  return match.key;
}
function tokenIndex(
  entries: Iterable<EditorAssetEntry>,
): Map<string, EditorAssetEntry> {
  const output = new Map<string, EditorAssetEntry>();
  for (const entry of entries) {
    const token = editorAssetKeyCollisionToken(entry.key);
    if (output.has(token))
      throw new Error(`workspace asset key collision：${entry.key}`);
    output.set(token, entry);
  }
  return output;
}
function freezeWorkspace(
  entries: Iterable<EditorAssetEntry>,
): EditorAssetWorkspace {
  const map = new Map<EditorAssetKey, EditorAssetEntry>();
  for (const entry of entries) {
    const copy = cloneEntry(entry);
    map.set(copy.key, copy);
  }
  tokenIndex(map.values());
  return Object.freeze({ entries: readonlyMap(map) });
}
function cloneEntry(entry: EditorAssetEntry): EditorAssetEntry {
  return Object.freeze({ ...entry, bytes: entry.bytes.slice() });
}
function readonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const map = new Map(source);
  for (const method of ["set", "delete", "clear"] as const)
    Object.defineProperty(map, method, {
      value: () => {
        throw new Error("只读 workspace map 不可修改。");
      },
    });
  return map;
}
function sameEntryBytes(
  left: EditorAssetEntry,
  right: EditorAssetEntry,
): boolean {
  return (
    left.mediaType === right.mediaType &&
    left.sha256 === right.sha256 &&
    bytesEqual(left.bytes, right.bytes)
  );
}
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}

export function assertMediaTypeMatchesExtension(
  key: string,
  mediaType: string,
): void {
  if (typeof mediaType !== "string" || !mediaType.includes("/"))
    throw new Error(`asset ${key} mediaType 无效。`);
  const extension = extensionOfEditorAssetKey(key);
  const allowed: Readonly<Record<string, readonly string[]>> = {
    png: ["image/png"],
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    webp: ["image/webp"],
    json: ["application/json"],
    atlas: ["text/plain", "application/octet-stream"],
    mp4: ["video/mp4"],
    zip: ["application/zip"],
  };
  const expected = allowed[extension];
  if (expected && !expected.includes(mediaType))
    throw new Error(
      `asset ${key} 扩展名与 mediaType 不兼容：${extension} / ${mediaType}`,
    );
}
