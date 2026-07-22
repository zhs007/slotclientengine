import {
  collectSceneLayoutAssetPaths,
  collectSceneLayoutPackagePaths,
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
} from "@slotclientengine/rendercore/scene-layout";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string";
import {
  collectSymbolPackageEntryPaths,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol";
import {
  collectPopupPackagePaths,
  parsePopupManifest,
} from "@slotclientengine/rendercore/popup";
import { createDeterministicZip } from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  basenameFromSourcePath,
  commitEditorAssetImport,
  createEditorAssetsMapFromWorkspace,
  createEmptyEditorAssetWorkspace,
  materializeEditorAssetPayloads,
  reviewEditorAssetImport,
  serializeEditorAssetsMap,
  type EditorAssetRewriteAdapter,
} from "@slotclientengine/editorresource";
import { assertStrictSymbolsPackagePaths } from "./imported-symbol-package.js";
import { assertCanonicalPackagePath } from "./filename-policy.js";
import { validateLayoutAssets } from "./imported-layout-zip.js";

export async function exportLayoutZip(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
  readonly symbolFiles?: ReadonlyMap<string, Uint8Array>;
  readonly symbolFilesById?: ReadonlyMap<
    string,
    ReadonlyMap<string, Uint8Array>
  >;
  readonly popupFilesById?: ReadonlyMap<
    string,
    ReadonlyMap<string, Uint8Array>
  >;
  readonly decodeImage?: (
    url: string,
  ) => Promise<{ readonly width: number; readonly height: number }>;
  readonly decodeVideo?: (url: string) => Promise<{
    readonly width: number;
    readonly height: number;
    readonly durationSeconds: number;
    readonly hasAudio: boolean | "unknown";
  }>;
}): Promise<{
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly blob: Blob;
}> {
  const materialized = await materializeLayoutOwnedAssets({
    manifest: options.manifest,
    assets: options.assets,
  });
  const manifest = materialized.manifest;
  const ownedAssets = materialized.assets;
  if (manifest.id !== manifest.id.toLowerCase())
    throw new Error("project id 必须为小写。");
  const closure = new Map<string, Uint8Array>();
  const add = (path: string, source = ownedAssets) => {
    const bytes = source.get(path);
    if (!bytes) throw new Error(`导出资源闭包缺少 bytes：${path}`);
    putClosure(closure, path, bytes);
  };
  for (const path of collectSceneLayoutAssetPaths(manifest)) {
    if (
      path === manifest.symbolPackage?.manifest ||
      Object.values(manifest.symbolPackages ?? {}).some(
        (binding) => binding.manifest === path,
      ) ||
      Object.values(manifest.popups ?? {}).some(
        (popup) => popup.manifest === path,
      ) ||
      manifest.nodes.some(
        (node) =>
          node.resource.kind === "image-string" &&
          node.resource.manifest === path,
      )
    )
      continue;
    add(path);
  }
  for (const node of manifest.nodes) {
    if (
      node.resource.kind !== "image-string" ||
      closure.has(node.resource.manifest)
    )
      continue;
    add(node.resource.manifest);
    const nested = parseImageStringManifest(
      parseJson(
        ownedAssets.get(node.resource.manifest),
        node.resource.manifest,
      ),
    );
    const mapped = !node.resource.manifest.includes("/");
    const directory = mapped
      ? ""
      : node.resource.manifest.slice(
          0,
          node.resource.manifest.lastIndexOf("/"),
        );
    for (const path of collectImageStringAssetPaths(nested))
      add(mapped ? path : `${directory}/${path}`);
  }
  if (manifest.symbolPackage) {
    const files = options.symbolFiles;
    if (!files)
      throw new Error("manifest 绑定 symbols package，但未提供 symbolFiles。");
    assertStrictSymbolsPackagePaths(files);
    const nested = parseSymbolPackageManifest(
      parseJson(files.get("symbols.package.json"), "symbols.package.json"),
    );
    if (
      manifest.symbolPackage.manifest.includes("/") &&
      nested.id !== manifest.symbolPackage.manifest.split("/").at(-2)
    )
      throw new Error("symbols package id 与 layout binding 目录不一致。");
    for (const path of collectSymbolPackageEntryPaths(nested)) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`symbols dependency 缺少 bytes：${path}`);
      putClosure(
        closure,
        path === "symbols.package.json"
          ? manifest.symbolPackage.manifest
          : path,
        bytes,
      );
    }
  }
  for (const [symbolId, binding] of Object.entries(
    manifest.symbolPackages ?? {},
  )) {
    const files = options.symbolFilesById?.get(symbolId);
    if (!files)
      throw new Error(
        `manifest 绑定 symbols package，但未提供 bytes：${symbolId}`,
      );
    assertStrictSymbolsPackagePaths(files);
    const nested = parseSymbolPackageManifest(
      parseJson(files.get("symbols.package.json"), "symbols.package.json"),
    );
    if (nested.id !== symbolId)
      throw new Error(
        `Symbols nested id ${nested.id} 与 binding ${symbolId} 不一致。`,
      );
    for (const path of collectSymbolPackageEntryPaths(nested)) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`symbols dependency 缺少 bytes：${path}`);
      putClosure(
        closure,
        path === "symbols.package.json" ? binding.manifest : path,
        bytes,
      );
    }
  }
  const referencedPopupIds = new Set(
    manifest.gameModes?.modes.flatMap((mode) =>
      mode.awardCelebrationPopup ? [mode.awardCelebrationPopup] : [],
    ) ?? Object.keys(manifest.popups ?? {}),
  );
  for (const popupId of referencedPopupIds) {
    const popup = manifest.popups?.[popupId];
    if (!popup) throw new Error(`游戏模式引用了未知 popup binding：${popupId}`);
    const files = options.popupFilesById?.get(popupId);
    if (!files)
      throw new Error(`manifest 绑定 popup，但未提供 bytes：${popupId}`);
    const nested = parsePopupManifest(
      parseJson(files.get("popup.manifest.json"), "popup.manifest.json"),
    );
    if (nested.id !== popupId)
      throw new Error(
        `Popup nested id ${nested.id} 与 binding ${popupId} 不一致。`,
      );
    const paths = collectPopupPackagePaths({ manifest: nested, files });
    for (const path of ["popup.manifest.json", ...paths])
      putClosure(
        closure,
        path === "popup.manifest.json" ? popup.manifest : path,
        files.get(path)!,
      );
  }
  collectSceneLayoutPackagePaths({ manifest, files: closure });
  const validated = await validateLayoutAssets(manifest, closure, {
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.decodeVideo ? { decodeVideo: options.decodeVideo } : {}),
  });
  validated.destroy();
  const flattened = await flattenLayoutClosure(manifest, closure);
  const entries = new Map(materializeEditorAssetPayloads(flattened.workspace));
  entries.set(
    EDITOR_ASSETS_MAP_PATH,
    serializeEditorAssetsMap(
      createEditorAssetsMapFromWorkspace(flattened.workspace),
    ),
  );
  entries.set(
    "layout.manifest.json",
    new TextEncoder().encode(stableManifestJson(flattened.manifest)),
  );
  for (const path of entries.keys()) assertCanonicalPackagePath(path);
  const bytes = createDeterministicZip(entries, {
    level: 6,
  });
  return Object.freeze({
    fileName: `${manifest.id}-layout.zip`,
    bytes,
    blob: new Blob([bytes as BlobPart], { type: "application/zip" }),
  });
}

