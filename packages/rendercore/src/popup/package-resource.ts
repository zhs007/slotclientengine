import { Assets, Texture } from "pixi.js";
import {
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
  resolvePackagePath,
  sha256Hex,
} from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  assertEditorAssetKey,
  assertNoEditorAssetKeyAliases,
  basenameFromSourcePath,
  decodeEditorAssetsMap,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import {
  assertVNIProject,
  resolveProjectAssetUrls,
  rewriteVNIProjectAssetPaths,
} from "@slotclientengine/vnicore/core";
import {
  collectImageStringAssetPaths,
  createImageStringResourceFromResolvedFiles,
  createImageStringResourceFromFiles,
  parseImageStringManifest,
  validateImageStringText,
  type DecodeImageStringImage,
} from "../image-string/index.js";
import { validateOfficialSpineResource } from "../spine/runtime-player.js";
import { collectPopupDirectPaths, parsePopupManifest } from "./manifest.js";
import { requiredPopupAmountCharacters } from "./amount-format.js";
import type {
  PopupManifestV1,
  PopupLayer,
  PopupPackageResource,
  PopupPreparedResource,
  PopupResourceSpec,
} from "./types.js";

const ROOT = "popup.manifest.json";

export function collectPopupPackagePaths(options: {
  readonly manifest: PopupManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): readonly string[] {
  const manifest = parsePopupManifest(options.manifest);
  const expected = new Set(collectPopupDirectPaths(manifest));
  const hasDirectPath = [...expected].some((reference) =>
    reference.includes("/"),
  );
  const hasFilenameKey = [...expected].some(
    (reference) => !reference.includes("/"),
  );
  if (hasDirectPath && hasFilenameKey)
    throw new Error(
      "popup package 不得混用 filename key 与 direct package path。",
    );
  const mapped = hasFilenameKey;
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image-string") {
      const nested = parseImageStringManifest(
        parseJson(
          requireBytes(options.files, resource.manifest),
          resource.manifest,
        ),
      );
      if (!mapped) {
        const directoryId = resource.manifest.split("/").at(-2);
        if (nested.id !== directoryId)
          throw new Error(
            `popup image-string dependency id mismatch: ${resource.manifest}`,
          );
      }
      for (const asset of collectImageStringAssetPaths(nested))
        expected.add(
          mapped ? asset : resolvePackagePath(resource.manifest, asset),
        );
    } else if (resource.kind === "vni") {
      const project = assertVNIProject(
        parseJson(
          requireBytes(options.files, resource.project),
          resource.project,
        ),
      );
      for (const asset of project.assets)
        expected.add(
          mapped
            ? assertEditorAssetKey(asset.path)
            : resolvePackagePath(resource.project, asset.path),
        );
    }
  }
  const actual = [...options.files.keys()].filter((path) => path !== ROOT);
  for (const path of actual)
    if (mapped) assertEditorAssetKey(path);
    else assertCanonicalPackagePath(path, { requireLowercase: true });
  const sortedExpected = [...expected].sort();
  const sortedActual = actual.sort();
  assertNoPackagePathCollisions(sortedActual);
  if (JSON.stringify(sortedExpected) !== JSON.stringify(sortedActual)) {
    throw new Error(
      `popup package entries must exactly match transitive closure; expected=${sortedExpected.join(",")}, actual=${sortedActual.join(",")}.`,
    );
  }
  return Object.freeze(sortedExpected);
}

export async function createPopupPackageResource(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}): Promise<PopupPackageResource> {
  const manifest = parsePopupManifest(
    options.manifest ?? parseJson(requireBytes(options.files, ROOT), ROOT),
  );
  const files = await resolvePopupPackageFiles({
    manifest,
    files: options.files,
  });
  return createPopupPackageResourceFromResolvedFiles({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
  });
}

