import { validateOfficialSpineResource } from "../spine/runtime-player.js";
import {
  assertVNIProject,
  resolveProjectAssetUrls,
  type AssetUrlManifest,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/data";
import { validateImageStringText } from "../image-string/data/index.js";
import type { ImageStringResource } from "../image-string/core/index.js";
import { loadImageStringResourceFromUrl } from "../image-string/package-runtime.js";
import { SceneLayoutError } from "./errors.js";
import {
  parseSceneLayoutJsonData,
  type SceneLayoutJsonData,
} from "./data/json-data.js";
import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifestDocument,
} from "./manifest.js";
import { upgradeSceneLayoutManifestToLatest } from "./manifest-v3.js";
import type {
  SceneLayoutResource,
  SceneLayoutRuntimeResource,
} from "./types.js";

export interface CreateSceneLayoutResourceOptions {
  readonly manifest: unknown;
  /** @internal Canonical v6 materialized views carry ordinary L/P placements. */
  readonly allowOrientationPlacements?: boolean;
  readonly imageModules?: Readonly<Record<string, string>>;
  readonly skeletonModules?: Readonly<Record<string, unknown>>;
  readonly atlasModules?: Readonly<Record<string, string>>;
  readonly textureModules?: Readonly<Record<string, string>>;
  readonly videoModules?: Readonly<Record<string, string>>;
  readonly audioModules?: Readonly<Record<string, string>>;
  readonly jsonDataModules?: Readonly<Record<string, SceneLayoutJsonData>>;
  readonly ownedObjectUrls?: readonly string[];
  readonly imageStringResources?: Readonly<Record<string, ImageStringResource>>;
  readonly vniResources?: Readonly<
    Record<
      string,
      {
        readonly project: VNIProjectConfig;
        readonly assetUrls: AssetUrlManifest;
      }
    >
  >;
}

