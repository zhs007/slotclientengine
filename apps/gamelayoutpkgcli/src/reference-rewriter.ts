import {
  parseImageStringManifest,
  type ImageStringManifestV1,
} from "@slotclientengine/rendercore/image-string/data";
import { editorAssetKeyCollisionToken } from "@slotclientengine/editorresource";
import {
  loadPopupManifest,
  type LatestPopupManifest,
  type PopupResourceSpec,
} from "@slotclientengine/rendercore/popup/data";
import {
  parseSceneLayoutManifestDocument,
  type SceneLayoutManifest,
} from "@slotclientengine/rendercore/scene-layout";
import {
  parseSymbolPackageManifest,
  parseSymbolStateTextureManifest,
  type SymbolPackageManifestV1,
} from "@slotclientengine/rendercore/symbol";
import {
  assertVNIProject,
  rewriteVNIProjectAssetPaths,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/data";
import { parseJson } from "./package-reader.js";
import type {
  ImageOptimizationResult,
  OptimizedLogicalAsset,
} from "./types.js";

export function rewriteLayoutPackageReferences(options: {
  readonly manifest: SceneLayoutManifest;
  readonly optimization: ImageOptimizationResult;
}): {
  readonly manifest: SceneLayoutManifest;
  readonly assets: ReadonlyMap<string, OptimizedLogicalAsset>;
} {
  const sourceFiles = new Map(
    [...options.optimization.assets.values()].map((asset) => [
      asset.sourceKey,
      asset.bytes,
    ]),
  );
  const symbolManifestKeys = collectSymbolManifestKeys(
    options.manifest,
    sourceFiles,
  );
  const assets = new Map<string, OptimizedLogicalAsset>();
  for (const asset of options.optimization.assets.values()) {
    let bytes = asset.bytes;
    if (asset.sourceKey.toLowerCase().endsWith(".json")) {
      const raw = parseJson(bytes, asset.sourceKey);
      let rewritten: unknown | undefined;
      if (symbolManifestKeys.has(asset.sourceKey)) {
        rewritten = rewriteSymbolManifest(raw, options.optimization.keyMapping);
      } else if (isRecord(raw) && raw.kind === "image-string") {
        rewritten = rewriteImageStringManifest(
          raw,
          options.optimization.keyMapping,
        );
      } else if (isRecord(raw) && raw.kind === "symbol-package") {
        rewritten = rewriteSymbolPackageManifest(
          raw,
          options.optimization.keyMapping,
        );
      } else if (isRecord(raw) && raw.kind === "popup") {
        rewritten = rewritePopupManifest(raw, options.optimization.keyMapping);
      } else if (looksLikeVniProject(raw)) {
        rewritten = rewriteVniProject(raw, options.optimization.keyMapping);
      }
      if (rewritten !== undefined) bytes = encodeStableJson(rewritten);
    }
    assets.set(
      asset.key,
      Object.freeze({
        ...asset,
        bytes: bytes.slice(),
      }),
    );
  }
  return Object.freeze({
    manifest: rewriteLayoutManifest(
      options.manifest,
      options.optimization.keyMapping,
    ),
    assets: new Map(assets),
  });
}

export function rewriteLayoutManifest(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): SceneLayoutManifest {
  const manifest = structuredClone(
    parseSceneLayoutManifestDocument(value),
  ) as SceneLayoutManifest;
  const nodes = manifest.nodes.map((node) => {
    if (node.resource.kind === "image")
      return {
        ...node,
        resource: {
          ...node.resource,
          path: rewriteRef(node.resource.path, mapping),
        },
      };
    if (node.resource.kind === "image-string")
      return {
        ...node,
        resource: {
          ...node.resource,
          manifest: rewriteRef(node.resource.manifest, mapping),
        },
      };
    if (node.resource.kind === "vni")
      return {
        ...node,
        resource: {
          ...node.resource,
          project: rewriteRef(node.resource.project, mapping),
        },
      };
    return {
      ...node,
      resource: {
        ...node.resource,
        skeleton: rewriteRef(node.resource.skeleton, mapping),
        atlas: rewriteRef(node.resource.atlas, mapping),
        textures: rewriteSpineTextures(node.resource.textures, mapping),
      },
    };
  });
  const transitions = manifest.gameModes?.transitions?.map((transition) => {
    if ("kind" in transition.overlay) return transition;
    const resource = transition.overlay.resource;
    if (resource.kind === "video")
      return {
        ...transition,
        overlay: {
          ...transition.overlay,
          resource: {
            ...resource,
            path: rewriteRef(resource.path, mapping),
          },
        },
      };
    return {
      ...transition,
      overlay: {
        ...transition.overlay,
        resource: {
          ...resource,
          skeleton: rewriteRef(resource.skeleton, mapping),
          atlas: rewriteRef(resource.atlas, mapping),
          textures: rewriteSpineTextures(resource.textures, mapping),
        },
      },
    };
  });
  const runtimeResources = manifest.runtimeResources
    ? Object.fromEntries(
        Object.entries(manifest.runtimeResources).map(([id, resource]) => {
          if (resource.kind === "image" || resource.kind === "video")
            return [
              id,
              { ...resource, path: rewriteRef(resource.path, mapping) },
            ];
          if (resource.kind === "image-string")
            return [
              id,
              {
                ...resource,
                manifest: rewriteRef(resource.manifest, mapping),
              },
            ];
          if (resource.kind === "vni")
            return [
              id,
              { ...resource, project: rewriteRef(resource.project, mapping) },
            ];
          return [
            id,
            {
              ...resource,
              skeleton: rewriteRef(resource.skeleton, mapping),
              atlas: rewriteRef(resource.atlas, mapping),
              textures: rewriteSpineTextures(resource.textures, mapping),
            },
          ];
        }),
      )
    : undefined;
  return parseSceneLayoutManifestDocument({
    ...manifest,
    nodes,
    ...(manifest.symbolPackage
      ? {
          symbolPackage: {
            ...manifest.symbolPackage,
            manifest: rewriteRef(manifest.symbolPackage.manifest, mapping),
          },
        }
      : {}),
    ...(manifest.symbolPackages
      ? {
          symbolPackages: Object.fromEntries(
            Object.entries(manifest.symbolPackages).map(([id, binding]) => [
              id,
              { ...binding, manifest: rewriteRef(binding.manifest, mapping) },
            ]),
          ),
        }
      : {}),
    ...(manifest.popups
      ? {
          popups: Object.fromEntries(
            Object.entries(manifest.popups).map(([id, binding]) => [
              id,
              { ...binding, manifest: rewriteRef(binding.manifest, mapping) },
            ]),
          ),
        }
      : {}),
    ...(runtimeResources ? { runtimeResources } : {}),
    ...(manifest.gameModes
      ? {
          gameModes: {
            ...manifest.gameModes,
            ...(transitions ? { transitions } : {}),
          },
        }
      : {}),
  });
}

export function rewriteImageStringManifest(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): ImageStringManifestV1 {
  const manifest = structuredClone(
    parseImageStringManifest(value),
  ) as ImageStringManifestV1;
  return parseImageStringManifest({
    ...manifest,
    glyphs: Object.fromEntries(
      Object.entries(manifest.glyphs).map(([character, glyph]) => [
        character,
        { ...glyph, path: rewriteRef(glyph.path, mapping) },
      ]),
    ),
  });
}

export function rewriteSymbolPackageManifest(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): SymbolPackageManifestV1 {
  const manifest = parseSymbolPackageManifest(value);
  return parseSymbolPackageManifest({
    ...manifest,
    entrypoints: {
      gameConfig: rewriteRef(manifest.entrypoints.gameConfig, mapping),
      symbolManifest: rewriteRef(manifest.entrypoints.symbolManifest, mapping),
    },
    resources: manifest.resources
      .map((path) => rewriteRef(path, mapping))
      .sort(compare),
  });
}

export function rewriteSymbolManifest(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): unknown {
  parseSymbolStateTextureManifest(value);
  const manifest = structuredClone(value) as Record<string, unknown>;
  const states = Array.isArray(manifest.states)
    ? manifest.states.filter(
        (state): state is string => typeof state === "string",
      )
    : [];
  const symbols = record(manifest.symbols, "symbol manifest.symbols");
  for (const rawEntry of Object.values(symbols)) {
    const entry = record(rawEntry, "symbol manifest symbol");
    if ("normal" in entry) entry.normal = rewriteNormal(entry.normal, mapping);
    for (const state of states)
      if (typeof entry[state] === "string")
        entry[state] = rewriteRef(entry[state] as string, mapping);
    if (entry.animations) {
      for (const rawAnimation of Object.values(
        record(entry.animations, "symbol animations"),
      ))
        rewriteAnimation(record(rawAnimation, "symbol animation"), mapping);
    }
    if (entry.valuePresentation)
      rewriteValuePresentation(
        record(entry.valuePresentation, "valuePresentation"),
        mapping,
      );
  }
  parseSymbolStateTextureManifest(manifest);
  return manifest;
}

export function rewritePopupManifest(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): LatestPopupManifest {
  const manifest = loadPopupManifest(value).manifest;
  const resources: Record<string, PopupResourceSpec> = {};
  const resourceIds = new Map<string, string>();
  for (const [id, resource] of Object.entries(manifest.resources)) {
    const rewritten = rewritePopupResource(resource, mapping);
    const oldRoot = popupResourceRoot(resource);
    const nextRoot = popupResourceRoot(rewritten);
    const nextId = id === oldRoot ? nextRoot : id;
    if (resources[nextId])
      throw new Error(`Popup resource key 转换冲突：${id} -> ${nextId}`);
    resources[nextId] = rewritten;
    resourceIds.set(id, nextId);
  }
  const rewriteTier = <T extends { readonly layers: readonly unknown[] }>(
    tier: T,
  ): T =>
    ({
      ...tier,
      layers: tier.layers.map((rawLayer) => {
        const layer = record(rawLayer, "popup layer");
        const resource = String(layer.resource);
        return { ...layer, resource: resourceIds.get(resource) ?? resource };
      }),
    }) as T;
  if (manifest.type === "spine")
    return loadPopupManifest({
      ...manifest,
      resources,
      spine: {
        ...manifest.spine,
        resource:
          resourceIds.get(manifest.spine.resource) ?? manifest.spine.resource,
        ...(manifest.spine.overlays
          ? {
              overlays: manifest.spine.overlays.map((layer) => ({
                ...layer,
                ...(layer.resource
                  ? {
                      resource:
                        resourceIds.get(layer.resource) ?? layer.resource,
                    }
                  : {}),
              })),
            }
          : {}),
      },
    }).manifest;
  return loadPopupManifest({
    ...manifest,
    resources,
    awardCelebration: {
      base: rewriteTier(manifest.awardCelebration.base),
      standard: rewriteTier(manifest.awardCelebration.standard),
      celebrationTiers:
        manifest.awardCelebration.celebrationTiers.map(rewriteTier),
    },
  }).manifest;
}

export function rewriteVniProject(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): VNIProjectConfig {
  const rewritten = rewriteVNIProjectAssetPaths(value, (path) =>
    rewriteRef(path, mapping),
  );
  assertVNIProject(rewritten);
  return rewritten;
}

export function encodeStableJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(sortValue(value), null, 2)}\n`,
  );
}

function collectSymbolManifestKeys(
  manifest: SceneLayoutManifest,
  files: ReadonlyMap<string, Uint8Array>,
): Set<string> {
  const roots = [
    ...(manifest.symbolPackage ? [manifest.symbolPackage.manifest] : []),
    ...Object.values(manifest.symbolPackages ?? {}).map(
      (binding) => binding.manifest,
    ),
  ];
  const keys = new Set<string>();
  for (const root of roots) {
    const bytes = files.get(root);
    if (!bytes) throw new Error(`Symbols package manifest 缺失：${root}`);
    const nested = parseSymbolPackageManifest(parseJson(bytes, root));
    keys.add(nested.entrypoints.symbolManifest);
  }
  return keys;
}

function rewriteValuePresentation(
  presentation: Record<string, unknown>,
  mapping: ReadonlyMap<string, string>,
): void {
  const reelStates = record(
    presentation.reelStates,
    "valuePresentation.reelStates",
  );
  for (const [state, path] of Object.entries(reelStates))
    if (state !== "normal" && typeof path === "string")
      reelStates[state] = rewriteRef(path, mapping);
  if (Array.isArray(presentation.tiers))
    for (const rawTier of presentation.tiers) {
      const tier = record(rawTier, "valuePresentation tier");
      rewriteAnimation(
        record(tier.animation, "valuePresentation tier.animation"),
        mapping,
      );
    }
  const text = record(presentation.text, "valuePresentation.text");
  if (text.type !== "image") return;
  if (typeof text.prefix === "string") {
    if (!Array.isArray(presentation.defaultValues))
      throw new Error("valuePresentation.defaultValues 必须是 array。");
    const images: Record<string, string> = {};
    for (const value of presentation.defaultValues) {
      if (!Number.isSafeInteger(value) || (value as number) <= 0)
        throw new Error("valuePresentation.defaultValues 必须是正安全整数。");
      images[String(value)] = rewriteRequiredRef(
        `${text.prefix}${value}.png`,
        mapping,
      );
    }
    delete text.prefix;
    text.images = images;
    return;
  }
  const images = record(text.images, "valuePresentation.text.images");
  for (const [value, path] of Object.entries(images))
    if (typeof path === "string")
      images[value] = rewriteRequiredRef(path, mapping);
}

function rewriteNormal(
  value: unknown,
  mapping: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === "string") return rewriteRef(value, mapping);
  if (
    !isRecord(value) ||
    value.kind !== "layered" ||
    !Array.isArray(value.layers)
  )
    return value;
  value.layers = value.layers.map((rawLayer) => {
    if (typeof rawLayer === "string") return rewriteRef(rawLayer, mapping);
    const layer = record(rawLayer, "symbol normal layer");
    if (typeof layer.texture === "string")
      layer.texture = rewriteRef(layer.texture, mapping);
    if (Array.isArray(layer.keyframes))
      layer.keyframes = layer.keyframes.map((path) =>
        typeof path === "string" ? rewriteRef(path, mapping) : path,
      );
    return layer;
  });
  return value;
}

function rewriteAnimation(
  animation: Record<string, unknown>,
  mapping: ReadonlyMap<string, string>,
): void {
  if (animation.kind === "vni" && typeof animation.project === "string")
    animation.project = rewriteRef(animation.project, mapping);
  else if (animation.kind === "spine")
    for (const key of ["skeleton", "atlas", "texture"] as const)
      if (typeof animation[key] === "string")
        animation[key] = rewriteRef(animation[key] as string, mapping);
  if ("base" in animation)
    animation.base = rewriteNormal(animation.base, mapping);
}

function rewritePopupResource(
  resource: PopupResourceSpec,
  mapping: ReadonlyMap<string, string>,
): PopupResourceSpec {
  if (resource.kind === "image" || resource.kind === "font")
    return { ...resource, path: rewriteRef(resource.path, mapping) };
  if (resource.kind === "image-string")
    return { ...resource, manifest: rewriteRef(resource.manifest, mapping) };
  if (resource.kind === "vni")
    return { ...resource, project: rewriteRef(resource.project, mapping) };
  return {
    ...resource,
    skeleton: rewriteRef(resource.skeleton, mapping),
    atlas: rewriteRef(resource.atlas, mapping),
    textures: rewriteSpineTextures(resource.textures, mapping),
  };
}

function popupResourceRoot(resource: PopupResourceSpec): string {
  if (resource.kind === "image" || resource.kind === "font")
    return resource.path;
  if (resource.kind === "image-string") return resource.manifest;
  if (resource.kind === "vni") return resource.project;
  return resource.skeleton;
}

function rewriteRecordValues(
  values: Readonly<Record<string, string>>,
  mapping: ReadonlyMap<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      rewriteRef(value, mapping),
    ]),
  );
}

function rewriteSpineTextures(
  values: Readonly<Record<string, string>>,
  mapping: ReadonlyMap<string, string>,
): Record<string, string> {
  const targetsByToken = new Map(
    [...mapping].map(([source, target]) => [
      editorAssetKeyCollisionToken(source),
      target,
    ]),
  );
  const rewritten: Record<string, string> = {};
  for (const [page, value] of Object.entries(values)) {
    const targetPage =
      targetsByToken.get(editorAssetKeyCollisionToken(page)) ?? page;
    if (targetPage in rewritten)
      throw new Error(`Spine texture 页名重写后冲突：${targetPage}`);
    rewritten[targetPage] = rewriteRef(value, mapping);
  }
  return rewritten;
}

function rewriteRef(
  value: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const dot = value.startsWith("./");
  const source = dot ? value.slice(2) : value;
  const target = mapping.get(source);
  return target ? (dot ? `./${target}` : target) : value;
}

function rewriteRequiredRef(
  value: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const rewritten = rewriteRef(value, mapping);
  if (rewritten === value) {
    const source = value.startsWith("./") ? value.slice(2) : value;
    if (!mapping.has(source))
      throw new Error(`结构化图片引用未在 assets map 中声明：${value}`);
  }
  return rewritten;
}

function looksLikeVniProject(value: unknown): boolean {
  return Boolean(
    isRecord(value) &&
    "schemaVersion" in value &&
    "assets" in value &&
    "layers" in value,
  );
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} 必须是 object。`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compare(left, right))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
