import type {
  GameLoadingResource,
  GameLoadingResourceContext,
} from "@slotclientengine/gameloading";
import { createSceneLayoutPackageResource } from "@slotclientengine/rendercore";
import craveMap from "../../../assets/crave/assets.map.json" with { type: "json" };

const ROOT_FILES = Object.freeze(["layout.manifest.json", "assets.map.json"]);
const mappedFiles: Readonly<Record<string, { readonly path: string }>> =
  craveMap.files;

export function createCraveLoadingResources(): readonly GameLoadingResource[] {
  const paths = [
    ...ROOT_FILES,
    ...new Set(Object.values(mappedFiles).map((entry) => entry.path)),
  ];
  return Object.freeze(
    paths.map((path) =>
      Object.freeze({
        id: `crave:${path}`,
        url: path,
        kind: "binary" as const,
        async load({ signal }: GameLoadingResourceContext) {
          const response = await fetch(new URL(path, document.baseURI), {
            signal,
          });
          if (response.status === 404) return null;
          if (!response.ok)
            throw new Error(`Crave fetch failed (${response.status}): ${path}`);
          return response.arrayBuffer();
        },
      }),
    ),
  );
}

export async function createCraveResource(
  loaded: ReadonlyMap<string, unknown>,
) {
  const files = new Map<string, Uint8Array>();
  for (const path of [
    ...ROOT_FILES,
    ...new Set(Object.values(mappedFiles).map((entry) => entry.path)),
  ]) {
    const value = loaded.get(`crave:${path}`);
    if (value instanceof ArrayBuffer)
      files.set(path, new Uint8Array(value.slice(0)));
  }
  return createSceneLayoutPackageResource({
    files,
    lazyRuntimeResources: true,
    loadRuntimeResourceBytes: async (logicalKey) => {
      const path = mappedFiles[logicalKey]?.path;
      const bytes = path ? files.get(path) : undefined;
      if (!bytes) throw new Error(`Missing Crave resource: ${logicalKey}`);
      return bytes.slice();
    },
  });
}
