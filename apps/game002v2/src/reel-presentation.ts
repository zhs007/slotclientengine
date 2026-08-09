import reelPresentationManifest from "../../game002/config/reel-presentation.manifest.json" with { type: "json" };
import {
  createGridCellEffectController,
  createGridCellEffectResourceFromLoadedSpine,
  deriveGridCellEffectPoolCapacities,
  parseReelManifest,
  type GridCellEffectResourceMap,
  type ParsedReelManifest,
  type SceneLayoutPackageResource,
} from "@slotclientengine/rendercore";

export interface Game002v2ReelPresentation {
  readonly manifest: ParsedReelManifest;
  readonly resources: GridCellEffectResourceMap;
  readonly capacities: Readonly<Record<string, number>>;
  readonly columns: number;
  readonly rows: number;
}

export async function prepareGame002v2ReelPresentation(
  resource: SceneLayoutPackageResource,
): Promise<Game002v2ReelPresentation> {
  const manifest = parseReelManifest(reelPresentationManifest);
  const entries = await Promise.all(
    Object.entries(manifest.spin.cellEffects).map(async ([id, spec]) => {
      const key = exactRuntimeKey(spec.skeleton);
      const loaded = await resource.loadRuntimeResource(key, "spine");
      return [
        id,
        createGridCellEffectResourceFromLoadedSpine({
          id,
          resource: loaded,
          animationName: spec.animation,
          loopCount: spec.loopCount,
          finishBeforeStopMs: spec.finishBeforeStopMs,
          transform: spec.transform,
        }),
      ] as const;
    }),
  );
  const resources = Object.freeze(Object.fromEntries(entries));
  const geometry = resource.manifest.reels.main;
  if (!geometry)
    throw new Error("game002v2 Crave package requires reels.main.");
  return Object.freeze({
    manifest,
    resources,
    capacities: deriveGridCellEffectPoolCapacities({
      manifest,
      resources,
      cellCount: geometry.columns * geometry.rows,
    }),
    columns: geometry.columns,
    rows: geometry.rows,
  });
}

export function createGame002v2EffectController(
  resource: SceneLayoutPackageResource,
  presentation: Game002v2ReelPresentation,
) {
  const geometry = resource.manifest.reels.main;
  if (!geometry)
    throw new Error("game002v2 Crave package requires reels.main.");
  return createGridCellEffectController({
    resources: presentation.resources,
    capacities: presentation.capacities,
    columns: geometry.columns,
    rows: geometry.rows,
    cellWidth: geometry.cellSize.width,
    cellHeight: geometry.cellSize.height,
    columnGap: geometry.gap.x,
    rowGap: geometry.gap.y,
  });
}

function exactRuntimeKey(path: string): string {
  if (!/^\.\/[a-zA-Z0-9_-]+$/u.test(path))
    throw new Error(
      `game002v2 grid effect path "${path}" must map to one exact runtime key.`,
    );
  return path.slice(2);
}