export async function createPopupPackageResourceFromResolvedFiles(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}): Promise<PopupPackageResource> {
  const manifest = parsePopupManifest(
    options.manifest ?? parseJson(requireBytes(options.files, ROOT), ROOT),
  );
  const files = options.files;
  collectPopupPackagePaths({ manifest, files });
  const mapped = collectPopupDirectPaths(manifest).every(
    (reference) => !reference.includes("/"),
  );
  const urls: string[] = [];
  const prepared: Record<string, PopupPreparedResource> = {};
  const ownedTextures = new Set<Texture>();
  try {
    for (const [id, spec] of Object.entries(manifest.resources)) {
      if (spec.kind === "image-string") {
        const imageStringResource = mapped
          ? await createMappedNestedImageStringResource({
              manifestKey: spec.manifest,
              files,
              ...(options.decodeImage
                ? { decodeImage: options.decodeImage }
                : {}),
              ...(options.loadTexture
                ? { loadTexture: options.loadTexture }
                : {}),
            })
          : await createImageStringResourceFromFiles({
              files: extractPrefix(
                files,
                spec.manifest.slice(0, spec.manifest.lastIndexOf("/")),
              ),
              ...(options.decodeImage
                ? { decodeImage: options.decodeImage }
                : {}),
              ...(options.loadTexture
                ? { loadTexture: options.loadTexture }
                : {}),
            });
        prepared[id] = {
          kind: "image-string",
          resource: imageStringResource,
        };
        validateImageStringText(
          requiredPopupAmountCharacters(manifest.amountFormat).join(""),
          imageStringResource.manifest,
        );
      } else if (spec.kind === "image") {
        const url = objectUrl(requireBytes(files, spec.path), spec.path, urls);
        const texture = await (options.loadTexture
          ? options.loadTexture(url, spec.path)
          : Assets.load<Texture>({ src: url, parser: "loadTextures" }));
        if (
          texture.width !== spec.size.width ||
          texture.height !== spec.size.height
        )
          throw new Error(
            `popup image size mismatch ${spec.path}: expected ${spec.size.width}x${spec.size.height}, got ${texture.width}x${texture.height}.`,
          );
        ownedTextures.add(texture);
        prepared[id] = { kind: "image", texture };
      } else if (spec.kind === "vni") {
        const project = assertVNIProject(
          parseJson(requireBytes(files, spec.project), spec.project),
        );
        const assetUrls: Record<string, string> = {};
        for (const asset of project.assets)
          assetUrls[asset.path] = objectUrl(
            requireBytes(
              files,
              mapped
                ? assertEditorAssetKey(asset.path)
                : resolvePackagePath(spec.project, asset.path),
            ),
            asset.path,
            urls,
          );
        prepared[id] = {
          kind: "vni",
          project,
          assetUrls: resolveProjectAssetUrls(project, assetUrls),
        };
      } else {
        const skeleton = parseJson(
          requireBytes(files, spec.skeleton),
          spec.skeleton,
        );
        const atlasText = decode(requireBytes(files, spec.atlas), spec.atlas);
        const textureUrls = Object.fromEntries(
          Object.entries(spec.textures).map(([page, path]) => [
            page,
            objectUrl(requireBytes(files, path), path, urls),
          ]),
        );
        const spine = { skeleton, atlasText, textureUrls };
        const requiredAnimations =
          manifest.awardCelebration.celebrationTiers.flatMap(
            () => [] as string[],
          );
        validateOfficialSpineResource({ resource: spine, requiredAnimations });
        prepared[id] = { kind: "spine", resource: spine };
      }
    }
    validateAnimationBindings(manifest, prepared);
    let destroyed = false;
    return Object.freeze({
      manifest,
      resources: Object.freeze(prepared),
      async destroy() {
        if (destroyed) return;
        destroyed = true;
        for (const value of Object.values(prepared))
          if (value.kind === "image-string") await value.resource.destroy();
        for (const texture of ownedTextures) texture.destroy(false);
        for (const url of urls) URL.revokeObjectURL(url);
      },
    });
  } catch (error) {
    for (const value of Object.values(prepared))
      if (value.kind === "image-string") await value.resource.destroy();
    for (const texture of ownedTextures) texture.destroy(false);
    for (const url of urls) URL.revokeObjectURL(url);
    throw error;
  }
}

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
  if (!mapped) return options.files;
  const rootBytes = requireBytes(options.files, ROOT);
  const map = decodeEditorAssetsMap(
    requireBytes(options.files, EDITOR_ASSETS_MAP_PATH),
  );
  const resolved = await validateEditorAssetsMapPackage({
    map,
    files: options.files,
    allowControlPaths: [ROOT],
  });
  const virtual = new Map<string, Uint8Array>([[ROOT, rootBytes.slice()]]);
  for (const [key, asset] of resolved) virtual.set(key, asset.bytes.slice());
  collectPopupPackagePaths({ manifest, files: virtual });
  return virtual;
}

