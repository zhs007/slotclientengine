import type {
  GameLoadingResource,
  GameLoadingResourceContext,
} from "@slotclientengine/gameloading";
import type { Game003v2Resource } from "./resource.js";
import { prepareGame003v2Resource } from "./resource.js";

export const MINECART2_DELIVERY_RESOURCE_ID = "game003v2-minecart2-delivery";

interface LoadedMinecart2Delivery {
  readonly kind: "minecart2-delivery";
  readonly resource: Game003v2Resource;
}

export function createGame003v2LoadingResources(
  documentBaseUrl: string | URL,
): readonly GameLoadingResource[] {
  return Object.freeze([
    Object.freeze({
      id: MINECART2_DELIVERY_RESOURCE_ID,
      url: new URL("delivery.manifest.json", documentBaseUrl).href,
      async load({ signal }: GameLoadingResourceContext) {
        const resource = await prepareGame003v2Resource(
          new URL("delivery.manifest.json", documentBaseUrl),
          signal,
        );
        return Object.freeze({ kind: "minecart2-delivery", resource });
      },
      async dispose(value: unknown) {
        if (isLoadedMinecart2Delivery(value))
          await value.resource.package.destroy();
      },
    }),
  ]);
}

export function readMinecart2Resource(
  loaded: ReadonlyMap<string, unknown>,
): Game003v2Resource {
  const value = loaded.get(MINECART2_DELIVERY_RESOURCE_ID);
  if (!isLoadedMinecart2Delivery(value))
    throw new Error("Minecart2 delivery was not loaded.");
  return value.resource;
}

function isLoadedMinecart2Delivery(
  value: unknown,
): value is LoadedMinecart2Delivery {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === "minecart2-delivery" &&
    typeof (value as { readonly resource?: { readonly package?: unknown } })
      .resource?.package === "object"
  );
}
