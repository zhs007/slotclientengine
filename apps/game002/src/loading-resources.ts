import type { GameLoadingResource } from "@slotclientengine/gameloading";
import craveAssetsMap from "../../../assets/crave/assets.map.json";
import { craveSceneLayoutPhysicalResourceUrls } from "./generated/crave-layout-resources.generated.js";

const CRAVE_ASSETS_MAP_FILES: Readonly<
  Record<string, { readonly path: string }>
> = craveAssetsMap.files;
const CRAVE_PHYSICAL_RESOURCE_URLS: Readonly<Record<string, string>> =
  craveSceneLayoutPhysicalResourceUrls;

export const GAME002_RUNTIME_MODULE_RESOURCE_ID = "game002-runtime-module";
export const GAME002_CRAVE_RESOURCE_ID_PREFIX = "game002-crave-package:";
const GAME002_DEFERRED_RUNTIME_PHYSICAL_PATHS = new Set(
  ["nearwin1.json", "nearwin2.json", "nearwin3.json"].flatMap((key) => {
    const path = CRAVE_ASSETS_MAP_FILES[key]?.path;
    return typeof path === "string" ? [path] : [];
  }),
);

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
  for (const path of Object.keys(CRAVE_PHYSICAL_RESOURCE_URLS)) {
    if (GAME002_DEFERRED_RUNTIME_PHYSICAL_PATHS.has(path)) continue;
    const value = loadedResources.get(
      `${GAME002_CRAVE_RESOURCE_ID_PREFIX}${path}`,
    );
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
  const packageResources = Object.entries(CRAVE_PHYSICAL_RESOURCE_URLS)
    .filter(([path]) => !GAME002_DEFERRED_RUNTIME_PHYSICAL_PATHS.has(path))
    .map(([path, url]) =>
      Object.freeze({
        id: `${GAME002_CRAVE_RESOURCE_ID_PREFIX}${path}`,
        url,
        kind: "binary" as const,
      }),
    );
  return deduplicateGame002LoadingResourceUrls(packageResources);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
