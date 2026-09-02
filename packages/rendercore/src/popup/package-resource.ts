import { Texture } from "pixi.js";
import { resolvePackagePath } from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  assertEditorAssetKey,
  assertNoEditorAssetKeyAliases,
  basenameFromSourcePath,
  decodeEditorAssetsMap,
  resolveEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import {
  assertVNIProject,
  rewriteVNIProjectAssetPaths,
} from "@slotclientengine/vnicore/data";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "../image-string/data/index.js";
import type { DecodeImageStringImage } from "../image-string/core/index.js";
import { collectPopupDirectPaths, parsePopupManifest } from "./manifest.js";
import {
  collectPopupObjectDirectPaths,
  parsePopupObjectManifest,
  POPUP_OBJECT_MANIFEST_PATH,
  popupObjectToSingleStateManifest,
} from "./data/object-manifest.js";
import { loadPopupManifest } from "./data/normalize.js";
import type { LatestPopupManifest } from "./data/normalize.js";
import {
  collectMappedPopupAssetKeys,
  collectMappedPopupObjectAssetKeys,
  collectPopupObjectPackagePaths,
  collectPopupPackagePaths,
} from "./data/package-closure.js";
export { collectMappedPopupAssetKeys } from "./data/package-closure.js";
import type { PopupFontLoader } from "./font-resource.js";
import type {
  PopupManifest,
  PopupObjectManifestV1,
  PopupLayer,
  PopupPackageResource,
  PopupResourceSpec,
} from "./types.js";
import type { PopupPreparedObject } from "./core/types.js";
import { createPopupPackageResourceFromResolvedFiles } from "./core/package-resource.js";

const ROOT = "popup.manifest.json";

export async function createPopupObjectPackageResource(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
  readonly loadFont?: PopupFontLoader;
}): Promise<PopupPreparedObject> {
  const manifest = parsePopupObjectManifest(
    options.manifest ??
      parseJson(
        requireBytes(options.files, POPUP_OBJECT_MANIFEST_PATH),
        POPUP_OBJECT_MANIFEST_PATH,
      ),
  );
  const files = await resolvePopupObjectPackageFiles({
    manifest,
    files: options.files,
  });
  const resource = (await createPopupPackageResourceFromResolvedFiles({
    manifest: popupObjectToSingleStateManifest(manifest),
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
    ...(options.loadFont ? { loadFont: options.loadFont } : {}),
  })) as PopupPackageResource<import("./types.js").SingleStatePopupManifestV9>;
  return Object.freeze({ kind: "popup-object", manifest, resource });
}

export async function resolvePopupObjectPackageFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): Promise<ReadonlyMap<string, Uint8Array>> {
  const manifest = parsePopupObjectManifest(options.manifest);
  const mapped = collectPopupObjectDirectPaths(manifest).every(
    (reference) => !reference.includes("/"),
  );
  const hasMap = options.files.has(EDITOR_ASSETS_MAP_PATH);
  if (mapped !== hasMap)
    throw new Error(
      mapped
        ? "filename-key popup object package 缺少 assets.map.json。"
        : "legacy popup object package 不得混入 assets.map.json。",
    );
  if (!mapped) {
    const required = collectPopupObjectPackagePaths({
      manifest,
      files: options.files,
      allowExtraFiles: true,
    });
    return exactPopupObjectFiles(options.files, required);
  }
  const rootBytes = requireBytes(options.files, POPUP_OBJECT_MANIFEST_PATH);
  const map = decodeEditorAssetsMap(
    requireBytes(options.files, EDITOR_ASSETS_MAP_PATH),
  );
  const resolved = resolveEditorAssetsMapPackage({
    map,
    files: options.files,
    keys: collectPopupObjectDirectPaths(manifest),
  });
  const virtual = new Map<string, Uint8Array>([
    [POPUP_OBJECT_MANIFEST_PATH, rootBytes.slice()],
  ]);
  for (const [key, asset] of resolved) virtual.set(key, asset.bytes.slice());
  const required = collectMappedPopupObjectAssetKeys({
    manifest,
    files: virtual,
  });
  const closure = resolveEditorAssetsMapPackage({
    map,
    files: options.files,
    keys: required,
  });
  const exact = new Map<string, Uint8Array>([
    [POPUP_OBJECT_MANIFEST_PATH, rootBytes.slice()],
  ]);
  for (const [key, asset] of closure) exact.set(key, asset.bytes.slice());
  collectPopupObjectPackagePaths({ manifest, files: exact });
  return exact;
}

export function namespaceMappedPopupObjectPackageFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly keyPrefix: string;
}): {
  readonly manifest: PopupObjectManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly rootKey: string;
} {
  const manifest = parsePopupObjectManifest(options.manifest);
  collectPopupObjectPackagePaths({ manifest, files: options.files });
  const sourcePaths = collectMappedPopupObjectAssetKeys({
    manifest,
    files: options.files,
  });
  if (sourcePaths.some((path) => path.includes("/")))
    throw new Error("Popup Object namespace 只接受 mapped package。");
  const mapping = new Map(
    sourcePaths.map(
      (path) =>
        [path, `${options.keyPrefix}-${basenameFromSourcePath(path)}`] as const,
    ),
  );
  assertNoEditorAssetKeyAliases([...mapping.values()]);
  const rootKey = `${options.keyPrefix}-${POPUP_OBJECT_MANIFEST_PATH}`;
  const rewrittenManifest = rewritePopupObjectManifestWithMapping({
    manifest,
    mapping,
    sourcePath: POPUP_OBJECT_MANIFEST_PATH,
    mapped: true,
  });
  const files = new Map<string, Uint8Array>([
    [rootKey, encodeStableJson(rewrittenManifest)],
  ]);
  for (const [sourcePath, target] of mapping) {
    const bytes = requireBytes(options.files, sourcePath);
    let rewritten = bytes;
    const resource = Object.values(manifest.resources).find((spec) =>
      spec.kind === "image-string"
        ? spec.manifest === sourcePath
        : spec.kind === "vni"
          ? spec.project === sourcePath
          : false,
    );
    if (resource?.kind === "image-string") {
      const nested = structuredClone(
        parseImageStringManifest(parseJson(bytes, sourcePath)),
      ) as { glyphs: Record<string, { path: string }> };
      for (const glyph of Object.values(nested.glyphs))
        glyph.path = requirePopupMapping(mapping, glyph.path);
      rewritten = encodeStableJson(nested);
    } else if (resource?.kind === "vni") {
      rewritten = encodeStableJson(
        rewriteVNIProjectAssetPaths(parseJson(bytes, sourcePath), (path) =>
          requirePopupMapping(mapping, path),
        ),
      );
    }
    putPopupFile(files, target, rewritten);
  }
  const validationFiles = new Map(files);
  validationFiles.set(
    POPUP_OBJECT_MANIFEST_PATH,
    validationFiles.get(rootKey)!,
  );
  validationFiles.delete(rootKey);
  collectPopupObjectPackagePaths({
    manifest: rewrittenManifest,
    files: validationFiles,
  });
  return { manifest: rewrittenManifest, files, rootKey };
}

export { collectPopupPackagePaths } from "./data/package-closure.js";
export async function createPopupPackageResource(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
  readonly loadFont?: PopupFontLoader;
}): Promise<PopupPackageResource<LatestPopupManifest>> {
  const manifest = loadPopupManifest(
    options.manifest ?? parseJson(requireBytes(options.files, ROOT), ROOT),
  ).manifest;
  const files = await resolvePopupPackageFiles({
    manifest,
    files: options.files,
  });
  return createPopupPackageResourceFromResolvedFiles({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
    ...(options.loadFont ? { loadFont: options.loadFont } : {}),
  });
}

