import { BOARD, BUBBLES } from "./config.js";
import { createRandom, randomBetween } from "./random.js";

export interface SymbolPlacement {
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly phase: number;
  readonly paletteIndex: number;
  readonly scale: number;
}

export interface BubblePlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly speed: number;
  readonly phase: number;
}

export function createSymbolPlacements(seed: number): SymbolPlacement[] {
  const random = createRandom(seed);
  const width = (BOARD.columns - 1) * (BOARD.cellWidth + BOARD.gapX);
  const height = (BOARD.rows - 1) * (BOARD.cellHeight + BOARD.gapY);
  const placements: SymbolPlacement[] = [];
  for (let row = 0; row < BOARD.rows; row += 1) {
    for (let column = 0; column < BOARD.columns; column += 1) {
      placements.push({
        column,
        row,
        x: column * (BOARD.cellWidth + BOARD.gapX) - width / 2,
        y: BOARD.centerY + height / 2 - row * (BOARD.cellHeight + BOARD.gapY),
        z: randomBetween(random, -0.25, 0.3),
        phase: randomBetween(random, 0, Math.PI * 2),
        paletteIndex: Math.floor(random() * 7),
        scale: randomBetween(random, 0.88, 1.08),
      });
    }
  }
  return placements;
}

export function createBubblePlacements(
  seed: number = BUBBLES.seed,
  count: number = BUBBLES.count,
): BubblePlacement[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, () => ({
    x: randomBetween(random, BUBBLES.minX, BUBBLES.maxX),
    y: randomBetween(random, BUBBLES.minY, BUBBLES.maxY),
    z: randomBetween(random, BUBBLES.minZ, BUBBLES.maxZ),
    radius: randomBetween(random, 0.045, 0.22),
    speed: randomBetween(random, 0.28, 0.86),
    phase: randomBetween(random, 0, Math.PI * 2),
  }));
}
