import { Assets, Texture } from "pixi.js";
import {
  assertCanonicalPackagePath,
  assertNoPackagePathCollisions,
  resolvePackagePath,
} from "@slotclientengine/browserartifactio";
import {
  assertVNIProject,
  resolveProjectAssetUrls,
} from "@slotclientengine/vnicore/core";
import {
  collectImageStringAssetPaths,
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
  PopupPackageResource,
  PopupPreparedResource,
} from "./types.js";

const ROOT = "popup.manifest.json";

export function collectPopupPackagePaths(options: {
  readonly manifest: PopupManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): readonly string[] {
  const manifest = parsePopupManifest(options.manifest);
  const expected = new Set(collectPopupDirectPaths(manifest));
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image-string") {
      const nested = parseImageStringManifest(
        parseJson(
          requireBytes(options.files, resource.manifest),
          resource.manifest,
        ),
      );
      const directoryId = resource.manifest.split("/").at(-2);
      if (nested.id !== directoryId)
        throw new Error(
          `popup image-string dependency id mismatch: ${resource.manifest}`,
        );
      for (const asset of collectImageStringAssetPaths(nested))
        expected.add(resolvePackagePath(resource.manifest, asset));
    } else if (resource.kind === "vni") {
      const project = assertVNIProject(
        parseJson(
          requireBytes(options.files, resource.project),
          resource.project,
        ),
      );
      for (const asset of project.assets)
        expected.add(resolvePackagePath(resource.project, asset.path));
    }
  }
  const actual = [...options.files.keys()].filter((path) => path !== ROOT);
  for (const path of actual)
    assertCanonicalPackagePath(path, { requireLowercase: true });
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
  collectPopupPackagePaths({ manifest, files: options.files });
  const urls: string[] = [];
  const prepared: Record<string, PopupPreparedResource> = {};
  const ownedTextures = new Set<Texture>();
  try {
    for (const [id, spec] of Object.entries(manifest.resources)) {
      if (spec.kind === "image-string") {
        const prefix = spec.manifest.slice(0, spec.manifest.lastIndexOf("/"));
        const nested = extractPrefix(options.files, prefix);
        const imageStringResource = await createImageStringResourceFromFiles({
          files: nested,
          ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
          ...(options.loadTexture ? { loadTexture: options.loadTexture } : {}),
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
        const url = objectUrl(
          requireBytes(options.files, spec.path),
          spec.path,
          urls,
        );
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
          parseJson(requireBytes(options.files, spec.project), spec.project),
        );
        const assetUrls: Record<string, string> = {};
        for (const asset of project.assets)
          assetUrls[asset.path] = objectUrl(
            requireBytes(
              options.files,
              resolvePackagePath(spec.project, asset.path),
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
          requireBytes(options.files, spec.skeleton),
          spec.skeleton,
        );
        const atlasText = decode(
          requireBytes(options.files, spec.atlas),
          spec.atlas,
        );
        const textureUrls = Object.fromEntries(
          Object.entries(spec.textures).map(([page, path]) => [
            page,
            objectUrl(requireBytes(options.files, path), path, urls),
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