export { createPopupPackageResourceFromResolvedFiles } from "./core/package-resource.js";
export async function resolvePopupPackageFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): Promise<ReadonlyMap<string, Uint8Array>> {
  const manifest = parsePopupManifest(options.manifest);
  const mapped = collectPopupDirectPaths(manifest).every(
    (reference) => !reference.includes("/"),
  );
  const hasMap = options.files.has(EDITOR_ASSETS_MAP_PATH);
  if (mapped !== hasMap)
    throw new Error(
      mapped
        ? "filename-key popup package 缺少 assets.map.json。"
        : "legacy popup package 不得混入 assets.map.json。",
    );
  if (!mapped) {
    const required = collectPopupPackagePaths({
      manifest,
      files: options.files,
      allowExtraFiles: true,
    });
    return exactPopupFiles(options.files, required);
  }
  const rootBytes = requireBytes(options.files, ROOT);
  const map = decodeEditorAssetsMap(
    requireBytes(options.files, EDITOR_ASSETS_MAP_PATH),
  );
  const resolved = resolveEditorAssetsMapPackage({
    map,
    files: options.files,
    keys: collectPopupDirectPaths(manifest),
  });
  const virtual = new Map<string, Uint8Array>([[ROOT, rootBytes.slice()]]);
  for (const [key, asset] of resolved) virtual.set(key, asset.bytes.slice());
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind !== "popup-object") continue;
    const objectManifest = parsePopupObjectManifest(
      parseJson(requireBytes(virtual, resource.manifest), resource.manifest),
    );
    const objectRoots = resolveEditorAssetsMapPackage({
      map,
      files: options.files,
      keys: collectPopupObjectDirectPaths(objectManifest),
    });
    for (const [key, asset] of objectRoots)
      virtual.set(key, asset.bytes.slice());
  }
  const required = collectMappedPopupAssetKeys({ manifest, files: virtual });
  const closure = resolveEditorAssetsMapPackage({
    map,
    files: options.files,
    keys: required,
  });
  const exact = new Map<string, Uint8Array>([[ROOT, rootBytes.slice()]]);
  for (const [key, asset] of closure) exact.set(key, asset.bytes.slice());
  collectPopupPackagePaths({ manifest, files: exact });
  return exact;
}

export function rewritePopupManifestFilenameKeys(options: {
  readonly manifest: unknown;
  readonly rewrite: (filenameKey: string) => string;
}): PopupManifest {
  const manifest = parsePopupManifest(options.manifest);
  const mapping = new Map(
    [...new Set(collectPopupDirectPaths(manifest))].map(
      (path) => [path, options.rewrite(path)] as const,
    ),
  );
  assertNoEditorAssetKeyAliases([...mapping.values()]);
  return rewritePopupManifestWithMapping(manifest, mapping);
}

export function flattenPopupPackageFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): {
  readonly manifest: PopupManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
} {
  const manifest = parsePopupManifest(options.manifest);
  const direct = collectPopupDirectPaths(manifest);
  if (direct.every((path) => !path.includes("/")))
    return { manifest, files: options.files };
  if (direct.some((path) => !path.includes("/")))
    throw new Error(
      "popup package 不得混用 filename key 与 direct package path。",
    );
  const sourcePaths = new Set(
    collectPopupPackagePaths({
      manifest,
      files: options.files,
      allowExtraFiles: true,
    }),
  );
  const structured = collectRewritablePopupResources({
    manifest,
    files: options.files,
    mapped: false,
  });
  const mapping = new Map(
    [...sourcePaths].map(
      (path) => [path, basenameFromSourcePath(path)] as const,
    ),
  );
  assertNoEditorAssetKeyAliases([...new Set(mapping.values())]);
  const flattenedManifest = rewritePopupManifestWithMapping(manifest, mapping);
  const files = new Map<string, Uint8Array>([
    [ROOT, encodeStableJson(flattenedManifest)],
  ]);
  for (const [sourcePath, target] of mapping) {
    const bytes = requireBytes(options.files, sourcePath);
    let rewritten = bytes;
    const nested = structured.get(sourcePath);
    if (nested?.kind === "image-string") {
      const nested = structuredClone(
        parseImageStringManifest(parseJson(bytes, sourcePath)),
      ) as { glyphs: Record<string, { path: string }> };
      for (const glyph of Object.values(nested.glyphs))
        glyph.path = requirePopupMapping(
          mapping,
          resolvePackagePath(sourcePath, glyph.path),
        );
      rewritten = encodeStableJson(nested);
    } else if (nested?.kind === "vni") {
      rewritten = encodeStableJson(
        rewriteVNIProjectAssetPaths(parseJson(bytes, sourcePath), (path) =>
          requirePopupMapping(mapping, resolvePackagePath(sourcePath, path)),
        ),
      );
    } else if (nested?.kind === "popup-object") {
      rewritten = encodeStableJson(
        rewritePopupObjectManifestWithMapping({
          manifest: parseJson(bytes, sourcePath),
          mapping,
          sourcePath,
          mapped: false,
        }),
      );
    }
    putPopupFile(files, target, rewritten);
  }
  collectPopupPackagePaths({ manifest: flattenedManifest, files });
  return { manifest: flattenedManifest, files };
}

export function namespaceMappedPopupPackageFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly keyPrefix: string;
}): {
  readonly manifest: PopupManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly rootKey: string;
} {
  const manifest = parsePopupManifest(options.manifest);
  collectPopupPackagePaths({ manifest, files: options.files });
  const sourcePaths = collectMappedPopupAssetKeys({
    manifest,
    files: options.files,
  });
  if (sourcePaths.some((path) => path.includes("/")))
    throw new Error("Popup namespace 只接受 mapped filename-key package。");
  const mapping = new Map(
    sourcePaths.map(
      (path) =>
        [path, `${options.keyPrefix}-${basenameFromSourcePath(path)}`] as const,
    ),
  );
  assertNoEditorAssetKeyAliases([...mapping.values()]);
  const rewrittenManifest = rewritePopupManifestWithMapping(manifest, mapping);
  const structured = collectRewritablePopupResources({
    manifest,
    files: options.files,
    mapped: true,
  });
  const rootKey = `${options.keyPrefix}-popup.manifest.json`;
  const files = new Map<string, Uint8Array>([
    [rootKey, encodeStableJson(rewrittenManifest)],
  ]);
  for (const [sourcePath, target] of mapping) {
    const bytes = requireBytes(options.files, sourcePath);
    let rewritten = bytes;
    const nested = structured.get(sourcePath);
    if (nested?.kind === "image-string") {
      const nested = structuredClone(
        parseImageStringManifest(parseJson(bytes, sourcePath)),
      ) as { glyphs: Record<string, { path: string }> };
      for (const glyph of Object.values(nested.glyphs))
        glyph.path = requirePopupMapping(mapping, glyph.path);
      rewritten = encodeStableJson(nested);
    } else if (nested?.kind === "vni") {
      rewritten = encodeStableJson(
        rewriteVNIProjectAssetPaths(parseJson(bytes, sourcePath), (path) =>
          requirePopupMapping(mapping, path),
        ),
      );
    } else if (nested?.kind === "popup-object") {
      rewritten = encodeStableJson(
        rewritePopupObjectManifestWithMapping({
          manifest: parseJson(bytes, sourcePath),
          mapping,
          sourcePath,
          mapped: true,
        }),
      );
    }
    putPopupFile(files, target, rewritten);
  }
  const validationFiles = new Map(files);
  validationFiles.set(ROOT, validationFiles.get(rootKey)!);
  validationFiles.delete(rootKey);
  collectPopupPackagePaths({
    manifest: rewrittenManifest,
    files: validationFiles,
  });
  return { manifest: rewrittenManifest, files, rootKey };
}

