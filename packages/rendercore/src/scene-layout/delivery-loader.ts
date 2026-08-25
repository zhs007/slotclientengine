import {
  assertCanonicalPackagePath,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { Assets, Cache, Rectangle, Texture } from "pixi.js";
import {
  parseSceneLayoutDeliveryManifest,
  SCENE_LAYOUT_DELIVERY_MANIFEST,
  type SceneLayoutDeliveryAtlasV1,
  type SceneLayoutDeliveryManifestV1,
} from "./data/delivery.js";
import { SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS } from "./data/package-limits.js";
import { SceneLayoutError } from "./errors.js";
import { createSceneLayoutPackageResource } from "./package-resource.js";
import type { SceneLayoutPackageResource } from "./types.js";

let nextDeliveryInstance = 1;

export async function loadSceneLayoutDeliveryFromUrl(options: {
  readonly manifestUrl: string | URL;
  readonly manifestBytes?: Uint8Array;
  readonly fetchImpl?: typeof fetch;
  readonly loadSymbolTextures?: boolean;
}): Promise<SceneLayoutPackageResource> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function")
    throw new SceneLayoutError(
      "fetchImpl is required to load a Scene Layout delivery URL.",
    );
  const manifestUrl = new URL(options.manifestUrl);
  if (!/^https?:$/u.test(manifestUrl.protocol))
    throw new SceneLayoutError(
      "Scene Layout delivery manifest URL must use http or https.",
    );
  const manifestBytes =
    options.manifestBytes?.slice() ??
    (await fetchDeliveryBytes(fetchImpl, manifestUrl));
  const manifest = parseSceneLayoutDeliveryManifest(
    parseJson(manifestBytes, SCENE_LAYOUT_DELIVERY_MANIFEST),
  );
  const files = await loadMetadataChunks(fetchImpl, manifestUrl, manifest);
  materializeExternalPlaceholders(files, manifest);
  const textures = new DeliveryAtlasTextures(manifestUrl, manifest);
  try {
    await textures.load();
    const resource = await createSceneLayoutPackageResource({
      files,
      resolveAssetUrl: (logicalKey) => textures.resolve(logicalKey),
      loadSymbolTextures: options.loadSymbolTextures,
    });
    if (
      resource.runtimeManifest.id !== manifest.layoutId ||
      resource.runtimeManifest.gameModes?.initialMode !== manifest.initialMode
    ) {
      await resource.destroy();
      throw new SceneLayoutError(
        "Scene Layout delivery identity does not match its layout manifest.",
      );
    }
    let destroyed = false;
    return Object.freeze({
      ...resource,
      async destroy(): Promise<void> {
        if (destroyed) return;
        destroyed = true;
        try {
          await resource.destroy();
        } finally {
          await textures.destroy();
        }
      },
    });
  } catch (error) {
    await textures.destroy();
    throw error instanceof SceneLayoutError
      ? error
      : new SceneLayoutError(formatError(error));
  }
}

async function loadMetadataChunks(
  fetchImpl: typeof fetch,
  manifestUrl: URL,
  manifest: SceneLayoutDeliveryManifestV1,
): Promise<Map<string, Uint8Array>> {
  const initial = manifest.chunks.find(
    (chunk) => chunk.id === manifest.initialChunk,
  )!;
  const ordered = [
    initial,
    ...manifest.chunks.filter((chunk) => chunk !== initial),
  ];
  const loadChunk = async (chunk: (typeof ordered)[number]) => {
    if (!chunk.metadata) return [chunk.id, null] as const;
    const bytes = await fetchDeliveryBytes(
      fetchImpl,
      containedDeliveryUrl(manifestUrl, chunk.metadata.path),
    );
    try {
      return [
        chunk.id,
        extractBoundedZip(bytes, {
          limits: SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS,
          pathPolicy: { requireLowercase: true },
        }),
      ] as const;
    } catch (error) {
      throw new SceneLayoutError(
        `Scene Layout delivery chunk ${chunk.id} is invalid: ${formatError(error)}`,
      );
    }
  };
  const archives = [
    await loadChunk(initial),
    ...(await Promise.all(ordered.slice(1).map(loadChunk))),
  ];
  const files = new Map<string, Uint8Array>();
  for (const [chunkId, archive] of archives) {
    if (!archive) continue;
    for (const [path, bytes] of archive) {
      if (files.has(path))
        throw new SceneLayoutError(
          `Scene Layout delivery metadata path is duplicated across chunks: ${path} (${chunkId}).`,
        );
      files.set(path, bytes);
    }
  }
  if (!files.has("layout.manifest.json") || !files.has("assets.map.json"))
    throw new SceneLayoutError(
      "Scene Layout initial delivery chunk must contain layout.manifest.json and assets.map.json.",
    );
  return files;
}

