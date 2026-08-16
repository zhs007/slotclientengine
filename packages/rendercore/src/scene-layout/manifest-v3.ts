import { SceneLayoutError } from "./errors.js";
import {
  parseSceneLayoutManifestV2,
  upgradeSceneLayoutManifestToV2,
} from "./manifest-v2.js";
import {
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutRuntimeAllocation,
} from "./runtime-allocation.js";
import type {
  SceneLayoutManifestLatest,
  SceneLayoutManifestV3,
} from "./types.js";

export function parseSceneLayoutManifestV3(
  value: unknown,
): SceneLayoutManifestV3 {
  const root = record(value, "scene layout manifest");
  if (root.version !== 3)
    throw new SceneLayoutError("scene layout manifest.version must be 3.");
  if (!Object.hasOwn(root, "runtimeAllocation"))
    throw new SceneLayoutError(
      "scene layout manifest v3.runtimeAllocation is required.",
    );
  const { runtimeAllocation, ...source } = root;
  const parsedV2 = parseSceneLayoutManifestV2({ ...source, version: 2 });
  const allocation = parseSceneLayoutRuntimeAllocation(
    runtimeAllocation,
    parsedV2,
  );
  return deepFreeze({
    ...parsedV2,
    version: 3,
    runtimeAllocation: allocation,
  });
}

export function upgradeSceneLayoutManifestToLatest(
  value: unknown,
): SceneLayoutManifestLatest {
  const root = record(value, "scene layout manifest");
  if (root.version === 3) return parseSceneLayoutManifestV3(value);
  const source = upgradeSceneLayoutManifestToV2(value);
  return parseSceneLayoutManifestV3({
    ...source,
    version: 3,
    runtimeAllocation: createSceneLayoutRuntimeAllocation(source),
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SceneLayoutError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}