export async function loadPopupPackageFromUrl(options: {
  readonly manifestUrl: string | URL;
  readonly fetchImpl?: typeof fetch;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}): Promise<PopupPackageResource<LatestPopupManifest>> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function")
    throw new Error("fetchImpl is required.");
  const rootUrl = new URL(options.manifestUrl);
  if (!/^https?:$/u.test(rootUrl.protocol))
    throw new Error("popup manifest URL must use http/https.");
  const rootBytes = await fetchBytes(fetchImpl, rootUrl);
  const manifest = loadPopupManifest(parseJson(rootBytes, ROOT)).manifest;
  const files = new Map<string, Uint8Array>([[ROOT, rootBytes]]);
  const mapped = collectPopupDirectPaths(manifest).every(
    (reference) => !reference.includes("/"),
  );
  if (mapped) {
    const mapBytes = await fetchBytes(
      fetchImpl,
      contained(rootUrl, EDITOR_ASSETS_MAP_PATH),
    );
    const map = decodeEditorAssetsMap(mapBytes);
    files.set(EDITOR_ASSETS_MAP_PATH, mapBytes);
    for (const entry of Object.values(map.files)) {
      if (files.has(entry.path)) continue;
      const payload = await fetchBytes(
        fetchImpl,
        contained(rootUrl, entry.path),
      );
      files.set(entry.path, payload);
    }
    return createPopupPackageResource({
      manifest,
      files,
      ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
      ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
    });
  }
  for (const path of collectPopupDirectPaths(manifest))
    files.set(path, await fetchBytes(fetchImpl, contained(rootUrl, path)));
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image-string") {
      const nested = parseImageStringManifest(
        parseJson(requireBytes(files, resource.manifest), resource.manifest),
      );
      for (const path of collectImageStringAssetPaths(nested)) {
        const full = resolvePackagePath(resource.manifest, path);
        files.set(full, await fetchBytes(fetchImpl, contained(rootUrl, full)));
      }
    }
    if (resource.kind === "vni") {
      const project = assertVNIProject(
        parseJson(requireBytes(files, resource.project), resource.project),
      );
      for (const asset of project.assets) {
        const full = resolvePackagePath(resource.project, asset.path);
        files.set(full, await fetchBytes(fetchImpl, contained(rootUrl, full)));
      }
    }
    if (resource.kind === "popup-object") {
      const objectManifest = parsePopupObjectManifest(
        parseJson(requireBytes(files, resource.manifest), resource.manifest),
      );
      for (const reference of collectPopupObjectDirectPaths(objectManifest)) {
        const full = resolvePackagePath(resource.manifest, reference);
        files.set(full, await fetchBytes(fetchImpl, contained(rootUrl, full)));
      }
      for (const nested of Object.values(objectManifest.resources)) {
        if (nested.kind === "image-string") {
          const nestedPath = resolvePackagePath(
            resource.manifest,
            nested.manifest,
          );
          const imageString = parseImageStringManifest(
            parseJson(requireBytes(files, nestedPath), nestedPath),
          );
          for (const path of collectImageStringAssetPaths(imageString)) {
            const full = resolvePackagePath(nestedPath, path);
            files.set(
              full,
              await fetchBytes(fetchImpl, contained(rootUrl, full)),
            );
          }
        } else if (nested.kind === "vni") {
          const nestedPath = resolvePackagePath(
            resource.manifest,
            nested.project,
          );
          const project = assertVNIProject(
            parseJson(requireBytes(files, nestedPath), nestedPath),
          );
          for (const asset of project.assets) {
            const full = resolvePackagePath(nestedPath, asset.path);
            files.set(
              full,
              await fetchBytes(fetchImpl, contained(rootUrl, full)),
            );
          }
        }
      }
    }
  }
  return createPopupPackageResource({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
  });
}

function rewritePopupResourceSpec(
  spec: PopupResourceSpec,
  mapping: ReadonlyMap<string, string>,
): PopupResourceSpec {
  if (spec.kind === "image" || spec.kind === "font")
    return { ...spec, path: requirePopupMapping(mapping, spec.path) };
  if (spec.kind === "image-string")
    return { ...spec, manifest: requirePopupMapping(mapping, spec.manifest) };
  if (spec.kind === "vni")
    return { ...spec, project: requirePopupMapping(mapping, spec.project) };
  if (spec.kind === "popup-object")
    return { ...spec, manifest: requirePopupMapping(mapping, spec.manifest) };
  return {
    ...spec,
    skeleton: requirePopupMapping(mapping, spec.skeleton),
    atlas: requirePopupMapping(mapping, spec.atlas),
    textures: Object.fromEntries(
      Object.entries(spec.textures).map(([page, path]) => [
        page,
        requirePopupMapping(mapping, path),
      ]),
    ),
  };
}

