import game002SpineAtlasUrl from "../../../assets/game002-s3/Symbol.atlas?url";
import game002SpineTextureUrl from "../../../assets/game002-s3/Symbol.png?url";
import type { GameLoadingResource } from "@slotclientengine/gameloading";
import type { Game002SkinId } from "./skin-id.js";
import { craveSceneLayoutPhysicalResourceUrls } from "./generated/crave-layout-resources.generated.js";

export const GAME002_RUNTIME_MODULE_RESOURCE_ID = "game002-runtime-module";
export const GAME002_CRAVE_RESOURCE_ID_PREFIX = "game002-crave-package:";

const reelEffectSkeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{Nearwin1,Nearwin2}.json",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;

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

export function createGame002LoadingResources(
  skin: Game002SkinId = "2",
): readonly GameLoadingResource[] {
  if (skin !== "2") throw new Error('game002 loading only supports skin "2".');
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
  for (const path of Object.keys(craveSceneLayoutPhysicalResourceUrls)) {
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
  const packageResources = Object.entries(
    craveSceneLayoutPhysicalResourceUrls,
  ).map(([path, url]) =>
    Object.freeze({
      id: `${GAME002_CRAVE_RESOURCE_ID_PREFIX}${path}`,
      url,
      kind: "binary" as const,
    }),
  );
  const effectSkeletons = Object.entries(reelEffectSkeletonModules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, url]) =>
      Object.freeze({
        id: `game002-reel-effect-spine-skeletons:${getBaseName(path)}`,
        url,
      }),
    );
  if (effectSkeletons.length !== 2)
    throw new Error(
      "game002 Crave presentation extension must contain Nearwin1/2 skeletons.",
    );
  return deduplicateGame002LoadingResourceUrls([
    ...packageResources,
    Object.freeze({
      id: "game002-symbol-spine-atlas",
      url: game002SpineAtlasUrl,
    }),
    Object.freeze({
      id: "game002-symbol-spine-texture",
      url: game002SpineTextureUrl,
      weight: 3,
    }),
    ...effectSkeletons,
  ]);
}

function getBaseName(modulePath: string): string {
  const name = modulePath.split("/").at(-1);
  if (!name)
    throw new Error(
      `Cannot derive game002 loading basename from "${modulePath}".`,
    );
  return name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
