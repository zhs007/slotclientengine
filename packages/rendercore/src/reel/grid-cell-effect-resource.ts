import {
  validateOfficialSpineResource,
  type OfficialSpinePlayerResource,
} from "../spine/runtime-player.js";
import { ReelError } from "./errors.js";
import type {
  GridCellEffectId,
  ParsedReelManifest,
  ReelCellEffectManifest,
} from "./manifest.js";

// Spine stores timeline times as Float32. Keep the manifest-facing schedule at
// its stable decimal duration, but cross the official runtime boundary by a
// nanosecond-scale margin so completion still comes from Spine's real callback.
const SPINE_FLOAT_COMPLETION_MARGIN_SECONDS = 1e-9;

export interface GridCellEffectResource {
  readonly id: string;
  readonly playerResource: OfficialSpinePlayerResource;
  readonly animationName: string;
  readonly officialDurationSeconds: number;
  readonly durationSeconds: number;
  readonly completionBoundaryAdjustmentSeconds: number;
  readonly loopCount: 1;
  readonly finishBeforeStopMs: number;
  readonly transform: Readonly<{ x: number; y: number; scale: number }>;
}

export type GridCellEffectResourceMap = Readonly<
  Record<string, GridCellEffectResource>
>;

export function createGridCellEffectResourcesFromManifest(options: {
  readonly manifest: ParsedReelManifest;
  readonly skeletonModules: Readonly<Record<string, unknown>>;
  readonly atlasModules: Readonly<Record<string, string>>;
  readonly textureModules: Readonly<Record<string, string>>;
}): GridCellEffectResourceMap {
  const entries = (["normal", "anticipation"] as const).map((id) => [
    id,
    resolveEffect(id, options.manifest.spin.cellEffects[id], options),
  ]);
  return Object.freeze(Object.fromEntries(entries));
}

export function deriveGridCellEffectPoolCapacities(options: {
  readonly manifest: ParsedReelManifest;
  readonly resources: GridCellEffectResourceMap;
  readonly cellCount: number;
}): Readonly<Record<string, number>> {
  if (!Number.isSafeInteger(options.cellCount) || options.cellCount <= 0) {
    throw new ReelError("grid cell effect pool cellCount must be positive.");
  }
  const normal = requireResource(options.resources, "normal");
  const activated = requireResource(options.resources, "anticipation");
  return Object.freeze({
    normal: calculateConcurrentCapacity(
      normal.durationSeconds * 1000,
      options.manifest.spin.timing.stopStepMs,
      options.cellCount,
    ),
    anticipation: Math.max(
      calculateConcurrentCapacity(
        activated.durationSeconds * 1000,
        options.manifest.spin.anticipation.stopStepMs,
        options.cellCount,
      ),
      calculateConcurrentCapacity(
        activated.durationSeconds * 1000,
        options.manifest.cascade.anticipationRefill.sweep.startStepMs,
        options.cellCount,
      ),
      calculateConcurrentCapacity(
        activated.durationSeconds * 1000,
        options.manifest.cascade.anticipationRefill.spin.stopStepMs,
        options.cellCount,
      ),
    ),
  });
}

function resolveEffect(
  id: GridCellEffectId,
  spec: ReelCellEffectManifest,
  modules: {
    readonly skeletonModules: Readonly<Record<string, unknown>>;
    readonly atlasModules: Readonly<Record<string, string>>;
    readonly textureModules: Readonly<Record<string, string>>;
  },
): GridCellEffectResource {
  const skeleton = resolveExactModule(
    modules.skeletonModules,
    spec.skeleton,
    `${id} skeleton`,
  );
  const atlasText = resolveExactModule(
    modules.atlasModules,
    spec.atlas,
    `${id} atlas`,
  );
  const textureUrl = resolveExactModule(
    modules.textureModules,
    spec.texture,
    `${id} texture`,
  );
  const page = spec.texture.slice(2);
  const playerResource = Object.freeze({
    skeleton,
    atlasText,
    textureUrls: Object.freeze({ [page]: textureUrl }),
  });
  const validation = validateOfficialSpineResource({
    resource: playerResource,
    requiredAnimations: [spec.animation],
  });
  const parsedDurationSeconds = validation.animationDurations[spec.animation];
  if (!Number.isFinite(parsedDurationSeconds) || parsedDurationSeconds! <= 0) {
    throw new ReelError(
      `grid cell effect "${id}" animation "${spec.animation}" must have positive official duration.`,
    );
  }
  const officialDurationSeconds = parsedDurationSeconds!;
  const durationSeconds = Number(officialDurationSeconds.toFixed(7));
  const completionBoundaryAdjustmentSeconds =
    Math.max(0, officialDurationSeconds - durationSeconds) +
    SPINE_FLOAT_COMPLETION_MARGIN_SECONDS;
  return Object.freeze({
    id,
    playerResource,
    animationName: spec.animation,
    officialDurationSeconds,
    durationSeconds,
    completionBoundaryAdjustmentSeconds,
    loopCount: spec.loopCount,
    finishBeforeStopMs: spec.finishBeforeStopMs,
    transform: spec.transform,
  });
}

function resolveExactModule<T>(
  modules: Readonly<Record<string, T>>,
  resourcePath: string,
  label: string,
): T {
  const suffix = `/${resourcePath.slice(2)}`;
  const matches = Object.entries(modules).filter(
    ([modulePath]) =>
      modulePath.endsWith(suffix) || modulePath === resourcePath,
  );
  if (matches.length !== 1) {
    throw new ReelError(
      `grid cell effect ${label} path "${resourcePath}" must resolve exactly once; found ${matches.length}.`,
    );
  }
  return matches[0]![1];
}

function requireResource(
  resources: GridCellEffectResourceMap,
  id: string,
): GridCellEffectResource {
  const resource = resources[id];
  if (!resource)
    throw new ReelError(`Missing grid cell effect resource "${id}".`);
  return resource;
}

function calculateConcurrentCapacity(
  durationMs: number,
  stepMs: number,
  count: number,
): number {
  if (stepMs === 0) return count;
  const boundaryToleranceMs = 1e-3;
  return Math.min(
    count,
    Math.max(1, Math.ceil((durationMs - boundaryToleranceMs) / stepMs)),
  );
}
