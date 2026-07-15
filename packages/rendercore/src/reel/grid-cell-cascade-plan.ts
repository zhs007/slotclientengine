import { ReelError } from "./errors.js";
import {
  CASCADE_EMPTY_CELL,
  type GridCellCascadeDropMovement,
  type GridCellCascadeDropOccurrenceContext,
  type GridCellCascadeDropPlan,
  type GridCellCascadeMotionOptions,
  type GridCellCascadeScene,
  type GridCellCascadeValueMatrix,
} from "./types.js";

export function createGridCellCascadeDropPlan(options: {
  readonly sourceScene: GridCellCascadeScene;
  readonly sourceValues: GridCellCascadeValueMatrix;
  readonly settledScene: GridCellCascadeScene;
  readonly settledValues: GridCellCascadeValueMatrix;
  readonly targetScene: GridCellCascadeScene;
  readonly targetValues: GridCellCascadeValueMatrix;
  readonly refillPositions: readonly {
    readonly x: number;
    readonly y: number;
  }[];
  readonly canDropOccurrence?: (
    context: GridCellCascadeDropOccurrenceContext,
  ) => boolean;
  readonly cellHeight: number;
  readonly motion: GridCellCascadeMotionOptions;
}): GridCellCascadeDropPlan {
  const sourceScene = parseHoleScene(options.sourceScene, "sourceScene");
  const columns = sourceScene.length;
  const rows = sourceScene[0]?.length ?? 0;
  const targetScene = parseHoleScene(
    options.targetScene,
    "targetScene",
    columns,
    rows,
  );
  const sourceValues = parseHoleValues(
    options.sourceValues,
    sourceScene,
    "sourceValues",
  );
  const settledScene = parseHoleScene(
    options.settledScene,
    "settledScene",
    columns,
    rows,
  );
  const settledValues = parseHoleValues(
    options.settledValues,
    settledScene,
    "settledValues",
  );
  const targetValues = parseHoleValues(
    options.targetValues,
    targetScene,
    "targetValues",
  );
  const cellHeight = assertPositiveFinite(options.cellHeight, "cellHeight");
  const motion = parseMotion(options.motion);
  const refillPositions = parseRefillPositions(
    options.refillPositions,
    settledScene,
  );
  validateRefillTarget(
    settledScene,
    settledValues,
    targetScene,
    targetValues,
    refillPositions,
  );
  const movements: GridCellCascadeDropMovement[] = [];

  for (let x = 0; x < columns; x += 1) {
    const source = occupiedOccurrences(sourceScene[x], sourceValues[x]);
    const target = occupiedOccurrences(settledScene[x], settledValues[x]);
    if (source.length !== target.length) {
      throw new ReelError(`cascade column ${x} occurrence count changed.`);
    }
    const fixed = source.filter(
      (occurrence) =>
        options.canDropOccurrence?.({
          x,
          sourceY: occurrence.y,
          code: occurrence.code,
          presentationValue: occurrence.value,
        }) === false,
    );
    const fixedKeys = new Set(fixed.map((occurrence) => occurrence.y));
    for (const occurrence of fixed) {
      const settledCode = settledScene[x][occurrence.y];
      const settledValue = settledValues[x][occurrence.y];
      if (
        settledCode !== occurrence.code ||
        settledValue !== occurrence.value
      ) {
        throw new ReelError(
          `cascade fixed occurrence changed at (${x},${occurrence.y}).`,
        );
      }
    }
    const droppableSource = source.filter(
      (occurrence) => !fixedKeys.has(occurrence.y),
    );
    const droppableTarget = target.filter(
      (occurrence) => !fixedKeys.has(occurrence.y),
    );
    if (droppableSource.length !== droppableTarget.length) {
      throw new ReelError(
        `cascade column ${x} droppable occurrence count changed.`,
      );
    }
    const movingPairs: Array<{
      readonly source: (typeof droppableSource)[number];
      readonly target: (typeof droppableTarget)[number];
    }> = [];
    for (let index = 0; index < droppableSource.length; index += 1) {
      const from = droppableSource[index];
      const to = droppableTarget[index];
      if (from.code !== to.code || from.value !== to.value) {
        throw new ReelError(
          `cascade column ${x} occurrence ${index} code/value changed.`,
        );
      }
      if (to.y < from.y) {
        throw new ReelError(
          `cascade column ${x} occurrence ${index} moved upward.`,
        );
      }
      if (to.y > from.y) movingPairs.push({ source: from, target: to });
    }
    const refillTargets = refillPositions
      .filter((position) => position.x === x)
      .sort((left, right) => left.y - right.y)
      .map((position, index, positions) => ({
        kind: "refill" as const,
        source: {
          y: index - positions.length,
          code: targetScene[x][position.y],
          value:
            targetValues[x][position.y] === -1
              ? null
              : targetValues[x][position.y],
        },
        target: {
          y: position.y,
          code: targetScene[x][position.y],
          value:
            targetValues[x][position.y] === -1
              ? null
              : targetValues[x][position.y],
        },
      }));
    const combined = [
      ...movingPairs.map((pair) => ({ kind: "existing" as const, ...pair })),
      ...refillTargets,
    ].sort((left, right) => right.target.y - left.target.y);
    combined.forEach((pair, staggerIndex) => {
      const rowsFallen = pair.target.y - pair.source.y;
      const fallSeconds = Math.min(
        motion.maxFallSeconds,
        motion.baseFallSeconds + rowsFallen * motion.perRowFallSeconds,
      );
      movements.push(
        Object.freeze({
          kind: pair.kind,
          x,
          sourceY: pair.source.y,
          targetY: pair.target.y,
          code: pair.source.code,
          presentationValue: pair.source.value,
          startSeconds:
            x * motion.columnStartStaggerSeconds +
            staggerIndex * motion.startStaggerSeconds,
          fallSeconds,
          settleSeconds: motion.settleSeconds,
          overshootPixels: cellHeight * motion.overshootCellRatio,
        }),
      );
    });
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
    columns,
    rows,
    sourceScene,
    sourceValues,
    settledScene,
    settledValues,
    targetScene,
    targetValues,
    refillPositions,
    movements: Object.freeze(movements),
    totalSeconds,
  });
}