export function createSceneLayoutResource(
  options: CreateSceneLayoutResourceOptions,
): SceneLayoutResource {
  const manifest = upgradeSceneLayoutManifestToLatest(
    parseSceneLayoutManifestDocument(options.manifest),
  );
  const imageModules = normalizeMap(options.imageModules);
  const skeletonModules = normalizeMap(options.skeletonModules);
  const atlasModules = normalizeMap(options.atlasModules);
  const textureModules = normalizeMap(options.textureModules);
  const videoModules = normalizeMap(options.videoModules);
  const audioModules = normalizeMap(options.audioModules);
  const jsonDataModules = normalizeMap(options.jsonDataModules);
  const imagePaths = new Set<string>();
  const skeletonPaths = new Set<string>();
  const atlasPaths = new Set<string>();
  const texturePaths = new Set<string>();
  const imageStringResources: Readonly<Record<string, ImageStringResource>> =
    options.imageStringResources ?? Object.freeze({});
  const imageStringPaths = new Set<string>();
  const vniResources: Readonly<
    Record<
      string,
      {
        readonly project: VNIProjectConfig;
        readonly assetUrls: AssetUrlManifest;
      }
    >
  > = options.vniResources ?? Object.freeze({});
  const vniProjectPaths = new Set<string>();
  const videoPaths = new Set<string>();
  const audioPaths = new Set<string>();
  const jsonDataPaths = new Set<string>();
  const imageUrls: Record<string, string> = {};
  const spineResources: Record<
    string,
    {
      readonly skeleton: unknown;
      readonly atlasText: string;
      readonly textureUrls: Readonly<Record<string, string>>;
    }
  > = {};
  const videoUrls: Record<string, string> = {};
  const runtimeResources: Record<string, SceneLayoutRuntimeResource> = {};

  for (const node of manifest.nodes) {
    if (node.resource.kind === "image") {
      imagePaths.add(node.resource.path);
      imageUrls[node.resource.path] = requireString(
        imageModules,
        node.resource.path,
        "scene layout image",
      );
      continue;
    }
    if (node.resource.kind === "image-string") {
      imageStringPaths.add(node.resource.manifest);
      const nested = imageStringResources[node.resource.manifest];
      if (!nested) {
        throw new SceneLayoutError(
          `Scene layout image-string resource is missing: ${node.resource.manifest}.`,
        );
      }
      nested.assertUsable();
      const directoryId = node.resource.manifest.includes("/")
        ? node.resource.manifest.split("/").at(-2)
        : undefined;
      if (directoryId !== undefined && directoryId !== nested.manifest.id) {
        throw new SceneLayoutError(
          `Scene layout image-string dependency id mismatch for "${node.resource.manifest}": expected ${directoryId}, actual ${nested.manifest.id}.`,
        );
      }
      try {
        validateImageStringText(node.resource.text, nested.manifest);
      } catch (error) {
        throw new SceneLayoutError(
          `Scene layout image-string node "${node.id}" is invalid: ${formatError(error)}`,
        );
      }
      continue;
    }
    if (node.resource.kind === "vni") {
      vniProjectPaths.add(node.resource.project);
      const nested = vniResources[node.resource.project];
      if (!nested) {
        throw new SceneLayoutError(
          `Scene layout VNI resource is missing: ${node.resource.project}.`,
        );
      }
      try {
        assertRuntimeVniProject(nested.project, node.resource.project);
        resolveProjectAssetUrls(nested.project, nested.assetUrls);
      } catch (error) {
        throw new SceneLayoutError(
          `Scene layout VNI node "${node.id}" is invalid: ${formatError(error)}`,
        );
      }
      continue;
    }
    skeletonPaths.add(node.resource.skeleton);
    atlasPaths.add(node.resource.atlas);
    const skeleton = requireValue(
      skeletonModules,
      node.resource.skeleton,
      "scene layout Spine skeleton",
    );
    const atlasText = requireString(
      atlasModules,
      node.resource.atlas,
      "scene layout Spine atlas",
    );
    const textureUrls: Record<string, string> = {};
    for (const [page, path] of Object.entries(node.resource.textures)) {
      texturePaths.add(path);
      textureUrls[page] = requireString(
        textureModules,
        path,
        `scene layout Spine texture "${page}"`,
      );
    }
    try {
      validateOfficialSpineResource({
        resource: { skeleton, atlasText, textureUrls },
        requiredAnimations:
          "stateMachine" in node.resource
            ? [
                ...Object.values(node.resource.stateMachine.states).map(
                  (state) => state.animation,
                ),
                ...node.resource.stateMachine.transitions.map(
                  (transition) => transition.animation,
                ),
              ]
            : [node.resource.defaultAnimation],
      });
    } catch (error) {
      throw new SceneLayoutError(
        `Scene layout Spine node "${node.id}" is invalid: ${formatError(error)}`,
      );
    }
    spineResources[node.id] = Object.freeze({
      skeleton,
      atlasText,
      textureUrls: Object.freeze(textureUrls),
    });
  }

  for (const [key, spec] of Object.entries(manifest.runtimeResources ?? {})) {
    if (spec.kind === "image") {
      imagePaths.add(spec.path);
      const url = requireString(
        imageModules,
        spec.path,
        `scene layout runtime image "${key}"`,
      );
      imageUrls[spec.path] = url;
      runtimeResources[key] = Object.freeze({
        kind: "image",
        url,
        size: spec.size,
      });
      continue;
    }
    if (spec.kind === "image-string") {
      imageStringPaths.add(spec.manifest);
      const nested = imageStringResources[spec.manifest];
      if (!nested)
        throw new SceneLayoutError(
          `Scene layout runtime image-string "${key}" is missing: ${spec.manifest}.`,
        );
      nested.assertUsable();
      runtimeResources[key] = Object.freeze({
        kind: "image-string",
        resource: nested,
      });
      continue;
    }
    if (spec.kind === "vni") {
      vniProjectPaths.add(spec.project);
      const nested = vniResources[spec.project];
      if (!nested)
        throw new SceneLayoutError(
          `Scene layout runtime VNI "${key}" is missing: ${spec.project}.`,
        );
      try {
        assertRuntimeVniProject(nested.project, spec.project);
        resolveProjectAssetUrls(nested.project, nested.assetUrls);
      } catch (error) {
        throw new SceneLayoutError(
          `Scene layout runtime VNI "${key}" is invalid: ${formatError(error)}`,
        );
      }
      runtimeResources[key] = Object.freeze({
        kind: "vni",
        project: nested.project,
        assetUrls: nested.assetUrls,
      });
      continue;
    }
    if (spec.kind === "video") {
      videoPaths.add(spec.path);
      const url = requireString(
        videoModules,
        spec.path,
        `scene layout runtime video "${key}"`,
      );
      videoUrls[spec.path] = url;
      runtimeResources[key] = Object.freeze({
        kind: "video",
        url,
        mimeType: "video/mp4",
      });
      continue;
    }
    if (spec.kind === "json") {
      jsonDataPaths.add(spec.path);
      runtimeResources[key] = Object.freeze({
        kind: "json",
        value: requireValue(
          jsonDataModules,
          spec.path,
          `scene layout runtime JSON data "${key}"`,
        ),
      });
      continue;
    }
    if (spec.kind === "audio") {
      audioPaths.add(spec.path);
      runtimeResources[key] = Object.freeze({
        kind: "audio",
        url: requireString(
          audioModules,
          spec.path,
          `scene layout runtime audio "${key}"`,
        ),
        mediaType: spec.mediaType,
      });
      continue;
    }
    skeletonPaths.add(spec.skeleton);
    atlasPaths.add(spec.atlas);
    const skeleton = requireValue(
      skeletonModules,
      spec.skeleton,
      `scene layout runtime Spine "${key}" skeleton`,
    );
    const atlasText = requireString(
      atlasModules,
      spec.atlas,
      `scene layout runtime Spine "${key}" atlas`,
    );
    const textureUrls: Record<string, string> = {};
    for (const [page, path] of Object.entries(spec.textures)) {
      texturePaths.add(path);
      textureUrls[page] = requireString(
        textureModules,
        path,
        `scene layout runtime Spine "${key}" texture "${page}"`,
      );
    }
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
    runtimeResources[key] = Object.freeze({
      kind: "spine",
      skeleton,
      atlasText,
      textureUrls: Object.freeze(textureUrls),
    });
  }

  for (const transition of manifest.gameModes?.transitions ?? []) {
    const overlay = transition.overlay;
    if ("kind" in overlay) continue;
    const spec = overlay.resource;
    if (spec.kind === "video") {
      videoPaths.add(spec.path);
      videoUrls[spec.path] = requireString(
        videoModules,
        spec.path,
        "scene transition video",
      );
      continue;
    }
    skeletonPaths.add(spec.skeleton);
    atlasPaths.add(spec.atlas);
    const skeleton = requireValue(
      skeletonModules,
      spec.skeleton,
      "scene transition Spine skeleton",
    );
    const atlasText = requireString(
      atlasModules,
      spec.atlas,
      "scene transition Spine atlas",
    );
    const textureUrls: Record<string, string> = {};
    for (const [page, path] of Object.entries(spec.textures)) {
      texturePaths.add(path);
      textureUrls[page] = requireString(
        textureModules,
        path,
        `scene transition Spine texture "${page}"`,
      );
    }
    try {
      validateOfficialSpineResource({
        resource: { skeleton, atlasText, textureUrls },
        requiredAnimations: [
          "animation" in overlay ? overlay.animation : unreachableVideo(),
        ],
        requiredAnimationEvents: {
          ["animation" in overlay ? overlay.animation : unreachableVideo()]: [
            "switchEvent" in overlay ? overlay.switchEvent : unreachableVideo(),
          ],
        },
      });
    } catch (error) {
      throw new SceneLayoutError(
        `Scene transition ${transition.from} -> ${transition.to} is invalid: ${formatError(error)}`,
      );
    }
    spineResources[transitionResourceKey(transition.from, transition.to)] =
      Object.freeze({
        skeleton,
        atlasText,
        textureUrls: Object.freeze(textureUrls),
      });
  }

  assertExactKeys(imageModules, imagePaths, "scene layout image modules");
  assertExactKeys(
    skeletonModules,
    skeletonPaths,
    "scene layout skeleton modules",
  );
  assertExactKeys(vniResources, vniProjectPaths, "scene layout VNI resources");
  assertExactKeys(atlasModules, atlasPaths, "scene layout atlas modules");
  assertExactKeys(textureModules, texturePaths, "scene layout texture modules");
  assertExactKeys(videoModules, videoPaths, "scene layout video modules");
  assertExactKeys(audioModules, audioPaths, "scene layout audio modules");
  assertExactKeys(
    jsonDataModules,
    jsonDataPaths,
    "scene layout JSON data modules",
  );
  assertExactKeys(
    imageStringResources,
    imageStringPaths,
    "scene layout image-string resources",
  );

  let destroyed = false;
  const ownedObjectUrls = [...(options.ownedObjectUrls ?? [])];
  return Object.freeze({
    manifest,
    imageUrls: Object.freeze(imageUrls),
    spineResources: Object.freeze(spineResources),
    imageStringResources: Object.freeze({ ...imageStringResources }),
    vniResources: Object.freeze({ ...vniResources }),
    videoUrls: Object.freeze(videoUrls),
    runtimeResources: Object.freeze(runtimeResources),
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const url of ownedObjectUrls) URL.revokeObjectURL(url);
      for (const nested of new Set(Object.values(imageStringResources))) {
        void nested.destroy();
      }
    },
  });
}

