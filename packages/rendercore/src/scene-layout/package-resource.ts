import {
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
  resolvePackagePath,
} from "@slotclientengine/browserartifactio";
import { EDITOR_ASSETS_MAP_PATH } from "@slotclientengine/editorresource";
import type {
  ResolvedAudioEffect,
  ResolvedAudioEventTrack,
  ResolvedAudioMusic,
} from "@slotclientengine/audiocore/core";
import type {
  AudioEffectBindingV1,
  AudioEventTrackBindingV1,
  AudioMediaType,
  AudioMusicBindingV1,
} from "@slotclientengine/audiocore/data";
import {
  assertVNIProject,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/data";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
  validateImageStringText,
} from "../image-string/data/index.js";
import {
  createImageStringResourceFromResolvedFiles,
  type DecodeImageStringImage,
  type ImageStringResource,
} from "../image-string/core/index.js";
import { createImageStringResourceFromFiles } from "../image-string/package-runtime.js";
import {
  collectSymbolPackageEntryPaths,
  createSymbolPackageResourceFromResolvedFiles,
  parseSymbolPackageManifest,
  validateSymbolPackageContents,
  type SymbolPackageResource,
} from "../symbol/package.js";
import {
  collectPopupPackagePaths,
  createPopupPackageResourceFromResolvedFiles,
} from "../popup/package-resource.js";
import {
  collectPopupDirectPaths,
  loadPopupManifest,
  type LatestPopupManifest,
} from "../popup/data/index.js";
import type { PopupPackageResource } from "../popup/core/types.js";
import { validateOfficialSpineResource } from "../spine/runtime-player.js";
import { SceneLayoutError } from "./errors.js";
import {
  parseSceneLayoutJsonData,
  type SceneLayoutJsonData,
} from "./data/json-data.js";
import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifest,
  parseSceneLayoutManifestDocument,
} from "./manifest.js";
import { materializeInitialSceneLayoutManifest } from "./manifest-v2.js";
import { upgradeSceneLayoutManifestToLatest } from "./manifest-v3.js";
import { createSceneLayoutResource } from "./resource.js";
import type {
  SceneLayoutManifest,
  SceneLayoutManifestV1,
  SceneLayoutPackageResource,
  SceneLayoutRuntimeResource,
  SceneLayoutRuntimeResourceSpec,
} from "./types.js";

const ROOT_MANIFEST = "layout.manifest.json";

/** Returns the Symbols package selected by the layout's initial stable mode. */
export function getInitialSceneLayoutSymbolPackageResource(
  resource: SceneLayoutPackageResource,
): SymbolPackageResource {
  const manifest =
    resource.runtimeManifest ??
    (resource.manifest.version
      ? upgradeSceneLayoutManifestToLatest(resource.manifest)
      : (resource.manifest as never));
  if (manifest.symbolPackage) {
    if (!resource.symbolPackage)
      throw new SceneLayoutError(
        "Scene layout legacy symbol package resource is unavailable.",
      );
    return resource.symbolPackage;
  }
  const modes = manifest.gameModes;
  const initialMode = modes?.modes.find(
    (mode) => mode.id === modes.initialMode,
  );
  const id = initialMode?.symbolPackage;
  const symbols = id ? resource.symbolPackages[id] : undefined;
  if (!id || !symbols)
    throw new SceneLayoutError(
      "Scene layout initial mode has no active symbol package resource.",
    );
  return symbols;
}