export function flattenPopupPackageFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): {
  readonly manifest: PopupManifestV1;
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
  const sourcePaths = new Set(direct);
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image-string") {
      const nested = parseImageStringManifest(
        parseJson(
          requireBytes(options.files, resource.manifest),
          resource.manifest,
        ),
      );
      for (const path of collectImageStringAssetPaths(nested))
        sourcePaths.add(resolvePackagePath(resource.manifest, path));
    } else if (resource.kind === "vni") {
      const project = assertVNIProject(
        parseJson(
          requireBytes(options.files, resource.project),
          resource.project,
        ),
      );
      for (const asset of project.assets)
        sourcePaths.add(resolvePackagePath(resource.project, asset.path));
    }
  }
  const mapping = new Map(
    [...sourcePaths].map(
      (path) => [path, basenameFromSourcePath(path)] as const,
    ),
  );
  assertNoEditorAssetKeyAliases([...new Set(mapping.values())]);
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
        resource: requiredPopupResourceKey(resourceKeys, layer.resource),
      })),
    }) as T;
  const flattenedManifest = parsePopupManifest({
    ...manifest,
    resources,
    awardCelebration: {
      base: rewriteLayers(manifest.awardCelebration.base),
      standard: rewriteLayers(manifest.awardCelebration.standard),
      celebrationTiers:
        manifest.awardCelebration.celebrationTiers.map(rewriteLayers),
    },
  });
  const files = new Map<string, Uint8Array>([
    [ROOT, encodeStableJson(flattenedManifest)],
  ]);
  for (const [sourcePath, target] of mapping) {
    const bytes = requireBytes(options.files, sourcePath);
    let rewritten = bytes;
    const imageString = Object.values(manifest.resources).find(
      (resource) =>
        resource.kind === "image-string" && resource.manifest === sourcePath,
    );
    const vni = Object.values(manifest.resources).find(
      (resource) => resource.kind === "vni" && resource.project === sourcePath,
    );
    const spine = Object.values(manifest.resources).find(
      (resource) => resource.kind === "spine" && resource.atlas === sourcePath,
    );
    if (imageString) {
      const nested = structuredClone(
        parseImageStringManifest(parseJson(bytes, sourcePath)),
      ) as { glyphs: Record<string, { path: string }> };
      for (const glyph of Object.values(nested.glyphs))
        glyph.path = requirePopupMapping(
          mapping,
          resolvePackagePath(sourcePath, glyph.path),
        );
      rewritten = encodeStableJson(nested);
    } else if (vni) {
      rewritten = encodeStableJson(
        rewriteVNIProjectAssetPaths(parseJson(bytes, sourcePath), (path) =>
          requirePopupMapping(mapping, resolvePackagePath(sourcePath, path)),
        ),
      );
    } else if (spine) {
      const text = decode(bytes, sourcePath);
      rewritten = new TextEncoder().encode(
        rewritePopupAtlas(text, sourcePath, mapping),
      );
    }
    putPopupFile(files, target, rewritten);
  }
  collectPopupPackagePaths({ manifest: flattenedManifest, files });
  return { manifest: flattenedManifest, files };
}

export function collectMappedPopupAssetKeys(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): readonly string[] {
  const manifest = parsePopupManifest(options.manifest);
  const keys = new Set(collectPopupDirectPaths(manifest));
  const mapped = [...keys].every((path) => !path.includes("/"));
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image-string") {
      const nested = parseImageStringManifest(
        parseJson(
          requireBytes(options.files, resource.manifest),
          resource.manifest,
        ),
      );
      for (const key of collectImageStringAssetPaths(nested))
        keys.add(mapped ? key : resolvePackagePath(resource.manifest, key));
    } else if (resource.kind === "vni") {
      const project = assertVNIProject(
        parseJson(
          requireBytes(options.files, resource.project),
          resource.project,
        ),
      );
      for (const asset of project.assets)
        keys.add(
          mapped
            ? asset.path
            : resolvePackagePath(resource.project, asset.path),
        );
    }
  }
  return Object.freeze([...keys].sort((a, b) => a.localeCompare(b, "en")));
}