function materializeExternalPlaceholders(
  files: Map<string, Uint8Array>,
  manifest: SceneLayoutDeliveryManifestV1,
): void {
  for (const atlas of manifest.atlases)
    files.set(atlas.image.path, new Uint8Array([0]));
  for (const asset of Object.values(manifest.assets))
    if (asset.kind === "external") files.set(asset.path, new Uint8Array([0]));
}

class DeliveryAtlasTextures {
  readonly #manifestUrl: URL;
  readonly #manifest: SceneLayoutDeliveryManifestV1;
  readonly #prefix: string;
  readonly #urls = new Map<string, string>();
  readonly #frames = new Map<string, Texture>();
  readonly #pageUrls: string[] = [];

  constructor(manifestUrl: URL, manifest: SceneLayoutDeliveryManifestV1) {
    this.#manifestUrl = manifestUrl;
    this.#manifest = manifest;
    this.#prefix = `scene-layout-delivery:${nextDeliveryInstance++}:`;
    for (const [key, asset] of Object.entries(manifest.assets)) {
      if (asset.kind === "atlas-frame")
        this.#urls.set(key, `${this.#prefix}${key}`);
      else if (asset.kind === "external")
        this.#urls.set(key, containedDeliveryUrl(manifestUrl, asset.path).href);
    }
  }

  resolve(logicalKey: string): string | undefined {
    return this.#urls.get(logicalKey);
  }

  async load(): Promise<void> {
    const ownerRank = new Map(
      this.#manifest.chunks.map((chunk, index) => [chunk.owner, index]),
    );
    const atlases = [...this.#manifest.atlases].sort(
      (left, right) =>
        (ownerRank.get(left.owner) ?? Number.MAX_SAFE_INTEGER) -
          (ownerRank.get(right.owner) ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id, "en"),
    );
    for (const atlas of atlases) await this.#loadAtlas(atlas);
  }

  async destroy(): Promise<void> {
    for (const [key, texture] of this.#frames) {
      const url = this.#urls.get(key);
      if (url && Cache.has(url)) Cache.remove(url);
      if (!texture.destroyed) texture.destroy(false);
    }
    this.#frames.clear();
    for (const url of this.#pageUrls)
      await Assets.unload(url).catch(() => undefined);
    this.#pageUrls.length = 0;
  }

  async #loadAtlas(atlas: SceneLayoutDeliveryAtlasV1): Promise<void> {
    const pageUrl = containedDeliveryUrl(
      this.#manifestUrl,
      atlas.image.path,
    ).href;
    const page = (await Assets.load({
      src: pageUrl,
      parser: "loadTextures",
    })) as Texture | null | undefined;
    if (
      !page?.source ||
      page.width !== atlas.image.width ||
      page.height !== atlas.image.height
    )
      throw new SceneLayoutError(
        `Scene Layout delivery atlas ${atlas.id} has an invalid page size.`,
      );
    this.#pageUrls.push(pageUrl);
    for (const [key, frame] of Object.entries(atlas.frames)) {
      if (
        frame.x + frame.width > atlas.image.width ||
        frame.y + frame.height > atlas.image.height
      )
        throw new SceneLayoutError(
          `Scene Layout delivery atlas frame is out of bounds: ${key}.`,
        );
      const url = this.#urls.get(key);
      if (!url)
        throw new SceneLayoutError(
          `Scene Layout delivery atlas frame has no URL route: ${key}.`,
        );
      const texture = new Texture({
        source: page.source,
        frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
        orig: new Rectangle(0, 0, frame.sourceWidth, frame.sourceHeight),
        rotate: frame.rotated ? 2 : 0,
        label: key,
      });
      Cache.set(url, texture);
      this.#frames.set(key, texture);
    }
  }
}

async function fetchDeliveryBytes(
  fetchImpl: typeof fetch,
  url: URL,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene Layout delivery fetch failed for ${url.href}: ${formatError(error)}`,
    );
  }
  if (!response.ok)
    throw new SceneLayoutError(
      `Scene Layout delivery fetch failed for ${url.href}: HTTP ${response.status}.`,
    );
  return new Uint8Array(await response.arrayBuffer());
}

function containedDeliveryUrl(manifestUrl: URL, path: string): URL {
  assertCanonicalPackagePath(path, { requireLowercase: true });
  const url = new URL(path, manifestUrl);
  const root = manifestUrl.pathname.slice(
    0,
    manifestUrl.pathname.lastIndexOf("/") + 1,
  );
  if (url.origin !== manifestUrl.origin || !url.pathname.startsWith(root))
    throw new SceneLayoutError(
      `Scene Layout delivery path escapes its root: ${path}.`,
    );
  return url;
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new SceneLayoutError(`${path} is invalid: ${formatError(error)}`);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
