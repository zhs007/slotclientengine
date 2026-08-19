import {
  createDeterministicZip,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  createEditorAssetWorkspace,
  decodeEditorAssetsMap,
  serializeEditorAssetsMap,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import {
  validateEditorAssetCatalog,
  type EditorAssetsController,
} from "@slotclientengine/editorcore/assets/core";
import type {
  EditorAssetCatalog,
  EditorAssetNode,
  EditorAssetRelation,
  EditorAssetRoot,
  EditorAssetsSnapshot,
} from "@slotclientengine/editorcore/assets/data";
import { demoProjectHost, parseDemoProject, type DemoProject } from "./host.js";

export const DEMO_PROJECT_PATH = "editorcore.demo.json";

const ARCHIVE_LIMITS = Object.freeze({
  maxEntries: 20_000,
  maxCompressedBytes: 250 * 1024 * 1024,
  maxFileBytes: 60 * 1024 * 1024,
  maxTotalBytes: 600 * 1024 * 1024,
});

interface DemoArchiveManifest {
  readonly version: 1;
  readonly kind: "editorcore-assets-demo-archive";
  readonly project: DemoProject;
  readonly catalog: {
    readonly roots: readonly EditorAssetRoot[];
    readonly nodes: readonly EditorAssetNode[];
    readonly relations: readonly EditorAssetRelation[];
  };
}

export function createDemoProjectArchive(
  controller: EditorAssetsController<DemoProject>,
): Uint8Array {
  const rootKeys = [...controller.snapshot.catalog.roots.keys()];
  const map = controller.createAssetsMap(rootKeys);
  const entries = new Map(controller.materializePayloads(rootKeys));
  entries.set(EDITOR_ASSETS_MAP_PATH, serializeEditorAssetsMap(map));
  entries.set(
    DEMO_PROJECT_PATH,
    encodeJson({
      version: 1,
      kind: "editorcore-assets-demo-archive",
      project: parseDemoProject(controller.snapshot.project),
      catalog: {
        roots: [...controller.snapshot.catalog.roots.values()].map(parseRoot),
        nodes: [...controller.snapshot.catalog.nodes.values()].map(parseNode),
        relations: controller.snapshot.catalog.relations.map(parseRelation),
      },
    } satisfies DemoArchiveManifest),
  );
  return createDeterministicZip(entries);
}

export async function openDemoProjectArchive(
  bytes: Uint8Array,
): Promise<EditorAssetsSnapshot<DemoProject>> {
  const files = extractBoundedZip(bytes, { limits: ARCHIVE_LIMITS });
  const mapBytes = requiredFile(files, EDITOR_ASSETS_MAP_PATH);
  const manifestBytes = requiredFile(files, DEMO_PROJECT_PATH);
  const resolved = await validateEditorAssetsMapPackage({
    map: decodeEditorAssetsMap(mapBytes),
    files,
    allowControlPaths: [DEMO_PROJECT_PATH],
  });
  const manifest = parseArchiveManifest(
    decodeJson(manifestBytes, DEMO_PROJECT_PATH),
  );
  const workspace = await createEditorAssetWorkspace(
    [...resolved.values()].map(({ key, mediaType, bytes }) => ({
      key,
      mediaType,
      bytes,
    })),
  );
  const catalog = deserializeCatalog(manifest.catalog);
  await demoProjectHost.validateProject?.(manifest.project, catalog, workspace);
  return Object.freeze({ workspace, catalog, project: manifest.project });
}

function parseArchiveManifest(value: unknown): DemoArchiveManifest {
  const root = record(value, "demo archive");
  exactKeys(root, ["version", "kind", "project", "catalog"], "demo archive");
  if (root.version !== 1 || root.kind !== "editorcore-assets-demo-archive")
    throw new Error("demo archive version/kind 无效。");
  const catalog = record(root.catalog, "demo archive catalog");
  exactKeys(catalog, ["roots", "nodes", "relations"], "demo archive catalog");
  if (
    !Array.isArray(catalog.roots) ||
    !Array.isArray(catalog.nodes) ||
    !Array.isArray(catalog.relations)
  )
    throw new Error(
      "demo archive catalog roots/nodes/relations 必须是 array。",
    );
  return Object.freeze({
    version: 1,
    kind: "editorcore-assets-demo-archive",
    project: parseDemoProject(root.project),
    catalog: Object.freeze({
      roots: Object.freeze(catalog.roots.map(parseRoot)),
      nodes: Object.freeze(catalog.nodes.map(parseNode)),
      relations: Object.freeze(catalog.relations.map(parseRelation)),
    }),
  });
}

function deserializeCatalog(
  serialized: DemoArchiveManifest["catalog"],
): EditorAssetCatalog {
  const roots = new Map(
    serialized.roots.map((root) => [root.key, root] as const),
  );
  const nodes = new Map(
    serialized.nodes.map((node) => [node.id, node] as const),
  );
  if (roots.size !== serialized.roots.length)
    throw new Error("demo archive root key 重复。");
  if (nodes.size !== serialized.nodes.length)
    throw new Error("demo archive node id 重复。");
  const catalog = Object.freeze({
    roots,
    nodes,
    relations: serialized.relations,
  });
  validateEditorAssetCatalog(catalog);
  return catalog;
}

function parseRoot(value: unknown): EditorAssetRoot {
  const root = record(value, "asset root");
  exactKeys(
    root,
    ["key", "kind", "nodeId", "owner", "exactKeys"],
    "asset root",
  );
  if (
    !isText(root.key) ||
    !isText(root.kind) ||
    !ROOT_KINDS.has(root.kind) ||
    !isText(root.nodeId) ||
    !isText(root.owner)
  )
    throw new Error("asset root scalar fields 无效。");
  if (!Array.isArray(root.exactKeys) || !root.exactKeys.every(isText))
    throw new Error(`asset root ${root.key} exactKeys 无效。`);
  return Object.freeze({
    key: root.key,
    kind: root.kind as EditorAssetRoot["kind"],
    nodeId: root.nodeId,
    owner: root.owner,
    exactKeys: Object.freeze([...root.exactKeys]),
  });
}

function parseNode(value: unknown): EditorAssetNode {
  const node = record(value, "asset node");
  exactKeys(node, ["id", "kind", "key", "label", "metadata"], "asset node");
  if (
    !isText(node.id) ||
    !isText(node.kind) ||
    !NODE_KINDS.has(node.kind) ||
    !isText(node.key) ||
    !isText(node.label)
  )
    throw new Error("asset node scalar fields 无效。");
  const metadata = record(node.metadata, `asset node ${node.id} metadata`);
  for (const [key, item] of Object.entries(metadata))
    if (!isText(key) || !["string", "number", "boolean"].includes(typeof item))
      throw new Error(`asset node ${node.id} metadata 无效。`);
  return Object.freeze({
    id: node.id,
    kind: node.kind as EditorAssetNode["kind"],
    key: node.key,
    label: node.label,
    metadata: Object.freeze({ ...metadata } as Record<
      string,
      string | number | boolean
    >),
  });
}

function parseRelation(value: unknown): EditorAssetRelation {
  const relation = record(value, "asset relation");
  const keys = Object.keys(relation).sort();
  if (
    keys.join(",") !== "from,kind,to" &&
    keys.join(",") !== "from,kind,label,to"
  )
    throw new Error(`asset relation fields 无效：${keys.join(", ")}`);
  if (
    !isText(relation.from) ||
    !isText(relation.kind) ||
    !RELATION_KINDS.has(relation.kind) ||
    !isText(relation.to)
  )
    throw new Error("asset relation scalar fields 无效。");
  if (relation.label !== undefined && typeof relation.label !== "string")
    throw new Error("asset relation label 无效。");
  return Object.freeze({
    from: relation.from,
    kind: relation.kind as EditorAssetRelation["kind"],
    to: relation.to,
    ...(relation.label === undefined ? {} : { label: relation.label }),
  });
}

const ROOT_KINDS = new Set([
  "image",
  "audio",
  "video",
  "spine",
  "vni",
  "image-string",
  "popup",
  "symbols",
  "game-layout",
]);
const NODE_KINDS = new Set([
  ...ROOT_KINDS,
  "manifest",
  "skeleton",
  "atlas",
  "texture",
  "project",
  "game-config",
  "payload",
]);
const RELATION_KINDS = new Set([
  "contains",
  "uses-atlas",
  "uses-texture",
  "uses-project",
  "uses-manifest",
  "uses-payload",
]);

function requiredFile(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`demo archive 缺少 ${path}。`);
  return bytes;
}

function decodeJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(`${label} JSON 无效：${formatError(error)}`);
  }
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} 必须是 object。`);
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  )
    throw new Error(`${label} fields 无效：${actual.join(", ")}`);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
