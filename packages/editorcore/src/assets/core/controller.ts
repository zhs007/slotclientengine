import type { SourceFileLike } from "@slotclientengine/browserartifactio";
import {
  commitEditorAssetImport,
  createEditorAssetWorkspace,
  createEditorAssetsMapFromWorkspace,
  materializeEditorAssetPayloads,
  renameEditorAsset,
  resolveEditorAssetImportReview,
  reviewEditorAssetImport,
  type EditorAssetRewriteAdapter,
} from "@slotclientengine/editorresource";
import type {
  EditorAssetCatalog,
  EditorAssetExportArtifact,
  EditorAssetExportPlan,
  EditorAssetHostAdapter,
  EditorAssetImportPreparation,
  EditorAssetImportResolution,
  EditorAssetRootDraft,
  EditorAssetsSnapshot,
} from "../data/index.js";
import {
  computeEditorAssetUsage,
  createEmptyEditorAssetsSnapshot,
  exactCatalogKeys,
  mergeEditorAssetCatalog,
  removeEditorAssetRoot,
} from "./catalog.js";

export interface EditorAssetsController<TProject> {
  readonly snapshot: EditorAssetsSnapshot<TProject>;
  readonly host: EditorAssetHostAdapter<TProject>;
  subscribe(listener: () => void): () => void;
  prepareImport(
    files: readonly SourceFileLike[],
    profileSelections?: Readonly<Record<string, string>>,
  ): Promise<EditorAssetImportPreparation>;
  commitImport(
    preparation: EditorAssetImportPreparation,
    resolutions?: readonly EditorAssetImportResolution[],
  ): Promise<void>;
  deleteRoot(rootKey: string): Promise<void>;
  renameRoot(rootKey: string, nextKey: string): Promise<void>;
  setProgramBinding(rootKey: string, name: string | null): Promise<void>;
  exportRoot(rootKey: string): Promise<EditorAssetExportArtifact>;
  createExportPlan(rootKeys?: readonly string[]): EditorAssetExportPlan;
  createAssetsMap(
    rootKeys?: readonly string[],
  ): ReturnType<typeof createEditorAssetsMapFromWorkspace>;
  materializePayloads(
    rootKeys?: readonly string[],
  ): ReadonlyMap<string, Uint8Array>;
  destroy(): void;
}

