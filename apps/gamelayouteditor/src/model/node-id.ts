import {
  upgradeSceneLayoutManifestToLatest,
  type SceneLayoutManifest,
  type SceneLayoutManifestLatest,
} from "@slotclientengine/rendercore/scene-layout";

export const RESERVED_RENDER_LAYER_NODE_IDS = Object.freeze([
  "layout",
  "reel",
  "transition",
  "popup",
] as const);

const RESERVED = new Set<string>(RESERVED_RENDER_LAYER_NODE_IDS);
const CANONICAL = /^[a-z0-9][a-z0-9-]*$/u;

export interface EditorNodeIdRename {
  readonly from: string;
  readonly to: string;
}

export function assertCanonicalEditorNodeId(nodeId: string): void {
  if (!CANONICAL.test(nodeId))
    throw new Error(`node id 必须是小写字母数字与连字符：${nodeId}`);
  if (RESERVED.has(nodeId))
    throw new Error(`node id 不得使用 RenderLayer 保留名：${nodeId}`);
}

export function migrateSceneLayoutNodeIds(manifestValue: SceneLayoutManifest): {
  readonly manifest: SceneLayoutManifestLatest;
  readonly renames: readonly EditorNodeIdRename[];
} {
  const manifest = upgradeSceneLayoutManifestToLatest(manifestValue);
  const preserved = new Set(
    manifest.nodes
      .map((node) => node.id)
      .filter((id) => CANONICAL.test(id) && !RESERVED.has(id)),
  );
  const allocated = new Set(preserved);
  const renameById = new Map<string, string>();
  const migrating = manifest.nodes
    .filter((node) => !preserved.has(node.id))
    .slice()
    .sort(
      (left, right) =>
        left.id.localeCompare(right.id) || left.order - right.order,
    );
  for (const node of migrating) {
    const base = canonicalMigrationBase(node.id);
    let candidate = base;
    let suffix = 2;
    while (allocated.has(candidate) || RESERVED.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    allocated.add(candidate);
    renameById.set(node.id, candidate);
  }
  if (renameById.size === 0)
    return Object.freeze({ manifest, renames: Object.freeze([]) });

  const rename = (id: string): string => renameById.get(id) ?? id;
  const draft = structuredClone(manifest) as SceneLayoutManifestLatest;
  (draft as { nodes: SceneLayoutManifestLatest["nodes"] }).nodes =
    draft.nodes.map((node) => ({ ...node, id: rename(node.id) }));
  for (const mode of draft.gameModes.modes) {
    for (const [variant, id] of Object.entries(mode.backgroundNodes))
      if (id)
        (mode.backgroundNodes as Record<string, string>)[variant] = rename(id);
    (mode as { nodeStates: Record<string, string> }).nodeStates =
      Object.fromEntries(
        Object.entries(mode.nodeStates).map(([id, state]) => [
          rename(id),
          state,
        ]),
      );
  }
  const { runtimeAllocation: _runtimeAllocation, ...v2Fields } = draft;
  const migrated = upgradeSceneLayoutManifestToLatest({
    ...v2Fields,
    version: 2,
  });
  return Object.freeze({
    manifest: migrated,
    renames: Object.freeze(
      [...renameById.entries()]
        .map(([from, to]) => Object.freeze({ from, to }))
        .sort((left, right) => left.from.localeCompare(right.from)),
    ),
  });
}

function canonicalMigrationBase(id: string): string {
  let base = id
    .replace(/[._]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (!base) base = "node";
  if (RESERVED.has(base)) base = `${base}-node`;
  assertCanonicalEditorNodeId(base);
  return base;
}