async function createMappedNestedImageStringResource(options: {
  readonly manifestKey: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}) {
  const manifest = parseImageStringManifest(
    parseJson(
      requireBytes(options.files, options.manifestKey),
      options.manifestKey,
    ),
  );
  const nested = new Map<string, Uint8Array>([
    [
      "image-string.manifest.json",
      requireBytes(options.files, options.manifestKey),
    ],
  ]);
  for (const key of collectImageStringAssetPaths(manifest))
    nested.set(key, requireBytes(options.files, key));
  return createImageStringResourceFromResolvedFiles({
    manifest,
    files: nested,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
  });
}

export async function loadPopupPackageFromUrl(options: {
  readonly manifestUrl: string | URL;
  readonly fetchImpl?: typeof fetch;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadTexture?: (url: string, path: string) => Promise<Texture>;
}): Promise<PopupPackageResource> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function")
    throw new Error("fetchImpl is required.");
  const rootUrl = new URL(options.manifestUrl);
  if (!/^https?:$/u.test(rootUrl.protocol))
    throw new Error("popup manifest URL must use http/https.");
  const rootBytes = await fetchBytes(fetchImpl, rootUrl);
  const manifest = parsePopupManifest(parseJson(rootBytes, ROOT));
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
      if (payload.byteLength !== entry.byteLength)
        throw new Error(
          `popup mapped payload byteLength mismatch: ${entry.path}`,
        );
      if ((await sha256Hex(payload)) !== entry.sha256)
        throw new Error(`popup mapped payload SHA-256 mismatch: ${entry.path}`);
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
  }
  return createPopupPackageResource({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
  });
}

function validateAnimationBindings(
  manifest: PopupManifestV1,
  resources: Readonly<Record<string, PopupPreparedResource>>,
) {
  for (const tier of [
    manifest.awardCelebration.base,
    manifest.awardCelebration.standard,
    ...manifest.awardCelebration.celebrationTiers,
  ])
    for (const layer of tier.layers) {
      const resource = resources[layer.resource]!;
      if (layer.kind === "vni") {
        if (resource.kind !== "vni")
          throw new Error("popup VNI resource mismatch.");
        if (!(layer.playback.loopEndTime <= resource.project.stage.duration))
          throw new Error(
            `popup VNI layer ${layer.id} loopEndTime exceeds project duration.`,
          );
      }
      if (layer.kind === "spine") {
        if (resource.kind !== "spine")
          throw new Error("popup Spine resource mismatch.");
        validateOfficialSpineResource({
          resource: resource.resource,
          requiredAnimations: [
            layer.playback.startAnimation,
            layer.playback.loopAnimation,
            layer.playback.endAnimation,
          ],
        });
      }
    }
}

function rewritePopupResourceSpec(
  spec: PopupResourceSpec,
  mapping: ReadonlyMap<string, string>,
): PopupResourceSpec {
  if (spec.kind === "image")
    return { ...spec, path: requirePopupMapping(mapping, spec.path) };
  if (spec.kind === "image-string")
    return { ...spec, manifest: requirePopupMapping(mapping, spec.manifest) };
  if (spec.kind === "vni")
    return { ...spec, project: requirePopupMapping(mapping, spec.project) };
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

function popupResourceRoot(spec: PopupResourceSpec): string {
  if (spec.kind === "image") return spec.path;
  if (spec.kind === "image-string") return spec.manifest;
  if (spec.kind === "vni") return spec.project;
  return spec.skeleton;
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

function rewritePopupAtlas(
  text: string,
  atlasPath: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const lines = text.replace(/\r\n?/gu, "\n").split("\n");
  return `${lines
    .map((line) => {
      if (!line || /^\s/u.test(line) || line.includes(":")) return line;
      const source = resolvePackagePath(atlasPath, line);
      return mapping.get(source) ?? line;
    })
    .join("\n")
    .replace(/\n+$/u, "")}\n`;
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

function extractPrefix(files: ReadonlyMap<string, Uint8Array>, prefix: string) {
  const result = new Map<string, Uint8Array>();
  const marker = `${prefix}/`;
  for (const [path, bytes] of files)
    if (path.startsWith(marker))
      result.set(path.slice(marker.length), bytes.slice());
  return result;
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
function objectUrl(bytes: Uint8Array, path: string, urls: string[]) {
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer], { type: mime(path) }),
  );
  urls.push(url);
  return url;
}
function mime(path: string) {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
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
