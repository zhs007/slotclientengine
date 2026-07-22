import {
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
  resolvePackagePath,
} from "@slotclientengine/browserartifactio";
import {
  EDITOR_ASSETS_MAP_PATH,
  decodeEditorAssetsMap,
  validateEditorAssetsMapPackage,
} from "@slotclientengine/editorresource";
import { assertVNIProject } from "@slotclientengine/vnicore/core";
import {
  collectImageStringAssetPaths,
  createImageStringResourceFromFiles,
  createImageStringResourceFromResolvedFiles,
  parseImageStringManifest,
  validateImageStringText,
  type DecodeImageStringImage,
  type ImageStringResource,
} from "../image-string/index.js";
import {
  collectSymbolPackageEntryPaths,
  createSymbolPackageResourceFromResolvedFiles,
  parseSymbolPackageManifest,
  validateSymbolPackageContents,
  type SymbolPackageResource,
} from "../symbol/package.js";
import {
  collectPopupPackagePaths,
  collectPopupDirectPaths,
  createPopupPackageResourceFromResolvedFiles,
  parsePopupManifest,
  type PopupPackageResource,
} from "../popup/index.js";
import { SceneLayoutError } from "./errors.js";
import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifest,
} from "./manifest.js";
import { createSceneLayoutResource } from "./resource.js";
import type {
  SceneLayoutManifestV1,
  SceneLayoutPackageResource,
} from "./types.js";

const ROOT_MANIFEST = "layout.manifest.json";

export function collectSceneLayoutPackagePaths(options: {
  readonly manifest: SceneLayoutManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): readonly string[] {
  const manifest = parseSceneLayoutManifest(options.manifest);
  const references = collectSceneLayoutAssetPaths(manifest);
  const mapped = references.every((path) => !path.includes("/"));
  if (!mapped && references.some((path) => !path.includes("/")))
    throw new SceneLayoutError(
      "Scene layout package must not mix filename keys with direct package paths.",
    );
  const actual = [...options.files.keys()].filter(
    (path) => path !== ROOT_MANIFEST,
  );
  for (const path of actual) assertCanonicalPackagePath(path);
  assertNoPackagePathCollisions(actual);
  const expected = new Set<string>();

  for (const path of references) expected.add(path);
  for (const node of manifest.nodes) {
    if (node.resource.kind !== "image-string") continue;
    const nestedValue = parseJsonBytes(
      requireBytes(options.files, node.resource.manifest),
      node.resource.manifest,
    );
    const nested = parseImageStringManifest(nestedValue);
    const directory = directoryOf(node.resource.manifest);
    if (!mapped && nested.id !== node.resource.manifest.split("/").at(-2)) {
      throw new SceneLayoutError(
        `Scene layout "${manifest.id}" image-string dependency id mismatch at "${node.resource.manifest}".`,
      );
    }
    try {
      validateImageStringText(node.resource.text, nested);
    } catch (error) {
      throw new SceneLayoutError(
        `Scene layout image-string node "${node.id}" is invalid: ${formatError(error)}`,
      );
    }
    for (const path of collectImageStringAssetPaths(nested)) {
      expected.add(
        mapped ? path : resolvePackagePath(node.resource.manifest, path),
      );
    }
    if (!mapped && !directory.startsWith("dependencies/image-strings/")) {
      throw new SceneLayoutError("Invalid image-string dependency directory.");
    }
  }

  for (const [bindingId, binding] of symbolBindings(manifest)) {
    const nestedValue = parseJsonBytes(
      requireBytes(options.files, binding.manifest),
      binding.manifest,
    );
    const nested = parseSymbolPackageManifest(nestedValue);
    if (nested.id !== bindingId) {
      throw new SceneLayoutError(
        `Scene layout "${manifest.id}" symbol binding id mismatch at "${binding.manifest}": nested package is "${nested.id}".`,
      );
    }
    const nestedFiles = mapped
      ? mappedSymbolFiles(options.files, binding.manifest, nested)
      : extractPrefixedFiles(options.files, directoryOf(binding.manifest));
    validateSymbolPackageContents({
      packageManifest: nested,
      files: nestedFiles,
    });
    for (const path of collectSymbolPackageEntryPaths(nested)) {
      expected.add(
        path === "symbols.package.json"
          ? binding.manifest
          : mapped
            ? path
            : resolvePackagePath(binding.manifest, path),
      );
    }
  }

  for (const popup of Object.values(manifest.popups ?? {})) {
    const nestedValue = parseJsonBytes(
      requireBytes(options.files, popup.manifest),
      popup.manifest,
    );
    const nested = parsePopupManifest(nestedValue);
    if (!mapped && nested.id !== popup.manifest.split("/").at(-2)) {
      throw new SceneLayoutError(
        `Scene layout popup dependency id mismatch at "${popup.manifest}".`,
      );
    }
    const nestedFiles = mapped
      ? mappedPopupFiles(options.files, popup.manifest, nested)
      : extractPrefixedFiles(options.files, directoryOf(popup.manifest));
    for (const path of collectPopupPackagePaths({
      manifest: nested,
      files: nestedFiles,
    })) {
      expected.add(mapped ? path : resolvePackagePath(popup.manifest, path));
    }
  }

  const sortedExpected = [...expected].sort(comparePaths);
  assertNoPackagePathCollisions(sortedExpected);
  const sortedActual = actual.sort(comparePaths);
  if (!samePaths(sortedExpected, sortedActual)) {
    throw new SceneLayoutError(
      `Scene layout package entries must exactly match the transitive closure（传递资源闭包必须精确一致）; expected=${sortedExpected.join(",")}, actual=${sortedActual.join(",")}.`,
    );
  }
  return Object.freeze(sortedExpected);
}

export async function createSceneLayoutPackageResource(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadSymbolTextures?: boolean;
}): Promise<SceneLayoutPackageResource> {
  const manifestValue =
    options.manifest ??
    parseJsonBytes(requireBytes(options.files, ROOT_MANIFEST), ROOT_MANIFEST);
  const manifest = parseSceneLayoutManifest(manifestValue);
  const files = await resolveSceneLayoutPackageFiles({
    manifest,
    files: options.files,
  });
  return createSceneLayoutPackageResourceFromResolvedFiles({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    loadSymbolTextures: options.loadSymbolTextures,
  });
}

