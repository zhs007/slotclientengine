import type {
  GameLoadingResource,
  GameLoadingResourceKind,
} from "@slotclientengine/gameloading";
import { GAME003_LOADING_RESOURCE_URLS } from "./generated/game-loading.generated.js";
import { craveSceneLayoutPhysicalResourceUrls as minecart2SceneLayoutPhysicalResourceUrls } from "./generated/minecart2-layout-resources.generated.js";
import type { Game003SkinId } from "./skin-id.js";

export const GAME003_RUNTIME_MODULE_RESOURCE_ID = "game003-runtime-module";
export const GAME003_MINECART2_RESOURCE_ID_PREFIX =
  "game003-minecart2-package:";

export interface Game003PreparedLoadingSessionLike {
  readonly liveSession: {
    disconnect(): void;
  };
}

export interface Game003EnteredGameLike {
  destroy(): Promise<void> | void;
}

export interface Game003RuntimeModule {
  prepareGame003At99(options: {
    readonly search: string;
    readonly loadedResources?: ReadonlyMap<string, unknown>;
    readonly signal?: AbortSignal;
  }): Promise<Game003PreparedLoadingSessionLike>;
  enterGame003(options: {
    readonly root: HTMLElement;
    readonly prepared: Game003PreparedLoadingSessionLike;
  }): Promise<Game003EnteredGameLike>;
}

export function createGame003LoadingResources(
  skin: Game003SkinId = "1",
): readonly GameLoadingResource[] {
  const skinResources =
    skin === "1"
      ? GAME003_LOADING_RESOURCE_URLS.map(toGameLoadingResource)
      : createMinecart2LoadingResources();
  return Object.freeze([
    ...skinResources,
    Object.freeze({
      id: GAME003_RUNTIME_MODULE_RESOURCE_ID,
      weight: 10,
      load: () => import("./game-entry.js"),
    } satisfies GameLoadingResource),
  ]);
}

export function readGame003Minecart2PackageFiles(
  loadedResources: ReadonlyMap<string, unknown>,
): ReadonlyMap<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const path of Object.keys(minecart2SceneLayoutPhysicalResourceUrls)) {
    const value = loadedResources.get(
      `${GAME003_MINECART2_RESOURCE_ID_PREFIX}${path}`,
    );
    if (!(value instanceof ArrayBuffer)) {
      throw new Error(
        `game003 minecart2 package resource "${path}" was not loaded.`,
      );
    }
    files.set(path, new Uint8Array(value.slice(0)));
  }
  return files;
}

export function readGame003RuntimeModule(
  loadedResources: ReadonlyMap<string, unknown>,
): Game003RuntimeModule {
  const runtimeModule = loadedResources.get(GAME003_RUNTIME_MODULE_RESOURCE_ID);
  if (!isRecord(runtimeModule)) {
    throw new Error("game003 runtime module was not loaded.");
  }
  if (
    typeof runtimeModule.prepareGame003At99 !== "function" ||
    typeof runtimeModule.enterGame003 !== "function"
  ) {
    throw new Error("game003 runtime module is missing required exports.");
  }
  return runtimeModule as unknown as Game003RuntimeModule;
}

function toGameLoadingResource(resource: {
  readonly id: string;
  readonly url: string;
  readonly kind?: string;
  readonly weight?: number;
}): GameLoadingResource {
  return Object.freeze({
    id: resource.id,
    url: resource.url,
    ...(resource.kind === undefined
      ? {}
      : { kind: resource.kind as GameLoadingResourceKind }),
    ...(resource.weight === undefined ? {} : { weight: resource.weight }),
  });
}

function createMinecart2LoadingResources(): readonly GameLoadingResource[] {
  return Object.freeze(
    Object.entries(minecart2SceneLayoutPhysicalResourceUrls).map(
      ([path, url]) =>
        Object.freeze({
          id: `${GAME003_MINECART2_RESOURCE_ID_PREFIX}${path}`,
          url,
          kind: "binary" as const,
        }),
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
