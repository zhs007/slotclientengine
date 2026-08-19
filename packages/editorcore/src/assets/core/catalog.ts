import { createEmptyEditorAssetWorkspace } from "@slotclientengine/editorresource";
import type {
  EditorAssetCatalog,
  EditorAssetFilter,
  EditorAssetHostAdapter,
  EditorAssetNode,
  EditorAssetRelation,
  EditorAssetRoot,
  EditorAssetRootDraft,
  EditorAssetTreeOccurrence,
  EditorAssetUsage,
  EditorAssetUsageSnapshot,
} from "../data/index.js";

export function createEmptyEditorAssetCatalog(): EditorAssetCatalog {
  return freezeCatalog(new Map(), new Map(), []);
}

export function createEmptyEditorAssetsSnapshot<TProject>(project: TProject) {
  return Object.freeze({
    workspace: createEmptyEditorAssetWorkspace(),
    catalog: createEmptyEditorAssetCatalog(),
    project,
  });
}

export function mergeEditorAssetCatalog(
  catalog: EditorAssetCatalog,
  drafts: readonly EditorAssetRootDraft[],
): EditorAssetCatalog {
  const roots = new Map(catalog.roots);
  for (const draft of drafts) roots.delete(draft.key);
  for (const draft of drafts) roots.set(draft.key, rootFromDraft(draft));

  const retainedRootKeys = new Set(roots.keys());
  const replacedRootKeys = new Set(drafts.map(({ key }) => key));
  const retainedNodeIds = reachableNodeIds(
    catalog,
    (root) => retainedRootKeys.has(root.key) && !replacedRootKeys.has(root.key),
  );
  const nodes = new Map(
    [...catalog.nodes].filter(([id]) => retainedNodeIds.has(id)),
  );
  const relations = catalog.relations.filter(
    ({ from, to }) => retainedNodeIds.has(from) && retainedNodeIds.has(to),
  );
  for (const draft of drafts) {
    for (const node of draft.nodes) {
      const existing = nodes.get(node.id);
      if (existing && !sameNode(existing, node))
        throw new Error(`asset node identity collision: ${node.id}`);
      nodes.set(node.id, node);
    }
    relations.push(...draft.relations);
  }
  const result = freezeCatalog(roots, nodes, relations);
  validateEditorAssetCatalog(result);
  return result;
}

export function removeEditorAssetRoot(
  catalog: EditorAssetCatalog,
  rootKey: string,
): EditorAssetCatalog {
  if (!catalog.roots.has(rootKey))
    throw new Error(`asset root 不存在：${rootKey}`);
  const roots = new Map(catalog.roots);
  roots.delete(rootKey);
  const retained = reachableNodeIds(catalog, (root) => root.key !== rootKey);
  return freezeCatalog(
    roots,
    new Map([...catalog.nodes].filter(([id]) => retained.has(id))),
    catalog.relations.filter(
      ({ from, to }) => retained.has(from) && retained.has(to),
    ),
  );
}

export function validateEditorAssetCatalog(catalog: EditorAssetCatalog): void {
  const outgoing = relationIndex(catalog.relations);
  for (const root of catalog.roots.values()) {
    if (!catalog.nodes.has(root.nodeId))
      throw new Error(`asset root 缺少 node：${root.key}`);
    if (root.exactKeys.length === 0)
      throw new Error(`asset root exactKeys 不能为空：${root.key}`);
    if (new Set(root.exactKeys).size !== root.exactKeys.length)
      throw new Error(`asset root exactKeys 重复：${root.key}`);
    visit(root.nodeId, outgoing, new Set(), new Set());
  }
  for (const relation of catalog.relations) {
    if (!catalog.nodes.has(relation.from) || !catalog.nodes.has(relation.to))
      throw new Error(
        `asset relation dangling：${relation.from} -> ${relation.to}`,
      );
  }
}

export function projectEditorAssetTree(options: {
  readonly catalog: EditorAssetCatalog;
  readonly expanded: ReadonlySet<string>;
  readonly filter?: EditorAssetFilter;
  readonly usage?: EditorAssetUsageSnapshot;
}): readonly EditorAssetTreeOccurrence[] {
  const outgoing = relationIndex(options.catalog.relations);
  const output: EditorAssetTreeOccurrence[] = [];
  for (const root of filteredRoots(options)) {
    appendOccurrence({
      catalog: options.catalog,
      outgoing,
      output,
      rootKey: root.key,
      nodeId: root.nodeId,
      path: `root:${root.key}`,
      depth: 0,
      expanded: options.expanded,
    });
  }
  return Object.freeze(output);
}