export async function createSceneLayoutPackageResourceFromResolvedFiles(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadSymbolTextures?: boolean;
}): Promise<SceneLayoutPackageResource> {
  const sourceManifestValue =
    options.manifest ??
    parseJsonBytes(requireBytes(options.files, ROOT_MANIFEST), ROOT_MANIFEST);
  const manifest = parseSceneLayoutManifest(sourceManifestValue);
  const files = options.files;
  collectSceneLayoutPackagePaths({ manifest, files });
  const mapped = isMappedSceneLayoutManifest(manifest);

  const imageStrings: Record<string, ImageStringResource> = {};
  let symbolPackage: SymbolPackageResource | null = null;
  const symbolPackages: Record<string, SymbolPackageResource> = {};
  const popupPackages: Record<string, PopupPackageResource> = {};
  const objectUrls: string[] = [];
  try {
    for (const node of manifest.nodes) {
      if (node.resource.kind !== "image-string") continue;
      if (imageStrings[node.resource.manifest]) continue;
      const nestedFiles = extractPrefixedFiles(
        files,
        directoryOf(node.resource.manifest),
      );
      const preparedFiles = mapped
        ? mappedImageStringFiles(files, node.resource.manifest)
        : nestedFiles;
      imageStrings[node.resource.manifest] = mapped
        ? await createImageStringResourceFromResolvedFiles({
            manifest: parseJsonBytes(
              requireBytes(files, node.resource.manifest),
              node.resource.manifest,
            ),
            files: preparedFiles,
            ...(options.decodeImage
              ? { decodeImage: options.decodeImage }
              : {}),
          })
        : await createImageStringResourceFromFiles({
            files: preparedFiles,
            ...(options.decodeImage
              ? { decodeImage: options.decodeImage }
              : {}),
          });
    }

    for (const [bindingId, binding] of symbolBindings(manifest)) {
      const nestedFiles = extractPrefixedFiles(
        files,
        directoryOf(binding.manifest),
      );
      const nestedManifest = parseJsonBytes(
        requireBytes(
          mapped ? files : nestedFiles,
          mapped ? binding.manifest : "symbols.package.json",
        ),
        binding.manifest,
      );
      const preparedFiles = mapped
        ? mappedSymbolFiles(
            files,
            binding.manifest,
            parseSymbolPackageManifest(nestedManifest),
          )
        : nestedFiles;
      const resource = await createSymbolPackageResourceFromResolvedFiles({
        packageManifest: nestedManifest,
        files: preparedFiles,
        loadTextures: options.loadSymbolTextures,
      });
      if (manifest.symbolPackage) symbolPackage = resource;
      else symbolPackages[bindingId] = resource;
      validateBinding(manifest, binding, resource);
    }

    for (const [popupId, popup] of Object.entries(manifest.popups ?? {})) {
      const nestedFiles = extractPrefixedFiles(
        files,
        directoryOf(popup.manifest),
      );
      const nestedManifest = parsePopupManifest(
        parseJsonBytes(
          requireBytes(
            mapped ? files : nestedFiles,
            mapped ? popup.manifest : "popup.manifest.json",
          ),
          popup.manifest,
        ),
      );
      popupPackages[popupId] =
        await createPopupPackageResourceFromResolvedFiles({
          manifest: nestedManifest,
          files: mapped
            ? mappedPopupFiles(files, popup.manifest, nestedManifest)
            : nestedFiles,
          ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
        });
    }

    const imageModules: Record<string, string> = {};
    const skeletonModules: Record<string, unknown> = {};
    const atlasModules: Record<string, string> = {};
    const textureModules: Record<string, string> = {};
    const videoModules: Record<string, string> = {};
    for (const node of manifest.nodes) {
      const resource = node.resource;
      if (resource.kind === "image-string") continue;
      if (resource.kind === "image") {
        imageModules[resource.path] ??= createObjectUrl(
          requireBytes(files, resource.path),
          resource.path,
          objectUrls,
        );
        continue;
      }
      skeletonModules[resource.skeleton] ??= parseJsonBytes(
        requireBytes(files, resource.skeleton),
        resource.skeleton,
      );
      atlasModules[resource.atlas] ??= decodeUtf8(
        requireBytes(files, resource.atlas),
        resource.atlas,
      );
      for (const path of Object.values(resource.textures)) {
        textureModules[path] ??= createObjectUrl(
          requireBytes(files, path),
          path,
          objectUrls,
        );
      }
    }
    for (const transition of manifest.gameModes?.transitions ?? []) {
      const resource = transition.overlay.resource;
      if (resource.kind === "video") {
        const bytes = requireBytes(files, resource.path);
        if (
          bytes.byteLength < 12 ||
          String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp"
        )
          throw new SceneLayoutError(
            `Scene transition video is not an ISO MP4: ${resource.path}.`,
          );
        videoModules[resource.path] ??= createObjectUrl(
          bytes,
          resource.path,
          objectUrls,
        );
        continue;
      }
      skeletonModules[resource.skeleton] ??= parseJsonBytes(
        requireBytes(files, resource.skeleton),
        resource.skeleton,
      );
      atlasModules[resource.atlas] ??= decodeUtf8(
        requireBytes(files, resource.atlas),
        resource.atlas,
      );
      for (const path of Object.values(resource.textures)) {
        textureModules[path] ??= createObjectUrl(
          requireBytes(files, path),
          path,
          objectUrls,
        );
      }
    }

    const layout = createSceneLayoutResource({
      manifest,
      imageModules,
      skeletonModules,
      atlasModules,
      textureModules,
      videoModules,
      imageStringResources: imageStrings,
      ownedObjectUrls: objectUrls,
    });
    let destroyed = false;
    return Object.freeze({
      manifest,
      layout,
      imageStrings: Object.freeze({ ...imageStrings }),
      symbolPackage,
      symbolPackages: Object.freeze({ ...symbolPackages }),
      popupPackages: Object.freeze({ ...popupPackages }),
      destroy(): void {
        if (destroyed) return;
        destroyed = true;
        layout.destroy();
        symbolPackage?.destroy();
        for (const resource of Object.values(symbolPackages))
          resource.destroy();
        for (const popup of Object.values(popupPackages)) void popup.destroy();
      },
    });
  } catch (error) {
    for (const url of objectUrls) URL.revokeObjectURL(url);
    for (const resource of new Set(Object.values(imageStrings))) {
      await resource.destroy();
    }
    symbolPackage?.destroy();
    for (const resource of Object.values(symbolPackages)) resource.destroy();
    for (const popup of Object.values(popupPackages)) await popup.destroy();
    throw error instanceof SceneLayoutError
      ? error
      : new SceneLayoutError(formatError(error));
  }
}

