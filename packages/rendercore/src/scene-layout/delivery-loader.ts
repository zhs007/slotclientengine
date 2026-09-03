import {
  assertCanonicalPackagePath,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { decodeEditorAssetsMap } from "@slotclientengine/editorresource";
import { Assets, Cache, Rectangle, Texture } from "pixi.js";
import {
  parseSceneLayoutDeliveryManifest,
  type SceneLayoutDeliveryManifest,
  type SceneLayoutDeliveryAtlasV1,
  type SceneLayoutDeliveryChunkV1,
} from "./data/delivery.js";
import { SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS } from "./data/package-limits.js";
import { SceneLayoutError } from "./errors.js";
import { resolveSceneLayoutStartupMode } from "./manifest-v8.js";
import { createSceneLayoutPackageResource } from "./package-resource.js";
import type { SceneLayoutPackageResource } from "./types.js";

let nextDeliveryInstance = 1;

export async function loadSceneLayoutDeliveryFromUrl(options: {
  readonly manifestUrl?: string | URL;
  readonly urlPrefix: string | URL;
  readonly manifestBytes?: Uint8Array;
  readonly fetchImpl?: typeof fetch;
  readonly loadSymbolTextures?: boolean;
}): Promise<SceneLayoutPackageResource> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function")
    throw new SceneLayoutError(
      "fetchImpl is required to load a Scene Layout delivery URL.",
    );
  const manifestUrl =
    options.manifestUrl === undefined
      ? null
      : parseDeliveryManifestUrl(options.manifestUrl);
  const urlPrefix = parseDeliveryUrlPrefix(options.urlPrefix);
  let manifestBytes: Uint8Array;
  if (options.manifestBytes) manifestBytes = options.manifestBytes.slice();
  else {
    if (!manifestUrl)
      throw new SceneLayoutError(
        "Scene Layout delivery requires manifestUrl or manifestBytes.",
      );
    manifestBytes = await fetchDeliveryBytes(fetchImpl, manifestUrl);
  }
  const manifest = parseSceneLayoutDeliveryManifest(
    parseJson(manifestBytes, manifestUrl?.pathname ?? "delivery.manifest.json"),
  );
  const delivery = new DeliveryChunkLoader(fetchImpl, urlPrefix, manifest);
  const files = await delivery.loadInitial();
  materializeExternalPlaceholders(files, manifest);
  try {
    const resource = await createSceneLayoutPackageResource({
      files,
      resolveAssetUrl: (logicalKey) => delivery.resolve(logicalKey),
      loadSymbolTextures: options.loadSymbolTextures,
      lazyRuntimeResources: true,
      lazyPopupResources: true,
      loadRuntimeResourceBytes: (logicalKey) =>
        delivery.loadMetadataAsset(logicalKey),
    });
    if (
      resource.runtimeManifest.id !== manifest.layoutId ||
      resolveSceneLayoutStartupMode(resource.runtimeManifest.gameModes) !==
        manifest.initialMode
    ) {
      await resource.destroy();
      throw new SceneLayoutError(
        "Scene Layout delivery identity does not match its layout manifest.",
      );
    }
    let destroyed = false;
    const wrapped = Object.freeze({
      ...resource,
      delivery: Object.freeze({
        isGameModeReady: (modeId: string) => delivery.isGameModeReady(modeId),
        loadGameMode: (modeId: string) => delivery.loadGameMode(modeId),
      }),
      async destroy(): Promise<void> {
        if (destroyed) return;
        destroyed = true;
        try {
          await resource.destroy();
        } finally {
          await delivery.destroy();
        }
      },
    });
    delivery.startBackgroundLoad();
    return wrapped;
  } catch (error) {
    await delivery.destroy();
    throw error instanceof SceneLayoutError
      ? error
      : new SceneLayoutError(formatError(error));
  }
}

class DeliveryChunkLoader {
  readonly #fetchImpl: typeof fetch;
  readonly #urlPrefix: URL;
  readonly #manifest: SceneLayoutDeliveryManifest;
  readonly #chunks: ReadonlyMap<string, SceneLayoutDeliveryChunkV1>;
  readonly #entryOwners = new Map<string, string>();
  readonly #loads = new Map<string, Promise<ReadonlyMap<string, Uint8Array>>>();
  readonly #archiveLoads = new Map<
    string,
    Promise<ReadonlyMap<string, Uint8Array>>
  >();
  readonly #loaded = new Set<string>();
  readonly #textures: DeliveryTextures;
  #destroyed = false;

