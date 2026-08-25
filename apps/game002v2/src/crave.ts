import type {
  GameLoadingResource,
  GameLoadingResourceContext,
} from "@slotclientengine/gameloading";
import { loadSceneLayoutDeliveryFromUrl } from "@slotclientengine/rendercore/scene-layout/core";

const DELIVERY_MANIFEST = "delivery.manifest.json";
const DELIVERY_RESOURCE_ID = "crave:delivery";

interface LoadedCraveDelivery {
  readonly kind: "crave-delivery";
  readonly resource: Awaited<ReturnType<typeof loadSceneLayoutDeliveryFromUrl>>;
}

export function createCraveLoadingResources(): readonly GameLoadingResource[] {
  return Object.freeze([
    Object.freeze({
      id: DELIVERY_RESOURCE_ID,
      url: DELIVERY_MANIFEST,
      async load({ signal }: GameLoadingResourceContext) {
        const resource = await loadSceneLayoutDeliveryFromUrl({
          manifestUrl: new URL(DELIVERY_MANIFEST, document.baseURI),
          fetchImpl: ((input: RequestInfo | URL, init?: RequestInit) =>
            globalThis.fetch(input, { ...init, signal })) as typeof fetch,
        });
        return Object.freeze({ kind: "crave-delivery", resource });
      },
      async dispose(value: unknown) {
        if (isLoadedCraveDelivery(value)) await value.resource.destroy();
      },
    }),
  ]);
}

export async function createCraveResource(
  loaded: ReadonlyMap<string, unknown>,
) {
  const value = loaded.get(DELIVERY_RESOURCE_ID);
  if (!isLoadedCraveDelivery(value))
    throw new Error("Crave delivery was not loaded.");
  return value.resource;
}

function isLoadedCraveDelivery(value: unknown): value is LoadedCraveDelivery {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === "crave-delivery" &&
    typeof (value as { readonly resource?: { readonly destroy?: unknown } })
      .resource?.destroy === "function"
  );
}