export async function loadSceneLayoutPackageFromUrl(options: {
  readonly manifestUrl: string | URL;
  readonly fetchImpl?: typeof fetch;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadSymbolTextures?: boolean;
}): Promise<SceneLayoutPackageResource> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function")
    throw new SceneLayoutError(
      "fetchImpl is required to load a scene layout package URL.",
    );
  const manifestUrl = new URL(options.manifestUrl);
  if (!/^https?:$/u.test(manifestUrl.protocol))
    throw new SceneLayoutError(
      "Scene layout package manifest URL must use http or https.",
    );
  const files = new Map<string, Uint8Array>();
  const manifestBytes = await fetchBytes(fetchImpl, manifestUrl);
  files.set(ROOT_MANIFEST, manifestBytes);
  const manifest = parseSceneLayoutManifest(
    parseJsonBytes(manifestBytes, ROOT_MANIFEST),
  );

  if (isMappedSceneLayoutManifest(manifest)) {
    const mapBytes = await fetchBytes(
      fetchImpl,
      containedUrl(manifestUrl, EDITOR_ASSETS_MAP_PATH),
    );
    files.set(EDITOR_ASSETS_MAP_PATH, mapBytes);
    const map = decodeEditorAssetsMap(mapBytes);
    for (const entry of Object.values(map.files)) {
      if (files.has(entry.path)) continue;
      files.set(
        entry.path,
        await fetchBytes(fetchImpl, containedUrl(manifestUrl, entry.path)),
      );
    }
    return createSceneLayoutPackageResource({
      manifest,
      files,
      ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
      loadSymbolTextures: options.loadSymbolTextures,
    });
  }

  const direct = collectSceneLayoutAssetPaths(manifest);
  for (const path of direct) {
    const url = containedUrl(manifestUrl, path);
    files.set(path, await fetchBytes(fetchImpl, url));
  }
  for (const node of manifest.nodes) {
    if (node.resource.kind !== "image-string") continue;
    const nested = parseImageStringManifest(
      parseJsonBytes(
        requireBytes(files, node.resource.manifest),
        node.resource.manifest,
      ),
    );
    for (const path of collectImageStringAssetPaths(nested)) {
      const full = resolvePackagePath(node.resource.manifest, path);
      if (files.has(full)) continue;
      files.set(
        full,
        await fetchBytes(fetchImpl, containedUrl(manifestUrl, full)),
      );
    }
  }
  for (const [, binding] of symbolBindings(manifest)) {
    const nested = parseSymbolPackageManifest(
      parseJsonBytes(requireBytes(files, binding.manifest), binding.manifest),
    );
    for (const path of collectSymbolPackageEntryPaths(nested)) {
      const full = resolvePackagePath(binding.manifest, path);
      if (files.has(full)) continue;
      files.set(
        full,
        await fetchBytes(fetchImpl, containedUrl(manifestUrl, full)),
      );
    }
  }
  for (const popup of Object.values(manifest.popups ?? {})) {
    const nested = parsePopupManifest(
      parseJsonBytes(requireBytes(files, popup.manifest), popup.manifest),
    );
    const nestedFiles = new Map<string, Uint8Array>();
    nestedFiles.set("popup.manifest.json", requireBytes(files, popup.manifest));
    const direct = collectPopupDirectPaths(nested);
    for (const path of direct) {
      const full = resolvePackagePath(popup.manifest, path);
      if (!files.has(full))
        files.set(
          full,
          await fetchBytes(fetchImpl, containedUrl(manifestUrl, full)),
        );
      nestedFiles.set(path, requireBytes(files, full));
    }
    await fetchPopupTransitive(
      fetchImpl,
      manifestUrl,
      nested,
      nestedFiles,
      popup.manifest,
      files,
    );
  }
  return createSceneLayoutPackageResource({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    loadSymbolTextures: options.loadSymbolTextures,
  });
}

