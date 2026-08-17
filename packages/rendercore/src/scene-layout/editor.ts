import type { AwardCelebrationSnapshot } from "../popup/core/types.js";
import { inspectActiveAwardCelebrationRuntime } from "./package-runtime.js";
import type { SceneLayoutPackageRuntime } from "./types.js";

export interface SceneLayoutPackageRuntimeInspector {
  getActiveAwardCelebrationSnapshot(): AwardCelebrationSnapshot | null;
}

export function createSceneLayoutPackageRuntimeInspector(
  runtime: SceneLayoutPackageRuntime,
): SceneLayoutPackageRuntimeInspector {
  return Object.freeze({
    getActiveAwardCelebrationSnapshot: () =>
      inspectActiveAwardCelebrationRuntime(runtime),
  });
}
