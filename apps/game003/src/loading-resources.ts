import type {
  GameLoadingResource,
  GameLoadingResourceKind,
} from "@slotclientengine/gameloading";
import { GAME003_LOADING_RESOURCE_URLS } from "./generated/game-loading.generated.js";

export const GAME003_RUNTIME_MODULE_RESOURCE_ID = "game003-runtime-module";

export interface Game003PreparedLoadingSessionLike {
  readonly liveSession: {
    disconnect(): void;
  };
}

export interface Game003EnteredGameLike {
  destroy(): void;
}

export interface Game003RuntimeModule {
  prepareGame003At99(options: {
    readonly search: string;
  }): Promise<Game003PreparedLoadingSessionLike>;
  enterGame003(options: {
    readonly root: HTMLElement;
    readonly prepared: Game003PreparedLoadingSessionLike;
  }): Promise<Game003EnteredGameLike>;
}

export function createGame003LoadingResources(): readonly GameLoadingResource[] {
  return Object.freeze([
    ...GAME003_LOADING_RESOURCE_URLS.map(toGameLoadingResource),
    Object.freeze({
      id: GAME003_RUNTIME_MODULE_RESOURCE_ID,
      weight: 10,
      load: () => import("./game-entry.js"),
    } satisfies GameLoadingResource),
  ]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
