import { boardDepth, boardWidth, GROUND } from "./config.js";
import { createRandom } from "./random.js";

export interface PlantPlacement {
  readonly x: number;
  readonly z: number;
  readonly rotation: number;
  readonly scale: number;
  readonly phase: number;
  readonly paletteIndex: number;
}

export interface PlacementOptions {
  readonly count: number;
  readonly seed: number;
  readonly boardClearance: number;
  readonly edgeInset: number;
  readonly scaleRange: readonly [number, number];
  readonly paletteSize: number;
}

export function isOutsideBoard(
  x: number,
  z: number,
  clearance: number,
): boolean {
  return (
    Math.abs(x) > boardWidth / 2 + clearance ||
    Math.abs(z) > boardDepth / 2 + clearance
  );
}

export function createPerimeterPlacements(
  options: PlacementOptions,
): readonly PlantPlacement[] {
  const random = createRandom(options.seed);
  const placements: PlantPlacement[] = [];
  const maxX = GROUND.width / 2 - options.edgeInset;
  const maxZ = GROUND.depth / 2 - options.edgeInset;
  let attempts = 0;
  while (placements.length < options.count && attempts < options.count * 80) {
    attempts += 1;
    const x = random.range(-maxX, maxX);
    const z = random.range(-maxZ, maxZ);
    if (!isOutsideBoard(x, z, options.boardClearance)) continue;
    placements.push({
      x,
      z,
      rotation: random.range(0, Math.PI * 2),
      scale: random.range(options.scaleRange[0], options.scaleRange[1]),
      phase: random.range(0, Math.PI * 2),
      paletteIndex: random.integer(0, options.paletteSize - 1),
    });
  }
  if (placements.length !== options.count) {
    throw new Error(
      `Unable to place ${options.count} perimeter plants after ${attempts} attempts.`,
    );
  }
  return placements;
}