export function collectSceneLayoutPackagePaths(options: {
  readonly manifest: SceneLayoutManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly allowExtraFiles?: boolean;
}): readonly string[] {
  const manifest = parseSceneLayoutManifestDocument(options.manifest);
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
    if (node.resource.kind === "vni") {
      const project = parseRuntimeVniProject(
        requireBytes(options.files, node.resource.project),
        node.resource.project,
      );
      for (const asset of project.assets) {
        expected.add(
          mapped
            ? asset.path
            : resolvePackagePath(node.resource.project, asset.path),
        );
      }
      continue;
    }
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
  for (const resource of Object.values(manifest.runtimeResources ?? {})) {
    if (resource.kind === "vni") {
      const project = parseRuntimeVniProject(
        requireBytes(options.files, resource.project),
        resource.project,
      );
      for (const asset of project.assets)
        expected.add(
          mapped
            ? asset.path
            : resolvePackagePath(resource.project, asset.path),
        );
      continue;
    }
    if (resource.kind !== "image-string") continue;
    const nested = parseImageStringManifest(
      parseJsonBytes(
        requireBytes(options.files, resource.manifest),
        resource.manifest,
      ),
    );
    for (const path of collectImageStringAssetPaths(nested))
      expected.add(mapped ? path : resolvePackagePath(resource.manifest, path));
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
    const nested = loadPopupManifest(nestedValue).manifest;
    if (nested.type !== popup.type) {
      throw new SceneLayoutError(
        `Scene layout popup type mismatch at "${popup.manifest}": binding=${popup.type}, nested=${nested.type}.`,
      );
    }
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
  if (!options.allowExtraFiles && !samePaths(sortedExpected, sortedActual)) {
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
  readonly lazyRuntimeResources?: boolean;
  readonly lazyPopupResources?: boolean;
  readonly loadRuntimeResourceBytes?: (
    logicalKey: string,
  ) => Promise<Uint8Array>;
  readonly resolveAssetUrl?: (logicalKey: string) => string | undefined;
}): Promise<SceneLayoutPackageResource> {
  const manifestValue =
    options.manifest ??
    parseJsonBytes(requireBytes(options.files, ROOT_MANIFEST), ROOT_MANIFEST);
  const manifest = parseSceneLayoutManifestDocument(manifestValue);
  const files = await resolveSceneLayoutPackageFiles({
    manifest,
    files: options.files,
    allowMissingRuntimeResources:
      options.lazyRuntimeResources === true &&
      options.loadRuntimeResourceBytes !== undefined,
  });
  const loadRuntimeResourceBytes = options.loadRuntimeResourceBytes
    ? createMappedLogicalLoader(options.files, options.loadRuntimeResourceBytes)
    : undefined;
  return createSceneLayoutPackageResourceFromResolvedFiles({
    manifest,
    files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
    loadSymbolTextures: options.loadSymbolTextures,
    lazyRuntimeResources: options.lazyRuntimeResources,
    lazyPopupResources: options.lazyPopupResources,
    ...(loadRuntimeResourceBytes ? { loadRuntimeResourceBytes } : {}),
    ...(options.resolveAssetUrl
      ? { resolveAssetUrl: options.resolveAssetUrl }
      : {}),
  });
}

export async function createSceneLayoutPackageResourceFromResolvedFiles(options: {
  readonly manifest?: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly decodeImage?: DecodeImageStringImage;
  readonly loadSymbolTextures?: boolean;
  readonly lazyRuntimeResources?: boolean;
  readonly lazyPopupResources?: boolean;
  readonly loadRuntimeResourceBytes?: (
    logicalKey: string,
  ) => Promise<Uint8Array>;
  readonly resolveAssetUrl?: (logicalKey: string) => string | undefined;
}): Promise<SceneLayoutPackageResource> {
  const sourceManifestValue =
    options.manifest ??
    parseJsonBytes(requireBytes(options.files, ROOT_MANIFEST), ROOT_MANIFEST);
  const sourceDocument = parseSceneLayoutManifestDocument(sourceManifestValue);
  const manifest = upgradeSceneLayoutManifestToLatest(sourceDocument);
  const files = options.files;
  if (!options.lazyRuntimeResources)
    collectSceneLayoutPackagePaths({ manifest, files });
  const mapped = isMappedSceneLayoutManifest(manifest);

  const imageStrings: Record<string, ImageStringResource> = {};
  let symbolPackage: SymbolPackageResource | null = null;
  const symbolPackages: Record<string, SymbolPackageResource> = {};
  const popupPackages: Record<string, PopupPackageResource> = {};
  const popupManifests: Record<string, LatestPopupManifest> = {};
  const popupDefinitions: Record<
    string,
    {
      readonly bindingManifest: string;
      readonly manifest: LatestPopupManifest;
    }
  > = {};
  const vniResources: Record<
    string,
    { readonly project: VNIProjectConfig; readonly assetUrls: AssetUrlManifest }
  > = {};
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
            ...(options.resolveAssetUrl
              ? { resolveAssetUrl: options.resolveAssetUrl }
              : {}),
          })
        : await createImageStringResourceFromFiles({
            files: preparedFiles,
            ...(options.decodeImage
              ? { decodeImage: options.decodeImage }
              : {}),
          });
    }
    for (const resource of options.lazyRuntimeResources
      ? []
      : Object.values(manifest.runtimeResources ?? {})) {
      if (resource.kind !== "image-string" || imageStrings[resource.manifest])
        continue;
      const nestedFiles = extractPrefixedFiles(
        files,
        directoryOf(resource.manifest),
      );
      imageStrings[resource.manifest] = mapped
        ? await createImageStringResourceFromResolvedFiles({
            manifest: parseJsonBytes(
              requireBytes(files, resource.manifest),
              resource.manifest,
            ),
            files: mappedImageStringFiles(files, resource.manifest),
            ...(options.decodeImage
              ? { decodeImage: options.decodeImage }
              : {}),
            ...(options.resolveAssetUrl
              ? { resolveAssetUrl: options.resolveAssetUrl }
              : {}),
          })
        : await createImageStringResourceFromFiles({
            files: nestedFiles,
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
        ...(options.resolveAssetUrl
          ? { resolveAssetUrl: options.resolveAssetUrl }
          : {}),
      });
      if (manifest.symbolPackage) symbolPackage = resource;
      else symbolPackages[bindingId] = resource;
      validateBinding(manifest, binding, resource);
    }

    const createPopupResource = async (definition: {
      readonly bindingManifest: string;
      readonly manifest: LatestPopupManifest;
    }): Promise<PopupPackageResource> => {
      const nestedFiles = extractPrefixedFiles(
        files,
        directoryOf(definition.bindingManifest),
      );
      return createPopupPackageResourceFromResolvedFiles({
        manifest: definition.manifest,
        files: mapped
          ? mappedPopupFiles(
              files,
              definition.bindingManifest,
              definition.manifest,
            )
          : nestedFiles,
        ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
        ...(options.resolveAssetUrl
          ? { resolveAssetUrl: options.resolveAssetUrl }
          : {}),
      });
    };
    for (const [popupId, popup] of Object.entries(manifest.popups ?? {})) {
      const nestedManifest = loadPopupManifest(
        parseJsonBytes(
          requireBytes(
            mapped
              ? files
              : extractPrefixedFiles(files, directoryOf(popup.manifest)),
            mapped ? popup.manifest : "popup.manifest.json",
          ),
          popup.manifest,
        ),
      ).manifest;
      popupManifests[popupId] = nestedManifest;
      const definition = Object.freeze({
        bindingManifest: popup.manifest,
        manifest: nestedManifest,
      });
      popupDefinitions[popupId] = definition;
      if (!options.lazyPopupResources)
        popupPackages[popupId] = await createPopupResource(definition);
    }

    const audioUrls = new Map<string, string>();
    const resolveAudioPath = (
      path: string,
      mediaType: AudioMediaType,
      ownerManifest?: string,
    ): string => {
      const filePath = mapped
        ? path
        : ownerManifest
          ? resolvePackagePath(ownerManifest, path)
          : path;
      const cacheKey = `${filePath}\0${mediaType}`;
      let url = audioUrls.get(cacheKey);
      if (!url) {
        url =
          options.resolveAssetUrl?.(filePath) ??
          createObjectUrl(
            requireBytes(files, filePath),
            filePath,
            objectUrls,
            mediaType,
          );
        audioUrls.set(cacheKey, url);
      }
      return url;
    };
    const resolveEffect = (
      binding: AudioEffectBindingV1,
      ownerManifest?: string,
    ): ResolvedAudioEffect =>
      Object.freeze({
        binding,
        sources: Object.freeze(
          binding.asset.sources.map((source) =>
            Object.freeze({
              url: resolveAudioPath(
                source.path,
                source.mediaType,
                ownerManifest,
              ),
              mediaType: source.mediaType,
            }),
          ),
        ),
      });
    const resolveMusic = (binding: AudioMusicBindingV1): ResolvedAudioMusic =>
      Object.freeze({
        binding,
        sources: Object.freeze(
          binding.asset.sources.map((source) =>
            Object.freeze({
              url: resolveAudioPath(source.path, source.mediaType),
              mediaType: source.mediaType,
            }),
          ),
        ),
      });
    const resolveEventTrack = (
      binding: AudioEventTrackBindingV1,
    ): ResolvedAudioEventTrack =>
      Object.freeze({
        binding,
        sources: Object.freeze(
          binding.asset.sources.map((source) =>
            Object.freeze({
              url: resolveAudioPath(source.path, source.mediaType),
              mediaType: source.mediaType,
            }),
          ),
        ),
      });
    const audioEffects: Record<string, ResolvedAudioEffect> = {};
    const addEffect = (
      route: string,
      binding: AudioEffectBindingV1,
      ownerManifest?: string,
    ) => {
      if (audioEffects[route])
        throw new SceneLayoutError(
          `Duplicate aggregated audio route: ${route}.`,
        );
      audioEffects[route] = resolveEffect(binding, ownerManifest);
    };
    for (const effect of manifest.audio.effects) addEffect(effect.name, effect);
    for (const [bindingId, binding] of symbolBindings(manifest)) {
      const resource = manifest.symbolPackage
        ? symbolPackage
        : symbolPackages[bindingId];
      if (!resource)
        throw new SceneLayoutError(
          `Symbol package resource "${bindingId}" is unavailable for audio aggregation.`,
        );
      for (const effect of resource.symbolManifest.audio.effects)
        addEffect(`${bindingId}.${effect.name}`, effect, binding.manifest);
    }
    for (const [popupId, binding] of Object.entries(manifest.popups ?? {})) {
      const popupManifest = popupManifests[popupId];
      if (!popupManifest)
        throw new SceneLayoutError(
          `Popup package manifest "${popupId}" is unavailable for audio aggregation.`,
        );
      if (!("audio" in popupManifest)) continue;
      for (const effect of popupManifest.audio.effects)
        addEffect(`${popupId}.${effect.name}`, effect, binding.manifest);
    }
    const programmaticAudioEffects = new Set(
      manifest.audio.programmaticEffects,
    );
    for (const route of programmaticAudioEffects)
      if (!audioEffects[route])
        throw new SceneLayoutError(
          `Programmatic audio route is not declared by the Scene Layout package: ${route}.`,
        );
    const audioMusic = Object.fromEntries(
      manifest.audio.music.map((binding) => [
        binding.name,
        resolveMusic(binding),
      ]),
    ) as Record<string, ResolvedAudioMusic>;
    const audioEventTracks: Record<string, ResolvedAudioEventTrack> = {};
    for (const { audio } of manifest.eventAudio.bindings) {
      if (audioEventTracks[audio.name])
        throw new SceneLayoutError(
          `Duplicate event audio track name: ${audio.name}.`,
        );
      audioEventTracks[audio.name] = resolveEventTrack(audio);
    }

    const imageModules: Record<string, string> = {};
    const skeletonModules: Record<string, unknown> = {};
    const atlasModules: Record<string, string> = {};
    const textureModules: Record<string, string> = {};
    const videoModules: Record<string, string> = {};
    const jsonDataModules: Record<string, SceneLayoutJsonData> = {};
    for (const node of manifest.nodes) {
      const resource = node.resource;
      if (resource.kind === "image-string") continue;
      if (resource.kind === "vni") {
        if (!vniResources[resource.project]) {
          const project = parseRuntimeVniProject(
            requireBytes(files, resource.project),
            resource.project,
          );
          const assetUrls: Record<string, string> = {};
          for (const asset of project.assets) {
            const filePath = mapped
              ? asset.path
              : resolvePackagePath(resource.project, asset.path);
            assetUrls[asset.path] =
              options.resolveAssetUrl?.(filePath) ??
              createObjectUrl(
                requireBytes(files, filePath),
                filePath,
                objectUrls,
              );
          }
          vniResources[resource.project] = Object.freeze({
            project,
            assetUrls: resolveProjectAssetUrls(project, assetUrls),
          });
        }
        continue;
      }
      if (resource.kind === "image") {
        imageModules[resource.path] ??=
          options.resolveAssetUrl?.(resource.path) ??
          createObjectUrl(
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
        textureModules[path] ??=
          options.resolveAssetUrl?.(path) ??
          createObjectUrl(requireBytes(files, path), path, objectUrls);
      }
    }
    for (const resource of options.lazyRuntimeResources
      ? []
      : Object.values(manifest.runtimeResources ?? {})) {
      if (resource.kind === "image-string") continue;
      if (resource.kind === "vni") {
        if (!vniResources[resource.project]) {
          const project = parseRuntimeVniProject(
            requireBytes(files, resource.project),
            resource.project,
          );
          const assetUrls: Record<string, string> = {};
          for (const asset of project.assets) {
            const filePath = mapped
              ? asset.path
              : resolvePackagePath(resource.project, asset.path);
            assetUrls[asset.path] =
              options.resolveAssetUrl?.(filePath) ??
              createObjectUrl(
                requireBytes(files, filePath),
                filePath,
                objectUrls,
              );
          }
          vniResources[resource.project] = Object.freeze({
            project,
            assetUrls: resolveProjectAssetUrls(project, assetUrls),
          });
        }
        continue;
      }
      if (resource.kind === "image") {
        imageModules[resource.path] ??=
          options.resolveAssetUrl?.(resource.path) ??
          createObjectUrl(
            requireBytes(files, resource.path),
            resource.path,
            objectUrls,
          );
        continue;
      }
      if (resource.kind === "video") {
        const resolved = options.resolveAssetUrl?.(resource.path);
        const bytes = resolved ? undefined : requireBytes(files, resource.path);
        if (
          bytes &&
          (bytes.byteLength < 12 ||
            String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp")
        )
          throw new SceneLayoutError(
            `Scene runtime video is not an ISO MP4: ${resource.path}.`,
          );
        videoModules[resource.path] ??=
          resolved ?? createObjectUrl(bytes!, resource.path, objectUrls);
        continue;
      }
      if (resource.kind === "json") {
        jsonDataModules[resource.path] ??= parseSceneLayoutJsonData(
          requireBytes(files, resource.path),
          resource.path,
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
      for (const path of Object.values(resource.textures))
        textureModules[path] ??=
          options.resolveAssetUrl?.(path) ??
          createObjectUrl(requireBytes(files, path), path, objectUrls);
    }
    for (const transition of manifest.gameModes?.transitions ?? []) {
      if ("kind" in transition.overlay) continue;
      const resource = transition.overlay.resource;
      if (resource.kind === "video") {
        const resolved = options.resolveAssetUrl?.(resource.path);
        const bytes = resolved ? undefined : requireBytes(files, resource.path);
        if (
          bytes &&
          (bytes.byteLength < 12 ||
            String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp")
        )
          throw new SceneLayoutError(
            `Scene transition video is not an ISO MP4: ${resource.path}.`,
          );
        videoModules[resource.path] ??=
          resolved ?? createObjectUrl(bytes!, resource.path, objectUrls);
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
        textureModules[path] ??=
          options.resolveAssetUrl?.(path) ??
          createObjectUrl(requireBytes(files, path), path, objectUrls);
      }
    }

    const materializedLayout =
      sourceDocument.version === 1
        ? sourceDocument
        : materializeInitialSceneLayoutManifest(manifest);
    const layoutManifest = options.lazyRuntimeResources
      ? parseSceneLayoutManifest({
          ...materializedLayout,
          runtimeResources: undefined,
        })
      : materializedLayout;
    const layout = createSceneLayoutResource({
      manifest: layoutManifest,
      allowOrientationPlacements: sourceDocument.version !== 1,
      imageModules,
      skeletonModules,
      atlasModules,
      textureModules,
      videoModules,
      jsonDataModules,
      imageStringResources: imageStrings,
      vniResources,
      ownedObjectUrls: objectUrls,
    });
    const runtimeResources: Record<string, SceneLayoutRuntimeResource> = {
      ...layout.runtimeResources,
    };
    const runtimeLoads = new Map<string, Promise<SceneLayoutRuntimeResource>>();
    const popupLoads = new Map<string, Promise<PopupPackageResource>>();
    const lazyFiles = new Map(files);
    const lazyImageStrings: ImageStringResource[] = [];
    let destroyed = false;
    return Object.freeze({
      manifest: layoutManifest,
      runtimeManifest: manifest,
      layout,
      imageStrings: Object.freeze({ ...imageStrings }),
      symbolPackage,
      symbolPackages: Object.freeze({ ...symbolPackages }),
      popupManifests: Object.freeze({ ...popupManifests }),
      popupPackages: Object.freeze({ ...popupPackages }),
      getLoadedPopupPackage(id: string): PopupPackageResource | null {
        return popupPackages[id] ?? null;
      },
      loadPopupPackage(id: string): Promise<PopupPackageResource> {
        if (destroyed)
          return Promise.reject(
            new SceneLayoutError(
              "Scene layout package resource was destroyed.",
            ),
          );
        const loaded = popupPackages[id];
        if (loaded) return Promise.resolve(loaded);
        const existing = popupLoads.get(id);
        if (existing) return existing;
        const definition = popupDefinitions[id];
        if (!definition)
          return Promise.reject(
            new SceneLayoutError(
              `Scene layout Popup package "${id}" is unavailable.`,
            ),
          );
        const pending = createPopupResource(definition).then(
          async (resource) => {
            if (destroyed) {
              await resource.destroy();
              throw new SceneLayoutError(
                "Scene layout package resource was destroyed during Popup loading.",
              );
            }
            popupPackages[id] = resource;
            return resource;
          },
        );
        popupLoads.set(id, pending);
        void pending
          .finally(() => popupLoads.delete(id))
          .catch(() => undefined);
        return pending;
      },
      audioEffects: Object.freeze(audioEffects),
      audioMusic: Object.freeze(audioMusic),
      audioEventTracks: Object.freeze(audioEventTracks),
      programmaticAudioEffects: Object.freeze(programmaticAudioEffects),
      runtimeResources,
      getLoadedRuntimeResource<Kind extends SceneLayoutRuntimeResource["kind"]>(
        key: string,
        kind: Kind,
      ) {
        const resource = runtimeResources[key];
        if (!resource) return null;
        assertRuntimeResourceKind(key, resource, kind);
        return resource as Extract<
          SceneLayoutRuntimeResource,
          { readonly kind: Kind }
        >;
      },
      async loadRuntimeResource<
        Kind extends SceneLayoutRuntimeResource["kind"],
      >(key: string, kind: Kind) {
        if (destroyed)
          throw new SceneLayoutError(
            "Scene layout package resource was destroyed.",
          );
        const loaded = runtimeResources[key];
        if (loaded) {
          assertRuntimeResourceKind(key, loaded, kind);
          return loaded as Extract<
            SceneLayoutRuntimeResource,
            { readonly kind: Kind }
          >;
        }
        const spec = manifest.runtimeResources?.[key];
        if (!spec)
          throw new SceneLayoutError(
            `Scene layout runtime resource "${key}" was not found.`,
          );
        if (spec.kind !== kind)
          throw new SceneLayoutError(
            `Scene layout runtime resource "${key}" must be ${kind}; actual ${spec.kind}.`,
          );
        let pending = runtimeLoads.get(key);
        if (!pending) {
          const pendingObjectUrls: string[] = [];
          pending = prepareLazyRuntimeResource({
            key,
            spec,
            files,
            lazyFiles,
            loadRuntimeResourceBytes: options.loadRuntimeResourceBytes,
            mapped,
            objectUrls: pendingObjectUrls,
            lazyImageStrings,
            ...(options.decodeImage
              ? { decodeImage: options.decodeImage }
              : {}),
            ...(options.resolveAssetUrl
              ? { resolveAssetUrl: options.resolveAssetUrl }
              : {}),
          }).then(
            (resource) => {
              if (destroyed) {
                for (const url of pendingObjectUrls) URL.revokeObjectURL(url);
                if (resource.kind === "image-string")
                  void resource.resource.destroy();
                throw new SceneLayoutError(
                  "Scene layout package resource was destroyed during runtime resource loading.",
                );
              }
              objectUrls.push(...pendingObjectUrls);
              runtimeResources[key] = resource;
              return resource;
            },
            (error: unknown) => {
              for (const url of pendingObjectUrls) URL.revokeObjectURL(url);
              throw error;
            },
          );
          runtimeLoads.set(key, pending);
          void pending.catch(() => runtimeLoads.delete(key));
        }
        return pending as Promise<
          Extract<SceneLayoutRuntimeResource, { readonly kind: Kind }>
        >;
      },
      async loadJsonData(key: string): Promise<SceneLayoutJsonData> {
        return (await this.loadRuntimeResource(key, "json")).value;
      },
      destroy(): Promise<void> {
        if (destroyed) return Promise.resolve();
        destroyed = true;
        layout.destroy();
        symbolPackage?.destroy();
        for (const resource of Object.values(symbolPackages))
          resource.destroy();
        const popupDestructions = Object.values(popupPackages).map((popup) =>
          Promise.resolve(popup.destroy()),
        );
        for (const resource of lazyImageStrings) void resource.destroy();
        return Promise.allSettled([
          ...popupLoads.values(),
          ...popupDestructions,
        ]).then(() => undefined);
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

function assertRuntimeResourceKind<
  Kind extends SceneLayoutRuntimeResource["kind"],
>(key: string, resource: SceneLayoutRuntimeResource, kind: Kind): void {
  if (resource.kind !== kind)
    throw new SceneLayoutError(
      `Scene layout runtime resource "${key}" must be ${kind}; actual ${resource.kind}.`,
    );
}

async function prepareLazyRuntimeResource(options: {
  readonly key: string;
  readonly spec: SceneLayoutRuntimeResourceSpec;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly lazyFiles: Map<string, Uint8Array>;
  readonly loadRuntimeResourceBytes?: (
    logicalKey: string,
  ) => Promise<Uint8Array>;
  readonly mapped: boolean;
  readonly objectUrls: string[];
  readonly lazyImageStrings: ImageStringResource[];
  readonly decodeImage?: DecodeImageStringImage;
  readonly resolveAssetUrl?: (logicalKey: string) => string | undefined;
}): Promise<SceneLayoutRuntimeResource> {
  const { key, spec, files, mapped, objectUrls } = options;
  const fetchLazyBytes = async (path: string): Promise<Uint8Array> => {
    if (!options.loadRuntimeResourceBytes)
      throw new SceneLayoutError(`Missing package file: ${path}.`);
    return options.loadRuntimeResourceBytes(path);
  };
  const requireLazyBytes = async (path: string): Promise<Uint8Array> => {
    const existing = options.lazyFiles.get(path);
    if (existing) return existing;
    const loaded = await fetchLazyBytes(path);
    options.lazyFiles.set(path, loaded.slice());
    return loaded;
  };
  if (spec.kind === "image")
    return Object.freeze({
      kind: "image",
      url:
        options.resolveAssetUrl?.(spec.path) ??
        createObjectUrl(
          await requireLazyBytes(spec.path),
          spec.path,
          objectUrls,
        ),
      size: spec.size,
    });
  if (spec.kind === "json") {
    const existing = options.lazyFiles.get(spec.path);
    const bytes = existing ?? (await fetchLazyBytes(spec.path));
    const value = parseSceneLayoutJsonData(bytes, spec.path);
    if (!existing) options.lazyFiles.set(spec.path, bytes.slice());
    return Object.freeze({
      kind: "json",
      value,
    });
  }
  if (spec.kind === "video") {
    const resolved = options.resolveAssetUrl?.(spec.path);
    const bytes = resolved ? undefined : await requireLazyBytes(spec.path);
    if (
      bytes &&
      (bytes.byteLength < 12 ||
        String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp")
    )
      throw new SceneLayoutError(
        `Scene runtime video is not an ISO MP4: ${spec.path}.`,
      );
    return Object.freeze({
      kind: "video",
      url: resolved ?? createObjectUrl(bytes!, spec.path, objectUrls),
      mimeType: "video/mp4",
    });
  }
  if (spec.kind === "spine") {
    const skeleton = parseJsonBytes(
      await requireLazyBytes(spec.skeleton),
      spec.skeleton,
    );
    const atlasText = decodeUtf8(
      await requireLazyBytes(spec.atlas),
      spec.atlas,
    );
    const textureUrls: Record<string, string> = {};
    for (const [page, path] of Object.entries(spec.textures))
      textureUrls[page] =
        options.resolveAssetUrl?.(path) ??
        createObjectUrl(await requireLazyBytes(path), path, objectUrls);
    try {
      validateOfficialSpineResource({
        resource: { skeleton, atlasText, textureUrls },
        requiredAnimations: [],
      });
    } catch (error) {
      throw new SceneLayoutError(
        `Scene layout runtime Spine "${key}" is invalid: ${formatError(error)}`,
      );
    }
    return Object.freeze({
      kind: "spine",
      skeleton,
      atlasText,
      textureUrls: Object.freeze(textureUrls),
    });
  }
  if (spec.kind === "vni") {
    const project = parseRuntimeVniProject(
      await requireLazyBytes(spec.project),
      spec.project,
    );
    const assetUrls: Record<string, string> = {};
    for (const asset of project.assets) {
      const path = mapped
        ? asset.path
        : resolvePackagePath(spec.project, asset.path);
      assetUrls[asset.path] =
        options.resolveAssetUrl?.(path) ??
        createObjectUrl(await requireLazyBytes(path), path, objectUrls);
    }
    return Object.freeze({
      kind: "vni",
      project,
      assetUrls: resolveProjectAssetUrls(project, assetUrls),
    });
  }
  const imageStringManifestBytes = await requireLazyBytes(spec.manifest);
  const imageStringManifestValue = parseJsonBytes(
    imageStringManifestBytes,
    spec.manifest,
  );
  if (mapped) {
    const nested = parseImageStringManifest(imageStringManifestValue);
    for (const path of collectImageStringAssetPaths(nested))
      await requireLazyBytes(path);
  }
  const resource = mapped
    ? await createImageStringResourceFromResolvedFiles({
        manifest: imageStringManifestValue,
        files: mappedImageStringFiles(options.lazyFiles, spec.manifest),
        ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
        ...(options.resolveAssetUrl
          ? { resolveAssetUrl: options.resolveAssetUrl }
          : {}),
      })
    : await createImageStringResourceFromFiles({
        files: extractPrefixedFiles(files, directoryOf(spec.manifest)),
        ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
      });
  options.lazyImageStrings.push(resource);
  return Object.freeze({ kind: "image-string", resource });
}

function parseRuntimeVniProject(
  bytes: Uint8Array,
  path: string,
): VNIProjectConfig {
  const value = parseJsonBytes(bytes, path);
  let project: VNIProjectConfig;
  try {
    project = assertVNIProject(value);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout VNI project "${path}" is invalid: ${formatError(error)}`,
    );
  }
  if (project.exportProfile?.purpose !== "runtime") {
    throw new SceneLayoutError(
      `Scene layout VNI project "${path}" must declare a runtime exportProfile.`,
    );
  }
  return project;
}

export async function loadSceneLayoutPackageFromUrl(options: {
  readonly manifestUrl: string | URL;
  readonly manifestBytes?: Uint8Array;
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
  const manifestBytes =
    options.manifestBytes?.slice() ??
    (await fetchBytes(fetchImpl, manifestUrl));
  files.set(ROOT_MANIFEST, manifestBytes);
  const manifest = parseSceneLayoutManifestDocument(
    parseJsonBytes(manifestBytes, ROOT_MANIFEST),
  );

  if (isMappedSceneLayoutManifest(manifest)) {
    const mapBytes = await fetchBytes(
      fetchImpl,
      containedUrl(manifestUrl, EDITOR_ASSETS_MAP_PATH),
    );
    files.set(EDITOR_ASSETS_MAP_PATH, mapBytes);
    const map = decodeRuntimeAssetsMap(mapBytes);
    for (const key of Object.keys(map.files)) {
      const path = optionalRuntimeAssetPath(map, key);
      if (!path || files.has(path)) continue;
      files.set(
        path,
        await fetchBytes(fetchImpl, containedUrl(manifestUrl, path)),
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
    if (node.resource.kind === "vni") {
      const project = parseRuntimeVniProject(
        requireBytes(files, node.resource.project),
        node.resource.project,
      );
      for (const asset of project.assets) {
        const full = resolvePackagePath(node.resource.project, asset.path);
        if (files.has(full)) continue;
        files.set(
          full,
          await fetchBytes(fetchImpl, containedUrl(manifestUrl, full)),
        );
      }
      continue;
    }
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
  for (const resource of Object.values(manifest.runtimeResources ?? {})) {
    if (resource.kind === "vni") {
      const project = parseRuntimeVniProject(
        requireBytes(files, resource.project),
        resource.project,
      );
      for (const asset of project.assets) {
        const full = resolvePackagePath(resource.project, asset.path);
        if (files.has(full)) continue;
        files.set(
          full,
          await fetchBytes(fetchImpl, containedUrl(manifestUrl, full)),
        );
      }
      continue;
    }
    if (resource.kind !== "image-string") continue;
    const nested = parseImageStringManifest(
      parseJsonBytes(requireBytes(files, resource.manifest), resource.manifest),
    );
    for (const path of collectImageStringAssetPaths(nested)) {
      const full = resolvePackagePath(resource.manifest, path);
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
    const nested = loadPopupManifest(
      parseJsonBytes(requireBytes(files, popup.manifest), popup.manifest),
    ).manifest;
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
  manifest: ReturnType<typeof loadPopupManifest>["manifest"],
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
  manifest: SceneLayoutManifest,
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
  manifest: SceneLayoutManifest,
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
  readonly allowMissingRuntimeResources?: boolean;
}): Promise<ReadonlyMap<string, Uint8Array>> {
  const manifest = parseSceneLayoutManifestDocument(options.manifest);
  const mapped = isMappedSceneLayoutManifest(manifest);
  const hasMap = options.files.has(EDITOR_ASSETS_MAP_PATH);
  if (mapped !== hasMap)
    throw new SceneLayoutError(
      mapped
        ? "Filename-key scene layout package is missing assets.map.json."
        : "Legacy scene layout package must not contain assets.map.json.",
    );
  if (!mapped) {
    const paths = collectSceneLayoutPackagePaths({
      manifest,
      files: options.files,
      allowExtraFiles: true,
    });
    const required = new Map<string, Uint8Array>();
    const rootBytes = options.files.get(ROOT_MANIFEST);
    if (rootBytes) required.set(ROOT_MANIFEST, rootBytes.slice());
    for (const path of paths)
      required.set(path, requireBytes(options.files, path).slice());
    collectSceneLayoutPackagePaths({ manifest, files: required });
    return required;
  }
  return resolveRuntimeMappedSceneLayoutPackageFiles({
    manifest,
    files: options.files,
    allowMissingRuntimeResources: options.allowMissingRuntimeResources,
  });
}

function createMappedLogicalLoader(
  packageFiles: ReadonlyMap<string, Uint8Array>,
  load: (logicalKey: string) => Promise<Uint8Array>,
): (logicalKey: string) => Promise<Uint8Array> {
  const map = decodeRuntimeAssetsMap(
    requireBytes(packageFiles, EDITOR_ASSETS_MAP_PATH),
  );
  return async (logicalKey) => {
    const path = requireRuntimeAssetPath(map, logicalKey);
    const packagedBytes = packageFiles.get(path);
    return packagedBytes
      ? packagedBytes.slice()
      : (await load(logicalKey)).slice();
  };
}

function resolveRuntimeMappedSceneLayoutPackageFiles(options: {
  readonly manifest: SceneLayoutManifest;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly allowMissingRuntimeResources?: boolean;
}): ReadonlyMap<string, Uint8Array> {
  const map = decodeRuntimeAssetsMap(
    requireBytes(options.files, EDITOR_ASSETS_MAP_PATH),
  );
  const virtual = new Map<string, Uint8Array>([
    [ROOT_MANIFEST, requireBytes(options.files, ROOT_MANIFEST).slice()],
  ]);
  for (const key of Object.keys(map.files)) {
    const path = optionalRuntimeAssetPath(map, key);
    if (!path) continue;
    const bytes = options.files.get(path);
    if (bytes) virtual.set(key, bytes.slice());
  }
  const effectiveManifest = options.allowMissingRuntimeResources
    ? parseSceneLayoutManifest({
        ...(options.manifest.version === 1
          ? options.manifest
          : materializeInitialSceneLayoutManifest(options.manifest)),
        runtimeResources: undefined,
      })
    : options.manifest;
  const paths = collectSceneLayoutPackagePaths({
    manifest: effectiveManifest,
    files: virtual,
    allowExtraFiles: true,
  });
  const requiredFiles = new Map<string, Uint8Array>([
    [ROOT_MANIFEST, requireBytes(virtual, ROOT_MANIFEST)],
  ]);
  for (const path of paths)
    requiredFiles.set(path, requireBytes(virtual, path));
  collectSceneLayoutPackagePaths({
    manifest: effectiveManifest,
    files: requiredFiles,
  });
  return requiredFiles;
}

interface RuntimeAssetsMap {
  readonly files: Readonly<Record<string, unknown>>;
}

function decodeRuntimeAssetsMap(bytes: Uint8Array): RuntimeAssetsMap {
  const value = parseJsonBytes(bytes, EDITOR_ASSETS_MAP_PATH);
  if (!isRecord(value))
    throw new SceneLayoutError("Runtime assets.map.json must be an object.");
  if (value.version !== 1 || value.kind !== "editor-assets")
    throw new SceneLayoutError(
      'Runtime assets.map.json must declare version=1 and kind="editor-assets".',
    );
  if (!isRecord(value.files))
    throw new SceneLayoutError(
      "Runtime assets.map.json files must be an object.",
    );
  return Object.freeze({ files: value.files });
}

function optionalRuntimeAssetPath(
  map: RuntimeAssetsMap,
  logicalKey: string,
): string | null {
  if (!Object.hasOwn(map.files, logicalKey)) return null;
  const entry = map.files[logicalKey];
  if (!isRecord(entry) || typeof entry.path !== "string") return null;
  try {
    assertCanonicalPackagePath(logicalKey);
    assertCanonicalPackagePath(entry.path);
  } catch {
    return null;
  }
  if (logicalKey.includes("/") || !entry.path.startsWith("assets/"))
    return null;
  return entry.path;
}

function requireRuntimeAssetPath(
  map: RuntimeAssetsMap,
  logicalKey: string,
): string {
  const path = optionalRuntimeAssetPath(map, logicalKey);
  if (!path)
    throw new SceneLayoutError(
      `Scene layout runtime logical asset "${logicalKey}" does not declare a safe mapped path.`,
    );
  return path;
}

function isMappedSceneLayoutManifest(manifest: SceneLayoutManifest): boolean {
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
  manifest: ReturnType<typeof loadPopupManifest>["manifest"],
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
  type = mimeType(path),
): string {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