export function computeEditorAssetUsage<TProject>(options: {
  readonly catalog: EditorAssetCatalog;
  readonly project: TProject;
  readonly host: EditorAssetHostAdapter<TProject>;
}): EditorAssetUsageSnapshot {
  const references = options.host.collectReferences(options.project);
  const bindings = options.host.collectProgramBindings(options.project);
  const byRoot = new Map<string, EditorAssetUsage>();
  const byNode = new Map<string, MutableUsage>();
  const outgoing = relationIndex(options.catalog.relations);
  for (const root of options.catalog.roots.values()) {
    const directReferences = references.filter(
      ({ rootKey }) => rootKey === root.key,
    );
    const programBindings = bindings.filter(
      ({ rootKey }) => rootKey === root.key,
    );
    const exported = directReferences.length > 0 || programBindings.length > 0;
    const usage = freezeUsage({
      directReferences,
      programBindings,
      inheritedFromRoots: [],
      exported,
    });
    byRoot.set(root.key, usage);
    for (const nodeId of reachableFrom(root.nodeId, outgoing)) {
      const current = byNode.get(nodeId) ?? emptyMutableUsage();
      current.directReferences.push(...directReferences);
      current.programBindings.push(...programBindings);
      if (exported) current.inheritedFromRoots.add(root.key);
      current.exported ||= exported;
      byNode.set(nodeId, current);
    }
  }
  return Object.freeze({
    byRootKey: readonlyMap(byRoot),
    byNodeId: readonlyMap(
      new Map(
        [...byNode].map(([id, usage]) => [id, freezeUsage(usage)] as const),
      ),
    ),
  });
}

export function exactCatalogKeys(
  catalog: EditorAssetCatalog,
  rootKeys: readonly string[],
): readonly string[] {
  const keys = new Set<string>();
  for (const rootKey of rootKeys) {
    const root = catalog.roots.get(rootKey);
    if (!root) throw new Error(`asset root 不存在：${rootKey}`);
    for (const key of root.exactKeys) keys.add(key);
  }
  return Object.freeze([...keys].sort(compare));
}

function filteredRoots(options: {
  catalog: EditorAssetCatalog;
  filter?: EditorAssetFilter;
  usage?: EditorAssetUsageSnapshot;
}): EditorAssetRoot[] {
  const query = options.filter?.query?.trim().toLocaleLowerCase("en-US") ?? "";
  return [...options.catalog.roots.values()]
    .filter(
      (root) => !options.filter?.kinds || options.filter.kinds.has(root.kind),
    )
    .filter((root) => {
      const status = options.filter?.status ?? "all";
      const usage = options.usage?.byRootKey.get(root.key);
      if (status === "used") return Boolean(usage?.directReferences.length);
      if (status === "programmatic")
        return Boolean(usage?.programBindings.length);
      if (status === "unused") return !usage?.exported;
      return true;
    })
    .filter((root) => {
      if (!query) return true;
      const node = options.catalog.nodes.get(root.nodeId)!;
      return `${root.key} ${root.kind} ${node.label}`
        .toLocaleLowerCase("en-US")
        .includes(query);
    })
    .sort((left, right) => compare(left.key, right.key));
}

function appendOccurrence(options: {
  catalog: EditorAssetCatalog;
  outgoing: ReadonlyMap<string, readonly EditorAssetRelation[]>;
  output: EditorAssetTreeOccurrence[];
  rootKey: string;
  nodeId: string;
  path: string;
  depth: number;
  relation?: EditorAssetRelation;
  expanded: ReadonlySet<string>;
}): void {
  const node = options.catalog.nodes.get(options.nodeId);
  if (!node) throw new Error(`asset tree node 不存在：${options.nodeId}`);
  const children = options.outgoing.get(options.nodeId) ?? [];
  const occurrence = Object.freeze({
    id: options.path,
    node,
    rootKey: options.rootKey,
    depth: options.depth,
    ...(options.relation ? { relation: options.relation } : {}),
    hasChildren: children.length > 0,
  });
  options.output.push(occurrence);
  if (!options.expanded.has(options.path)) return;
  for (const [index, relation] of children.entries())
    appendOccurrence({
      ...options,
      nodeId: relation.to,
      path: `${options.path}/${index}:${relation.kind}:${relation.to}`,
      depth: options.depth + 1,
      relation,
    });
}

