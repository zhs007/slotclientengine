import type { GameLoadingResource } from "@slotclientengine/gameloading";
import { craveSceneLayoutPhysicalResourceUrls as minecart2Urls } from "./generated/minecart2-layout-resources.generated.js";

export const MINECART2_RESOURCE_PREFIX = "game003v2-minecart2:";

export function createGame003v2LoadingResources(): readonly GameLoadingResource[] {
  return Object.freeze(
    Object.entries(minecart2Urls).map(([path, url]) =>
      Object.freeze({
        id: `${MINECART2_RESOURCE_PREFIX}${path}`,
        url,
        kind: "binary" as const,
      }),
    ),
  );
}

export function readMinecart2Files(
  loaded: ReadonlyMap<string, unknown>,
): ReadonlyMap<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  for (const path of Object.keys(minecart2Urls)) {
    const value = loaded.get(`${MINECART2_RESOURCE_PREFIX}${path}`);
    if (!(value instanceof ArrayBuffer))
      throw new Error(`Minecart2 resource "${path}" was not loaded.`);
    files.set(path, new Uint8Array(value.slice(0)));
  }
  return files;
}