export function requireSceneLayoutRuntimeResource<
  Kind extends SceneLayoutRuntimeResource["kind"],
>(
  resource: Pick<SceneLayoutResource, "runtimeResources">,
  key: string,
  kind: Kind,
): Extract<SceneLayoutRuntimeResource, { readonly kind: Kind }> {
  const resolved = resource.runtimeResources[key];
  if (!resolved)
    throw new SceneLayoutError(
      `Scene layout runtime resource "${key}" was not found.`,
    );
  if (resolved.kind !== kind)
    throw new SceneLayoutError(
      `Scene layout runtime resource "${key}" must be ${kind}; actual ${resolved.kind}.`,
    );
  return resolved as Extract<
    SceneLayoutRuntimeResource,
    { readonly kind: Kind }
  >;
}

function assertRuntimeVniProject(
  project: VNIProjectConfig,
  path: string,
): void {
  assertVNIProject(project);
  if (project.exportProfile?.purpose !== "runtime") {
    throw new SceneLayoutError(
      `Scene layout VNI project "${path}" must declare a runtime exportProfile.`,
    );
  }
}

function unreachableVideo(): never {
  throw new SceneLayoutError("Scene transition schema mismatch.");
}

export async function loadSceneLayoutResourceFromUrl(options: {
  readonly manifestUrl: string | URL;
  readonly fetchImpl?: typeof fetch;
  readonly decodeImage?: (
    blob: Blob,
    path: string,
  ) => Promise<{ readonly width: number; readonly height: number }>;
}): Promise<SceneLayoutResource> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new SceneLayoutError(
      "fetchImpl is required to load a scene layout URL.",
    );
  }
  const manifestUrl = new URL(options.manifestUrl);
  if (manifestUrl.protocol !== "http:" && manifestUrl.protocol !== "https:") {
    throw new SceneLayoutError(
      "Scene layout manifest URL must use http or https.",
    );
  }
  const manifestResponse = await fetchRequired(fetchImpl, manifestUrl);
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(await manifestResponse.text());
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout manifest JSON is invalid: ${formatError(error)}`,
    );
  }
  const manifest = parseSceneLayoutManifestDocument(rawManifest);
  const imageModules: Record<string, string> = {};
  const skeletonModules: Record<string, unknown> = {};
  const atlasModules: Record<string, string> = {};
  const textureModules: Record<string, string> = {};
  const videoModules: Record<string, string> = {};
  const audioModules: Record<string, string> = {};
  const jsonDataModules: Record<string, SceneLayoutJsonData> = {};
  const ownedObjectUrls: string[] = [];
  const imageStringResources: Record<string, ImageStringResource> = {};
  const vniResources: Record<
    string,
    { readonly project: VNIProjectConfig; readonly assetUrls: AssetUrlManifest }
  > = {};
  try {
    const resourceByPath = new Map<
      string,
      | "image"
      | "skeleton"
      | "atlas"
      | "texture"
      | "video"
      | "audio"
      | "json-data"
    >();
    for (const node of manifest.nodes) {
      const resource = node.resource;
      if (resource.kind === "image") {
        resourceByPath.set(resource.path, "image");
        continue;
      }
      if (resource.kind === "image-string") continue;
      if (resource.kind === "vni") continue;
      resourceByPath.set(resource.skeleton, "skeleton");
      resourceByPath.set(resource.atlas, "atlas");
      for (const path of Object.values(resource.textures)) {
        resourceByPath.set(path, "texture");
      }
    }
    for (const resource of Object.values(manifest.runtimeResources ?? {})) {
      if (resource.kind === "image") {
        resourceByPath.set(resource.path, "image");
        continue;
      }
      if (resource.kind === "video") {
        resourceByPath.set(resource.path, "video");
        continue;
      }
      if (resource.kind === "json") {
        resourceByPath.set(resource.path, "json-data");
        continue;
      }
      if (resource.kind === "audio") {
        resourceByPath.set(resource.path, "audio");
        continue;
      }
      if (resource.kind === "image-string" || resource.kind === "vni") continue;
      resourceByPath.set(resource.skeleton, "skeleton");
      resourceByPath.set(resource.atlas, "atlas");
      for (const path of Object.values(resource.textures))
        resourceByPath.set(path, "texture");
    }
    for (const transition of manifest.gameModes?.transitions ?? []) {
      if ("kind" in transition.overlay) continue;
      const resource = transition.overlay.resource;
      if (resource.kind === "video") {
        resourceByPath.set(resource.path, "video");
        continue;
      }
      resourceByPath.set(resource.skeleton, "skeleton");
      resourceByPath.set(resource.atlas, "atlas");
      for (const path of Object.values(resource.textures))
        resourceByPath.set(path, "texture");
    }
    for (const node of manifest.nodes) {
      if (node.resource.kind !== "image-string") continue;
      if (imageStringResources[node.resource.manifest]) continue;
      const dependencyUrl = resolveContainedAssetUrl(
        node.resource.manifest,
        manifestUrl,
      );
      imageStringResources[node.resource.manifest] =
        await loadImageStringResourceFromUrl({
          manifestUrl: dependencyUrl,
          fetchImpl,
          ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
        });
    }
    for (const resource of Object.values(manifest.runtimeResources ?? {})) {
      if (
        resource.kind !== "image-string" ||
        imageStringResources[resource.manifest]
      )
        continue;
      imageStringResources[resource.manifest] =
        await loadImageStringResourceFromUrl({
          manifestUrl: resolveContainedAssetUrl(resource.manifest, manifestUrl),
          fetchImpl,
          ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
        });
    }
    for (const node of manifest.nodes) {
      if (node.resource.kind !== "vni") continue;
      if (vniResources[node.resource.project]) continue;
      const projectUrl = resolveContainedAssetUrl(
        node.resource.project,
        manifestUrl,
      );
      const response = await fetchRequired(fetchImpl, projectUrl);
      let projectValue: unknown;
      try {
        projectValue = JSON.parse(await response.text());
      } catch (error) {
        throw new SceneLayoutError(
          `Scene layout VNI project "${node.resource.project}" is invalid JSON: ${formatError(error)}`,
        );
      }
      const project = assertVNIProject(projectValue);
      assertRuntimeVniProject(project, node.resource.project);
      const assetUrls: Record<string, string> = {};
      for (const asset of project.assets) {
        const assetUrl = resolveContainedAssetUrl(asset.path, projectUrl);
        const assetResponse = await fetchRequired(fetchImpl, assetUrl);
        const objectUrl = URL.createObjectURL(await assetResponse.blob());
        ownedObjectUrls.push(objectUrl);
        assetUrls[asset.path] = objectUrl;
      }
      vniResources[node.resource.project] = Object.freeze({
        project,
        assetUrls: resolveProjectAssetUrls(project, assetUrls),
      });
    }
    for (const resource of Object.values(manifest.runtimeResources ?? {})) {
      if (resource.kind !== "vni" || vniResources[resource.project]) continue;
      const projectUrl = resolveContainedAssetUrl(
        resource.project,
        manifestUrl,
      );
      const response = await fetchRequired(fetchImpl, projectUrl);
      let projectValue: unknown;
      try {
        projectValue = JSON.parse(await response.text());
      } catch (error) {
        throw new SceneLayoutError(
          `Scene layout VNI project "${resource.project}" is invalid JSON: ${formatError(error)}`,
        );
      }
      const project = assertVNIProject(projectValue);
      assertRuntimeVniProject(project, resource.project);
      const assetUrls: Record<string, string> = {};
      for (const asset of project.assets) {
        const assetUrl = resolveContainedAssetUrl(asset.path, projectUrl);
        const assetResponse = await fetchRequired(fetchImpl, assetUrl);
        const objectUrl = URL.createObjectURL(await assetResponse.blob());
        ownedObjectUrls.push(objectUrl);
        assetUrls[asset.path] = objectUrl;
      }
      vniResources[resource.project] = Object.freeze({
        project,
        assetUrls: resolveProjectAssetUrls(project, assetUrls),
      });
    }
    for (const path of collectSceneLayoutAssetPaths(manifest).filter(
      (path) =>
        !imageStringResources[path] &&
        !vniResources[path] &&
        path !== manifest.symbolPackage?.manifest,
    )) {
      const assetUrl = resolveContainedAssetUrl(path, manifestUrl);
      const response = await fetchRequired(fetchImpl, assetUrl);
      const kind = resourceByPath.get(path);
      if (kind === "skeleton") {
        try {
          skeletonModules[path] = JSON.parse(await response.text());
        } catch (error) {
          throw new SceneLayoutError(
            `Scene layout Spine skeleton "${path}" is invalid JSON: ${formatError(error)}`,
          );
        }
      } else if (kind === "atlas") {
        atlasModules[path] = await response.text();
      } else if (kind === "video") {
        const blob = await response.blob();
        if (blob.type && blob.type !== "video/mp4")
          throw new SceneLayoutError(
            `Scene layout video "${path}" must use video/mp4, actual ${blob.type}.`,
          );
        const objectUrl = URL.createObjectURL(
          blob.type === "video/mp4"
            ? blob
            : new Blob([blob], { type: "video/mp4" }),
        );
        ownedObjectUrls.push(objectUrl);
        videoModules[path] = objectUrl;
      } else if (kind === "json-data") {
        jsonDataModules[path] = parseSceneLayoutJsonData(
          new Uint8Array(await response.arrayBuffer()),
          path,
        );
      } else if (kind === "audio") {
        const spec = Object.values(manifest.runtimeResources ?? {}).find(
          (resource) => resource.kind === "audio" && resource.path === path,
        );
        if (!spec || spec.kind !== "audio")
          throw new SceneLayoutError(
            `Scene layout runtime audio spec is missing: ${path}.`,
          );
        const blob = await response.blob();
        if (blob.type && blob.type !== spec.mediaType)
          throw new SceneLayoutError(
            `Scene layout audio "${path}" must use ${spec.mediaType}, actual ${blob.type}.`,
          );
        const objectUrl = URL.createObjectURL(
          blob.type === spec.mediaType
            ? blob
            : new Blob([blob], { type: spec.mediaType }),
        );
        ownedObjectUrls.push(objectUrl);
        audioModules[path] = objectUrl;
      } else {
        const blob = await response.blob();
        const decoded = await (options.decodeImage ?? decodeBrowserImageBlob)(
          blob,
          path,
        );
        const imageSpec = manifest.nodes.find(
          (node) =>
            node.resource.kind === "image" && node.resource.path === path,
        )?.resource;
        if (
          imageSpec?.kind === "image" &&
          (decoded.width !== imageSpec.size.width ||
            decoded.height !== imageSpec.size.height)
        ) {
          throw new SceneLayoutError(
            `Scene layout image "${path}" size mismatch: expected ${imageSpec.size.width}x${imageSpec.size.height}, actual ${decoded.width}x${decoded.height}.`,
          );
        }
        const objectUrl = URL.createObjectURL(blob);
        ownedObjectUrls.push(objectUrl);
        if (kind === "image") imageModules[path] = objectUrl;
        else textureModules[path] = objectUrl;
      }
    }
    return createSceneLayoutResource({
      manifest,
      imageModules,
      skeletonModules,
      atlasModules,
      textureModules,
      videoModules,
      audioModules,
      jsonDataModules,
      ownedObjectUrls,
      imageStringResources,
      vniResources,
    });
  } catch (error) {
    for (const url of ownedObjectUrls) URL.revokeObjectURL(url);
    for (const nested of new Set(Object.values(imageStringResources))) {
      await nested.destroy();
    }
    throw error instanceof SceneLayoutError
      ? error
      : new SceneLayoutError(formatError(error));
  }
}

async function decodeBrowserImageBlob(
  blob: Blob,
  path: string,
): Promise<{ readonly width: number; readonly height: number }> {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(blob);
      const size = Object.freeze({
        width: bitmap.width,
        height: bitmap.height,
      });
      bitmap.close();
      return size;
    } catch (error) {
      throw new SceneLayoutError(
        `Scene layout image "${path}" failed to decode: ${formatError(error)}`,
      );
    }
  }
  if (typeof Image === "undefined") {
    throw new SceneLayoutError(
      `Scene layout image decoder is unavailable for "${path}".`,
    );
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve(
          Object.freeze({
            width: image.naturalWidth,
            height: image.naturalHeight,
          }),
        );
      image.onerror = () =>
        reject(
          new SceneLayoutError(
            `Scene layout image "${path}" failed to decode.`,
          ),
        );
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function fetchRequired(
  fetchImpl: typeof fetch,
  url: URL,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene layout fetch failed for ${url.href}: ${formatError(error)}`,
    );
  }
  if (!response.ok) {
    throw new SceneLayoutError(
      `Scene layout fetch failed for ${url.href}: HTTP ${response.status}.`,
    );
  }
  return response;
}

