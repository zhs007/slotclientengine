import type { AwardCelebrationSnapshot } from "../popup/core/types.js";
import {
  inspectActiveAwardCelebrationRuntime,
  inspectSceneLayoutGameModeRuntime,
} from "./package-runtime.js";
import type {
  SceneLayoutGameModeSnapshot,
  SceneLayoutPackageRuntime,
} from "./types.js";

export interface SceneLayoutPackageRuntimeInspector {
  getActiveAwardCelebrationSnapshot(): AwardCelebrationSnapshot | null;
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
}

export function createSceneLayoutPackageRuntimeInspector(
  runtime: SceneLayoutPackageRuntime,
): SceneLayoutPackageRuntimeInspector {
  return Object.freeze({
    getActiveAwardCelebrationSnapshot: () =>
      inspectActiveAwardCelebrationRuntime(runtime),
    getGameModeSnapshot: () => inspectSceneLayoutGameModeRuntime(runtime),
  });
}