async function fetchPopupTransitive(
  fetchImpl: typeof fetch,
  layoutManifestUrl: URL,
  manifest: ReturnType<typeof parsePopupManifest>,
  nestedFiles: Map<string, Uint8Array>,
  popupManifestPath: string,
  layoutFiles: Map<string, Uint8Array>,
): Promise<void> {
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image-string") {
      const nested = parseImageStringManifest(
        parseJsonBytes(
          requireBytes(nestedFiles, resource.manifest),
          resource.manifest,
        ),
      );
      for (const path of collectImageStringAssetPaths(nested)) {
        const popupPath = resolvePackagePath(resource.manifest, path);
        const layoutPath = resolvePackagePath(popupManifestPath, popupPath);
        const bytes = await fetchBytes(
          fetchImpl,
          containedUrl(layoutManifestUrl, layoutPath),
        );
        nestedFiles.set(popupPath, bytes);
        layoutFiles.set(layoutPath, bytes);
      }
    } else if (resource.kind === "vni") {
      const project = assertVNIProject(
        parseJsonBytes(
          requireBytes(nestedFiles, resource.project),
          resource.project,
        ),
      );
      for (const asset of project.assets) {
        const popupPath = resolvePackagePath(resource.project, asset.path);
        const layoutPath = resolvePackagePath(popupManifestPath, popupPath);
        const bytes = await fetchBytes(
          fetchImpl,
          containedUrl(layoutManifestUrl, layoutPath),
        );
        nestedFiles.set(popupPath, bytes);
        layoutFiles.set(layoutPath, bytes);
      }
    }
  }
}