function rewritePopupManifestWithMapping(
  manifest: PopupManifest,
  mapping: ReadonlyMap<string, string>,
): PopupManifest {
  const resources: Record<string, PopupResourceSpec> = {};
  const resourceKeys = new Map<string, string>();
  for (const [id, spec] of Object.entries(manifest.resources)) {
    const rewritten = rewritePopupResourceSpec(spec, mapping);
    const rootKey = popupResourceRoot(rewritten);
    if (resources[rootKey])
      throw new Error(`popup resource root filename key 冲突：${rootKey}`);
    resources[rootKey] = rewritten;
    resourceKeys.set(id, rootKey);
  }
  const rewriteLayers = <T extends { readonly layers: readonly PopupLayer[] }>(
    tier: T,
  ): T =>
    ({
      ...tier,
      layers: tier.layers.map((layer) => ({
        ...layer,
        ...(layer.resource
          ? { resource: requiredPopupResourceKey(resourceKeys, layer.resource) }
          : {}),
      })),
    }) as T;
  const audio =
    "audio" in manifest
      ? {
          audio: {
            ...manifest.audio,
            effects: manifest.audio.effects.map((effect) => ({
              ...effect,
              asset: {
                sources: effect.asset.sources.map((source) => ({
                  ...source,
                  path: requirePopupMapping(mapping, source.path),
                })),
              },
            })),
          },
        }
      : {};
  return parsePopupManifest(
    manifest.type === "spine"
      ? {
          ...manifest,
          ...audio,
          resources,
          spine: rewriteSpineReferences(manifest.spine, resourceKeys),
        }
      : manifest.type === "single-state"
        ? {
            ...manifest,
            ...audio,
            resources,
            singleState: {
              layers: manifest.singleState.layers.map((layer) => ({
                ...layer,
                ...(layer.resource
                  ? {
                      resource: requiredPopupResourceKey(
                        resourceKeys,
                        layer.resource,
                      ),
                    }
                  : {}),
              })),
            },
          }
        : {
            ...manifest,
            ...audio,
            resources,
            awardCelebration: {
              base: rewriteLayers(manifest.awardCelebration.base),
              standard: rewriteLayers(manifest.awardCelebration.standard),
              celebrationTiers:
                manifest.awardCelebration.celebrationTiers.map(rewriteLayers),
            },
          },
  );
}

type RewritablePopupResource = {
  readonly kind: "image-string" | "vni" | "popup-object";
};

function collectRewritablePopupResources(options: {
  readonly manifest: PopupManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly mapped: boolean;
}): ReadonlyMap<string, RewritablePopupResource> {
  const result = new Map<string, RewritablePopupResource>();
  const pathFrom = (owner: string | undefined, reference: string) =>
    options.mapped || !owner ? reference : resolvePackagePath(owner, reference);
  for (const resource of Object.values(options.manifest.resources)) {
    if (resource.kind === "image-string")
      result.set(resource.manifest, { kind: "image-string" });
    else if (resource.kind === "vni")
      result.set(resource.project, { kind: "vni" });
    else if (resource.kind === "popup-object") {
      const objectPath = resource.manifest;
      result.set(objectPath, { kind: "popup-object" });
      const objectManifest = parsePopupObjectManifest(
        parseJson(requireBytes(options.files, objectPath), objectPath),
      );
      for (const nested of Object.values(objectManifest.resources)) {
        if (nested.kind === "image-string")
          result.set(pathFrom(objectPath, nested.manifest), {
            kind: "image-string",
          });
        else if (nested.kind === "vni")
          result.set(pathFrom(objectPath, nested.project), { kind: "vni" });
      }
    }
  }
  return result;
}

function rewritePopupObjectManifestWithMapping(options: {
  readonly manifest: unknown;
  readonly mapping: ReadonlyMap<string, string>;
  readonly sourcePath: string;
  readonly mapped: boolean;
}): PopupObjectManifestV1 {
  const manifest = parsePopupObjectManifest(options.manifest);
  const localMapping = new Map<string, string>();
  for (const reference of collectPopupObjectDirectPaths(manifest)) {
    const source = options.mapped
      ? reference
      : resolvePackagePath(options.sourcePath, reference);
    localMapping.set(reference, requirePopupMapping(options.mapping, source));
  }
  const resources: Record<string, PopupResourceSpec> = {};
  const resourceKeys = new Map<string, string>();
  for (const [id, spec] of Object.entries(manifest.resources)) {
    const rewritten = rewritePopupResourceSpec(spec, localMapping);
    const rootKey = popupResourceRoot(rewritten);
    if (resources[rootKey])
      throw new Error(
        `popup object resource root filename key 冲突：${rootKey}`,
      );
    resources[rootKey] = rewritten;
    resourceKeys.set(id, rootKey);
  }
  return parsePopupObjectManifest({
    ...manifest,
    resources,
    layers: manifest.layers.map((layer) => ({
      ...layer,
      ...(layer.resource
        ? {
            resource: requiredPopupResourceKey(resourceKeys, layer.resource),
          }
        : {}),
    })),
  });
}