function resolveContainedAssetUrl(path: string, manifestUrl: URL): URL {
  const assetUrl = new URL(path, manifestUrl);
  const basePath = manifestUrl.pathname.slice(
    0,
    manifestUrl.pathname.lastIndexOf("/") + 1,
  );
  if (
    assetUrl.origin !== manifestUrl.origin ||
    !assetUrl.pathname.startsWith(basePath)
  ) {
    throw new SceneLayoutError(
      `Scene layout asset path escapes the manifest directory: ${path}.`,
    );
  }
  return assetUrl;
}

function normalizeMap<T>(
  value: Readonly<Record<string, T>> | undefined,
): Readonly<Record<string, T>> {
  return value ?? Object.freeze({});
}

function requireValue<T>(
  modules: Readonly<Record<string, T>>,
  path: string,
  label: string,
): T {
  if (!Object.hasOwn(modules, path)) {
    throw new SceneLayoutError(`${label} is missing: ${path}.`);
  }
  const value = modules[path];
  if (value === undefined) {
    throw new SceneLayoutError(`${label} is undefined: ${path}.`);
  }
  return unwrapDefault(value) as T;
}

function requireString(
  modules: Readonly<Record<string, unknown>>,
  path: string,
  label: string,
): string {
  const value = requireValue(modules, path, label);
  if (typeof value !== "string" || value.length === 0) {
    throw new SceneLayoutError(`${label} must be a non-empty string: ${path}.`);
  }
  return value;
}

function unwrapDefault(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    Object.hasOwn(value, "default") &&
    Object.keys(value).length === 1
  ) {
    return (value as { readonly default: unknown }).default;
  }
  return value;
}

function assertExactKeys(
  modules: Readonly<Record<string, unknown>>,
  expected: ReadonlySet<string>,
  label: string,
): void {
  const actual = Object.keys(modules).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new SceneLayoutError(
      `${label} must exactly match the manifest closure; expected=${wanted.join(",")}, actual=${actual.join(",")}.`,
    );
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function transitionResourceKey(from: string, to: string): string {
  return `scene-transition:${from}\u0000${to}`;
}