function freezeCatalog(
  roots: ReadonlyMap<string, EditorAssetRoot>,
  nodes: ReadonlyMap<string, EditorAssetNode>,
  relations: readonly EditorAssetRelation[],
): EditorAssetCatalog {
  const uniqueRelations = new Map(
    relations.map((relation) => [
      `${relation.from}\u0000${relation.kind}\u0000${relation.to}`,
      relation,
    ]),
  );
  return Object.freeze({
    roots: readonlyMap(new Map(roots)),
    nodes: readonlyMap(new Map(nodes)),
    relations: Object.freeze([...uniqueRelations.values()]),
  });
}

function rootFromDraft(draft: EditorAssetRootDraft): EditorAssetRoot {
  return Object.freeze({
    key: draft.key,
    kind: draft.kind,
    nodeId: draft.nodeId,
    owner: draft.owner,
    exactKeys: Object.freeze([...draft.exactKeys]),
  });
}

function reachableNodeIds(
  catalog: EditorAssetCatalog,
  include: (root: EditorAssetRoot) => boolean,
): Set<string> {
  const outgoing = relationIndex(catalog.relations);
  const output = new Set<string>();
  for (const root of catalog.roots.values())
    if (include(root))
      for (const id of reachableFrom(root.nodeId, outgoing)) output.add(id);
  return output;
}

function reachableFrom(
  start: string,
  outgoing: ReadonlyMap<string, readonly EditorAssetRelation[]>,
): readonly string[] {
  const output = new Set<string>();
  const pending = [start];
  while (pending.length) {
    const id = pending.pop()!;
    if (output.has(id)) continue;
    output.add(id);
    for (const relation of outgoing.get(id) ?? []) pending.push(relation.to);
  }
  return [...output];
}

function visit(
  id: string,
  outgoing: ReadonlyMap<string, readonly EditorAssetRelation[]>,
  visiting: Set<string>,
  visited: Set<string>,
): void {
  if (visiting.has(id)) throw new Error(`asset relation cycle：${id}`);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const edge of outgoing.get(id) ?? [])
    visit(edge.to, outgoing, visiting, visited);
  visiting.delete(id);
  visited.add(id);
}

function relationIndex(
  relations: readonly EditorAssetRelation[],
): ReadonlyMap<string, readonly EditorAssetRelation[]> {
  const output = new Map<string, EditorAssetRelation[]>();
  for (const relation of relations) {
    const current = output.get(relation.from) ?? [];
    current.push(relation);
    output.set(relation.from, current);
  }
  for (const values of output.values())
    values.sort((left, right) =>
      compare(`${left.kind}:${left.to}`, `${right.kind}:${right.to}`),
    );
  return output;
}

interface MutableUsage {
  directReferences: import("../data/index.js").EditorAssetHostReference[];
  programBindings: import("../data/index.js").EditorAssetProgramBinding[];
  inheritedFromRoots: Set<string>;
  exported: boolean;
}

function emptyMutableUsage(): MutableUsage {
  return {
    directReferences: [],
    programBindings: [],
    inheritedFromRoots: new Set(),
    exported: false,
  };
}

function freezeUsage(
  usage:
    | MutableUsage
    | {
        directReferences: readonly import("../data/index.js").EditorAssetHostReference[];
        programBindings: readonly import("../data/index.js").EditorAssetProgramBinding[];
        inheritedFromRoots: readonly string[];
        exported: boolean;
      },
): EditorAssetUsage {
  return Object.freeze({
    directReferences: Object.freeze([...usage.directReferences]),
    programBindings: Object.freeze([...usage.programBindings]),
    inheritedFromRoots: Object.freeze(
      [...usage.inheritedFromRoots].sort(compare),
    ),
    exported: usage.exported,
  });
}

function sameNode(left: EditorAssetNode, right: EditorAssetNode): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readonlyMap<K, V>(source: ReadonlyMap<K, V>): ReadonlyMap<K, V> {
  const copy = new Map(source);
  for (const method of ["set", "delete", "clear"] as const)
    Object.defineProperty(copy, method, {
      value: () => {
        throw new Error("EditorCore readonly map 不可修改。");
      },
    });
  return copy;
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