  constructor(
    fetchImpl: typeof fetch,
    urlPrefix: URL,
    manifest: SceneLayoutDeliveryManifest,
  ) {
    this.#fetchImpl = fetchImpl;
    this.#urlPrefix = urlPrefix;
    this.#manifest = manifest;
    this.#chunks = new Map(manifest.chunks.map((chunk) => [chunk.id, chunk]));
    for (const asset of Object.values(manifest.assets))
      if (asset.kind === "metadata")
        this.#entryOwners.set(asset.entry, asset.owner);
    this.#textures = new DeliveryTextures(fetchImpl, urlPrefix, manifest);
  }

  resolve(logicalKey: string): string | undefined {
    return this.#textures.resolve(logicalKey);
  }

  async loadInitial(): Promise<Map<string, Uint8Array>> {
    const files = new Map(await this.#loadChunk(this.#manifest.initialChunk));
    const catalogs = await Promise.all(
      this.#manifest.chunks
        .filter(
          (chunk) =>
            chunk.id !== this.#manifest.initialChunk &&
            chunk.owner !== "media" &&
            chunk.metadata !== null,
        )
        .map((chunk) => this.#loadArchiveOnce(chunk)),
    );
    for (const archive of catalogs)
      for (const [path, bytes] of archive) {
        if (files.has(path))
          throw new SceneLayoutError(
            `Scene Layout delivery metadata path is duplicated across chunks: ${path}.`,
          );
        files.set(path, bytes.slice());
      }
    if (!files.has("layout.manifest.json") || !files.has("assets.map.json"))
      throw new SceneLayoutError(
        "Scene Layout initial delivery chunk must contain layout.manifest.json and assets.map.json.",
      );
    return files;
  }

  startBackgroundLoad(): void {
    const remaining = this.#manifest.chunks.filter(
      (chunk) => chunk.id !== this.#manifest.initialChunk,
    );
    const media = remaining.filter((chunk) => chunk.owner === "media");
    const modes = remaining.filter((chunk) => chunk.owner !== "media");
    const pending = (async () => {
      for (const chunk of media) await this.#loadChunk(chunk.id);
      for (const chunk of modes) await this.#loadChunk(chunk.id);
    })();
    void pending.catch(() => undefined);
  }

  isGameModeReady(modeId: string): boolean {
    return this.#loaded.has(this.#gameModeChunkId(modeId));
  }

  async loadGameMode(modeId: string): Promise<void> {
    await this.#loadChunk(this.#gameModeChunkId(modeId));
  }

  async loadMetadataAsset(logicalKey: string): Promise<Uint8Array> {
    const asset = this.#manifest.assets[logicalKey];
    if (!asset || asset.kind !== "metadata")
      throw new SceneLayoutError(
        `Scene Layout delivery metadata route was not found: ${logicalKey}.`,
      );
    const chunk = this.#chunks.get(asset.chunk);
    if (!chunk)
      throw new SceneLayoutError(
        `Scene Layout delivery chunk was not found: ${asset.chunk}.`,
      );
    const archive = await this.#loadArchiveOnce(chunk);
    const bytes = archive.get(asset.entry);
    if (!bytes)
      throw new SceneLayoutError(
        `Scene Layout delivery chunk ${asset.chunk} is missing ${asset.entry}.`,
      );
    return bytes.slice();
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    await this.#textures.destroy();
  }

  #gameModeChunkId(modeId: string): string {
    const id =
      modeId === this.#manifest.initialMode
        ? this.#manifest.initialChunk
        : `mode:${modeId}`;
    if (!this.#chunks.has(id))
      throw new SceneLayoutError(
        `Scene Layout delivery has no chunk for game mode "${modeId}".`,
      );
    return id;
  }

  #loadChunk(id: string): Promise<ReadonlyMap<string, Uint8Array>> {
    if (this.#destroyed)
      return Promise.reject(
        new SceneLayoutError("Scene Layout delivery was destroyed."),
      );
    const existing = this.#loads.get(id);
    if (existing) return existing;
    const chunk = this.#chunks.get(id);
    if (!chunk)
      return Promise.reject(
        new SceneLayoutError(
          `Scene Layout delivery chunk was not found: ${id}.`,
        ),
      );
    const pending = this.#loadChunkValue(chunk);
    this.#loads.set(id, pending);
    return pending;
  }

  async #loadChunkValue(
    chunk: SceneLayoutDeliveryChunkV1,
  ): Promise<ReadonlyMap<string, Uint8Array>> {
    await Promise.all(
      chunk.dependencies.map((dependency) => this.#loadChunk(dependency)),
    );
    const [archive] = await Promise.all([
      this.#loadArchiveOnce(chunk),
      this.#textures.loadChunk(chunk),
    ]);
    if (this.#destroyed)
      throw new SceneLayoutError("Scene Layout delivery was destroyed.");
    this.#loaded.add(chunk.id);
    return archive;
  }

  #loadArchiveOnce(
    chunk: SceneLayoutDeliveryChunkV1,
  ): Promise<ReadonlyMap<string, Uint8Array>> {
    const existing = this.#archiveLoads.get(chunk.id);
    if (existing) return existing;
    const pending = this.#loadArchive(chunk);
    this.#archiveLoads.set(chunk.id, pending);
    return pending;
  }

  async #loadArchive(
    chunk: SceneLayoutDeliveryChunkV1,
  ): Promise<ReadonlyMap<string, Uint8Array>> {
    if (!chunk.metadata) return new Map();
    const bytes = await fetchDeliveryBytes(
      this.#fetchImpl,
      containedDeliveryUrl(this.#urlPrefix, chunk.metadata.path),
    );
    let archive: ReadonlyMap<string, Uint8Array>;
    try {
      archive = extractBoundedZip(bytes, {
        limits: SCENE_LAYOUT_PRODUCTION_ZIP_LIMITS,
        pathPolicy: { requireLowercase: true },
      });
    } catch (error) {
      throw new SceneLayoutError(
        `Scene Layout delivery chunk ${chunk.id} is invalid: ${formatError(error)}`,
      );
    }
    for (const path of archive.keys()) {
      const isInitialRoot =
        chunk.id === this.#manifest.initialChunk &&
        (path === "layout.manifest.json" || path === "assets.map.json");
      if (!isInitialRoot && this.#entryOwners.get(path) !== chunk.owner)
        throw new SceneLayoutError(
          `Scene Layout delivery metadata path has the wrong owner: ${path} (${chunk.id}).`,
        );
    }
    return archive;
  }
}

function materializeExternalPlaceholders(
  files: Map<string, Uint8Array>,
  manifest: SceneLayoutDeliveryManifest,
): void {
  const mapBytes = files.get("assets.map.json");
  if (!mapBytes)
    throw new SceneLayoutError(
      "Scene Layout initial delivery chunk must contain assets.map.json.",
    );
  let assetsMap: ReturnType<typeof decodeEditorAssetsMap>;
  try {
    assetsMap = decodeEditorAssetsMap(mapBytes);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene Layout delivery assets.map.json is invalid: ${formatError(error)}`,
    );
  }
  for (const [logicalKey, asset] of Object.entries(manifest.assets)) {
    if (asset.kind !== "atlas-frame" && asset.kind !== "external") continue;
    const mapped = assetsMap.files[logicalKey];
    if (!mapped)
      throw new SceneLayoutError(
        `Scene Layout delivery asset route has no mapped package path: ${logicalKey}.`,
      );
    files.set(mapped.path, new Uint8Array([0]));
  }
}

class DeliveryTextures {
  readonly #fetchImpl: typeof fetch;
  readonly #urlPrefix: URL;
  readonly #manifest: SceneLayoutDeliveryManifest;
  readonly #prefix: string;
  readonly #urls = new Map<string, string>();
  readonly #frames = new Map<string, Texture>();
  readonly #loadedUrls = new Set<string>();
  readonly #loads = new Map<string, Promise<void>>();
  readonly #atlases: ReadonlyMap<string, SceneLayoutDeliveryAtlasV1>;
  #destroyed = false;

  constructor(
    fetchImpl: typeof fetch,
    urlPrefix: URL,
    manifest: SceneLayoutDeliveryManifest,
  ) {
    this.#fetchImpl = fetchImpl;
    this.#urlPrefix = urlPrefix;
    this.#manifest = manifest;
    this.#atlases = new Map(manifest.atlases.map((atlas) => [atlas.id, atlas]));
    this.#prefix = `scene-layout-delivery:${nextDeliveryInstance++}:`;
    for (const [key, asset] of Object.entries(manifest.assets)) {
      if (asset.kind === "atlas-frame")
        this.#urls.set(key, `${this.#prefix}${key}`);
      else if (asset.kind === "external")
        this.#urls.set(key, containedDeliveryUrl(urlPrefix, asset.path).href);
    }
  }

  resolve(logicalKey: string): string | undefined {
    return this.#urls.get(logicalKey);
  }

  async loadChunk(chunk: SceneLayoutDeliveryChunkV1): Promise<void> {
    await Promise.all([
      ...chunk.atlases.map((id) => this.#loadAtlasById(id)),
      ...chunk.externalAssets.map((key) => this.#loadExternalAsset(key)),
    ]);
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const [key, texture] of this.#frames) {
      const url = this.#urls.get(key);
      if (url && Cache.has(url)) Cache.remove(url);
      if (!texture.destroyed) texture.destroy(false);
    }
    this.#frames.clear();
    for (const url of this.#loadedUrls)
      await Assets.unload(url).catch(() => undefined);
    this.#loadedUrls.clear();
  }

  #loadAtlasById(id: string): Promise<void> {
    return this.#loadOnce(`atlas:${id}`, async () => {
      const atlas = this.#atlases.get(id);
      if (!atlas)
        throw new SceneLayoutError(
          `Scene Layout delivery atlas was not found: ${id}.`,
        );
      await this.#loadAtlas(atlas);
    });
  }

  #loadExternalAsset(logicalKey: string): Promise<void> {
    const asset = this.#manifest.assets[logicalKey];
    if (!asset || asset.kind !== "external") return Promise.resolve();
    const url = this.#urls.get(logicalKey);
    if (!url) return Promise.resolve();
    return this.#loadOnce(`external:${logicalKey}`, async () => {
      if (asset.mediaType.startsWith("image/")) {
        await Assets.load({ src: url, parser: "loadTextures" });
        this.#loadedUrls.add(url);
      } else {
        await fetchDeliveryBytes(this.#fetchImpl, new URL(url));
      }
    });
  }

  #loadOnce(key: string, load: () => Promise<void>): Promise<void> {
    if (this.#destroyed)
      return Promise.reject(
        new SceneLayoutError("Scene Layout delivery textures were destroyed."),
      );
    const existing = this.#loads.get(key);
    if (existing) return existing;
    const pending = load();
    this.#loads.set(key, pending);
    return pending;
  }

  async #loadAtlas(atlas: SceneLayoutDeliveryAtlasV1): Promise<void> {
    const pageUrl = containedDeliveryUrl(
      this.#urlPrefix,
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
    if (this.#destroyed) {
      await Assets.unload(pageUrl).catch(() => undefined);
      throw new SceneLayoutError(
        "Scene Layout delivery textures were destroyed.",
      );
    }
    this.#loadedUrls.add(pageUrl);
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

function parseDeliveryManifestUrl(value: string | URL): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene Layout delivery manifest URL is invalid: ${formatError(error)}`,
    );
  }
  if (!/^https?:$/u.test(url.protocol))
    throw new SceneLayoutError(
      "Scene Layout delivery manifest URL must use http or https.",
    );
  return url;
}

function parseDeliveryUrlPrefix(value: string | URL): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new SceneLayoutError(
      `Scene Layout delivery URL prefix is invalid: ${formatError(error)}`,
    );
  }
  if (!/^https?:$/u.test(url.protocol))
    throw new SceneLayoutError(
      "Scene Layout delivery URL prefix must use http or https.",
    );
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/")
  )
    throw new SceneLayoutError(
      "Scene Layout delivery URL prefix must be a credential-free directory URL without query or hash.",
    );
  return url;
}

function containedDeliveryUrl(urlPrefix: URL, path: string): URL {
  assertCanonicalPackagePath(path, { requireLowercase: true });
  const url = new URL(path, urlPrefix);
  if (
    url.origin !== urlPrefix.origin ||
    !url.pathname.startsWith(urlPrefix.pathname) ||
    url.search ||
    url.hash
  )
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
