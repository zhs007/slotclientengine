import type {
  SlotCascadeMovementFact,
  SlotCascadeValueCommit,
} from "@slotclientengine/logiccore";
import { ReelError } from "./errors.js";
import type {
  GridCellCascadeDropMovement,
  GridCellCascadeDropPlan,
  GridCellCascadeMotionOptions,
} from "./types.js";

export function createGridCellCascadeDropPlan(options: {
  readonly columns: number;
  readonly rows: number;
  readonly movements: readonly SlotCascadeMovementFact[];
  readonly valueCommits: readonly SlotCascadeValueCommit[];
  readonly cellHeight: number;
  readonly rowGap?: number;
  readonly motion: GridCellCascadeMotionOptions;
}): GridCellCascadeDropPlan {
  const cellHeight = assertPositiveFinite(options.cellHeight, "cellHeight");
  const rowGap = assertNonNegativeFinite(options.rowGap ?? 0, "rowGap");
  const motion = parseMotion(options.motion);
  const movements: GridCellCascadeDropMovement[] = [];
  const ordered = [...options.movements].sort(
    (left, right) =>
      left.target.x - right.target.x || right.target.y - left.target.y,
  );
  const columnIndexes = new Map<number, number>();
  for (const movement of ordered) {
    const staggerIndex = columnIndexes.get(movement.target.x) ?? 0;
    columnIndexes.set(movement.target.x, staggerIndex + 1);
    const rowsFallen = movement.target.y - movement.source.y;
    const fallSeconds = Math.min(
      motion.maxFallSeconds,
      motion.baseFallSeconds + rowsFallen * motion.perRowFallSeconds,
    );
    const common = {
      x: movement.target.x,
      sourceY: movement.source.y,
      targetY: movement.target.y,
      startSeconds:
        movement.target.x * motion.columnStartStaggerSeconds +
        staggerIndex * motion.startStaggerSeconds,
      fallSeconds,
      settleSeconds: motion.settleSeconds,
      overshootPixels: (cellHeight + rowGap) * motion.overshootCellRatio,
    };
    movements.push(
      Object.freeze(
        movement.kind === "existing"
          ? { kind: movement.kind, ...common }
          : {
              kind: movement.kind,
              ...common,
              outputCode: movement.outputCode,
              outputPresentationValue: movement.outputValue,
            },
      ),
    );
  }
  const totalSeconds = movements.reduce(
    (maximum, movement) =>
      Math.max(
        maximum,
        movement.startSeconds + movement.fallSeconds + movement.settleSeconds,
      ),
    0,
  );
  return Object.freeze({
    columns: options.columns,
    rows: options.rows,
    movements: Object.freeze(movements),
    valueCommits: Object.freeze(
      options.valueCommits.map(({ position, value }) =>
        Object.freeze({
          x: position.x,
          y: position.y,
          presentationValue: value,
        }),
      ),
    ),
    totalSeconds,
  });
}

export function createGridCellCascadeDropdownPlan(
  options: Parameters<typeof createGridCellCascadeDropPlan>[0],
): GridCellCascadeDropPlan {
  return createGridCellCascadeDropPlan(options);
}

function parseMotion(
  value: GridCellCascadeMotionOptions,
): GridCellCascadeMotionOptions {
  const parsed = Object.freeze({
    columnStartStaggerSeconds: assertNonNegativeFinite(
      value.columnStartStaggerSeconds,
      "columnStartStaggerSeconds",
    ),
    startStaggerSeconds: assertNonNegativeFinite(
      value.startStaggerSeconds,
      "startStaggerSeconds",
    ),
    baseFallSeconds: assertPositiveFinite(
      value.baseFallSeconds,
      "baseFallSeconds",
    ),
    perRowFallSeconds: assertNonNegativeFinite(
      value.perRowFallSeconds,
      "perRowFallSeconds",
    ),
    maxFallSeconds: assertPositiveFinite(
      value.maxFallSeconds,
      "maxFallSeconds",
    ),
    overshootCellRatio: assertNonNegativeFinite(
      value.overshootCellRatio,
      "overshootCellRatio",
    ),
    settleSeconds: assertPositiveFinite(value.settleSeconds, "settleSeconds"),
  });
  if (parsed.maxFallSeconds < parsed.baseFallSeconds)
    throw new ReelError("maxFallSeconds must be at least baseFallSeconds.");
  return parsed;
}

function assertPositiveFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new ReelError(label + " must be a finite positive number.");
  return value;
}

function assertNonNegativeFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new ReelError(label + " must be a finite non-negative number.");
  return value;
}
