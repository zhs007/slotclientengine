import {
  CELL_HEIGHT,
  CELL_WIDTH,
  DROP_TIMING,
  WALL_BASE_Y,
  WALL_COLUMNS,
} from "./config.js";
import {
  assertMegalithScene,
  type MegalithScene,
  type SymbolCode,
} from "./scene-data.js";

export interface DropScheduleEntry {
  readonly code: SymbolCode;
  readonly column: number;
  readonly row: number;
  readonly finalX: number;
  readonly finalY: number;
  readonly startY: number;
  readonly delaySeconds: number;
  readonly durationSeconds: number;
}

export function createDropSchedule(
  scene: MegalithScene,
): readonly DropScheduleEntry[] {
  assertMegalithScene(scene);
  const horizontalCenter = (WALL_COLUMNS - 1) / 2;
  const entries: DropScheduleEntry[] = [];
  for (let row = 0; row < scene[0]!.length; row += 1) {
    for (let column = 0; column < scene.length; column += 1) {
      const finalY = WALL_BASE_Y + row * CELL_HEIGHT;
      entries.push(
        Object.freeze({
          code: scene[column]![row]!,
          column,
          row,
          finalX: (column - horizontalCenter) * CELL_WIDTH,
          finalY,
          startY: finalY + DROP_TIMING.startClearance,
          delaySeconds:
            row * DROP_TIMING.rowDelaySeconds +
            column * DROP_TIMING.columnDelaySeconds,
          durationSeconds: DROP_TIMING.durationSeconds,
        }),
      );
    }
  }
  return Object.freeze(entries);
}

export function calculateDropY(
  entry: DropScheduleEntry,
  elapsedSeconds: number,
): number | null {
  const localTime = elapsedSeconds - entry.delaySeconds;
  if (localTime < 0) return null;
  const progress = Math.min(localTime / entry.durationSeconds, 1);
  if (progress >= 1) return entry.finalY;
  const gravityProgress = progress * progress;
  return entry.startY + (entry.finalY - entry.startY) * gravityProgress;
}

export function getScheduleDuration(
  entries: readonly DropScheduleEntry[],
): number {
  return entries.reduce(
    (duration, entry) =>
      Math.max(duration, entry.delaySeconds + entry.durationSeconds),
    0,
  );
}
