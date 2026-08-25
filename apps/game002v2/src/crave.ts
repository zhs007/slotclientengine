import type {
  GameLoadingResource,
  GameLoadingResourceContext,
} from "@slotclientengine/gameloading";
import { loadSceneLayoutDeliveryFromUrl } from "@slotclientengine/rendercore/scene-layout/core";

const DELIVERY_MANIFEST = "delivery.manifest.json";
const DELIVERY_RESOURCE_ID = `crave:${DELIVERY_MANIFEST}`;

export function createCraveLoadingResources(): readonly GameLoadingResource[] {
  return Object.freeze([
    Object.freeze({
      id: DELIVERY_RESOURCE_ID,
      url: DELIVERY_MANIFEST,
      kind: "binary" as const,
      async load({ signal }: GameLoadingResourceContext) {
        const response = await fetch(
          new URL(DELIVERY_MANIFEST, document.baseURI),
          { signal },
        );
        if (response.status === 404) return null;
        if (!response.ok)
          throw new Error(
            `Crave fetch failed (${response.status}): ${DELIVERY_MANIFEST}`,
          );
        return response.arrayBuffer();
      },
    }),
  ]);
}

export async function createCraveResource(
  loaded: ReadonlyMap<string, unknown>,
  signal?: AbortSignal,
) {
  const value = loaded.get(DELIVERY_RESOURCE_ID);
  if (!(value instanceof ArrayBuffer))
    throw new Error("Crave delivery manifest was not loaded.");
  return loadSceneLayoutDeliveryFromUrl({
    manifestUrl: new URL(DELIVERY_MANIFEST, document.baseURI),
    manifestBytes: new Uint8Array(value.slice(0)),
    ...(signal
      ? {
          fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
            globalThis.fetch(input, { ...init, signal })) as typeof fetch,
        }
      : {}),
  });
}
