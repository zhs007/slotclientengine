import type { GameLoadingResource } from "@slotclientengine/gameloading";

export const MINECART2_MANIFEST_RESOURCE_ID = "game003v2-minecart2-manifest";

export function createGame003v2LoadingResources(
  documentBaseUrl: string | URL,
): readonly GameLoadingResource[] {
  return Object.freeze([
    Object.freeze({
      id: MINECART2_MANIFEST_RESOURCE_ID,
      url: new URL("delivery.manifest.json", documentBaseUrl).href,
      kind: "binary" as const,
    }),
  ]);
}

export function readMinecart2Manifest(
  loaded: ReadonlyMap<string, unknown>,
): Uint8Array {
  const value = loaded.get(MINECART2_MANIFEST_RESOURCE_ID);
  if (!(value instanceof ArrayBuffer))
    throw new Error("Minecart2 layout manifest was not loaded.");
  return new Uint8Array(value.slice(0));
}
