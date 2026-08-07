import type {
  GameLoadingResource,
  GameLoadingResourceContext,
} from "@slotclientengine/gameloading";
import {
  GAME002_CRAVE_DEFERRED_PHYSICAL_PATHS,
  listGame002CravePhysicalPaths,
  resolveGame002CraveResourceUrl,
} from "./crave-package-paths.js";

export const GAME002_RUNTIME_MODULE_RESOURCE_ID = "game002-runtime-module";
export const GAME002_CRAVE_RESOURCE_ID_PREFIX = "game002-crave-package:";

export interface Game002PreparedLoadingSessionLike {
  readonly readiness: { destroy(): void };
}

export interface Game002EnteredGameLike {
  destroy(): Promise<void>;
}

export interface Game002RuntimeModule {
  finalizeGame002At99(options: {
    readonly readinessResult: import("./game002-bootstrap.js").Game002ReadinessResult;
    readonly loadedResources?: ReadonlyMap<string, unknown>;
    readonly signal: AbortSignal;
  }): Promise<Game002PreparedLoadingSessionLike>;
  enterGame002(options: {
    readonly root: HTMLElement;
    readonly prepared: Game002PreparedLoadingSessionLike;
  }): Promise<Game002EnteredGameLike>;
}

export function deduplicateGame002LoadingResourceUrls(
  candidates: readonly GameLoadingResource[],
): readonly GameLoadingResource[] {
  const resources: GameLoadingResource[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const resource of candidates) {
    if (seenIds.has(resource.id))
      throw new Error(
        `Duplicate game002 loading resource id "${resource.id}".`,
      );
    seenIds.add(resource.id);
    if (!resource.url)
      throw new Error(
        `Missing game002 loading resource URL for "${resource.id}".`,
      );
    if (seenUrls.has(resource.url)) continue;
    seenUrls.add(resource.url);
    resources.push(Object.freeze(resource));
  }
  return Object.freeze(resources);
}

export function createGame002LoadingResources(): readonly GameLoadingResource[] {
  return Object.freeze([
    ...createCraveLoadingResources(),
    Object.freeze({
      id: GAME002_RUNTIME_MODULE_RESOURCE_ID,
      weight: 10,
      load: () => import("./game-entry.js"),
    } satisfies GameLoadingResource),
  ]);
}

export function readGame002CravePackageFiles(
  loadedResources: ReadonlyMap<string, unknown>,
): ReadonlyMap<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const path of listGame002CravePhysicalPaths()) {
    if (GAME002_CRAVE_DEFERRED_PHYSICAL_PATHS.has(path)) continue;
    const value = loadedResources.get(
      `${GAME002_CRAVE_RESOURCE_ID_PREFIX}${path}`,
    );
    if (value === null) continue;
    if (!(value instanceof ArrayBuffer))
      throw new Error(
        `game002 Crave package resource "${path}" was not loaded.`,
      );
    files.set(path, new Uint8Array(value.slice(0)));
  }
  return files;
}

export function readGame002RuntimeModule(
  loadedResources: ReadonlyMap<string, unknown>,
): Game002RuntimeModule {
  const runtimeModule = loadedResources.get(GAME002_RUNTIME_MODULE_RESOURCE_ID);
  if (!isRecord(runtimeModule))
    throw new Error("game002 runtime module was not loaded.");
  if (
    typeof runtimeModule.finalizeGame002At99 !== "function" ||
    typeof runtimeModule.enterGame002 !== "function"
  )
    throw new Error("game002 runtime module is missing required exports.");
  return runtimeModule as unknown as Game002RuntimeModule;
}

function createCraveLoadingResources(): readonly GameLoadingResource[] {
  const packageResources = listGame002CravePhysicalPaths()
    .filter((path) => !GAME002_CRAVE_DEFERRED_PHYSICAL_PATHS.has(path))
    .map((path) =>
      Object.freeze({
        id: `${GAME002_CRAVE_RESOURCE_ID_PREFIX}${path}`,
        url: resolveGame002CraveResourceUrl(path),
        kind: "binary" as const,
        load: ({ signal }: GameLoadingResourceContext) =>
          loadCravePackageFile(path, signal),
      }),
    );
  return deduplicateGame002LoadingResourceUrls(packageResources);
}

async function loadCravePackageFile(
  path: string,
  signal: AbortSignal,
): Promise<ArrayBuffer | null> {
  const response = await fetch(resolveGame002CraveResourceUrl(path), {
    signal,
  });
  if (response.status === 404 && path.startsWith("assets/")) return null;
  if (!response.ok)
    throw new Error(
      `game002 Crave package fetch failed (${response.status}): ${path}.`,
    );
  return response.arrayBuffer();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
