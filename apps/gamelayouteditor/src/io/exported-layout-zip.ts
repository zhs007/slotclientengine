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
import {
  allocateContentAddressedPath,
  createDeterministicZip,
  detectRasterAssetType,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
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
    assertCanonicalPackagePath(path);
    const bytes = source.get(path);
    if (!bytes) throw new Error(`导出资源闭包缺少 bytes：${path}`);
    closure.set(path, bytes.slice());
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
    const directory = node.resource.manifest.slice(
      0,
      node.resource.manifest.lastIndexOf("/"),
    );
    for (const path of collectImageStringAssetPaths(nested))
      add(`${directory}/${path}`);
  }
  if (manifest.symbolPackage) {
    const files = options.symbolFiles;
    if (!files)
      throw new Error("manifest 绑定 symbols package，但未提供 symbolFiles。");
    assertStrictSymbolsPackagePaths(files);
    const nested = parseSymbolPackageManifest(
      parseJson(files.get("symbols.package.json"), "symbols.package.json"),
    );
    if (nested.id !== manifest.symbolPackage.manifest.split("/").at(-2))
      throw new Error("symbols package id 与 layout binding 目录不一致。");
    const directory = manifest.symbolPackage.manifest.slice(
      0,
      manifest.symbolPackage.manifest.lastIndexOf("/"),
    );
    for (const path of collectSymbolPackageEntryPaths(nested)) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`symbols dependency 缺少 bytes：${path}`);
      closure.set(`${directory}/${path}`, bytes.slice());
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
    const directory = binding.manifest.slice(
      0,
      binding.manifest.lastIndexOf("/"),
    );
    for (const path of collectSymbolPackageEntryPaths(nested)) {
      const bytes = files.get(path);
      if (!bytes) throw new Error(`symbols dependency 缺少 bytes：${path}`);
      closure.set(`${directory}/${path}`, bytes.slice());
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
    const directory = `dependencies/popups/${popupId}`;
    for (const path of ["popup.manifest.json", ...paths])
      closure.set(`${directory}/${path}`, files.get(path)!.slice());
  }
  collectSceneLayoutPackagePaths({ manifest, files: closure });
  const validated = await validateLayoutAssets(manifest, closure, {
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
  });
  validated.destroy();
  const entries: Record<string, Uint8Array> = {
    "layout.manifest.json": new TextEncoder().encode(
      stableManifestJson(manifest),
    ),
  };
  for (const path of [...closure.keys()].sort())
    entries[path] = closure.get(path)!.slice();
  const bytes = createDeterministicZip(entries, {
    level: 6,
    pathPolicy: { requireLowercase: true },
  });
  return Object.freeze({
    fileName: `${manifest.id}-layout.zip`,
    bytes,
    blob: new Blob([bytes as BlobPart], { type: "application/zip" }),
  });
}

export async function materializeLayoutOwnedAssets(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}): Promise<{
  readonly manifest: SceneLayoutManifestV1;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}> {
  const source = parseSceneLayoutManifest(options.manifest);
  const assets = new Map<string, Uint8Array>();
  for (const [path, bytes] of options.assets) {
    if (path.startsWith("dependencies/")) assets.set(path, bytes.slice());
  }
  const cache = new Map<
    string,
    SceneLayoutManifestV1["nodes"][number]["resource"]
  >();
  type SpineAssetResource = {
    readonly kind: "spine";
    readonly skeleton: string;
    readonly atlas: string;
    readonly textures: Readonly<Record<string, string>>;
  };
  const spineCache = new Map<string, SpineAssetResource>();
  const materializeSpineResource = async <T extends SpineAssetResource>(
    input: T,
  ): Promise<T> => {
    const cacheKey = JSON.stringify(
      sortValue({
        skeleton: input.skeleton,
        atlas: input.atlas,
        textures: input.textures,
      }),
    );
    const cached = spineCache.get(cacheKey);
    if (cached) return { ...input, ...cached };
    const textures: Record<string, string> = {};
    const pageMapping = new Map<string, string>();
    for (const [page, oldPath] of Object.entries(input.textures)) {
      const bytes = requiredBytes(options.assets, oldPath);
      const type = detectRasterAssetType(bytes);
      const path = allocateContentAddressedPath({
        digest: await sha256Hex(bytes),
        extension: type.extension,
      });
      textures[page] = path;
      pageMapping.set(page, page);
      putAsset(assets, path, bytes);
    }
    const atlasBytes = new TextEncoder().encode(
      rewriteAtlasText(
        new TextDecoder("utf-8", { fatal: true }).decode(
          requiredBytes(options.assets, input.atlas),
        ),
        pageMapping,
      ),
    );
    const atlas = allocateContentAddressedPath({
      digest: await sha256Hex(atlasBytes),
      extension: "atlas",
    });
    putAsset(assets, atlas, atlasBytes);
    const skeletonValue = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        requiredBytes(options.assets, input.skeleton),
      ),
    );
    const skeletonBytes = new TextEncoder().encode(
      `${JSON.stringify(sortValue(skeletonValue), null, 2)}\n`,
    );
    const skeleton = allocateContentAddressedPath({
      digest: await sha256Hex(skeletonBytes),
      extension: "json",
    });
    putAsset(assets, skeleton, skeletonBytes);
    const materialized = { kind: "spine" as const, skeleton, atlas, textures };
    spineCache.set(cacheKey, materialized);
    return { ...input, ...materialized };
  };
  const nodes = [] as unknown as Array<Record<string, unknown>>;
  for (const node of source.nodes) {
    const cacheKey = JSON.stringify(sortValue(node.resource));
    let resource = cache.get(cacheKey);
    if (!resource) {
      if (node.resource.kind === "image") {
        const bytes = requiredBytes(options.assets, node.resource.path);
        const type = detectRasterAssetType(bytes);
        const path = allocateContentAddressedPath({
          digest: await sha256Hex(bytes),
          extension: type.extension,
        });
        putAsset(assets, path, bytes);
        resource = { ...node.resource, path };
      } else if (node.resource.kind === "image-string") {
        resource = node.resource;
      } else {
        resource = await materializeSpineResource(node.resource);
      }
      cache.set(cacheKey, resource);
    }
    nodes.push({ ...node, resource });
  }
  const transitions = [];
  for (const transition of source.gameModes?.transitions ?? []) {
    transitions.push({
      ...transition,
      overlay: {
        ...transition.overlay,
        resource: await materializeSpineResource(transition.overlay.resource),
      },
    });
  }
  return Object.freeze({
    manifest: parseSceneLayoutManifest({
      ...source,
      nodes,
      ...(source.gameModes
        ? {
            gameModes: {
              ...source.gameModes,
              transitions,
            },
          }
        : {}),
    }),
    assets,
  });
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

function rewriteAtlasText(
  text: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  const rewritten = lines.map((line) => mapping.get(line) ?? line);
  for (const page of mapping.keys()) {
    if (!lines.includes(page))
      throw new Error(`Spine atlas 缺少 page：${page}`);
  }
  return `${rewritten.join("\n").replace(/\n+$/u, "")}\n`;
}

function requiredBytes(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`导出资源闭包缺少 bytes：${path}`);
  return bytes;
}

function putAsset(
  files: Map<string, Uint8Array>,
  path: string,
  bytes: Uint8Array,
): void {
  const current = files.get(path);
  if (
    current &&
    (current.byteLength !== bytes.byteLength ||
      current.some((value, index) => value !== bytes[index]))
  ) {
    throw new Error(`content-addressed path collision：${path}`);
  }
  if (!current) files.set(path, bytes.slice());
}