export function createEditorAssetsController<TProject>(options: {
  readonly project: TProject;
  readonly host: EditorAssetHostAdapter<TProject>;
  readonly initial?: EditorAssetsSnapshot<TProject>;
  readonly discoverAssets?: (
    files: readonly SourceFileLike[],
    profileSelections?: Readonly<Record<string, string>>,
  ) => Promise<{
    readonly drafts: readonly EditorAssetRootDraft[];
    readonly profiles: EditorAssetImportPreparation["profiles"];
    readonly blockingErrors: readonly string[];
  }>;
  readonly exportAsset?: (
    snapshot: EditorAssetsSnapshot<TProject>,
    rootKey: string,
  ) => Promise<EditorAssetExportArtifact>;
}): EditorAssetsController<TProject> {
  let snapshot =
    options.initial ?? createEmptyEditorAssetsSnapshot(options.project);
  let destroyed = false;
  const listeners = new Set<() => void>();

  const controller: EditorAssetsController<TProject> = {
    get snapshot() {
      return snapshot;
    },
    host: options.host,
    subscribe(listener) {
      assertAlive();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async prepareImport(files, profileSelections) {
      assertAlive();
      if (!options.discoverAssets)
        throw new Error(
          "EditorAssetsController 未配置 asset discover adapter。",
        );
      const discovered = await options.discoverAssets(files, profileSelections);
      const incoming = uniqueInputs(
        discovered.drafts.flatMap(({ inputs }) => inputs),
      );
      const references = options.host.collectReferences(snapshot.project);
      const review = await reviewEditorAssetImport({
        workspace: snapshot.workspace,
        incoming,
        references: {
          references: references.map(({ rootKey, location, kind }) => ({
            key: rootKey,
            location,
            ...(kind ? { kind } : {}),
          })),
        },
      });
      return Object.freeze({
        drafts: discovered.drafts,
        review,
        profiles: discovered.profiles,
        blockingErrors: Object.freeze([
          ...discovered.blockingErrors,
          ...review.blockingErrors,
        ]),
      });
    },
    async commitImport(preparation, resolutions = []) {
      assertAlive();
      if (preparation.blockingErrors.length)
        throw new Error(
          `asset import 仍有 blocking error：${preparation.blockingErrors.join("；")}`,
        );
      const overwriteItems = preparation.review.items
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => item.action === "overwrite");
      const decisions = new Map(
        resolutions.map(({ itemIndex, resolution }) => [itemIndex, resolution]),
      );
      for (const { itemIndex, item } of overwriteItems)
        if (!decisions.has(itemIndex))
          throw new Error(`asset conflict 尚未选择：${item.targetKey}`);
      for (const resolution of resolutions) {
        if (resolution.resolution !== "keep-both") continue;
        const item = preparation.review.items[resolution.itemIndex];
        const compound = preparation.drafts.find(
          (draft) =>
            draft.exactKeys.length > 1 &&
            draft.exactKeys.includes(item?.targetKey ?? ""),
        );
        if (compound)
          throw new Error(
            `compound asset ${compound.key} 的 keep-both 必须先使用不同 owner/package id 导出，不能只改内部 leaf。`,
          );
      }
      const review = resolutions.length
        ? resolveEditorAssetImportReview({
            workspace: snapshot.workspace,
            review: preparation.review,
            resolutions,
          })
        : preparation.review;
      const rewrite = new Map(
        review.items.map(
          (item, index) =>
            [
              preparation.review.items[index]!.incoming.key,
              item.targetKey,
            ] as const,
        ),
      );
      const drafts = preparation.drafts.map((draft) =>
        remapDraft(draft, rewrite),
      );
      const catalog = mergeEditorAssetCatalog(snapshot.catalog, drafts);
      const project = options.host.cloneProject(snapshot.project);
      const adapter = workspaceAdapter(options.host, catalog);
      const committed = await commitEditorAssetImport({
        workspace: snapshot.workspace,
        project,
        review,
        adapter,
        prepare: async (workspace, candidate) =>
          options.host.validateProject?.(candidate, catalog, workspace),
      });
      const workspace = await pruneWorkspace(committed.workspace, catalog);
      snapshot = Object.freeze({
        workspace,
        catalog,
        project: committed.project,
      });
      emit();
    },
    async deleteRoot(rootKey) {
      assertAlive();
      const usage = computeEditorAssetUsage({
        catalog: snapshot.catalog,
        project: snapshot.project,
        host: options.host,
      }).byRootKey.get(rootKey);
      if (usage?.directReferences.length || usage?.programBindings.length)
        throw new Error(`asset root 仍被使用：${rootKey}`);
      const catalog = removeEditorAssetRoot(snapshot.catalog, rootKey);
      const workspace = await pruneWorkspace(snapshot.workspace, catalog);
      const project = options.host.cloneProject(snapshot.project);
      await options.host.validateProject?.(project, catalog, workspace);
      snapshot = Object.freeze({ workspace, catalog, project });
      emit();
    },
    async renameRoot(rootKey, nextKey) {
      assertAlive();
      const root = snapshot.catalog.roots.get(rootKey);
      if (!root) throw new Error(`asset root 不存在：${rootKey}`);
      if (root.exactKeys.length !== 1)
        throw new Error("compound root 必须由 owner adapter 结构化改名。");
      const renamed = await renameEditorAsset({
        workspace: snapshot.workspace,
        project: snapshot.project,
        from: rootKey,
        to: nextKey,
        adapter: workspaceAdapter(options.host, snapshot.catalog),
      });
      const draft = remapExistingRoot(snapshot.catalog, rootKey, nextKey);
      let catalog = removeEditorAssetRoot(snapshot.catalog, rootKey);
      catalog = mergeEditorAssetCatalog(catalog, [draft]);
      await options.host.validateProject?.(
        renamed.project,
        catalog,
        renamed.workspace,
      );
      snapshot = Object.freeze({
        workspace: renamed.workspace,
        catalog,
        project: renamed.project,
      });
      emit();
    },
    async setProgramBinding(rootKey, name) {
      assertAlive();
      if (!snapshot.catalog.roots.has(rootKey))
        throw new Error(`asset root 不存在：${rootKey}`);
      const cloned = options.host.cloneProject(snapshot.project);
      const project = await options.host.setProgramBinding(
        cloned,
        rootKey,
        name,
      );
      await options.host.validateProject?.(
        project,
        snapshot.catalog,
        snapshot.workspace,
      );
      snapshot = Object.freeze({ ...snapshot, project });
      emit();
    },
    async exportRoot(rootKey) {
      assertAlive();
      if (!snapshot.catalog.roots.has(rootKey))
        throw new Error(`asset root 不存在：${rootKey}`);
      if (!options.exportAsset)
        throw new Error("EditorAssetsController 未配置 asset export adapter。");
      const artifact = await options.exportAsset(snapshot, rootKey);
      if (!artifact.filename.trim())
        throw new Error("asset export filename 为空。");
      if (!artifact.mediaType.trim())
        throw new Error("asset export mediaType 为空。");
      if (!(artifact.bytes instanceof Uint8Array))
        throw new Error("asset export bytes 必须是 Uint8Array。");
      return Object.freeze({
        filename: artifact.filename,
        mediaType: artifact.mediaType,
        bytes: artifact.bytes.slice(),
      });
    },
    createExportPlan(rootKeys) {
      assertAlive();
      const selected = rootKeys ?? exportedRootKeys(snapshot, options.host);
      return Object.freeze({
        rootKeys: Object.freeze([...selected]),
        assetKeys: exactCatalogKeys(snapshot.catalog, selected),
        workspace: snapshot.workspace,
      });
    },
    createAssetsMap(rootKeys) {
      const plan = controller.createExportPlan(rootKeys);
      return createEditorAssetsMapFromWorkspace(plan.workspace, plan.assetKeys);
    },
    materializePayloads(rootKeys) {
      const plan = controller.createExportPlan(rootKeys);
      return materializeEditorAssetPayloads(plan.workspace, plan.assetKeys);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
    },
  };
  return controller;

  function assertAlive(): void {
    if (destroyed) throw new Error("EditorAssetsController 已销毁。");
  }
  function emit(): void {
    for (const listener of listeners) listener();
  }
}