function validateBinding(
  manifest: SceneLayoutManifestV1,
  binding: NonNullable<SceneLayoutManifestV1["symbolPackage"]>,
  resource: SymbolPackageResource,
): void {
  const reel = manifest.reels.main;
  if (!reel) return;
  const prefix = `Scene layout "${manifest.id}" symbol binding to package "${resource.packageManifest.id}"`;
  if (
    resource.packageManifest.cellSize.width !== reel.cellSize.width ||
    resource.packageManifest.cellSize.height !== reel.cellSize.height
  ) {
    throw new SceneLayoutError(
      `${prefix} cellSize mismatch: layout=${reel.cellSize.width}x${reel.cellSize.height}, package=${resource.packageManifest.cellSize.width}x${resource.packageManifest.cellSize.height}.`,
    );
  }
  let reels;
  try {
    reels = resource.gameConfig.getReels(binding.reelSet);
  } catch (error) {
    throw new SceneLayoutError(
      `${prefix} reelSet "${binding.reelSet}" is missing: ${formatError(error)}`,
    );
  }
  if (reels.getReelCount() !== reel.columns) {
    throw new SceneLayoutError(
      `${prefix} reel count ${reels.getReelCount()} does not match layout columns ${reel.columns}.`,
    );
  }
  const displayCodes = new Set(
    resource.displaySymbols.map((symbol) =>
      resource.gameConfig.getSymbolCode(symbol),
    ),
  );
  for (let x = 0; x < reels.getReelCount(); x += 1) {
    for (let y = 0; y < reels.getLength(x); y += 1) {
      const code = reels.get(x, y);
      if (!displayCodes.has(code))
        throw new SceneLayoutError(
          `${prefix} public reel contains non-display code ${code}.`,
        );
    }
  }
}

function symbolBindings(
  manifest: SceneLayoutManifestV1,
): readonly (readonly [
  string,
  NonNullable<SceneLayoutManifestV1["symbolPackage"]>,
])[] {
  if (manifest.symbolPackage) {
    return Object.freeze([
      Object.freeze([
        manifest.symbolPackage.manifest.split("/").at(-2)!,
        manifest.symbolPackage,
      ] as const),
    ]);
  }
  return Object.freeze(
    Object.entries(manifest.symbolPackages ?? {}).map(([id, binding]) =>
      Object.freeze([id, binding] as const),
    ),
  );
}

export async function resolveSceneLayoutPackageFiles(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): Promise<ReadonlyMap<string, Uint8Array>> {
  const manifest = parseSceneLayoutManifest(options.manifest);
  const mapped = isMappedSceneLayoutManifest(manifest);
  const hasMap = options.files.has(EDITOR_ASSETS_MAP_PATH);
  if (mapped !== hasMap)
    throw new SceneLayoutError(
      mapped
        ? "Filename-key scene layout package is missing assets.map.json."
        : "Legacy scene layout package must not contain assets.map.json.",
    );
  if (!mapped) return options.files;
  const map = decodeEditorAssetsMap(
    requireBytes(options.files, EDITOR_ASSETS_MAP_PATH),
  );
  const resolved = await validateEditorAssetsMapPackage({
    map,
    files: options.files,
    allowControlPaths: [ROOT_MANIFEST],
  });
  const virtual = new Map<string, Uint8Array>([
    [ROOT_MANIFEST, requireBytes(options.files, ROOT_MANIFEST).slice()],
  ]);
  for (const [key, asset] of resolved) virtual.set(key, asset.bytes.slice());
  collectSceneLayoutPackagePaths({ manifest, files: virtual });
  return virtual;
}