async function flattenLayoutClosure(
  manifest: SceneLayoutManifestV1,
  closure: ReadonlyMap<string, Uint8Array>,
) {
  const mapping = new Map(
    [...closure.keys()].map((path) => [path, basenameFromSourcePath(path)]),
  );
  const virtual = new Map<string, Uint8Array>();
  for (const [path, bytes] of closure) {
    const key = mapping.get(path)!;
    const current = virtual.get(key);
    if (current && !sameBytes(current, bytes))
      throw new Error(`全局扁平 filename key 冲突：${key}`);
    virtual.set(key, bytes.slice());
  }
  const rewritten = rewriteLayoutManifestFilenameKeys(manifest, mapping);
  const empty = createEmptyEditorAssetWorkspace();
  const review = await reviewEditorAssetImport({
    workspace: empty,
    incoming: [...virtual].map(([key, bytes]) => ({
      key,
      mediaType: layoutMediaType(key),
      bytes,
    })),
  });
  const adapter: EditorAssetRewriteAdapter<null> = {
    cloneProject: () => null,
    collectReferences: () => ({ references: [] }),
    renameReferences: () => null,
  };
  const workspace = (
    await commitEditorAssetImport({
      workspace: empty,
      project: null,
      review,
      adapter,
    })
  ).workspace;
  return { manifest: rewritten, workspace };
}