function exactPopupFiles(
  files: ReadonlyMap<string, Uint8Array>,
  required: readonly string[],
): ReadonlyMap<string, Uint8Array> {
  const exact = new Map<string, Uint8Array>([
    [ROOT, requireBytes(files, ROOT).slice()],
  ]);
  for (const path of required)
    exact.set(path, requireBytes(files, path).slice());
  return exact;
}

function exactPopupObjectFiles(
  files: ReadonlyMap<string, Uint8Array>,
  required: readonly string[],
): ReadonlyMap<string, Uint8Array> {
  const exact = new Map<string, Uint8Array>([
    [
      POPUP_OBJECT_MANIFEST_PATH,
      requireBytes(files, POPUP_OBJECT_MANIFEST_PATH).slice(),
    ],
  ]);
  for (const path of required)
    exact.set(path, requireBytes(files, path).slice());
  return exact;
}

function popupResourceRoot(spec: PopupResourceSpec): string {
  if (spec.kind === "image" || spec.kind === "font") return spec.path;
  if (spec.kind === "image-string") return spec.manifest;
  if (spec.kind === "vni") return spec.project;
  if (spec.kind === "popup-object") return spec.manifest;
  return spec.skeleton;
}

function rewriteSpineReferences(
  spine: Extract<PopupManifest, { readonly type: "spine" }>["spine"],
  mapping: ReadonlyMap<string, string>,
) {
  return {
    ...spine,
    resource: requiredPopupResourceKey(mapping, spine.resource),
    ...(spine.prompt
      ? {
          prompt: {
            ...spine.prompt,
            ...(spine.prompt.font
              ? {
                  font: requiredPopupResourceKey(mapping, spine.prompt.font),
                }
              : {}),
          },
        }
      : {}),
    ...(spine.overlays
      ? {
          overlays: spine.overlays.map((overlay) => ({
            ...overlay,
            ...(overlay.resource
              ? {
                  resource: requiredPopupResourceKey(mapping, overlay.resource),
                }
              : {}),
          })),
        }
      : {}),
  };
}

function requiredPopupResourceKey(
  mapping: ReadonlyMap<string, string>,
  id: string,
): string {
  const key = mapping.get(id);
  if (!key) throw new Error(`popup layer 引用了未知 resource：${id}`);
  return key;
}

function requirePopupMapping(
  mapping: ReadonlyMap<string, string>,
  path: string,
): string {
  const target = mapping.get(path);
  if (!target) throw new Error(`popup 结构化资源依赖未物化：${path}`);
  return target;
}

function encodeStableJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(sortPopupJson(value), null, 2)}\n`,
  );
}

function sortPopupJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortPopupJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, sortPopupJson(child)]),
  );
}

function putPopupFile(
  files: Map<string, Uint8Array>,
  key: string,
  bytes: Uint8Array,
): void {
  const existing = files.get(key);
  if (
    existing &&
    (existing.byteLength !== bytes.byteLength ||
      existing.some((byte, index) => byte !== bytes[index]))
  )
    throw new Error(`popup 全局扁平 filename key 冲突：${key}`);
  if (!existing) files.set(key, bytes.slice());
}

function requireBytes(files: ReadonlyMap<string, Uint8Array>, path: string) {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`popup package missing ${path}.`);
  return bytes;
}
function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(decode(bytes, path));
  } catch (error) {
    throw new Error(
      `invalid JSON ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
function decode(bytes: Uint8Array, path: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`invalid UTF-8 ${path}.`);
  }
}
async function fetchBytes(fetchImpl: typeof fetch, url: URL) {
  const response = await fetchImpl(url);
  if (!response.ok)
    throw new Error(`popup fetch failed ${url.href}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
function contained(root: URL, path: string) {
  const base = new URL("./", root);
  const result = new URL(path, base);
  if (
    result.origin !== base.origin ||
    !result.pathname.startsWith(base.pathname)
  )
    throw new Error(`popup URL escapes package: ${path}`);
  return result;
}