function isMappedSceneLayoutManifest(manifest: SceneLayoutManifestV1): boolean {
  const references = collectSceneLayoutAssetPaths(manifest);
  const hasFilenameKey = references.some((path) => !path.includes("/"));
  const hasDirectPath = references.some((path) => path.includes("/"));
  if (hasFilenameKey && hasDirectPath)
    throw new SceneLayoutError(
      "Scene layout package must not mix filename keys with direct package paths.",
    );
  return hasFilenameKey;
}

function mappedImageStringFiles(
  files: ReadonlyMap<string, Uint8Array>,
  rootKey: string,
): ReadonlyMap<string, Uint8Array> {
  const manifest = parseImageStringManifest(
    parseJsonBytes(requireBytes(files, rootKey), rootKey),
  );
  return new Map([
    ["image-string.manifest.json", requireBytes(files, rootKey).slice()],
    ...collectImageStringAssetPaths(manifest).map(
      (key) => [key, requireBytes(files, key).slice()] as const,
    ),
  ]);
}

function mappedSymbolFiles(
  files: ReadonlyMap<string, Uint8Array>,
  rootKey: string,
  manifest: ReturnType<typeof parseSymbolPackageManifest>,
): ReadonlyMap<string, Uint8Array> {
  return new Map([
    ["symbols.package.json", requireBytes(files, rootKey).slice()],
    ...[
      manifest.entrypoints.gameConfig,
      manifest.entrypoints.symbolManifest,
      ...manifest.resources,
    ].map((key) => [key, requireBytes(files, key).slice()] as const),
  ]);
}

function mappedPopupFiles(
  files: ReadonlyMap<string, Uint8Array>,
  rootKey: string,
  manifest: ReturnType<typeof parsePopupManifest>,
): ReadonlyMap<string, Uint8Array> {
  const keys = new Set(collectPopupDirectPaths(manifest));
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image-string") {
      const nested = parseImageStringManifest(
        parseJsonBytes(
          requireBytes(files, resource.manifest),
          resource.manifest,
        ),
      );
      for (const key of collectImageStringAssetPaths(nested)) keys.add(key);
    } else if (resource.kind === "vni") {
      const project = assertVNIProject(
        parseJsonBytes(requireBytes(files, resource.project), resource.project),
      );
      for (const asset of project.assets) keys.add(asset.path);
    }
  }
  const result = new Map<string, Uint8Array>([
    ["popup.manifest.json", requireBytes(files, rootKey).slice()],
  ]);
  for (const key of keys) result.set(key, requireBytes(files, key).slice());
  collectPopupPackagePaths({ manifest, files: result });
  return result;
}

function extractPrefixedFiles(
  files: ReadonlyMap<string, Uint8Array>,
  directory: string,
): ReadonlyMap<string, Uint8Array> {
  const prefix = `${directory}/`;
  return new Map(
    [...files.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, bytes]) => [path.slice(prefix.length), bytes] as const),
  );
}

function directoryOf(path: string): string {
  return path.slice(0, path.lastIndexOf("/"));
}

function createObjectUrl(
  bytes: Uint8Array,
  path: string,
  owned: string[],
): string {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: mimeType(path) }),
  );
  owned.push(url);
  return url;
}

async function fetchBytes(
  fetchImpl: typeof fetch,
  url: URL,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout package fetch failed for ${url.href}: ${formatError(error)}`,
    );
  }
  if (!response.ok)
    throw new SceneLayoutError(
      `Scene layout package fetch failed for ${url.href}: HTTP ${response.status}.`,
    );
  return new Uint8Array(await response.arrayBuffer());
}

function containedUrl(manifestUrl: URL, path: string): URL {
  const url = new URL(path, manifestUrl);
  const base = manifestUrl.pathname.slice(
    0,
    manifestUrl.pathname.lastIndexOf("/") + 1,
  );
  if (url.origin !== manifestUrl.origin || !url.pathname.startsWith(base))
    throw new SceneLayoutError(
      `Scene layout package path escapes its root: ${path}.`,
    );
  return url;
}

function requireBytes(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes)
    throw new SceneLayoutError(
      `Scene layout package file is missing: ${path}.`,
    );
  return bytes;
}

function parseJsonBytes(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(decodeUtf8(bytes, path));
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout JSON "${path}" is invalid: ${formatError(error)}`,
    );
  }
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout text "${path}" is invalid UTF-8: ${formatError(error)}`,
    );
  }
}

function mimeType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((path, index) => path === right[index])
  );
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