function parseRefillPositions(
  positions: readonly { readonly x: number; readonly y: number }[],
  settledScene: GridCellCascadeScene,
) {
  if (!Array.isArray(positions)) {
    throw new ReelError("refillPositions must be an array.");
  }
  const keys = new Set<string>();
  const parsed = positions.map((position, index) => {
    if (
      !Number.isSafeInteger(position.x) ||
      position.x < 0 ||
      position.x >= settledScene.length ||
      !Number.isSafeInteger(position.y) ||
      position.y < 0 ||
      position.y >= settledScene[position.x].length
    ) {
      throw new ReelError(`refillPositions[${index}] is out of range.`);
    }
    const key = `${position.x},${position.y}`;
    if (keys.has(key))
      throw new ReelError(`refillPositions contains duplicate ${key}.`);
    keys.add(key);
    return Object.freeze({ x: position.x, y: position.y });
  });
  for (let x = 0; x < settledScene.length; x += 1) {
    for (let y = 0; y < settledScene[x].length; y += 1) {
      const isHole = settledScene[x][y] === CASCADE_EMPTY_CELL;
      if (isHole !== keys.has(`${x},${y}`)) {
        throw new ReelError(
          "refillPositions must match settledScene holes exactly.",
        );
      }
    }
  }
  return Object.freeze(parsed);
}

function validateRefillTarget(
  settledScene: GridCellCascadeScene,
  settledValues: GridCellCascadeValueMatrix,
  targetScene: GridCellCascadeScene,
  targetValues: GridCellCascadeValueMatrix,
  refillPositions: readonly { readonly x: number; readonly y: number }[],
): void {
  const refillKeys = new Set(refillPositions.map(({ x, y }) => `${x},${y}`));
  for (let x = 0; x < targetScene.length; x += 1) {
    for (let y = 0; y < targetScene[x].length; y += 1) {
      if (targetScene[x][y] === CASCADE_EMPTY_CELL) {
        throw new ReelError("targetScene must not contain holes.");
      }
      if (!refillKeys.has(`${x},${y}`)) {
        if (
          targetScene[x][y] !== settledScene[x][y] ||
          targetValues[x][y] !== settledValues[x][y]
        ) {
          throw new ReelError(
            `refill changed carried occurrence at (${x},${y}).`,
          );
        }
      }
    }
  }
}

export function parseGridCellCascadeScene(
  value: GridCellCascadeScene,
  label = "cascadeScene",
): GridCellCascadeScene {
  return parseHoleScene(value, label);
}

function occupiedOccurrences(
  scene: readonly number[],
  values: readonly (number | null | -1)[],
) {
  return scene.flatMap((code, y) =>
    code === CASCADE_EMPTY_CELL
      ? []
      : [
          {
            y,
            code,
            value: values[y] === CASCADE_EMPTY_CELL ? null : values[y],
          },
        ],
  );
}

function parseHoleScene(
  value: GridCellCascadeScene,
  label: string,
  expectedColumns?: number,
  expectedRows?: number,
): GridCellCascadeScene {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ReelError(`${label} must contain columns.`);
  }
  if (expectedColumns !== undefined && value.length !== expectedColumns) {
    throw new ReelError(`${label} width must be ${expectedColumns}.`);
  }
  const rows = expectedRows ?? value[0]?.length ?? 0;
  if (rows <= 0) throw new ReelError(`${label} must contain rows.`);
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows) {
        throw new ReelError(`${label}[${x}] height must be ${rows}.`);
      }
      return Object.freeze(
        column.map((code, y) => {
          if (!Number.isSafeInteger(code) || code < CASCADE_EMPTY_CELL) {
            throw new ReelError(
              `${label}[${x}][${y}] must be -1 or a non-negative safe integer.`,
            );
          }
          return code;
        }),
      );
    }),
  );
}

function parseHoleValues(
  value: GridCellCascadeValueMatrix,
  scene: GridCellCascadeScene,
  label: string,
): GridCellCascadeValueMatrix {
  if (!Array.isArray(value) || value.length !== scene.length) {
    throw new ReelError(`${label} width must match scene.`);
  }
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== scene[x].length) {
        throw new ReelError(`${label}[${x}] height must match scene.`);
      }
      return Object.freeze(
        column.map((candidate, y) => {
          if (scene[x][y] === CASCADE_EMPTY_CELL) {
            if (candidate !== CASCADE_EMPTY_CELL) {
              throw new ReelError(
                `${label}[${x}][${y}] must be -1 for a hole.`,
              );
            }
            return CASCADE_EMPTY_CELL;
          }
          if (
            candidate !== null &&
            (!Number.isSafeInteger(candidate) || candidate <= 0)
          ) {
            throw new ReelError(
              `${label}[${x}][${y}] must be a positive safe integer or null.`,
            );
          }
          return candidate;
        }),
      );
    }),
  );
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
  if (parsed.maxFallSeconds < parsed.baseFallSeconds) {
    throw new ReelError("maxFallSeconds must be at least baseFallSeconds.");
  }
  return parsed;
}

function assertPositiveFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ReelError(`${label} must be a finite positive number.`);
  }
  return value;
}

function assertNonNegativeFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ReelError(`${label} must be a finite non-negative number.`);
  }
  return value;
}
