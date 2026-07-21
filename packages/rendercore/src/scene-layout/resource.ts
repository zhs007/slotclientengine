import { validateOfficialSpineResource } from "../spine/runtime-player.js";
import {
  loadImageStringResourceFromUrl,
  validateImageStringText,
  type ImageStringResource,
} from "../image-string/index.js";
import { SceneLayoutError } from "./errors.js";
import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifest,
} from "./manifest.js";
import type { SceneLayoutManifestV1, SceneLayoutResource } from "./types.js";

export interface CreateSceneLayoutResourceOptions {
  readonly manifest: unknown;
  readonly imageModules?: Readonly<Record<string, string>>;
  readonly skeletonModules?: Readonly<Record<string, unknown>>;
  readonly atlasModules?: Readonly<Record<string, string>>;
  readonly textureModules?: Readonly<Record<string, string>>;
  readonly ownedObjectUrls?: readonly string[];
  readonly imageStringResources?: Readonly<Record<string, ImageStringResource>>;
}

export function createSceneLayoutResource(
  options: CreateSceneLayoutResourceOptions,
): SceneLayoutResource {
  const manifest = parseSceneLayoutManifest(options.manifest);
  const imageModules = normalizeMap(options.imageModules);
  const skeletonModules = normalizeMap(options.skeletonModules);
  const atlasModules = normalizeMap(options.atlasModules);
  const textureModules = normalizeMap(options.textureModules);
  const imagePaths = new Set<string>();
  const skeletonPaths = new Set<string>();
  const atlasPaths = new Set<string>();
  const texturePaths = new Set<string>();
  const imageStringResources: Readonly<Record<string, ImageStringResource>> =
    options.imageStringResources ?? Object.freeze({});
  const imageStringPaths = new Set<string>();
  const imageUrls: Record<string, string> = {};
  const spineResources: Record<
    string,
    {
      readonly skeleton: unknown;
      readonly atlasText: string;
      readonly textureUrls: Readonly<Record<string, string>>;
    }
  > = {};

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
      const directoryId = node.resource.manifest.split("/").at(-2);
      if (directoryId !== nested.manifest.id) {
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

  for (const transition of manifest.gameModes?.transitions ?? []) {
    const spec = transition.overlay.resource;
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
        requiredAnimations: [transition.overlay.animation],
        requiredAnimationEvents: {
          [transition.overlay.animation]: [transition.overlay.switchEvent],
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
  assertExactKeys(atlasModules, atlasPaths, "scene layout atlas modules");
  assertExactKeys(textureModules, texturePaths, "scene layout texture modules");
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
  const manifest = parseSceneLayoutManifest(rawManifest);
  const imageModules: Record<string, string> = {};
  const skeletonModules: Record<string, unknown> = {};
  const atlasModules: Record<string, string> = {};
  const textureModules: Record<string, string> = {};
  const ownedObjectUrls: string[] = [];
  const imageStringResources: Record<string, ImageStringResource> = {};
  try {
    const resourceByPath = new Map<
      string,
      "image" | "skeleton" | "atlas" | "texture"
    >();
    for (const node of manifest.nodes) {
      const resource = node.resource;
      if (resource.kind === "image") {
        resourceByPath.set(resource.path, "image");
        continue;
      }
      if (resource.kind === "image-string") continue;
      resourceByPath.set(resource.skeleton, "skeleton");
      resourceByPath.set(resource.atlas, "atlas");
      for (const path of Object.values(resource.textures)) {
        resourceByPath.set(path, "texture");
      }
    }
    for (const transition of manifest.gameModes?.transitions ?? []) {
      const resource = transition.overlay.resource;
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
    for (const path of collectSceneLayoutAssetPaths(manifest).filter(
      (path) =>
        !imageStringResources[path] &&
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
      ownedObjectUrls,
      imageStringResources,
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