function workspaceAdapter<TProject>(
  host: EditorAssetHostAdapter<TProject>,
  catalog: EditorAssetCatalog,
): EditorAssetRewriteAdapter<TProject> {
  return {
    cloneProject: host.cloneProject,
    collectReferences: (project) => ({
      references: host
        .collectReferences(project)
        .map(({ rootKey, location, kind }) => ({
          key: rootKey,
          location,
          ...(kind ? { kind } : {}),
        })),
    }),
    renameReferences: host.renameReferences,
    validateProject: async (project, workspace) =>
      host.validateProject?.(project, catalog, workspace),
  };
}

function remapDraft(
  draft: EditorAssetRootDraft,
  rewrite: ReadonlyMap<string, string>,
): EditorAssetRootDraft {
  const remapKey = (key: string) => rewrite.get(key) ?? key;
  const remapId = (id: string) => {
    if (id.startsWith("file:")) return `file:${remapKey(id.slice(5))}`;
    if (id.startsWith("root:")) {
      const marker = id.indexOf(":", 5);
      return marker < 0
        ? id
        : `${id.slice(0, marker + 1)}${remapKey(id.slice(marker + 1))}`;
    }
    return id;
  };
  const rootKey = remapKey(draft.key);
  return Object.freeze({
    ...draft,
    key: rootKey,
    nodeId: remapId(draft.nodeId),
    exactKeys: Object.freeze(draft.exactKeys.map(remapKey)),
    inputs: Object.freeze(
      draft.inputs.map((item) => ({ ...item, key: remapKey(item.key) })),
    ),
    nodes: Object.freeze(
      draft.nodes.map((node) => ({
        ...node,
        id: remapId(node.id),
        key: remapKey(node.key),
        label: node.label === node.key ? remapKey(node.key) : node.label,
      })),
    ),
    relations: Object.freeze(
      draft.relations.map((edge) => ({
        ...edge,
        from: remapId(edge.from),
        to: remapId(edge.to),
      })),
    ),
  });
}

function remapExistingRoot(
  catalog: EditorAssetCatalog,
  rootKey: string,
  nextKey: string,
): EditorAssetRootDraft {
  const root = catalog.roots.get(rootKey)!;
  const nodeIds = reachable(catalog, root.nodeId);
  const rewrite = new Map([[rootKey, nextKey]]);
  return remapDraft(
    {
      ...root,
      inputs: [],
      nodes: [...nodeIds].map((id) => catalog.nodes.get(id)!),
      relations: catalog.relations.filter(
        ({ from, to }) => nodeIds.has(from) && nodeIds.has(to),
      ),
    },
    rewrite,
  );
}

function reachable(catalog: EditorAssetCatalog, start: string): Set<string> {
  const output = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const id = pending.pop()!;
    if (output.has(id)) continue;
    output.add(id);
    for (const edge of catalog.relations)
      if (edge.from === id) pending.push(edge.to);
  }
  return output;
}

async function pruneWorkspace(
  workspace: import("@slotclientengine/editorresource").EditorAssetWorkspace,
  catalog: EditorAssetCatalog,
) {
  const keep = new Set(
    [...catalog.roots.values()].flatMap(({ exactKeys }) => exactKeys),
  );
  return createEditorAssetWorkspace(
    [...workspace.entries.values()]
      .filter(({ key }) => keep.has(key))
      .map(({ key, mediaType, bytes }) => ({ key, mediaType, bytes })),
  );
}

function exportedRootKeys<TProject>(
  snapshot: EditorAssetsSnapshot<TProject>,
  host: EditorAssetHostAdapter<TProject>,
): readonly string[] {
  const usage = computeEditorAssetUsage({
    catalog: snapshot.catalog,
    project: snapshot.project,
    host,
  });
  return Object.freeze(
    [...snapshot.catalog.roots.keys()]
      .filter((key) => usage.byRootKey.get(key)?.exported)
      .sort(compare),
  );
}

function uniqueInputs(
  inputs: readonly import("@slotclientengine/editorresource").EditorAssetInput[],
) {
  const output = new Map<string, (typeof inputs)[number]>();
  for (const input of inputs) {
    const existing = output.get(input.key);
    if (
      existing &&
      (existing.mediaType !== input.mediaType ||
        !equalBytes(existing.bytes, input.bytes))
    )
      throw new Error(`asset input 同 key 不同内容：${input.key}`);
    output.set(input.key, input);
  }
  return [...output.values()];
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