function rewriteLayoutManifestFilenameKeys(
  value: SceneLayoutManifestV1,
  mapping: ReadonlyMap<string, string>,
): SceneLayoutManifestV1 {
  const key = (path: string) => mapping.get(path) ?? path;
  const nodes = value.nodes.map((node) => {
    const resource = node.resource;
    if (resource.kind === "image")
      return { ...node, resource: { ...resource, path: key(resource.path) } };
    if (resource.kind === "image-string")
      return {
        ...node,
        resource: { ...resource, manifest: key(resource.manifest) },
      };
    return {
      ...node,
      resource: {
        ...resource,
        skeleton: key(resource.skeleton),
        atlas: key(resource.atlas),
        textures: Object.fromEntries(
          Object.entries(resource.textures).map(([page, path]) => [
            page,
            key(path),
          ]),
        ),
      },
    };
  });
  const transitions = value.gameModes?.transitions?.map((transition) => {
    const resource = transition.overlay.resource;
    if (resource.kind === "video")
      return {
        ...transition,
        overlay: {
          ...transition.overlay,
          resource: { ...resource, path: key(resource.path) },
        },
      };
    return {
      ...transition,
      overlay: {
        ...transition.overlay,
        resource: {
          ...resource,
          skeleton: key(resource.skeleton),
          atlas: key(resource.atlas),
          textures: Object.fromEntries(
            Object.entries(resource.textures).map(([page, path]) => [
              page,
              key(path),
            ]),
          ),
        },
      },
    };
  });
  return parseSceneLayoutManifest({
    ...value,
    nodes,
    ...(value.symbolPackage
      ? {
          symbolPackage: {
            ...value.symbolPackage,
            manifest: key(value.symbolPackage.manifest),
          },
        }
      : {}),
    ...(value.symbolPackages
      ? {
          symbolPackages: Object.fromEntries(
            Object.entries(value.symbolPackages).map(([id, binding]) => [
              id,
              { ...binding, manifest: key(binding.manifest) },
            ]),
          ),
        }
      : {}),
    ...(value.popups
      ? {
          popups: Object.fromEntries(
            Object.entries(value.popups).map(([id, popup]) => [
              id,
              { ...popup, manifest: key(popup.manifest) },
            ]),
          ),
        }
      : {}),
    ...(value.gameModes
      ? {
          gameModes: {
            ...value.gameModes,
            ...(transitions ? { transitions } : {}),
          },
        }
      : {}),
  });
}

function layoutMediaType(key: string): string {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "mp4") return "video/mp4";
  if (extension === "json") return "application/json";
  if (extension === "atlas") return "text/plain";
  throw new Error(`layout asset extension 不支持：${key}`);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index])
  );
}

function putClosure(
  closure: Map<string, Uint8Array>,
  key: string,
  bytes: Uint8Array,
): void {
  const current = closure.get(key);
  if (current && !sameBytes(current, bytes))
    throw new Error(`全局扁平 filename key 冲突：${key}`);
  if (!current) closure.set(key, bytes.slice());
}

export async function materializeLayoutOwnedAssets(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}): Promise<{
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}> {
  const source = parseSceneLayoutManifest(options.manifest);
  const assets = new Map(
    [...options.assets].map(([path, bytes]) => [path, bytes.slice()] as const),
  );
  const externalRoots = new Set([
    ...(source.symbolPackage ? [source.symbolPackage.manifest] : []),
    ...Object.values(source.symbolPackages ?? {}).map(
      (binding) => binding.manifest,
    ),
    ...Object.values(source.popups ?? {}).map((binding) => binding.manifest),
  ]);
  for (const path of collectSceneLayoutAssetPaths(source))
    if (!externalRoots.has(path) && !assets.has(path))
      throw new Error(`导出资源闭包缺少 bytes：${path}`);
  for (const resource of [
    ...source.nodes
      .filter((node) => node.resource.kind === "spine")
      .map((node) => node.resource),
    ...(source.gameModes?.transitions ?? [])
      .filter((transition) => transition.overlay.resource.kind === "spine")
      .map((transition) => transition.overlay.resource),
  ]) {
    if (resource.kind !== "spine") continue;
    assertSpineAtlasBindings(
      new TextDecoder("utf-8", { fatal: true }).decode(
        assets.get(resource.atlas),
      ),
      Object.keys(resource.textures),
    );
  }
  return Object.freeze({
    manifest: source,
    assets,
  });
}

function assertSpineAtlasBindings(
  text: string,
  expectedPages: readonly string[],
): void {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const pages = lines.filter((line, index) => {
    if (!line || /^\s/u.test(line) || line.includes(":")) return false;
    return lines
      .slice(index + 1)
      .find((candidate) => candidate.length > 0)
      ?.startsWith("size:");
  });
  for (const page of expectedPages)
    if (!pages.includes(page))
      throw new Error(`Spine atlas 缺少 page：${page}`);
  for (const page of pages)
    if (!expectedPages.includes(page))
      throw new Error(`Spine atlas 包含未绑定 page：${page}`);
}

export function stableManifestJson(
  manifestValue: SceneLayoutManifestV1,
): string {
  const manifest = parseSceneLayoutManifest(manifestValue);
  return `${JSON.stringify(sortValue(manifest), null, 2)}\n`;
}

function parseJson(bytes: Uint8Array | undefined, path: string): unknown {
  if (!bytes) throw new Error(`缺少 JSON：${path}`);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
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
